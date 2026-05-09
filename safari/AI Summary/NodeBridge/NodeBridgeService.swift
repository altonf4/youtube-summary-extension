//
//  NodeBridgeService.swift
//
//  Implements NodeBridgeProtocol by connecting to the AI Summary
//  LaunchAgent's Unix socket, forwarding one length-prefixed JSON request,
//  and reading frames until the final (non-progress) response arrives.
//
//  Why a Unix socket and not Process.run("node host.js"):
//      The XPC service is launched by xpcproxy in a non-Aqua security
//      session, so any subprocess it spawns can't unlock the user's login
//      keychain — and the Claude CLI keeps its OAuth credentials there.
//      Running host.js inside a LaunchAgent with LimitLoadToSessionType=Aqua
//      gives it the user's session, with full keychain access. This XPC
//      service is then just a transport adapter between the sandboxed
//      Safari extension and that already-running agent.
//

import Foundation
import os.log
import Darwin

private let log = OSLog(subsystem: "com.altonfong.aisummary", category: "node-bridge")

enum BridgeError: LocalizedError {
    case socketConnectFailed(String)
    case socketWriteFailed(String)
    case socketReadFailed(String)
    case malformedResponse
    case agentNotRunning(String)

    var errorDescription: String? {
        switch self {
        case .socketConnectFailed(let detail):
            return "Couldn't connect to the AI Summary agent: \(detail). Make sure the LaunchAgent is loaded — re-run install-safari.sh."
        case .socketWriteFailed(let d): return "Socket write failed: \(d)"
        case .socketReadFailed(let d):  return "Socket read failed: \(d)"
        case .malformedResponse:        return "Malformed response from agent"
        case .agentNotRunning(let p):   return "Agent socket not found at \(p). Run install-safari.sh."
        }
    }
}

final class NodeBridgeService: NSObject, NodeBridgeProtocol {

    static let shared = NodeBridgeService()

    private let workQueue = DispatchQueue(label: "com.altonfong.aisummary.bridge.work",
                                          qos: .userInitiated,
                                          attributes: .concurrent)

    // MARK: - NodeBridgeProtocol

    func handleMessage(_ payloadJSON: Data, reply: @escaping (Data?, String?) -> Void) {
        // Run each request on the concurrent work queue so multiple Safari
        // tabs can have summaries in flight simultaneously. Each call gets
        // its own socket and its own host.js child via the agent.
        workQueue.async {
            do {
                let response = try self.runOneRequest(payloadJSON: payloadJSON)
                reply(response, nil)
            } catch {
                os_log(.error, log: log, "request failed: %{public}@", error.localizedDescription)
                reply(nil, error.localizedDescription)
            }
        }
    }

    // MARK: - Single request

    private func runOneRequest(payloadJSON: Data) throws -> Data {
        // Preserve the JS-supplied requestId; the agent's host.js will echo
        // it back on the final response. We need to put it back in the JSON
        // we hand to background.js.
        guard var payload = try JSONSerialization.jsonObject(with: payloadJSON) as? [String: Any] else {
            throw BridgeError.malformedResponse
        }
        let originalRequestId = payload["requestId"]
        let trackingId = "xpc-\(UInt64.random(in: 1_000_000...UInt64.max))"
        payload["requestId"] = trackingId

        let outBody = try JSONSerialization.data(withJSONObject: payload, options: [])

        // Connect, send, read, close.
        let socketPath = NodeBridgeService.resolveSocketPath()
        let fd = try NodeBridgeService.connect(to: socketPath)
        defer { close(fd) }

        try NodeBridgeService.writeFrame(fd: fd, body: outBody)

        // Read frames until we see a non-progress response with our trackingId.
        // host.js may emit any number of {type:'progress',requestId:...} frames
        // before the final one.
        while true {
            let frame = try NodeBridgeService.readFrame(fd: fd)
            guard let json = try? JSONSerialization.jsonObject(with: frame) as? [String: Any] else {
                throw BridgeError.malformedResponse
            }
            // Skip progress frames silently — Safari has no transport to push
            // them back to the page anyway.
            if let type = json["type"] as? String, type == "progress" {
                continue
            }
            // host.js stamps requestId on final responses. If it's not our
            // tracking id, the agent multiplexed wrongly; bail.
            if let rid = json["requestId"] as? String, rid != trackingId {
                continue
            }

            var cleaned = json
            if let orig = originalRequestId {
                cleaned["requestId"] = orig
            } else {
                cleaned.removeValue(forKey: "requestId")
            }
            return try JSONSerialization.data(withJSONObject: cleaned, options: [])
        }
    }

    // MARK: - Socket I/O

    private static func resolveSocketPath() -> String {
        // The install script writes this to config.json next to nodePath/hostPath.
        // Default if config can't be read: same path the agent uses by default.
        let url = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first?
            .appendingPathComponent("AI Summary")
            .appendingPathComponent("config.json")

        if let url = url,
           let data = try? Data(contentsOf: url),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let p = json["socketPath"] as? String {
            return p
        }

        let home = NSHomeDirectory()
        return home + "/Library/Caches/com.altonfong.aisummary/host.sock"
    }

    private static func connect(to path: String) throws -> Int32 {
        if !FileManager.default.fileExists(atPath: path) {
            throw BridgeError.agentNotRunning(path)
        }

        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        if fd < 0 {
            throw BridgeError.socketConnectFailed("socket(2) failed: \(String(cString: strerror(errno)))")
        }

        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)

        let pathBytes = path.utf8CString
        let maxPathLen = MemoryLayout.size(ofValue: addr.sun_path)
        guard pathBytes.count <= maxPathLen else {
            close(fd)
            throw BridgeError.socketConnectFailed("socket path too long: \(path)")
        }
        // Copy pathBytes into the fixed-size sun_path C array.
        withUnsafeMutablePointer(to: &addr.sun_path) { ptr in
            ptr.withMemoryRebound(to: CChar.self, capacity: maxPathLen) { dst in
                _ = pathBytes.withUnsafeBufferPointer { src in
                    memcpy(dst, src.baseAddress!, src.count)
                }
            }
        }

        let connectResult = withUnsafePointer(to: &addr) { ptr -> Int32 in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        if connectResult < 0 {
            let err = String(cString: strerror(errno))
            close(fd)
            throw BridgeError.socketConnectFailed("connect(2) failed: \(err)")
        }

        // Generous read timeout — Claude CLI calls can take 30+ seconds.
        var timeout = timeval(tv_sec: 180, tv_usec: 0)
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))

        return fd
    }

    private static func writeFrame(fd: Int32, body: Data) throws {
        var lengthLE = UInt32(body.count).littleEndian
        var frame = Data(bytes: &lengthLE, count: 4)
        frame.append(body)

        try frame.withUnsafeBytes { (rawBuf: UnsafeRawBufferPointer) in
            var sent = 0
            let total = rawBuf.count
            while sent < total {
                let remaining = total - sent
                let n = Darwin.write(fd, rawBuf.baseAddress!.advanced(by: sent), remaining)
                if n < 0 {
                    let err = String(cString: strerror(errno))
                    throw BridgeError.socketWriteFailed(err)
                }
                if n == 0 {
                    throw BridgeError.socketWriteFailed("write returned 0 (peer closed)")
                }
                sent += n
            }
        }
    }

    private static func readFrame(fd: Int32) throws -> Data {
        let header = try readExactly(fd: fd, count: 4)
        let length = header.withUnsafeBytes { $0.load(as: UInt32.self).littleEndian }
        if length == 0 || length > 64 * 1024 * 1024 {
            throw BridgeError.malformedResponse
        }
        return try readExactly(fd: fd, count: Int(length))
    }

    private static func readExactly(fd: Int32, count: Int) throws -> Data {
        var buffer = Data(count: count)
        var read = 0
        try buffer.withUnsafeMutableBytes { (rawBuf: UnsafeMutableRawBufferPointer) in
            while read < count {
                let remaining = count - read
                let n = Darwin.read(fd, rawBuf.baseAddress!.advanced(by: read), remaining)
                if n < 0 {
                    let err = String(cString: strerror(errno))
                    throw BridgeError.socketReadFailed(err)
                }
                if n == 0 {
                    throw BridgeError.socketReadFailed("EOF before \(count) bytes (got \(read))")
                }
                read += n
            }
        }
        return buffer
    }
}
