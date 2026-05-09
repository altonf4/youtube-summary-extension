//
//  NodeBridgeProtocol.swift
//
//  Shared NSXPC interface between the sandboxed Safari Web Extension and the
//  unsandboxed NodeBridge XPC service that spawns native-host/host.js.
//
//  Lives in the Shared/ folder and is compiled into BOTH targets so the
//  Objective-C bridge metadata sees the same protocol on each side.
//

import Foundation

@objc(NodeBridgeProtocol)
protocol NodeBridgeProtocol {
    /// Forward a single Web Extension message to host.js. The reply is the
    /// final (non-progress) response, plain JSON-serializable dictionary.
    /// On failure, `errorMessage` is set and `response` is nil.
    func handleMessage(
        _ payloadJSON: Data,
        reply: @escaping (_ responseJSON: Data?, _ errorMessage: String?) -> Void
    )
}
