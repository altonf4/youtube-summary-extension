# AI Summary Extension (Claude + Codex)

Generate AI summaries of **any web content** — YouTube videos, articles, web pages, and selected text — using your Claude Code or OpenAI Codex subscription. Save key learnings to Apple Notes, sync action items to Apple Reminders, and optionally listen to summaries via ElevenLabs text-to-speech.

## Features

- **Works on anything** — YouTube videos, articles, generic web pages, text selections, and HTML5 videos with captions
- **Two AI providers** — Claude CLI and OpenAI Codex CLI (OAuth), pick per task or run them side-by-side in **Compare mode**
- **Key learnings + action items** — concise summary plus 5–7 actionable takeaways and a separate task list
- **Apple Notes** — save summaries to a folder of your choice (folders are auto-created)
- **Apple Reminders sync** — push action items as reminders with one click
- **Audio narration** — ElevenLabs text-to-speech for summary / learnings / actions (bring your own ElevenLabs API key)
- **Multi-turn follow-up chat** — keep asking with the full transcript and prior turns in context
- **Transcript search + viewer** — search and highlight inside the original transcript
- **Customisable templates** — per-content-type prompt instructions and output sections
- **Right-click "Summarize selection"** — works on any page
- **Chrome and Safari** — same extension source, native bridge for each
- **No AI API costs** — uses your existing Claude / Codex subscriptions via local CLI auth (only ElevenLabs needs an API key, and only if you turn audio on)

## 📖 User Guide

For detailed usage instructions with screenshots, see the **[Wiki](../../wiki)**.

## Prerequisites

- **macOS** (for Apple Notes / Reminders integration)
- **Google Chrome / Chromium** *or* **Safari** (see [Safari install](#safari-installation))
- **Node.js** (v14 or higher) — [Download](https://nodejs.org/)
- **At least one AI CLI**, authenticated:
  - **Claude Code CLI** with an active Claude subscription (`claude login`), or
  - **OpenAI Codex CLI** with an active subscription (`codex login`)
- **Xcode** (Safari only) — required to build the wrapper app
- **ElevenLabs API key** (optional) — only needed if you want audio narration

### Installing Claude Code

If you don't have Claude Code installed:

```bash
# macOS/Linux (Recommended)
curl -fsSL https://claude.ai/install.sh | bash

# Or via Homebrew (macOS/Linux)
brew install --cask claude-code

# Or via npm (deprecated but still works)
npm install -g @anthropic-ai/claude-code
```

For more details, see: https://docs.anthropic.com/en/docs/claude-code

Verify installation:
```bash
claude --version
```

## Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/altfong/youtube-summary-extension.git
cd youtube-summary-extension
```

### Step 2: Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `extension` folder inside this directory
5. Copy the **Extension ID** (looks like: `abcdefghijklmnopqrstuvwxyzabcdef`)

### Step 3: Run Installation Script

```bash
./install.sh
```

The script will:
- Install npm dependencies
- Make the native host executable
- Prompt you for the Extension ID
- Install the native messaging manifest

Paste the Extension ID you copied in Step 2 when prompted.

### Step 4: Reload Extension

1. Go back to `chrome://extensions/`
2. Click the **Reload** button on the YouTube Summary extension

## Safari Installation

The Safari build wraps the same `extension/` source in a macOS app. Apple
requires Safari Web Extensions to ship inside an app bundle — there is no
"Load unpacked" equivalent in Safari.

### One-shot install

```bash
./install-safari.sh
```

The script:

1. Detects your Apple Development signing identity and team ID
2. Builds `safari/AI Summary/` with `xcodebuild -allowProvisioningUpdates`
3. Installs `AI Summary.app` to `/Applications`
4. Writes `~/Library/Application Support/AI Summary/config.json` with paths
   to your `node`, `host.js`, and the agent's Unix socket
5. Installs and loads `~/Library/LaunchAgents/com.altonfong.aisummary.host.plist`
   into your Aqua (GUI) session via `launchctl bootstrap`. The agent runs
   `native-host/agent-server.js`, which exposes `host.js` over a local Unix
   socket so the Safari extension can reach it with full keychain access.

### Enable in Safari

1. Open `/Applications/AI Summary.app` once (the wrapper app — it just
   registers the extension with Safari).
2. Safari → Settings → Extensions → enable **AI Summary Extension**.
3. If Safari asks, choose **Always Allow** for site access.
4. If macOS Gatekeeper blocks the app on first launch (because it's
   ad-hoc signed), right-click the app and choose **Open**.
5. If Safari refuses to load the unsigned extension, enable
   **Develop → Allow Unsigned Extensions** (you may need to re-enable this
   each Safari relaunch).

### What's different on Safari

- **Streaming progress dropped.** Chrome shows staged progress while Claude
  works (extracting transcript, fetching comments, generating summary).
  Safari just shows a spinner — Safari Web Extensions can't push spontaneous
  messages from the native side back to a `connectNative` port. Final result
  is identical.
- **Same native host.** Both browsers run `native-host/host.js`. No business
  logic was duplicated in Swift.
- **One background process.** A LaunchAgent (`com.altonfong.aisummary.host`)
  runs in your GUI session so the Claude CLI can read its keychain
  credentials. Idle cost is ~46 MB resident, ~0% CPU. To uninstall:
  `launchctl bootout gui/$(id -u)/com.altonfong.aisummary.host && rm ~/Library/LaunchAgents/com.altonfong.aisummary.host.plist`.

## Usage

### Generating Summaries

1. Navigate to any supported page:
   - A YouTube video with captions / subtitles
   - An article or blog post
   - Any generic web page (best-effort extraction)
   - Or, on any page: highlight some text, right-click, choose **Summarize selection**
2. Click the **AI Summary** floating button (or the compact toast in the
   bottom-right corner) — the sidebar opens on the right
3. (Optional) In the sidebar header, switch the AI provider between
   **Claude** and **Codex**, or pick **Compare** to run both at once
4. Click **Generate Summary**
5. Wait while the provider analyses the content (typically 30 s – 2 min)
6. Review the summary, key learnings, action items, and relevant links
7. Use **Follow-up** to ask multi-turn questions with the full content in
   context

### Saving to Apple Notes

1. After generating a summary, select/deselect key learnings you want to save
2. Enter a folder name (e.g., "Tech", "Education", "Business")
   - Folders are created automatically if they don't exist
   - Previous folders are suggested as you type
3. Click **Save to Apple Notes**
4. The first time, macOS will prompt you to grant automation permissions

### Granting Permissions

When you first save to Apple Notes, macOS will ask for permission:

1. Open **System Settings** > **Privacy & Security** > **Automation**
2. Find `node` or the terminal app
3. Enable access to **Notes**

## Folder Organization

Summaries are organized in Apple Notes by the folder name you specify:

- **One folder per topic**: Group related videos together
- **By channel**: Organize by content creator
- **By subject**: Sort by learning topics (e.g., "Programming", "History")

Each note includes:
- Video title and URL
- Date saved
- AI-generated summary
- Selected key learnings
- Link back to video

## Architecture

```
        Browser (Chrome or Safari)
┌──────────────────────────────────────────────┐
│ content-detector.js  →  picks an extractor   │
│   ├─ youtube-extractor.js                    │
│   ├─ article-extractor.js                    │
│   ├─ webpage-extractor.js                    │
│   ├─ video-extractor.js                      │
│   └─ selection-extractor.js                  │
│                                              │
│ sidebar.js  ◄──postMessage──►  extractor     │
│      │                                       │
│      └─ chrome.runtime.sendMessage           │
│                  │                           │
│                  ▼                           │
│           background.js                      │
└──────────────────┼───────────────────────────┘
                   │ Native Messaging (Chrome)
                   │ XPC + LaunchAgent (Safari)
                   ▼
        ┌─────────────────────────┐
        │       host.js           │
        │  getBridge(provider)    │
        └─┬────┬──────┬─────┬─────┘
          │    │      │     │
          ▼    ▼      ▼     ▼
   claude- codex- apple- elevenlabs
   bridge  bridge notes  .js
   (CLI)   (CLI)  (+reminders)
```

For the full Safari topology (XPC service + Aqua-session LaunchAgent
that lets `host.js` reach the keychain), see
[`AGENTS.md`](AGENTS.md#6-safari-bridge-xpc-service--aqua-session-launchagent)
and [`docs/safari-troubleshooting.md`](docs/safari-troubleshooting.md).

## File Structure

```
youtube-summary-extension/
├── extension/                       # Web extension source (Chrome + Safari)
│   ├── manifest.json                # Manifest V3
│   ├── background.js                # Service worker / native messaging
│   ├── content-detector.js          # Picks an extractor per page
│   ├── content.js                   # Legacy stub (do not edit)
│   ├── extractors/                  # Per-content-type extractors + shared UI
│   │   ├── base-extractor.js        # Floating button, toast, sidebar shell
│   │   ├── youtube-extractor.js
│   │   ├── article-extractor.js
│   │   ├── webpage-extractor.js
│   │   ├── video-extractor.js
│   │   └── selection-extractor.js
│   ├── lib/readability.js           # Vendored
│   ├── sidebar/                     # Sidebar UI (HTML / JS / CSS)
│   └── settings/                    # Settings page (HTML / JS / CSS)
├── native-host/                     # Node.js native host
│   ├── host.js                      # Entry point — routes all actions
│   ├── claude-bridge.js             # Claude CLI provider
│   ├── codex-bridge.js              # Codex CLI provider
│   ├── elevenlabs.js                # TTS audio
│   ├── apple-notes.js               # AppleScript → Notes
│   ├── apple-reminders.js           # AppleScript → Reminders
│   ├── agent-server.js              # Safari-only Unix-socket wrapper
│   ├── logger.js                    # Shared file logger
│   ├── package.json
│   ├── com.youtube.summary.json     # Chrome native-messaging manifest
│   └── com.altonfong.aisummary.host.plist.template  # Safari LaunchAgent
├── safari/                          # Xcode project for the Safari wrapper
├── docs/                            # Long-form developer docs
│   ├── safari-troubleshooting.md
│   └── plans/
├── wiki/                            # GitHub wiki source (user guide)
├── install.sh                       # Chrome installer
├── install-safari.sh                # Safari installer (xcodebuild)
├── README.md                        # This file
├── AGENTS.md                        # Developer / architecture guide
├── CLAUDE.md                        # Symlink → AGENTS.md
├── FEATURES.md                      # Feature request + implementation log
└── PLAN.md                          # Original implementation plan
```

## Troubleshooting

### Extension Not Connecting to Native Host

**Error**: "Could not connect to native messaging host"

**Solutions**:
1. Ensure you ran `./install.sh` successfully
2. Verify the Extension ID matches what you provided during installation
3. Check that `host.js` is executable: `chmod +x native-host/host.js`
4. Reload the extension in `chrome://extensions/`

### Claude Code / Codex CLI Not Found

**Error**: "Claude Code CLI not found" or "Codex CLI not found"

**Solutions**:
1. Verify the CLI is installed: `which claude` or `which codex`
2. Ensure it's in your shell PATH
3. Try running it directly in the terminal
4. Reinstall if needed
5. The settings page surfaces auth status for both providers — if Claude
   shows green and Codex shows red (or vice versa), pick the green one

### No Transcript Available

**Error**: "Could not fetch transcript"

**Causes**:
- Video doesn't have captions/subtitles enabled
- Video has auto-generated captions disabled
- Age-restricted or private videos

**Solution**:
- Try a different video with captions
- Enable subtitles on the video if you're the creator

### Apple Notes Permission Denied

**Error**: "Not authorized to control Apple Notes"

**Solution**:
1. Open **System Settings** > **Privacy & Security** > **Automation**
2. Find the app that's running the script (usually `node`)
3. Enable **Notes** access
4. Try again

### Summary Generation Takes Too Long

**Causes**:
- Long video with extensive transcript
- Claude Code is processing
- Network issues

**Solutions**:
- Wait up to 2 minutes (timeout limit)
- Try with a shorter video first
- Check Claude Code is working: `echo "Hello" | claude`

### Check Logs

View debug logs:
```bash
tail -f native-host/extension.log
```

## Limitations

- **macOS only** (Apple Notes / Reminders integration uses AppleScript)
- **YouTube videos need captions** — videos without captions / subtitles
  can't be summarised. Articles, generic pages, and selections do not
  have this constraint
- **Processing time**: typically 30 s – 2 min depending on content length
  and provider
- **At least one CLI subscription** — Claude or Codex
- **Safari has no streaming progress** — Safari shows a spinner instead of
  the staged progress UI Chrome shows; the final result is identical
- **Audio narration** requires an ElevenLabs API key

## Future Enhancements

Potential features for future versions:

- Spaced repetition reminders
- Support for other video platforms (Vimeo, etc.)
- Notion / Obsidian export
- Batch processing of playlists
- Export summaries as PDF / Markdown

## Contributing

This is a personal project. Feel free to fork and modify for your own use.

## License

MIT License - use freely for personal or commercial projects.

## Credits

Built with:
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/) and Safari Web Extensions
- [Claude Code CLI](https://code.claude.com)
- [OpenAI Codex CLI](https://github.com/openai/codex)
- [ElevenLabs](https://elevenlabs.io) (optional TTS)
- AppleScript for Notes / Reminders integration

---

**Questions or Issues?**

Check the logs at `native-host/extension.log` for debugging information.
