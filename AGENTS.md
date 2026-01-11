# AGENTS.md - Development Guide for YouTube Summary Extension

This document is intended for AI agents and developers working on this codebase. It explains the architecture, key components, and how everything fits together.

## Project Overview

This is a Chrome extension that generates AI summaries of YouTube videos using Claude CLI and saves them to Apple Notes. It uses Chrome's Native Messaging API to communicate between the browser extension and local Node.js processes.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CHROME BROWSER                                │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │   content.js    │◄──►│   sidebar.js    │◄──►│  background.js  │ │
│  │  (YouTube page) │    │   (Sidebar UI)  │    │(Service Worker) │ │
│  └─────────────────┘    └─────────────────┘    └────────┬────────┘ │
└─────────────────────────────────────────────────────────┼──────────┘
                                                          │
                                            Native Messaging API
                                                          │
┌─────────────────────────────────────────────────────────┼──────────┐
│                      LOCAL SYSTEM (Node.js)             │          │
│  ┌──────────────────────────────────────────────────────▼────────┐ │
│  │                        host.js                                 │ │
│  │                  (Native Messaging Host)                       │ │
│  └──────┬─────────────────────┬─────────────────────┬────────────┘ │
│         │                     │                     │              │
│         ▼                     ▼                     ▼              │
│  ┌──────────────┐    ┌───────────────┐    ┌─────────────────┐     │
│  │claude-bridge │    │ apple-notes.js│    │transcript-      │     │
│  │    .js       │    │ (AppleScript) │    │extractor.js     │     │
│  └──────┬───────┘    └───────────────┘    │(unused-legacy)  │     │
│         │                                  └─────────────────┘     │
│         ▼                                                          │
│  ┌──────────────┐                                                  │
│  │  Claude CLI  │                                                  │
│  │   (claude)   │                                                  │
│  └──────────────┘                                                  │
└────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
youtube-summary-extension/
├── extension/                    # Chrome extension files
│   ├── manifest.json            # Extension manifest (Manifest V3)
│   ├── content.js               # Injected into YouTube pages
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
│   ├── claude-bridge.js         # Claude CLI integration
│   ├── apple-notes.js           # AppleScript wrapper
│   ├── transcript-extractor.js  # Legacy (unused - DOM scraping now)
│   ├── package.json             # Dependencies
│   └── com.youtube.summary.json # Native messaging manifest template
├── install.sh                    # Installation script
├── README.md                     # User documentation
├── AGENTS.md                     # This file (dev guide)
├── FEATURES.md                   # Feature request log (UPDATE THIS when adding features!)
└── PLAN.md                       # Original implementation plan
```

## Key Components

### 1. Content Script (`extension/content.js`)

**Purpose**: Injected into YouTube video pages to:
- Add the "AI Summary" toggle button to YouTube's UI
- Create and manage the sidebar iframe
- Extract transcripts from YouTube's DOM
- Communicate with sidebar via postMessage

**Key Functions**:
- `extractTranscript()` - Scrapes transcript from YouTube's transcript panel
- `openTranscriptPanel()` - Auto-clicks "Show transcript" button
- `createSidebar()` - Injects sidebar iframe

**DOM Selectors Used** (may change if YouTube updates their UI):
- Transcript container: `ytd-transcript-segment-list-renderer`
- Transcript segments: `ytd-transcript-segment-renderer`
- Segment text: `.segment-text`

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

**Native Host Name**: `com.youtube.summary`

### 4. Native Host (`native-host/host.js`)

**Purpose**: Node.js process that Chrome communicates with

**Protocol**: Chrome's Native Messaging uses length-prefixed JSON:
- First 4 bytes: message length (UInt32LE)
- Remaining bytes: JSON message

**Message Actions**:
- `generateSummary` - Get summary from Claude
- `saveToNotes` - Save to Apple Notes

### 5. Claude Bridge (`native-host/claude-bridge.js`)

**Purpose**: Spawns Claude CLI and handles prompt/response

**Key Behavior**:
- Wraps user's custom instructions with system prompt
- Enforces output format (SUMMARY: / KEY LEARNINGS:)
- Parses Claude's response into structured data

**Important**: The system prompt wrapper ensures consistent output regardless of user customization.

### 6. Apple Notes (`native-host/apple-notes.js`)

**Purpose**: Creates notes in Apple Notes via AppleScript

**Functions**:
- `saveNote()` - Main function to save
- `ensureFolder()` - Creates folder if needed
- `createNote()` - Creates note in folder
- `formatNoteContent()` - Formats HTML content

**Note**: Requires macOS and AppleScript permissions.

## Data Flow

### Generate Summary Flow

1. User clicks "Generate Summary" in sidebar
2. `sidebar.js` sends `GET_TRANSCRIPT` to `content.js`
3. `content.js` scrapes YouTube DOM, returns transcript
4. `sidebar.js` loads custom instructions from `chrome.storage.sync`
5. `sidebar.js` sends to `background.js` via `chrome.runtime.sendMessage`
6. `background.js` forwards to native host via Native Messaging
7. `host.js` routes to `claude-bridge.js`
8. `claude-bridge.js` spawns `claude --print`, sends prompt via stdin
9. Response flows back through the same chain

### Save to Notes Flow

1. User clicks "Save to Apple Notes"
2. `sidebar.js` collects edited learnings + custom notes
3. Sends to native host with folder name
4. `host.js` routes to `apple-notes.js`
5. `apple-notes.js` runs AppleScript to create note

## Configuration Storage

Uses `chrome.storage.sync` for:
- `analysisInstructions` - Custom prompt instructions
- `folderSuggestions` - Recent folder names (local only, uses `chrome.storage.local`)

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
4. **API key handling** - The extension uses Claude Code CLI, not direct API calls, so no API keys in extension code.

## Known Limitations

- **macOS only** - Apple Notes integration uses AppleScript
- **Requires Claude CLI** - Must have `claude` command available
- **YouTube DOM dependent** - Transcript scraping may break if YouTube changes UI
- **Manifest V3** - Service worker may go idle, connection needs reconnection

## Testing Checklist

- [ ] Extension loads without errors
- [ ] Toggle button appears on YouTube videos
- [ ] Sidebar opens/closes correctly
- [ ] Transcript extraction works
- [ ] Claude generates summary
- [ ] Key learnings are editable
- [ ] Rich text editor works (bold, italic, lists)
- [ ] Save to Apple Notes creates note in correct folder
- [ ] Custom instructions are saved and used
- [ ] Settings page opens from sidebar

## Future Enhancement Ideas

- Spaced repetition reminders
- Export to Obsidian/Notion
- Batch processing playlists
- Support for other video platforms
- Offline transcript caching
