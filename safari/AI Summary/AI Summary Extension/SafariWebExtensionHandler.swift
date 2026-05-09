//
//  SafariWebExtensionHandler.swift
//  AI Summary Extension
//
//  Sandboxed Safari Web Extension entry point. Forwards each browser message
//  to the NodeBridge XPC service (which runs unsandboxed inside the same app
//  bundle and is the only thing allowed to spawn Node).
//

import SafariServices
import os.log

private let log = OSLog(subsystem: "com.altonfong.aisummary", category: "extension")

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message: Any?
        if #available(macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        guard let payload = message as? [String: Any] else {
            complete(context: context, response: ["success": false, "error": "Invalid message payload"])
            return
        }

        guard let payloadJSON = try? JSONSerialization.data(withJSONObject: payload, options: []) else {
            complete(context: context, response: ["success": false, "error": "Could not serialize payload"])
            return
        }

        // Open a fresh XPC connection per request. The NodeBridge service is
        // long-lived (it keeps host.js running) but this connection is just
        // the call channel.
        let connection = NSXPCConnection(serviceName: "com.altonfong.aisummary.NodeBridge")
        connection.remoteObjectInterface = NSXPCInterface(with: NodeBridgeProtocol.self)

        connection.invalidationHandler = {
            os_log(.error, log: log, "XPC connection to NodeBridge invalidated")
        }
        connection.interruptionHandler = {
            os_log(.error, log: log, "XPC connection to NodeBridge interrupted")
        }

        connection.resume()

        let proxy = connection.remoteObjectProxyWithErrorHandler { [weak self] error in
            guard let self = self else { return }
            os_log(.error, log: log, "XPC error: %{public}@", error.localizedDescription)
            self.complete(context: context,
                          response: ["success": false, "error": "NodeBridge unreachable: \(error.localizedDescription)"])
            connection.invalidate()
        } as? NodeBridgeProtocol

        guard let proxy = proxy else {
            complete(context: context, response: ["success": false, "error": "Could not get NodeBridge proxy"])
            connection.invalidate()
            return
        }

        proxy.handleMessage(payloadJSON) { [weak self] responseJSON, errorMessage in
            guard let self = self else { return }
            defer { connection.invalidate() }

            if let errorMessage = errorMessage {
                self.complete(context: context, response: ["success": false, "error": errorMessage])
                return
            }
            guard let responseJSON = responseJSON,
                  let dict = try? JSONSerialization.jsonObject(with: responseJSON) as? [String: Any] else {
                self.complete(context: context, response: ["success": false, "error": "Malformed response from NodeBridge"])
                return
            }
            self.complete(context: context, response: dict)
        }
    }

    private func complete(context: NSExtensionContext, response: [String: Any]) {
        let item = NSExtensionItem()
        if #available(macOS 11.0, *) {
            item.userInfo = [SFExtensionMessageKey: response]
        } else {
            item.userInfo = ["message": response]
        }
        context.completeRequest(returningItems: [item], completionHandler: nil)
    }
}
