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

### 10. Follow-up Prompts for Additional Extraction
**Request:** Allow users to continue prompting Claude to extract additional information if the first pass wasn't comprehensive enough.

**Implementation:**
- **UI** (`sidebar.html`):
  - "Extract More" section appears after initial summary
  - Textarea for entering follow-up questions
  - "Ask Claude" button with loading spinner
  - Inline error display (auto-dismisses after 5 seconds)
- **Frontend Logic** (`sidebar.js`):
  - `handleFollowUp()` - Sends follow-up query with transcript and existing learnings
  - `appendNewLearnings()` - Adds new bullet points to existing list with animation
  - New items highlighted with green animation effect
  - Auto-scrolls to first new item
- **Backend** (`host.js`, `claude-bridge.js`):
  - New `followUp` action handler in native host
  - `generateFollowUp()` function creates focused prompt
  - Includes existing learnings to avoid duplication
  - `parseFollowUpResponse()` extracts bullet points from response
- **Example Use Cases**:
  - "What specific tools or frameworks were mentioned?"
  - "Extract any statistics or numbers discussed"
  - "What were the action items or recommendations?"
  - "List any books or resources referenced"

### 11. YouTube Comments Integration
**Request:** Include top YouTube comments in the analysis to capture valuable audience insights, with special emphasis on creator comments/replies.

**Implementation:**
- **Comment Extraction** (`content.js`):
  - `extractTopComments()` scrolls to load comments and extracts them
  - Separates **creator comments** (video author replies) from **viewer comments**
  - Detects creator badge (`ytd-author-comment-badge-renderer`) to identify creator
  - Extracts comment text, like count, and author
  - Sorts viewer comments by likes, limits to top 20
- **Creator vs Viewer Priority**:
  - Creator comments are treated as authoritative additions to the video
  - Viewer comments only included if: length >= 30 chars AND likes >= 10
  - Viewer comments marked as "for context only - may include jokes/memes"
- **Claude Prompt** (`claude-bridge.js`):
  - Creator comments section: "treat as authoritative additions/clarifications"
  - Viewer comments section: "use cautiously, only if genuinely insightful"
  - New `CREATOR ADDITIONS:` output section for insights from creator comments
  - Creator insights marked with `[From Creator]` prefix in key learnings
- **Data Flow**:
  - content.js → `{ creatorComments: [], viewerComments: [] }`
  - sidebar.js caches both arrays
  - host.js passes both to claude-bridge.js
  - parseResponse() extracts and marks creator additions

### 12. Light/Dark Mode Support
**Request:** Style the extension to support both light and dark mode based on system preference.

**Implementation:**
- Complete CSS redesign using CSS custom properties for theming
- Auto-switches based on `prefers-color-scheme` media query
- Light mode: warm stone palette with orange accent (#d97706)
- Dark mode: charcoal backgrounds (#171717) with amber accent (#f59e0b)
- Claude-inspired design with rounded pill buttons

### 13. Multi-Export Options & Streamlined Installation
**Request:** Add web-based export alternatives (clipboard, markdown download) and improve installation process.

**Implementation:**
- **Quick Export Buttons** (no native host required):
  - "Copy to Clipboard" - copies formatted markdown to clipboard
  - "Download .md" - downloads summary as markdown file
  - Visual feedback on button success/failure states
- **Apple Notes Graceful Degradation**:
  - `checkNativeHostAvailability()` pings native host on load
  - Shows "Available"/"Not configured" status badge
  - Hides Apple Notes section if native host unavailable
  - Users can still use clipboard/download without full setup
- **Improved Install Script** (`install.sh`):
  - Colored terminal output (green/yellow/red status indicators)
  - Claude CLI detection with helpful install instructions
  - Auto-detect extension ID from Chrome profile
  - Non-blocking if Claude not found (warns but continues)
  - Extension ID format validation

### 14. Centralized Logging with Auto-Rotation
**Request:** Move logs from home directory to native-host directory and ensure log file never exceeds 1MB.

**Implementation:**
- **New Logger Module** (`native-host/logger.js`):
  - Centralized logging utility used by all native host modules
  - Log file location: `native-host/extension.log` (instead of `~/.youtube-summary-extension.log`)
  - Auto-rotation: When log exceeds 1MB, truncates to keep last half of entries
  - Supports optional prefix for categorizing log sources (e.g., `[claude-bridge]`)
- **Files Updated**:
  - `host.js` - Uses `logger.log()` instead of inline `fs.appendFileSync`
  - `claude-bridge.js` - Uses `logger.log(msg, 'claude-bridge')` for both `generateSummary` and `generateFollowUp`
  - Documentation updated in `install.sh`, `AGENTS.md`, `README.md`

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

- [ ] Notion integration (API-based export)
- [ ] Batch process multiple videos
- [ ] Keyboard shortcuts
- [ ] Custom summary templates
- [ ] Obsidian export

---

## Technical Notes

### Key Files Modified
- `extension/content.js` - Popup banner, floating button, drag functionality, progress forwarding, description/link extraction
- `extension/sidebar/sidebar.html` - Progress stages UI, back-to-edit button, relevant links section, transcript viewer, search pane, multi-export UI
- `extension/sidebar/sidebar.js` - Progress handling, back-to-edit logic, link display/selection, transcript preview, search functionality, export handlers (clipboard, download), native host check
- `extension/sidebar/styles.css` - Progress stage styling, link item styling, transcript viewer styling, search highlighting, light/dark mode theming, export button styles
- `extension/background.js` - Progress callback routing
- `native-host/host.js` - Progress message sending, description/links pass-through
- `native-host/claude-bridge.js` - Progress callbacks, description in prompt, relevant link parsing
- `native-host/apple-notes.js` - listFolders(), relevant links in saved notes
- `install.sh` - Improved installer with colored output, Claude CLI detection, auto-detection

### Storage
- `localStorage['youtube-summary-btn-position']` - Floating button position
- `chrome.storage.local['folderSuggestions']` - Previously used folder names
- `chrome.storage.sync['analysisInstructions']` - Custom analysis instructions
