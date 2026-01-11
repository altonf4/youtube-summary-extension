# YouTube Summary Extension - Feature Requests & Implementation Log

This document tracks all feature requests and implementations for the YouTube Summary Extension.

## Implemented Features

### 1. Popup Banner Notification (instead of icon button)
**Request:** Replace the small icon button with a more visible popup notification when a YouTube video is detected.

**Implementation:**
- Floating popup banner appears at top-right of screen when a YouTube video page is loaded
- Shows "YouTube Summary Available" with "Summarize" button
- Animated slide-in/slide-out transitions
- Close (X) button to dismiss
- Positioned on right side to avoid blocking YouTube's search bar

### 2. Floating Button (after dismissing popup)
**Request:** Allow bringing back the popup after dismissing it without refreshing the page.

**Implementation:**
- When popup is dismissed, a small circular floating button appears in its place
- Clicking the floating button opens the sidebar directly
- Button is draggable - can be repositioned anywhere on screen
- Position is saved in localStorage and persists across sessions
- Grab cursor on hover indicates draggability

### 3. Close Button on Sidebar
**Request:** (Implied for better UX)

**Implementation:**
- Added close (X) button in sidebar header next to settings
- Closing sidebar shows the floating button for quick re-access

### 4. Apple Notes Folder Integration
**Request:** Show existing Apple Notes folders when saving, not just create new ones.

**Implementation:**
- Fetches existing folders from Apple Notes via AppleScript
- Combines with previously used folders from local storage
- Shows autocomplete suggestions in folder input field
- Creates new folders automatically if they don't exist

### 5. Back to Edit After Saving
**Request:** Allow going back to edit a note after saving it.

**Implementation:**
- Added "Back to Edit" button on success screen
- Preserves all content (summary, learnings, custom notes, folder selection)
- Can edit and save again (creates new note with updated content)

### 6. Progress Tracking During Summary Generation
**Request:** Show actual Claude progress instead of just a spinner, since generation can take a while.

**Implementation:**
- Visual progress stages showing:
  1. Preparing transcript
  2. Sending to Claude
  3. Claude is thinking...
  4. Receiving response (with character count)
  5. Extracting insights
- Each stage has an icon, pulsing animation when active, green checkmark when complete
- Progress messages update in real-time from native host
- Streaming character count shows data being received

### 7. Thinking Timer & Token Counter
**Request:** Show elapsed time during "Claude is thinking" stage (like Claude Code does) and show tokens being streamed.

**Implementation:**
- **Thinking Timer:** Live timer starts when entering "waiting" stage
  - Shows seconds (e.g., "5s") or minutes:seconds (e.g., "1:23")
  - Uses `tabular-nums` font variant for stable width
  - Stops when response starts streaming
- **Token Counter:** Shows estimated tokens during streaming
  - Estimates ~4 characters per token
  - Displays as "~250 tokens" in real-time
- Both use matching pill-style badges in the progress UI

### 8. YouTube Description & Link Extraction
**Request:** Scrape the YouTube video description to extract useful links that should be saved in the notes.

**Implementation:**
- **Description Scraping** (`content.js`):
  - `getVideoDescription()` extracts the full text from YouTube's description container
  - `getDescriptionLinks()` extracts all anchor elements and filters out:
    - YouTube hashtags
    - Links to other YouTube videos
    - Channel/user links
- **Claude Analysis** (`claude-bridge.js`):
  - Description text and links are included in the Claude prompt
  - Prompt asks Claude to identify which links are most relevant to the video content
  - Claude returns link numbers with reasons for relevance
- **UI Display** (`sidebar.html/js`):
  - "Relevant Links" section appears when Claude identifies useful links
  - Each link shows the text, URL, and Claude's reason for selection
  - Checkboxes allow users to include/exclude specific links before saving
  - Links are clickable and open in new tabs
- **Apple Notes** (`apple-notes.js`):
  - Selected links are saved in a "Relevant Links" section
  - Each link includes the URL, display text, and relevance reason
  - HTML formatting preserves clickable links in Apple Notes

---

## Architecture Overview

### Data Flow
```
YouTube Page (content.js)
    ↓ postMessage
Sidebar (sidebar.js)
    ↓ chrome.runtime.sendMessage
Background (background.js)
    ↓ native messaging
Native Host (host.js)
    ↓
Claude Bridge (claude-bridge.js) → Claude CLI
Apple Notes (apple-notes.js) → AppleScript
```

### Progress Update Flow
```
claude-bridge.js (onProgress callback)
    ↓
host.js (sendResponse with type: 'progress')
    ↓ native messaging
background.js (progressCallbacks Map)
    ↓ chrome.tabs.sendMessage
content.js (chrome.runtime.onMessage)
    ↓ postMessage
sidebar.js (updateProgressUI)
```

---

## Pending / Future Ideas

- [ ] Update existing note instead of creating new one when re-saving
- [ ] Export to other note apps (Notion, Obsidian, etc.)
- [ ] Batch process multiple videos
- [ ] Keyboard shortcuts
- [ ] Dark mode support
- [ ] Custom summary templates

---

## Technical Notes

### Key Files Modified
- `extension/content.js` - Popup banner, floating button, drag functionality, progress forwarding, description/link extraction
- `extension/sidebar/sidebar.html` - Progress stages UI, back-to-edit button, relevant links section
- `extension/sidebar/sidebar.js` - Progress handling, back-to-edit logic, link display/selection
- `extension/sidebar/styles.css` - Progress stage styling, link item styling
- `extension/background.js` - Progress callback routing
- `native-host/host.js` - Progress message sending, description/links pass-through
- `native-host/claude-bridge.js` - Progress callbacks, description in prompt, relevant link parsing
- `native-host/apple-notes.js` - listFolders(), relevant links in saved notes

### Storage
- `localStorage['youtube-summary-btn-position']` - Floating button position
- `chrome.storage.local['folderSuggestions']` - Previously used folder names
- `chrome.storage.sync['analysisInstructions']` - Custom analysis instructions
