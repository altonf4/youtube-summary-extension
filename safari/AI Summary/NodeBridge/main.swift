//
//  main.swift
//  NodeBridge XPC Service
//
//  Entry point for the unsandboxed XPC service that proxies between the
//  sandboxed Safari Web Extension and native-host/host.js. macOS launches
//  this on demand when the Extension opens the NSXPCConnection.
//

import Foundation

final class ServiceDelegate: NSObject, NSXPCListenerDelegate {
    func listener(_ listener: NSXPCListener, shouldAcceptNewConnection conn: NSXPCConnection) -> Bool {
        conn.exportedInterface = NSXPCInterface(with: NodeBridgeProtocol.self)
        conn.exportedObject = NodeBridgeService.shared
        conn.resume()
        return true
    }
}

// Hold a strong reference; `listener.delegate` is weak.
let serviceDelegate = ServiceDelegate()
let listener = NSXPCListener.service()
listener.delegate = serviceDelegate
listener.resume()
