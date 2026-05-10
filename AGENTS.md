# AGENTS.md - Development Guide for AI Summary Extension

This document is intended for AI agents and developers working on this codebase. It explains the architecture, key components, and how everything fits together.

## Project Overview

This is a Chrome / Safari extension that generates AI summaries of **any web content** — YouTube videos, articles, blog posts, selected text, and videos with captions — and saves them to Apple Notes. It supports two AI providers (Claude CLI and Codex CLI), optional ElevenLabs audio narration, Apple Reminders sync for action items, and a "Claude + Codex" side-by-side compare mode. Communication uses Chrome's Native Messaging API on Chrome, and an XPC + LaunchAgent bridge on Safari (see Section 6).

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CHROME BROWSER                                │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              Content Scripts (all pages)                      │    │
│  │                                                               │    │
│  │  ┌──────────────────┐  ┌─────────────────────────────────┐  │    │
│  │  │ content-detector │──│      extractors/                 │  │    │
│  │  │ (type detection) │  │  base-extractor.js (UI/sidebar) │  │    │
│  │  └──────────────────┘  │  youtube-extractor.js            │  │    │
│  │                         │  article-extractor.js            │  │    │
│  │                         │  webpage-extractor.js            │  │    │
│  │                         │  video-extractor.js              │  │    │
│  │                         │  selection-extractor.js          │  │    │
│  │                         └─────────────────────────────────┘  │    │
│  └────────────────────────────────┬────────────────────────────┘    │
│                                    │ postMessage                     │
│  ┌─────────────────┐    ┌────────▼────────┐    ┌─────────────────┐ │
│  │  context menus   │    │   sidebar.js    │◄──►│  background.js  │ │
│  │  (right-click)   │    │   (Sidebar UI)  │    │(Service Worker) │ │
│  └─────────────────┘    └─────────────────┘    └────────┬────────┘ │
└─────────────────────────────────────────────────────────┼──────────┘
                                                          │
                                            Native Messaging API
                                                          │
┌─────────────────────────────────────────────────────────┼──────────┐
│                      LOCAL SYSTEM (Node.js)             │          │
│  ┌──────────────────────────────────────────────────────▼────────┐ │
│  │                        host.js                                 │ │
│  │   getBridge(provider) routes generateSummary / followUp /      │ │
│  │   chat to the active provider. Other actions handled inline.   │ │
│  └──┬────────────┬──────────────┬─────────────┬──────────────┬───┘ │
│     │            │              │             │              │     │
│     ▼            ▼              ▼             ▼              ▼     │
│  ┌───────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐│
│  │claude-│  │codex-    │  │elevenlabs│  │apple-    │  │apple-    ││
│  │bridge │  │bridge    │  │.js (TTS) │  │notes.js  │  │reminders ││
│  │.js    │  │.js       │  │          │  │          │  │.js       ││
│  └───┬───┘  └────┬─────┘  └─────┬────┘  └──────────┘  └──────────┘│
│      │           │              │                                 │
│      ▼           ▼              ▼                                 │
│  ┌───────────┐  ┌────────────┐ ┌───────────────┐                  │
│  │ claude    │  │  codex     │ │ ElevenLabs    │                  │
│  │ --print   │  │  exec      │ │ HTTPS API     │                  │
│  │ (keychain)│  │ (~/.codex/ │ │ (api key)     │                  │
│  │           │  │  auth.json)│ │               │                  │
│  └───────────┘  └────────────┘ └───────────────┘                  │
└────────────────────────────────────────────────────────────────────┘
```

On Safari, `host.js` is reached through an XPC service + Aqua-session
LaunchAgent instead of Chrome's Native Messaging Hosts directory. See
Section 6 for the full topology and `docs/safari-troubleshooting.md` for
the runbook.

## Directory Structure

```
youtube-summary-extension/
├── extension/                    # Chrome extension files
│   ├── manifest.json            # Extension manifest (Manifest V3)
│   ├── content-detector.js      # Detects content type, runs on all pages
│   ├── content.js               # Legacy (unused, see extractors/)
│   ├── extractors/              # Content extraction modules
│   │   ├── base-extractor.js    # Shared UI: popup, floating button, sidebar
│   │   ├── youtube-extractor.js # YouTube transcript & comment extraction
│   │   ├── article-extractor.js # Article text extraction (DOM heuristics)
│   │   ├── webpage-extractor.js # Fallback page text extraction
│   │   ├── video-extractor.js   # HTML5 video caption extraction (VTT/SRT)
│   │   └── selection-extractor.js # Text selection extraction
│   ├── lib/                     # Vendored libraries
│   │   └── readability.js       # Mozilla Readability (placeholder)
│   ├── background.js            # Service worker for native messaging
│   ├── sidebar/
│   │   ├── sidebar.html         # Sidebar UI
│   │   ├── sidebar.js           # Sidebar logic
│   │   └── styles.css           # All CSS styles
│   └── settings/
│       ├── settings.html        # Settings page
│       ├── settings.js          # Settings logic
│       └── settings.css         # Settings styles
├── native-host/                  # Node.js native messaging host
│   ├── host.js                  # Main entry point (stdin/stdout)
│   ├── agent-server.js          # Safari only: Unix-socket wrapper run as a
│   │                            #   LaunchAgent in the Aqua session so it
│   │                            #   has keychain access. Spawns host.js per
│   │                            #   accepted connection.
│   ├── claude-bridge.js         # Claude CLI integration (prompt build, parse)
│   ├── codex-bridge.js          # Codex CLI (OAuth) integration; reuses
│   │                            #   claude-bridge prompt builders + parser
│   ├── anthropic-client.js      # Legacy direct Anthropic API client (no
│   │                            #   longer wired into host.js — kept for
│   │                            #   reference and test fixture compatibility)
│   ├── elevenlabs.js            # ElevenLabs HTTPS client (TTS audio + voices)
│   ├── transcript-extractor.js  # Standalone transcript fetch helper
│   ├── apple-notes.js           # AppleScript wrapper
│   ├── apple-reminders.js       # Apple Reminders via AppleScript
│   ├── logger.js                # Shared file-logger (writes extension.log)
│   ├── package.json             # Dependencies
│   ├── com.youtube.summary.json # Chrome native messaging manifest template
│   └── com.altonfong.aisummary.host.plist.template  # Safari LaunchAgent template
├── safari/                       # Safari Web Extension wrapper (macOS only)
│   └── AI Summary/
│       ├── AI Summary.xcodeproj  # Xcode project (folder refs to ../../../extension)
│       ├── AI Summary/           # Wrapper macOS app target (stub UI)
│       ├── AI Summary Extension/ # Safari Web Extension target (sandboxed)
│       │   ├── SafariWebExtensionHandler.swift  # XPC client; forwards to NodeBridge
│       │   └── AI Summary Extension.entitlements  # sandbox=YES, network.client
│       ├── NodeBridge/           # XPC service target (UNsandboxed)
│       │   ├── main.swift                   # NSXPCListener boot
│       │   ├── NodeBridgeService.swift      # Spawns and proxies host.js
│       │   └── Info.plist                   # XPCService dict
│       └── Shared/
│           └── NodeBridgeProtocol.swift     # NSXPCProtocol shared by both
├── docs/                         # Long-form developer docs
│   ├── safari-troubleshooting.md # Safari port runbook
│   └── plans/                    # Design notes for in-flight features
├── wiki/                         # GitHub wiki source (user guide + screenshots)
├── install.sh                    # Chrome installer (native messaging manifest)
├── install-safari.sh             # Safari installer (xcodebuild + /Applications)
├── README.md                     # User documentation
├── AGENTS.md                     # This file (dev guide)
├── CLAUDE.md                     # Symlink → AGENTS.md (Claude Code reads this)
├── FEATURES.md                   # Feature request log (UPDATE THIS when adding features!)
└── PLAN.md                       # Original implementation plan (historical)
```

## Key Components

### 1. Content Scripts (`extension/content-detector.js` + `extension/extractors/`)

`extension/content.js` is **legacy** and intentionally a stub — the file
only documents where the logic moved. Do not edit it; do not add behavior
to it. The active content-script load order is set in `manifest.json`:

```
lib/readability.js
extractors/base-extractor.js
extractors/youtube-extractor.js
extractors/article-extractor.js
extractors/webpage-extractor.js
extractors/video-extractor.js
extractors/selection-extractor.js
content-detector.js
```

**Roles:**
- `content-detector.js` — runs on every page, classifies the URL (YouTube
  vs article vs generic webpage vs HTML5 video vs selection), captures
  page metadata, and routes to the right extractor.
- `extractors/base-extractor.js` — shared UI shell: floating button, compact
  toast banner, sidebar iframe lifecycle, postMessage plumbing. Every
  content-type extractor builds on this.
- `extractors/youtube-extractor.js` — YouTube transcript + comments scraping.
  DOM selectors used (may change if YouTube updates their UI): transcript
  container `ytd-transcript-segment-list-renderer`, segments
  `ytd-transcript-segment-renderer`, text `.segment-text`. The 2025+ YouTube
  DOM revisions are handled here (see commit `7e5ec5d`).
- `extractors/article-extractor.js` — DOM-heuristic article extraction.
- `extractors/webpage-extractor.js` — fallback for generic pages.
- `extractors/video-extractor.js` — pulls VTT/SRT captions off a `<video>`.
- `extractors/selection-extractor.js` — extracts the user's text selection
  (driven by the right-click context menu).

### 2. Sidebar (`extension/sidebar/`)

**Purpose**: Main UI for the extension

**Key Features**:
- Video info display
- Generate summary button
- Editable key learnings (textarea)
- Rich text editor for custom notes
- Folder selection for Apple Notes
- Save functionality

**Communication**:
- Uses `window.postMessage` to talk to content script
- Uses `chrome.runtime.sendMessage` to talk to background script

### 3. Background Script (`extension/background.js`)

**Purpose**: Service worker that bridges extension ↔ native host

**Key Responsibilities**:
- Maintains native messaging connection
- Routes messages between sidebar and native host
- Handles connection lifecycle and errors

**Native Host Name**:
- Chrome: `com.youtube.summary` (matches the manifest in `NativeMessagingHosts/`)
- Safari: `com.altonfong.aisummary` (the wrapper app's bundle ID — Safari resolves
  `connectNative` by bundle ID, not manifest)

The script feature-detects Safari via the `safari-web-extension://` URL scheme
and picks the right name automatically.

### 4. Native Host (`native-host/host.js`)

**Purpose**: Node.js process that Chrome communicates with

**Protocol**: Chrome's Native Messaging uses length-prefixed JSON:
- First 4 bytes: message length (UInt32LE)
- Remaining bytes: JSON message

**Message Actions** (handled in the `switch` in `handleMessage`):
- `generateSummary` — generate summary from transcript / article / page text
- `saveToNotes` — write the result to Apple Notes
- `listFolders` — enumerate Apple Notes folders for the picker
- `followUp` — single-shot follow-up question against the existing summary
- `chat` — multi-turn conversation with full content + prior turns in context
- `generateAudio` — render summary/learnings/actions as speech via ElevenLabs
- `listVoices` — fetch the user's ElevenLabs voice library
- `checkAuth` — reports availability for Claude CLI, Codex CLI, and the
  Codex `auth.json` so the settings page can render status dots

**Provider routing**: AI-bound actions (`generateSummary`, `followUp`,
`chat`) read a `provider` field from the incoming message and dispatch
through `getBridge(provider)`. Defaults to `claude` for backwards
compatibility with older extension builds. The "Claude + Codex" compare
mode in the sidebar issues two parallel `generateSummary` calls — one per
provider — and renders the results side by side.

### 5. Claude Bridge (`native-host/claude-bridge.js`)

**Purpose**: Spawns Claude CLI and handles prompt/response

**Key Behavior**:
- Wraps user's custom instructions with a system prompt
- Builds content-type-specific prompts: `createPrompt` (YouTube),
  `createArticlePrompt`, `createSelectionPrompt`
- Output format is template-driven via `buildOutputFormat(templateSections)` —
  enabled sections (summary, key_learnings, action_items, relevant_links, etc.)
  are emitted in the user's configured order with their configured labels
- `parseResponse()` reads back whichever section labels the template uses
  via `getParseLabels(templateSections)`
- Streams progress callbacks (`stage: extracting | thinking | parsing | complete`)
  back through the native-messaging port. Chrome surfaces these as staged
  progress UI; Safari drops them (request/response only) and shows a
  spinner instead

**Important**: `claude-bridge` is the single source of truth for prompt
construction and response parsing. `codex-bridge.js` deliberately reuses
its `createPrompt`, `createArticlePrompt`, `createSelectionPrompt`, and
`parseResponse` so output stays identical across providers.

### 5b. Codex Bridge (`native-host/codex-bridge.js`)

**Purpose**: Spawns the OpenAI Codex CLI and exposes the same interface
as `claude-bridge` (`generateSummary`, `generateFollowUp`, `chat`).

**Key behavior**:
- Spawns `codex exec --skip-git-repo-check --color never --ephemeral
  --output-last-message <tmpfile>`, pipes the prompt via stdin, reads the
  clean reply from the tempfile (stdout is too noisy to parse).
- Authentication uses OAuth credentials cached in `~/.codex/auth.json` by
  `codex login`. No API keys live in the extension.
- `findCodexCommand()` resolves the binary even when the
  Aqua-session LaunchAgent's PATH was captured before Codex was installed
  — it scans `/opt/homebrew/Cellar/node/*/bin/codex` and `npm prefix -g`
  paths in addition to the static candidates.
- Reuses the prompt builders and parser from `claude-bridge` so swapping
  providers does not change formatting or parsing logic.

### 6. Safari Bridge (XPC service + Aqua-session LaunchAgent)

**Purpose**: On Safari, replaces Chrome's Native Messaging API. Routes
extension messages to `native-host/host.js` and proxies the same
length-prefixed JSON protocol Chrome uses.

**Three tiers, layered for sandbox/keychain reasons**:

```
┌──────────────────────────────────────────────────┐
│ Safari Web Extension (.appex)                    │  sandbox = YES
│   SafariWebExtensionHandler.swift                │
│           │ NSXPCConnection                      │
│           ▼                                      │
│   NodeBridge.xpc (in appex/Contents/XPCServices) │  sandbox = NO
│     opens AF_UNIX socket per request             │
│           │ Unix socket                          │
│           ▼                                      │
│   LaunchAgent: agent-server.js                   │  Aqua session
│     listens on ~/Library/Caches/com.altonfong.  │
│     aisummary/host.sock; spawns host.js per     │
│     incoming connection                          │
│           │ stdin/stdout                         │
│           ▼                                      │
│   node host.js  (existing, unchanged)            │
│           │ spawns                               │
│           ▼                                      │
│   claude --print  (reads keychain credential)    │
└──────────────────────────────────────────────────┘
```

**Why each tier exists**:

1. *Sandbox on the Extension*: Safari refuses to discover Web Extensions
   whose containing app target is not sandboxed
   (`extensionkit:discovery: Extension is not entitled to run in the App Sandbox`).
2. *Unsandboxed XPC service*: a sandboxed extension can't spawn arbitrary
   child processes, but a co-bundled XPC service can have its own (looser)
   sandbox config. We make this one a thin transport adapter.
3. *Aqua-session LaunchAgent*: when launchd spawns the XPC service via
   xpcproxy, the service runs in a security session that **doesn't have the
   user's login keychain unlocked**. The Claude CLI keeps its OAuth token in
   the keychain, so any spawn from the XPC service reports "Not logged in".
   We sidestep this by running `host.js` inside a LaunchAgent with
   `LimitLoadToSessionType=Aqua` (the GUI session). That agent inherits the
   user's unlocked keychain handle the same way Terminal does.

The XPC service no longer spawns Node; it just opens a fresh AF_UNIX socket
to the agent for each Safari request, sends one framed JSON message, reads
frames until the non-progress final response arrives, and closes.
`agent-server.js` spawns a fresh `host.js` per accepted connection so each
request is isolated.

**Why spawn `host.js` rather than reimplement everything in Swift**: a single
source of truth for the Anthropic client / AppleScript automation. The
Chrome and Safari builds share 100% of `native-host/`.

**Idle cost**: the agent is a Node.js process that holds ~46 MB resident and
~0% CPU when no requests are in flight. host.js processes only exist for
the duration of a single request and exit when the socket closes.

**Config**: `install-safari.sh` writes `~/Library/Application Support/AI Summary/config.json`
with `nodePath`, `hostPath`, and `socketPath`. The plist template is at
`native-host/com.altonfong.aisummary.host.plist.template`.

**Limitations**:
- Drops `progress` messages. Safari's port API is request/response only —
  the native side can't push spontaneous events. Final results work; staged
  progress UI doesn't.
- Distribution to others (Mac App Store, Developer ID + notarization) is not
  yet wired up. The current build uses an Apple Development cert + automatic
  provisioning profile; this works only on the developer's own Mac.

### 7. Apple Notes (`native-host/apple-notes.js`)

**Purpose**: Creates notes in Apple Notes via AppleScript

**Functions**:
- `saveNote()` - Main function to save
- `ensureFolder()` - Creates folder if needed
- `createNote()` - Creates note in folder
- `formatNoteContent()` - Formats HTML content

**Note**: Requires macOS and AppleScript permissions.

## Data Flow

### Generate Summary Flow

1. User clicks "Generate Summary" in the sidebar
2. `sidebar.js` asks the active extractor for content via `postMessage`
   (the right extractor is whichever one `content-detector.js` picked for
   this page — YouTube, article, webpage, video, or selection)
3. The extractor returns `{ title, content, metadata, ... }`
4. `sidebar.js` loads provider, model, custom instructions, and templates
   from `chrome.storage.sync`
5. `sidebar.js` sends to `background.js` via `chrome.runtime.sendMessage`
6. `background.js` forwards to the native host (Chrome: Native Messaging
   port; Safari: same JSON shape, transported via XPC + LaunchAgent)
7. `host.js` reads `provider` from the message, calls
   `getBridge(provider).generateSummary(...)` — `claude-bridge.js` or
   `codex-bridge.js` depending on the user's selection
8. The bridge spawns `claude --print` (or `codex exec`), pipes the prompt
   via stdin, and reads the response
9. Response flows back through the same chain. On Chrome, intermediate
   `progress` messages stream through too; on Safari they are dropped

### Compare Mode Flow ("Claude + Codex" side-by-side)

1. Sidebar issues two parallel `generateSummary` requests — one with
   `provider: 'claude'`, one with `provider: 'codex'`
2. Each request travels independently through `background.js` →
   `host.js` → its own bridge process
3. Sidebar renders the two responses in adjacent panes as each completes;
   follow-up chat is per-pane

### Save to Notes Flow

1. User clicks "Save to Apple Notes"
2. `sidebar.js` collects edited learnings + custom notes + selected links
3. Sends to native host with folder name (and optional Reminders flags)
4. `host.js` routes to `apple-notes.js` (and `apple-reminders.js` if
   action items should sync)
5. AppleScript creates the folder if needed, then the note (and any
   reminders)

## Configuration Storage

`chrome.storage.sync` (synced across the user's browser profile):
- `provider` — `'claude'` or `'codex'` (active AI provider)
- `claudeModel` — Claude model preset (`'sonnet'`, `'opus'`, `'haiku'`)
- `codexModel` — Codex model string (default `'gpt-5.5'`)
- `templates` — per-content-type output templates with sections, labels,
  and instructions; `analysisInstructions` is also written for legacy fallback
- `remindersCheckedByDefault` — whether action items default to checked
- `elevenlabsApiKey` — ElevenLabs API key (only API key the extension stores)
- `elevenlabsVoiceId` — selected voice ID
- `audioIncludeSummary` / `audioIncludeLearnings` / `audioIncludeActions` —
  which sections feed into TTS audio generation

`chrome.storage.local`:
- `folderSuggestions` — recent Apple Notes folder names

`chrome.storage.session`:
- compact-toast dismissal state (resets on browser restart)

`localStorage`:
- `youtube-summary-btn-position` — floating button position

## Installation

The `install.sh` script:
1. Installs npm dependencies
2. Makes `host.js` executable
3. Prompts for extension ID
4. Creates native messaging manifest in correct location

**Manifest Location (macOS)**:
`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.youtube.summary.json`

## Common Development Tasks

### Adding a New Message Type

1. Add handler in `host.js` switch statement
2. Create module function if needed
3. Update `background.js` if special handling needed
4. Update `sidebar.js` to send new message type

### Modifying the Prompt

Edit `claude-bridge.js`:
- `DEFAULT_INSTRUCTIONS` - Default analysis focus
- `createPrompt()` - System wrapper that enforces format

### Changing UI

- HTML: `sidebar/sidebar.html`
- Styles: `sidebar/styles.css`
- Logic: `sidebar/sidebar.js`

### Debugging

1. Check extension console: Right-click extension icon → Inspect
2. Check YouTube page console: DevTools on YouTube tab
3. Check native host logs: `tail -f native-host/extension.log`

## Development Guidelines (Required Practices)

### Before Making Changes

1. **Always read existing code first** - Never modify code you haven't read. Understand the current implementation before suggesting changes.
2. **Understand the data flow** - Trace how data moves from YouTube → content script → sidebar → background → native host → Claude/Apple Notes.
3. **Check this file** - Review AGENTS.md for architecture docs and existing patterns before starting work.
4. **Review related files** - Changes often affect multiple components. Check all related files.

### Code Quality

1. **Write unit tests** - All new functionality should have corresponding tests.
2. **Test edge cases** - Handle: no transcript available, API errors, timeouts, invalid input, permission denied.
3. **Error handling** - Always provide user-friendly error messages. Log detailed errors for debugging.
4. **Keep functions focused** - Single responsibility principle. Extract helpers for reusable logic.
5. **Use consistent patterns** - Follow existing code style and patterns in the codebase.

### Documentation Requirements

1. **Update README.md** - If user-facing behavior changes, update the README.
2. **Update AGENTS.md** - If architecture, data flow, or key components change, update this file.
3. **Update FEATURES.md** - **REQUIRED**: Whenever a new feature is added, you MUST update `/FEATURES.md` with:
   - Feature name and description
   - What the user requested
   - How it was implemented
   - Any relevant technical notes
4. **JSDoc comments** - Add JSDoc comments to all new functions with:
   - Description of what the function does
   - `@param` for each parameter
   - `@returns` for return value
   - `@throws` if it can throw errors
4. **Inline comments** - Add comments for complex logic that isn't self-explanatory.

### Testing Requirements

1. **Manual testing checklist** - Before committing, verify:
   - [ ] Extension loads without errors
   - [ ] Sidebar opens/closes correctly
   - [ ] Transcript extraction works
   - [ ] Summary generation completes
   - [ ] Key learnings are editable
   - [ ] Save to Apple Notes works
   - [ ] Settings page functions correctly
2. **Test on real YouTube videos** - Use actual videos, not mocked data.
3. **Test error scenarios** - Verify error handling for network failures, missing transcripts, etc.
4. **Cross-browser testing** - If time permits, test on Chrome and Chromium-based browsers.

### Git Practices

1. **Commit after every feature/change** - **REQUIRED**: After completing any feature or change, you MUST create a commit and push it to the remote repository.

2. **Detailed commit messages** - Use this format:
   ```
   <type>: <short description>

   User Request:
   <Quote or summarize what the user asked for>

   Changes Made:
   - <List of specific changes/files modified>
   - <Implementation details>

   Use Case:
   <Why this feature exists / what problem it solves>

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
   ```

   Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

   Example:
   ```
   feat: add draggable floating button

   User Request:
   "can you make it so that the floating button can be repositioned?"

   Changes Made:
   - Added drag event handlers in content.js
   - Position saved to localStorage for persistence
   - Added grab cursor on hover to indicate draggability
   - Button stays within viewport bounds

   Use Case:
   Users may want the button in different positions to avoid
   overlapping with YouTube UI elements or personal preference.

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
   ```

3. **Push after committing** - Always push to remote after creating a commit:
   ```bash
   git add -A && git commit -m "..." && git push
   ```

4. **Small, focused commits** - One logical change per commit.
5. **Never commit secrets** - No API keys, passwords, or sensitive data.
6. **Review before pushing** - Use `git diff` to review changes before committing.

### Architecture Changes

1. **Document the rationale** - When making architectural changes, document WHY in AGENTS.md.
2. **Update diagrams** - Keep the architecture diagram current.
3. **Consider backwards compatibility** - Don't break existing user settings or data.
4. **Discuss major changes** - For significant architectural changes, discuss approach before implementing.

### Performance Considerations

1. **Minimize DOM operations** - Batch DOM reads/writes where possible.
2. **Handle large transcripts** - Some videos have very long transcripts; handle gracefully.
3. **Timeout handling** - Always set reasonable timeouts for external calls.
4. **Memory management** - Clean up event listeners and observers when no longer needed.

### Security Considerations

1. **Sanitize user input** - Never trust user input; sanitize before use.
2. **Content Security Policy** - Be aware of CSP restrictions in extension context.
3. **AppleScript injection** - Escape all strings passed to AppleScript to prevent injection.
4. **API key handling** - Claude and Codex both use CLI auth (Claude keychain, Codex `~/.codex/auth.json`), so no AI provider keys live in the extension. ElevenLabs is the one exception — its API key is stored in `chrome.storage.sync['elevenlabsApiKey']` and forwarded to the native host per request. Treat that key as user secret.

## Known Limitations

- **macOS only** — Apple Notes / Reminders integration uses AppleScript
- **Requires a CLI** — at least one of Claude CLI or Codex CLI must be
  installed and authenticated; the settings page surfaces this status
- **YouTube DOM dependent** — transcript scraping may break if YouTube
  changes its UI again (last refresh covered the 2025+ DOM, see commit
  `7e5ec5d`)
- **Manifest V3** — the service worker may go idle; the background script
  re-establishes the native messaging connection on demand
- **Safari has no streaming progress** — Safari Web Extensions are
  request/response only, so the staged progress UI Chrome shows is dropped
  on Safari (final result is identical)

## Testing Checklist

- [ ] Extension loads in Chrome without errors
- [ ] Floating button / compact toast appears on YouTube, articles, and
      generic web pages
- [ ] Sidebar opens / closes correctly; closing fully releases page scroll
- [ ] YouTube transcript extraction works (test on a recent video to catch
      DOM regressions)
- [ ] Article extractor pulls clean text from a typical news / blog page
- [ ] Right-click context menu summarizes a text selection
- [ ] HTML5 video page extracts captions
- [ ] Claude provider generates a summary end-to-end
- [ ] Codex provider generates a summary end-to-end
- [ ] "Claude + Codex" compare mode renders both panes
- [ ] Follow-up question / multi-turn chat preserves transcript context
- [ ] Key learnings + action items are editable and reorder cleanly
- [ ] Save to Apple Notes creates the note in the correct folder
- [ ] Action items sync to Apple Reminders when enabled
- [ ] ElevenLabs audio generation produces a playable file
- [ ] Settings page opens from the sidebar and persists every field
- [ ] Safari build: extension loads, summary completes (no progress UI is expected)

## Future Enhancement Ideas

- Spaced repetition reminders
- Export to Obsidian/Notion
- Batch processing playlists
- Support for other video platforms
- Offline transcript caching
