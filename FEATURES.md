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

### 5. Back to Edit After Saving (with Update Support)
**Request:** Allow going back to edit a note after saving it, and update the original note instead of creating duplicates.

**Implementation:**
- Added "Back to Edit" button on success screen
- Preserves all content (summary, learnings, custom notes, folder selection)
- **Note ID Caching:** Apple Notes returns a unique note ID after saving
  - First save: Creates note, caches the note ID
  - Subsequent saves: Uses cached ID to update the exact same note
  - Handles edge cases: If note is deleted in Apple Notes, falls back to title-based matching
- **Fallback matching:** If no cached ID, searches folder for note with matching title
- Success message indicates whether note was "Created" or "Updated"
- Note ID is reset when generating a new summary (ensures new video = new note)

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

### 7. Token Counter During Analysis
**Request:** Show token count during "Claude is thinking" instead of a timer (timer gave impression of timeout).

**Implementation:**
- **Simplified Progress Stages:** Removed "Receiving response" stage (overkill)
  - Now shows: Preparing → Sending → Thinking → Extracting
- **Token Counter:** Shows estimated output tokens during thinking/streaming
  - Estimates ~4 characters per token
  - Displays as "~250 tokens" in real-time
  - Updates continuously as Claude generates response
- Cleaner, less anxiety-inducing UX than a countdown timer

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

### 9. Transcript Viewer & Search
**Request:** Add ability to search the raw transcript for copying/pasting content. Show transcript when sidebar opens (before summarizing), and add a searchable transcript pane after summary is generated.

**Implementation:**
- **Transcript Preview** (before summarization):
  - When sidebar opens, immediately fetches and displays the raw transcript
  - Shows character count status indicator
  - Scrollable transcript area with 300px max-height
  - Allows users to read/copy from transcript before generating summary
- **Search Pane** (after summarization):
  - Search input with real-time highlighting as you type
  - Debounced search (200ms) for performance
  - Match count display (e.g., "5 found" or "2/5" when navigating)
  - Previous/Next navigation buttons with keyboard support (Enter/Shift+Enter)
  - Current match highlighted in orange, other matches in yellow
  - Auto-scrolls to current match
  - Collapsible transcript area with toggle button
- **Technical Details**:
  - Transcript is cached after initial fetch for use in both preview and search
  - Search uses case-insensitive regex matching
  - Special characters in search query are properly escaped
  - `<mark>` elements used for highlighting to ensure proper styling

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
- `extension/sidebar/sidebar.html` - Progress stages UI, back-to-edit button, relevant links section, transcript viewer, search pane
- `extension/sidebar/sidebar.js` - Progress handling, back-to-edit logic, link display/selection, transcript preview, search functionality
- `extension/sidebar/styles.css` - Progress stage styling, link item styling, transcript viewer styling, search highlighting
- `extension/background.js` - Progress callback routing
- `native-host/host.js` - Progress message sending, description/links pass-through
- `native-host/claude-bridge.js` - Progress callbacks, description in prompt, relevant link parsing
- `native-host/apple-notes.js` - listFolders(), relevant links in saved notes

### Storage
- `localStorage['youtube-summary-btn-position']` - Floating button position
- `chrome.storage.local['folderSuggestions']` - Previously used folder names
- `chrome.storage.sync['analysisInstructions']` - Custom analysis instructions
