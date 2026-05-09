# Safari Build — Troubleshooting & Handoff Runbook

> Audience: a future agent (or me, six months from now) who needs to debug,
> extend, or repair the Safari port without re-deriving anything from
> scratch. Read this before changing anything in `safari/` or
> `native-host/agent-server.js`.

The Safari port has more moving parts than the Chrome build because Apple's
sandbox model doesn't let a Safari Web Extension talk to the existing
`native-host/host.js` directly. There is no Native Messaging Hosts directory
on Safari, sandboxed Safari extensions cannot spawn arbitrary subprocesses,
and even an unsandboxed XPC service launched on demand sits in a security
session that cannot read the user's login keychain. Each piece below exists
to dodge a specific one of these constraints.

---

## Architecture in one breath

```
Safari Web Extension (.appex)        sandbox = YES
   │ NSXPCConnection
   ▼
NodeBridge.xpc                       sandbox = NO     (lives in
   │ AF_UNIX socket per request                       appex/Contents/XPCServices/)
   ▼
LaunchAgent: agent-server.js         Aqua session     (~/Library/LaunchAgents/
   │ stdin/stdout per accepted conn                   com.altonfong.aisummary.host.plist)
   ▼
node native-host/host.js             unchanged from Chrome
   │ spawns
   ▼
claude --print                       reads OAuth token from login keychain
```

Every Safari request opens **a fresh** XPC connection, **a fresh** Unix
socket connection, and **a fresh** `host.js` process. There is no shared
state between requests. Progress messages from `host.js` are dropped on the
way out (Safari has no transport for them — the sidebar synthesizes a fake
timeline instead).

---

## File layout

| Path | Purpose |
|---|---|
| `safari/AI Summary/AI Summary.xcodeproj` | Xcode project (folder refs to `extension/`, **no** `--copy-resources`) |
| `safari/AI Summary/AI Summary/` | Wrapper macOS app target — stub UI; only exists because Apple requires it |
| `safari/AI Summary/AI Summary Extension/` | The `.appex` — sandboxed; just an XPC client |
| `safari/AI Summary/AI Summary Extension/AI Summary Extension.entitlements` | sandbox=YES, network.client |
| `safari/AI Summary/AI Summary Extension/SafariWebExtensionHandler.swift` | `beginRequest` → forward to NodeBridge.xpc |
| `safari/AI Summary/NodeBridge/` | XPC service target (unsandboxed); embedded into the **appex's** `Contents/XPCServices/` |
| `safari/AI Summary/NodeBridge/NodeBridgeService.swift` | Opens AF_UNIX socket per request; framed JSON in/out |
| `safari/AI Summary/Shared/NodeBridgeProtocol.swift` | NSXPCProtocol shared between both Swift targets |
| `native-host/agent-server.js` | LaunchAgent body — listens on Unix socket, spawns `host.js` per accepted connection |
| `native-host/com.altonfong.aisummary.host.plist.template` | LaunchAgent plist; `__NODE_PATH__` / `__AGENT_SERVER_JS__` / `__PATH__` / `__HOME__` substituted by installer |
| `install-safari.sh` | xcodebuild → /Applications → write config.json → bootstrap LaunchAgent |
| `extension/background.js` | Detects Safari via `safari-web-extension://` URL scheme and uses the wrapper bundle ID for `connectNative` |
| `extension/sidebar/sidebar.js` | Synthesizes the multi-stage progress UI on Safari (`startSafariProgressSimulation`, `estimateInputTokens`) |

## Identifiers

| Thing | Value |
|---|---|
| Wrapper app bundle ID | `com.altonfong.aisummary` |
| Extension bundle ID | `com.altonfong.aisummary.Extension` |
| XPC service bundle ID | `com.altonfong.aisummary.NodeBridge` |
| Native messaging name (Safari) | `com.altonfong.aisummary` (the wrapper bundle ID, not a manifest name like Chrome) |
| Native messaging name (Chrome) | `com.youtube.summary` |
| LaunchAgent label | `com.altonfong.aisummary.host` |
| Apple Team ID | `WK3DS8W4Z9` (parse from the cert's `OU=` field, NOT from the parens after the name) |
| Unix socket | `~/Library/Caches/com.altonfong.aisummary/host.sock` |
| Bridge config | `~/Library/Application Support/AI Summary/config.json` |
| Plist on disk | `~/Library/LaunchAgents/com.altonfong.aisummary.host.plist` |
| Installed app | `/Applications/AI Summary.app` |
| LaunchAgent log | `/tmp/aisummary-agent.log` |
| Build log | `/tmp/aisummary-xcodebuild.log` |
| Bootstrap log | `/tmp/aisummary-bootstrap.log` |
| Codesign log | `/tmp/aisummary-codesign.log` |

---

## Common workflows

### JS-only change in `extension/`

`./install-safari.sh` rebuilds and re-copies; the new JS lands in the
appex's `Contents/Resources/`. **Quit Safari** (Cmd-Q), then reopen — it
loads extension JS only on launch.

### Native bridge change (Swift in `safari/`)

Same: `./install-safari.sh` rebuilds via `xcodebuild`. The script also
re-bootstraps the LaunchAgent. **Quit Safari** so the new XPC service
binary is picked up next time the extension launches it.

### Change in `native-host/host.js` or `native-host/agent-server.js`

`host.js` is read fresh on every request (each connection spawns a new
copy), so changes to `host.js` take effect immediately on the next Safari
request — no reinstall needed.

`agent-server.js` is held resident by the LaunchAgent. To pick up changes:

```bash
launchctl kickstart -k gui/$(id -u)/com.altonfong.aisummary.host
```

### Full uninstall

```bash
launchctl bootout gui/$(id -u)/com.altonfong.aisummary.host
rm ~/Library/LaunchAgents/com.altonfong.aisummary.host.plist
rm -rf "/Applications/AI Summary.app"
rm -rf "$HOME/Library/Application Support/AI Summary"
rm -rf "$HOME/Library/Caches/com.altonfong.aisummary"
```

---

## Symptom → cause → fix

### Extension doesn't appear in Safari → Settings → Extensions

Most likely causes, in order:

1. **App is ad-hoc signed** (no real code-signing identity). Safari
   silently refuses to discover the extension. Check:
   ```bash
   codesign -dvvv "/Applications/AI Summary.app" 2>&1 | grep -E "Authority|Signature"
   ```
   Expect `Authority=Apple Development: ...` and `Signature` with a real
   chain. If you see `Signature=adhoc`, re-run `./install-safari.sh` — it
   will pick up your Apple Development cert and use auto-provisioning.

2. **Apple ID not signed in to Xcode → Settings → Accounts**. xcodebuild
   needs an account to fetch the provisioning profile. Build log will say
   "No Account for Team WK3DS8W4Z9". Open Xcode → Settings → Accounts and
   add your Apple ID, then re-run install.

3. **Sandbox disabled on the extension**. Safari refuses to register
   non-sandboxed Web Extensions. Confirm:
   ```bash
   codesign -d --entitlements - "/Applications/AI Summary.app/Contents/PlugIns/AI Summary Extension.appex"
   ```
   Expect `com.apple.security.app-sandbox = true`. If false, check that
   the project hasn't been edited to set `ENABLE_APP_SANDBOX = NO` on the
   Extension target.

4. **LaunchServices caching a stale build-directory path**. Symptom:
   `lsregister -dump | grep com.altonfong.aisummary` shows the appex at
   `safari/AI Summary/build/...` instead of `/Applications/AI Summary.app/...`.
   Fix:
   ```bash
   LSREG=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister
   "$LSREG" -u "/Users/altfong/workspace/youtube-summary-extension/safari/AI Summary/build/Build/Products/Release/AI Summary.app"
   "$LSREG" -u "/Users/altfong/workspace/youtube-summary-extension/safari/AI Summary/build/Build/Products/Debug/AI Summary.app"
   "$LSREG" -f "/Applications/AI Summary.app"
   ```

5. **Extension was registered but Safari hasn't refreshed.** Quit Safari
   fully (Cmd-Q), reopen, look at Settings → Extensions. If the entry
   exists in `~/Library/Containers/com.apple.Safari/Data/Library/Safari/WebExtensions/Extensions.plist`
   then Safari knows about it.

### Safari shows the extension but the sidebar is stuck at "Starting..."

You're hitting the Safari bug where progress events can't be pushed.
The synthetic timeline in `extension/sidebar/sidebar.js` (`IS_SAFARI`,
`startSafariProgressSimulation`) handles this. If it's broken:

1. Check `extension/sidebar/sidebar.js` for `startSafariProgressSimulation`
   — it should be called inside `handleGenerateSummary` right before
   `await sendNativeMessage({...action: 'generateSummary'...})` and cancelled
   in the `finally`.
2. Verify Safari detection: the synth only runs when
   `window.location.protocol.startsWith('safari-web-extension:')`.

### Sidebar gets `Couldn't communicate with a helper application` / XPC error

The sandboxed extension can't reach `NodeBridge.xpc`. Check:

```bash
ls "/Applications/AI Summary.app/Contents/PlugIns/AI Summary Extension.appex/Contents/XPCServices/"
```

You should see `NodeBridge.xpc`. If it's missing, the Embed XPC Services
build phase isn't wired correctly (see "trap" #6 below). The XPC service
**must** be embedded in the appex, not the wrapper app.

### Sidebar says `Claude exited with code 1. Details: Not logged in`

The Claude CLI is being spawned in a context that can't read the login
keychain. The fix architecture is the LaunchAgent — verify it's loaded
and in the Aqua session:

```bash
launchctl print gui/$(id -u)/com.altonfong.aisummary.host | grep -E "state|LimitLoadToSessionType"
```

Expect `state = running` and the plist (loaded above) to contain
`LimitLoadToSessionType = Aqua`. If `state = not loaded`, run
`./install-safari.sh` to bootstrap it. If state is running but the error
persists, sanity-check the keychain item exists:

```bash
security find-generic-password -s 'Claude Code-credentials' -w
```

A non-empty JSON blob means Claude CLI IS logged in. If you get
`SecKeychainSearchCopyNext ... -25300` it's not logged in at all (run
`claude` from your terminal once to log in).

### Bridge config is wrong / pointing at non-existent paths

`~/Library/Application Support/AI Summary/config.json` is rewritten on every
`./install-safari.sh` run, so just re-run.

```json
{
  "nodePath": "/opt/homebrew/Cellar/node/24.3.0/bin/node",
  "hostPath": "/Users/altfong/workspace/youtube-summary-extension/native-host/host.js",
  "socketPath": "/Users/altfong/Library/Caches/com.altonfong.aisummary/host.sock"
}
```

### `launchctl bootstrap` fails with "Input/output error"

The LaunchAgent is already loaded. The installer handles this with a
bootout-then-wait-then-bootstrap-or-kickstart fallback. If running by
hand, do:

```bash
launchctl bootout gui/$(id -u)/com.altonfong.aisummary.host
# wait until it's gone:
until ! launchctl print gui/$(id -u)/com.altonfong.aisummary.host >/dev/null 2>&1; do sleep 0.25; done
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.altonfong.aisummary.host.plist
```

### Cursor / system lag while extension is "running"

Almost certainly not the extension. The agent + XPC service together cost
~0% CPU and ~56 MB resident at idle. Check the actual top processes:

```bash
ps -axo pid,pcpu,pmem,rss,comm | sort -nrk 2 | head -8
```

Look for high-CPU offenders elsewhere (rustc/WindowServer/WebKit are
common). To prove our footprint:

```bash
ps -axo pid,pcpu,pmem,rss,etime,command | grep -E "agent-server|aisummary|NodeBridge" | grep -v grep
```

---

## Diagnostic command cheat sheet

```bash
# Live log of everything in our subsystem (info+debug enabled)
/usr/bin/log stream --predicate "subsystem == 'com.altonfong.aisummary'" --info --debug --style compact

# Replay last N minutes
/usr/bin/log show --last 5m --info --debug --predicate "subsystem == 'com.altonfong.aisummary'"

# Agent log (stdout/stderr captured by the plist)
tail -f /tmp/aisummary-agent.log

# Test the agent socket directly (bypasses XPC + Safari)
node -e '
const net = require("net");
const sock = net.createConnection("/Users/altfong/Library/Caches/com.altonfong.aisummary/host.sock");
const msg = JSON.stringify({action: "checkAuth", requestId: "test"});
const buf = Buffer.from(msg);
const len = Buffer.alloc(4); len.writeUInt32LE(buf.length, 0);
sock.write(Buffer.concat([len, buf]));
let acc = Buffer.alloc(0);
sock.on("data", d => {
  acc = Buffer.concat([acc, d]);
  if (acc.length >= 4 && acc.length >= 4 + acc.readUInt32LE(0)) {
    console.log(acc.slice(4).toString());
    sock.end();
  }
});
'

# What does Safari think it knows?
plutil -p ~/Library/Containers/com.apple.Safari/Data/Library/Safari/WebExtensions/Extensions.plist

# What does LaunchServices think?
LSREG=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister
"$LSREG" -dump | grep -B2 -A20 com.altonfong.aisummary

# Verify code signing is real, not adhoc
codesign -dvvv "/Applications/AI Summary.app" 2>&1 | grep -E "Authority|Signature|TeamIdentifier"
codesign -dvvv "/Applications/AI Summary.app/Contents/PlugIns/AI Summary Extension.appex" 2>&1 | grep -E "Authority|Signature|TeamIdentifier"
codesign -dvvv "/Applications/AI Summary.app/Contents/PlugIns/AI Summary Extension.appex/Contents/XPCServices/NodeBridge.xpc" 2>&1 | grep -E "Authority|Signature|TeamIdentifier"

# Inspect entitlements
codesign -d --entitlements - "/Applications/AI Summary.app/Contents/PlugIns/AI Summary Extension.appex"
```

---

## Traps and gotchas (do not relearn these)

1. **`security find-identity` lies about team IDs.** The string in parens
   after the cert name (e.g. `Apple Development: Alton Fong (9AG444TLA6)`)
   is the cert serial, **not the team ID**. The real team ID is in the
   cert's Subject `OU=` field. The installer extracts it via:
   ```
   security find-certificate -c "Apple Development:" -p | openssl x509 -noout -subject
   ```
   Look for `OU=WK3DS8W4Z9`.

2. **Ad-hoc signed apps are silently rejected by Safari.** They pass
   `codesign -v` but fail `spctl --assess`, and Safari's
   `extensionkit:discovery` filter drops them with no user-visible error.
   Apple Development cert + auto-provisioning is the minimum.

3. **`xcodebuild ... CODE_SIGNING_ALLOWED=NO` produces a "linker-signed"
   bundle** with `Info.plist=not bound` and `Sealed Resources=none`. Safari
   refuses to register it. If you see those in `codesign -dvvv`, you need a
   real codesign pass.

4. **`xcodebuild` overrides from project settings.** If the `.pbxproj` says
   `CODE_SIGN_IDENTITY = "-"` and `CODE_SIGN_STYLE = Manual`, command-line
   `CODE_SIGN_STYLE=Automatic` won't override the identity. The project
   needs `CODE_SIGN_STYLE = Automatic` and no hardcoded `CODE_SIGN_IDENTITY`.

5. **Safari requires sandboxed extensions.** The first attempt disabled
   App Sandbox on the extension target so it could spawn `node`. Result:
   `extensionkit:discovery: Extension is not entitled to run in the App
   Sandbox` and the extension never appears in Settings. Sandbox is
   non-negotiable.

6. **XPC services in the wrapper `app/Contents/XPCServices/` are not
   reachable from a sandboxed extension.** `NSXPCConnection(serviceName:)`
   from the appex looks in **the appex's** `Contents/XPCServices/`. The
   Embed XPC Services build phase must be on the **Extension** target,
   not the wrapper App target. Symptom if wrong:
   `[com.apple.xpc:connection] failed to do a bootstrap look-up: xpc_error=[3: No such process]`.

7. **xpcproxy-launched processes can't unlock the login keychain.** Even
   though the XPC service is unsandboxed and runs as the user, it sits
   in a non-Aqua security session and `security find-generic-password`
   returns `errSecInteractionNotAllowed (status 36)`. The fix is the
   LaunchAgent with `LimitLoadToSessionType=Aqua`. Don't try to make the
   XPC service spawn Node directly; it will just fail at keychain reads.

8. **`launchctl bootout` is asynchronous.** A naïve bootout+bootstrap
   pair races and bootstrap fails with `Bootstrap failed: 5: Input/output
   error`. The installer waits for `launchctl print` to start failing
   before calling bootstrap.

9. **macOS deployment target needs ≥ 11.0.** Several of the bridge's
   Swift APIs (`FileHandle.write(contentsOf:)`, etc.) require macOS
   10.15.4+. The converter scaffolds at 10.14 by default. We bumped to
   11.0 (and the wrapper app is at 26.2 from the converter).

10. **The `xcodeproj` Ruby gem (1.27.0) doesn't expose `:xpc_services`
    as a Copy Files destination.** Use `:wrapper` + `dst_path =
    'Contents/XPCServices'` instead. Xcode treats them equivalently.

11. **Each Safari request gets a fresh `host.js` process.** Don't put
    in-memory state in `host.js` and expect it to persist between
    requests on Safari. Persistence belongs in `chrome.storage` (which
    Safari proxies to its own container) or in files.

12. **Progress messages are dropped.** `safari/.../NodeBridgeService.swift`'s
    `runOneRequest` skips frames where `type == "progress"`. The
    request/response XPC API only delivers one final response per
    `beginRequest` call. Don't try to "fix" this in Swift; the synthetic
    timeline in `sidebar.js` is the workaround.

13. **`safari-web-extension-converter` warns about `open_in_tab`** in
    the manifest. It's a harmless warning — Safari ignores `open_in_tab`
    and opens the options page in a sheet anyway.

14. **Launch the wrapper app at least once after install.** Safari
    populates `WebExtensions/Extensions.plist` only after LaunchServices
    has registered the bundle, which happens on first `open`. The
    installer does this for you (`open "$INSTALL_DEST"` at the end).

15. **The `Apple Development` cert is for development only.** macOS
    Gatekeeper will reject it (`spctl --assess` returns "rejected"), so
    you can't distribute the .app to anyone else. Distribution requires
    a `Developer ID Application` cert + notarization, which is out of
    scope for v1.

---

## What's intentionally not in the repo

- **Apple ID / signing identities** — read at install time from the
  user's keychain via `security find-identity`. The installer also
  reads the team ID from the cert's `OU=` field.
- **Provisioning profiles** — generated automatically by Xcode via
  `xcodebuild -allowProvisioningUpdates`. Cached in
  `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`.
- **The `safari/AI Summary/build/` directory** — gitignored.
- **Any prebuilt `.app`** — install-time build only.
- **The original `safari/edit-project.rb` scratch script** I used to
  add the XPC service target via the `xcodeproj` Ruby gem — it was a
  one-shot tool, not committed. The current `.pbxproj` is the source
  of truth. If you need to add another target, install the gem and
  manipulate the project from a fresh script:
  ```bash
  gem install --user-install xcodeproj
  ```
  See git commit `8d62f52` for the kinds of edits the script made.
