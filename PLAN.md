# YouTube Summary Extension with Claude Code Integration

## Overview
Build a Chrome extension that generates AI summaries of YouTube videos using Claude Code CLI (via Native Messaging API) and exports highlighted key learnings to Apple Notes with folder-based organization.

## Architecture

### Components

1. **Chrome Extension** (Frontend)
   - Sidebar UI that appears on YouTube video pages
   - Extracts video metadata and transcript
   - Displays Claude-generated summary and key learnings
   - UI for highlighting/selecting key points to save
   - Folder/topic selection for organizing in Apple Notes

2. **Native Messaging Host** (Bridge)
   - Node.js executable that bridges Chrome extension ↔ Claude Code CLI
   - Handles YouTube transcript extraction
   - Spawns Claude Code process to generate summaries
   - Integrates with Apple Notes via AppleScript
   - Uses Chrome's Native Messaging protocol (stdin/stdout JSON)

3. **Apple Notes Integration**
   - Uses AppleScript to create folders and notes programmatically
   - Organizes videos by topic/channel into separate folders
   - Formats notes with video title, link, summary, and key learnings

## Project Structure

```
youtube-summary-extension/
├── extension/
│   ├── manifest.json           # Extension config with nativeMessaging permission
│   ├── sidebar/
│   │   ├── sidebar.html        # Sidebar UI
│   │   ├── sidebar.js          # Sidebar logic
│   │   └── styles.css          # Styling
│   ├── content.js              # Injected into YouTube pages
│   ├── background.js           # Service worker for native messaging
│   └── icons/                  # Extension icons
├── native-host/
│   ├── host.js                 # Main native messaging host
│   ├── claude-bridge.js        # Claude Code CLI integration
│   ├── transcript-extractor.js # YouTube transcript fetching
│   ├── apple-notes.js          # AppleScript wrapper
│   ├── package.json
│   └── com.youtube.summary.json # Native messaging manifest
├── install.sh                   # Installation script
└── README.md
```

## Implementation Plan

### Phase 1: Chrome Extension Foundation

**Files to create:**
- `extension/manifest.json`
- `extension/content.js`
- `extension/background.js`
- `extension/sidebar/sidebar.html`
- `extension/sidebar/sidebar.js`
- `extension/sidebar/styles.css`

**Tasks:**
1. Create manifest.json with:
   - Manifest V3
   - `nativeMessaging` permission
   - Content script for YouTube pages
   - Background service worker
   - Sidebar page declaration

2. Build content script (`content.js`):
   - Detect YouTube video pages
   - Inject sidebar toggle button
   - Extract video ID from URL
   - Send video metadata to sidebar

3. Create sidebar UI:
   - Video title and thumbnail display
   - "Generate Summary" button
   - Summary display area
   - Key learnings list with checkboxes for highlighting
   - Folder selection dropdown
   - "Save to Apple Notes" button
   - Loading states and error handling

4. Background service worker:
   - Establish native messaging connection
   - Message passing between content script, sidebar, and native host
   - Handle native host connection lifecycle

### Phase 2: Native Messaging Host

**Files to create:**
- `native-host/host.js`
- `native-host/package.json`
- `native-host/com.youtube.summary.json`

**Tasks:**
1. Create Node.js native messaging host:
   - Read JSON messages from stdin (Chrome's protocol)
   - Write JSON responses to stdout
   - Message types: `getTranscript`, `generateSummary`, `saveToNotes`

2. Create native messaging manifest (`com.youtube.summary.json`):
   - Point to host.js executable
   - Specify allowed extension ID
   - Place in: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`

3. Implement message handlers:
   - Parse incoming Chrome messages
   - Route to appropriate module (transcript, Claude, Apple Notes)
   - Return results to Chrome extension

### Phase 3: YouTube Transcript Extraction

**Files to create:**
- `native-host/transcript-extractor.js`

**Tasks:**
1. Install and integrate `youtube-transcript` npm package
2. Create function to fetch transcript by video ID
3. Handle errors (no transcript available, age-restricted videos)
4. Return formatted transcript text

### Phase 4: Claude Code Integration

**Files to create:**
- `native-host/claude-bridge.js`

**Tasks:**
1. Create module to spawn Claude Code CLI as child process
2. Craft prompt template:
   ```
   Analyze this YouTube video transcript and provide:
   1. A concise summary (2-3 paragraphs)
   2. 5-7 key learnings or takeaways as bullet points

   Video Title: {title}
   Transcript:
   {transcript}
   ```
3. Send prompt to Claude Code via stdin
4. Parse response and extract summary + key learnings
5. Handle timeout and error cases

### Phase 5: Apple Notes Integration

**Files to create:**
- `native-host/apple-notes.js`

**Tasks:**
1. Create AppleScript wrapper using Node's `child_process.exec`
2. Implement functions:
   - `createFolder(folderName)` - Create folder if doesn't exist
   - `createNote(folder, title, content)` - Create note in folder
   - `listFolders()` - Get existing folders for dropdown
3. Format note content:
   ```
   [Video Title]
   URL: [YouTube link]
   Date saved: [timestamp]

   Summary:
   [Claude summary]

   Key Learnings:
   • [learning 1]
   • [learning 2]
   ...
   ```
4. Handle AppleScript errors and permissions

### Phase 6: Installation & Setup

**Files to create:**
- `install.sh`
- `README.md`

**Tasks:**
1. Create installation script:
   - Install npm dependencies in native-host/
   - Make host.js executable
   - Copy native messaging manifest to correct location
   - Update manifest with actual extension ID
2. Instructions for loading unpacked extension in Chrome
3. Grant AppleScript permissions (macOS will prompt)

## Technical Decisions

### Why Node.js for Native Host?
- Easy child process management for Claude Code CLI
- Good ecosystem for YouTube transcript libraries
- Simple AppleScript execution via `child_process`

### Why AppleScript for Apple Notes?
- Only programmatic way to create/organize notes in folders
- Native to macOS, no external dependencies
- Can handle folder creation and note organization

### YouTube Transcript Extraction
- Use `youtube-transcript` npm package (https://www.npmjs.com/package/youtube-transcript)
- Falls back gracefully if no transcript available
- Alternative: Extension could scrape transcript from YouTube UI if API fails

### Message Protocol
Messages between extension and native host:

```json
// Extension → Native Host
{
  "action": "generateSummary",
  "videoId": "dQw4w9WgXcQ",
  "title": "Video Title"
}

// Native Host → Extension
{
  "success": true,
  "summary": "...",
  "keyLearnings": ["...", "..."]
}
```

## Critical Files to Create

1. `extension/manifest.json` - Extension configuration
2. `extension/background.js` - Native messaging connection
3. `extension/sidebar/sidebar.html` - Main UI
4. `extension/sidebar/sidebar.js` - UI logic and message passing
5. `native-host/host.js` - Native messaging bridge
6. `native-host/claude-bridge.js` - Claude Code integration
7. `native-host/apple-notes.js` - AppleScript integration
8. `native-host/com.youtube.summary.json` - Native messaging manifest
9. `install.sh` - Setup script

## Testing & Verification

1. **Extension Installation:**
   - Load unpacked extension in Chrome
   - Navigate to YouTube video
   - Verify sidebar appears

2. **Native Messaging:**
   - Click "Generate Summary"
   - Verify native host receives message
   - Check Chrome DevTools console for errors

3. **Transcript Extraction:**
   - Test with various YouTube videos
   - Verify transcript is fetched correctly
   - Handle videos without transcripts

4. **Claude Integration:**
   - Verify Claude Code CLI is accessible
   - Check summary quality and format
   - Test error handling (Claude unavailable, rate limits)

5. **Apple Notes Export:**
   - Create test folder in Apple Notes
   - Save a summary
   - Verify note appears in correct folder with proper formatting
   - Test with multiple videos in same folder

6. **End-to-End Flow:**
   - Watch YouTube video → Generate summary → Review key learnings → Save to Apple Notes
   - Verify folder organization works
   - Check note formatting and content

## Future Enhancements (Not in V1)

- Spaced repetition reminders via Apple Reminders
- Support for other video platforms
- Custom prompt templates
- Export to other note apps (Obsidian, Notion)
- Batch processing of playlists

---

# Current Task: Update AGENTS.md with Development Guidelines

## Task
Add a comprehensive "Development Guidelines" section to AGENTS.md that establishes best practices for AI agents and developers working on this codebase.

## File to Modify
- `/Users/altfong/youtube-summary-extension/AGENTS.md`

## Content to Add

Add a new section after "Common Development Tasks" with the following guidelines:

### Development Guidelines (Required Practices)

**Before Making Changes:**
- Always read existing code before modifying
- Understand the data flow and how components interact
- Check AGENTS.md for architecture documentation

**Code Quality:**
- Write unit tests for new functionality
- Test edge cases (no transcript, API errors, etc.)
- Handle errors gracefully with user-friendly messages

**Documentation:**
- Update README.md if user-facing behavior changes
- Update AGENTS.md if architecture changes
- Add JSDoc comments to new functions
- Keep this file current

**Testing:**
- Manual testing checklist before committing
- Test on actual YouTube videos
- Verify Apple Notes integration works

**Git Practices:**
- Descriptive commit messages
- Small, focused commits
- Don't commit sensitive data

**Architecture Changes:**
- Document rationale in AGENTS.md
- Update architecture diagram if needed
- Consider backwards compatibility

## Verification
- Read the updated AGENTS.md to confirm the new section is properly formatted
- Ensure it flows well with existing content
