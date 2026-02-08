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

### 15. Actionable TODOs with Apple Reminders Integration
**Request:** Generate actionable tasks from video summaries and sync them to Apple Reminders with due dates.

**Implementation:**
- **New ACTION ITEMS Section** (`claude-bridge.js`):
  - Claude now generates a separate ACTION ITEMS section alongside KEY LEARNINGS
  - Action items are specific, actionable tasks starting with verbs (Try, Implement, Research, etc.)
  - Limited to 3-5 concrete next steps per video
  - Parsed separately from key learnings for distinct handling
- **Sidebar UI** (`sidebar.html`, `sidebar.js`):
  - New "Action Items" section with checkbox icon and "(saved to Reminders)" hint
  - Default due date dropdown (Tomorrow, 3 days, 1 week, 2 weeks, 1 month)
  - Each action item has: checkbox, editable textarea, date picker
  - `displayActionItems()` renders action items with auto-resizing textareas
  - `getSelectedActionItems()` returns `[{text, dueDate}]` for checked items
- **Apple Notes** (`apple-notes.js`):
  - Action items saved with visual checkbox symbols (☐)
  - Due dates displayed in "Month Day, Year" format
  - Appears in "Action Items" section after Key Learnings
- **Apple Reminders** (`apple-reminders.js` - NEW FILE):
  - `createReminders()` - Main entry point for batch reminder creation
  - `ensureRemindersList()` - Creates list if it doesn't exist (same name as Notes folder)
  - `createReminder()` - Creates individual reminder with due date
  - Reminder body includes video title and URL for context
  - Graceful error handling - Notes save succeeds even if Reminders fails
- **Native Host** (`host.js`):
  - `handleSaveToNotes()` updated to save to both Notes and Reminders
  - Returns `remindersCreated` count in response
  - Success message shows "Created note and X reminders"
- **CSS Styling** (`styles.css`):
  - `.action-items` container with settings dropdown
  - `.action-item` with checkbox, content, and due date picker
  - Consistent with existing key learnings styling

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

### 16. Select/Unselect All & Reminders Default Setting
**Request:** Add select/unselect all buttons for action items and key learnings sections. Add a setting for whether reminders should be checked by default.

**Implementation:**
- **Select/Unselect All Buttons**:
  - Added "Select All / Unselect All" toggle button to Key Learnings section header
  - Added "Select All / Unselect All" toggle button to Action Items section header
  - Button text dynamically updates based on current checkbox state
  - Uses `toggleAllCheckboxes(section)` function in sidebar.js
  - Dispatches change events to ensure proper state tracking
- **Reminders Default Setting** (`settings.html`, `settings.js`, `settings.css`):
  - New "Action Items / Reminders" settings section
  - Checkbox: "Select action items by default"
  - Stored as `remindersCheckedByDefault` in chrome.storage.sync
  - Default value: true (checked)
  - Hint text explains behavior when unchecked
- **UI Updates** (`sidebar.html`, `styles.css`):
  - New `.section-header-with-actions` layout for headers with toggle buttons
  - New `.select-toggle-btn` styling (subtle border, hover effect)
  - Both sections use consistent header layout

### 17. Floating Button Visibility Fix on Banner Dismiss
**Request:** When clicking X to dismiss the popup banner, the floating button was not appearing (unlike when clicking Summarize and then closing the sidebar).

**Implementation:**
- **Root Cause:** Two issues discovered:
  1. CSS animation `fadeIn` was leaving opacity at 0 due to animation not completing properly
  2. Saved button positions could be off-screen (e.g., from a wider monitor), making button invisible
- **Fixes Applied** (`content.js`):
  - Force opacity and disable animation with inline styles using `!important`:
    - `floatingButton.style.setProperty('opacity', '1', 'important')`
    - `floatingButton.style.setProperty('animation', 'none', 'important')`
  - Added viewport bounds validation for saved positions
  - Clear invalid positions from localStorage if off-screen
- **CSS Fallbacks** (for future-proofing):
  - Added `animation-fill-mode: forwards` to CSS
  - Added explicit `opacity: 1` to CSS as fallback

### 19. Transcript Caching Fix for Follow-up and Search
**Request:** Bug report - After generating a summary, follow-up questions fail with "transcript not found" and the searchable transcript doesn't display.

**Root Cause Analysis:**
- The transcript is fetched in two places:
  1. `fetchTranscriptForPreview()` - called on init, properly caches to `cachedTranscript`
  2. `handleGenerateSummary()` - called when generating summary, but did NOT cache the transcript
- If `fetchTranscriptForPreview()` failed or hadn't completed before summary generation, `cachedTranscript` remained null
- Both `handleFollowUp()` and `displaySummary()` rely on `cachedTranscript` for their functionality

**Fix Applied** (`sidebar.js`):
- Added `cachedTranscript = transcriptResult.transcript;` in `handleGenerateSummary()` after successful transcript extraction
- Now the transcript is always cached when summary generation succeeds, ensuring:
  - Follow-up questions work correctly
  - Searchable transcript displays after summary generation
- Single-line fix addressing the root cause rather than symptoms

### 18. Comprehensive Test Suite for Native Host
**Request:** Backfill tests based on the features list.

**Implementation:**
- **Jest Framework Setup** (`native-host/package.json`):
  - Added Jest as dev dependency
  - Configured `npm test` command with coverage reporting
- **Test Files Created**:
  - `claude-bridge.test.js` - 45 tests covering:
    - `createPrompt()` - Basic prompts, custom instructions, truncation, links, comments
    - `parseResponse()` - Structured parsing, bullet formats, action items, creator additions, link matching
    - `createFollowUpPrompt()` - Follow-up queries with existing learnings
    - `parseFollowUpResponse()` - Bullet extraction, sentence splitting
  - `apple-notes.test.js` - 26 tests covering:
    - `escapeForAppleScript()` - Backslashes, quotes, newlines
    - `escapeHtml()` - HTML special characters, XSS prevention
    - `formatDisplayDate()` - ISO to readable date format
    - `formatNoteContent()` - Full HTML note generation with all sections
  - `apple-reminders.test.js` - 10 tests for AppleScript escaping with null handling
  - `logger.test.js` - 9 tests for logging and log format
- **Module Changes**:
  - Exported internal pure functions for testability
  - No changes to existing functionality
- **Coverage**:
  - 80 tests, all passing
  - Covers prompt creation, response parsing, formatting, escaping

### 20. Extract More Enhancements (Tooltip, Dynamic Routing, Add/Remove)
**Request:** Improve the "Extract More" feature with: (1) tooltip explaining the feature, (2) dynamic AI decision making to classify items as insights or action items based on the query, (3) ability to manually add/remove items.

**Implementation:**
- **Example Chips** (`sidebar.html`, `sidebar.js`, `styles.css`):
  - Clickable example prompts shown below "Extract More" header
  - Four pre-built examples: "Tools mentioned", "Statistics", "Action items", "Key quotes"
  - Clicking a chip auto-fills the textarea with a relevant question
  - Pill-shaped buttons with hover effects (green highlight)
  - More discoverable than a hidden tooltip
- **Dynamic AI Response Routing** (`claude-bridge.js`, `sidebar.js`):
  - Updated `createFollowUpPrompt()` to request structured JSON output
  - Claude classifies each item as `insight` or `action` based on query intent
  - Response format: `{ items: [{ type: "insight"|"action", text: "..." }] }`
  - `parseFollowUpResponse()` parses JSON with fallback to plain text
  - Defensive type checking filters malformed items
  - `handleFollowUp()` routes insights to Key Learnings, actions to Action Items
  - Backwards compatible with legacy `additionalLearnings` response format
- **Delete Buttons** (`sidebar.js`, `styles.css`):
  - Small × button added to each learning and action item
  - Hidden by default, visible on row hover (opacity transition)
  - Red color on button hover for danger indication
  - `deleteItem()` removes item with fade-out animation
- **Add Buttons** (`sidebar.html`, `sidebar.js`, `styles.css`):
  - "+ Add Learning" button at bottom of Key Learnings section
  - "+ Add Action Item" button at bottom of Action Items section
  - Dashed border, subtle appearance, accent color on hover
  - `addNewLearning()` and `addNewActionItem()` create empty items
  - New items are checked by default and auto-focused
  - Action items respect `remindersCheckedByDefault` setting
- **Technical Details**:
  - 94 tests passing (added JSON parsing and fallback tests)
  - JSON response format designed for future MCP server extensibility
  - Animation class `new-item` applied to dynamically added items

### 21. Audio Narration (ElevenLabs TTS)
**Request:** "Add a feature where there's a playable audio version of the summary generated by ElevenLabs. When the summary is generated, on top of the summary there's a button to generate the audio version with ElevenLabs and immediately start playing it. It should only call ElevenLabs to generate it when I click the button, to avoid wasted ElevenLabs credits."

**Implementation:**
- **Speaker Button** inline with Summary header
- **On-demand generation** (not automatic) to save API credits
- **Settings Page** (`extension/settings/`):
  - ElevenLabs API key input with visibility toggle
  - Voice selection dropdown (populated from API, grouped by category)
  - Content checkboxes: Summary, Key Learnings, Action Items
  - Settings stored in `chrome.storage.sync`
- **Audio Player UI**:
  - Progress bar with clickable seek
  - Time display (mm:ss format)
  - Play/Stop toggle with visual states
  - Error messages auto-dismiss after 5 seconds
- **Audio Caching**:
  - Generated audio cached per session
  - Cache cleared on new summary generation
  - Replay uses cached audio (no API call)
- **Native Host** (`native-host/`):
  - `elevenlabs.js` - ElevenLabs API integration
  - `generateSpeech()` - Text-to-speech conversion
  - `listVoices()` - Fetch available voices
  - Handlers in `host.js` for `generateAudio` and `listVoices` actions

**Files Changed:**
- `native-host/elevenlabs.js` - New ElevenLabs API module
- `native-host/host.js` - Added generateAudio and listVoices handlers
- `extension/settings/settings.html` - Audio Narration settings section
- `extension/settings/settings.js` - Voice loading and settings logic
- `extension/settings/settings.css` - Form group and checkbox styles
- `extension/sidebar/sidebar.html` - Audio button and player UI
- `extension/sidebar/sidebar.js` - Audio generation and playback
- `extension/sidebar/styles.css` - Audio button/player styling

### 22. Direct Anthropic API with OAuth + API Key Authentication
**Request:** "Add direct Anthropic API integration using OAuth from Claude Code and an API key fallback, instead of always spawning the CLI."

**Implementation:**
- **Three-tier auth strategy**:
  1. **OAuth** from Claude Code (reads macOS Keychain or `~/.claude/.credentials.json`)
  2. **User-entered API key** (configured in settings page)
  3. **CLI fallback** (`claude --print` as before)
- **New Module** (`native-host/anthropic-client.js`):
  - `loadOAuthCredentials()` - Reads from macOS Keychain (`security find-generic-password`), falls back to credentials file
  - `isOAuthToken(token)` - Detects OAuth tokens by `sk-ant-oat` prefix
  - `resolveModelName(shortName)` - Maps `'sonnet'` → `'claude-sonnet-4-20250514'`, etc.
  - `callAnthropicAPI(prompt, options)` - Makes POST to Anthropic Messages API
    - OAuth path: `Authorization: Bearer` + required OAuth headers
    - API key path: `x-api-key` header
    - 401 retry: reloads credentials once (token may have been refreshed)
    - 2-minute timeout matching existing behavior
  - `checkAuthStatus(apiKey)` - Returns which auth method is available
  - Zero dependencies (uses Node.js built-in `https` module)
- **Claude Bridge** (`native-host/claude-bridge.js`):
  - `generateSummary()` and `generateFollowUp()` now try API first, fall back to CLI on failure
  - `callClaudeCode()` accepts `{ model }` option for CLI model selection
- **Native Host** (`native-host/host.js`):
  - `handleGenerateSummary()` and `handleFollowUp()` extract `anthropicApiKey` and `model` from messages
  - New `checkAuth` action returns which auth method is available
- **Settings Page** (`extension/settings/`):
  - New "Claude API" section with:
    - Auth status indicator (green dot = connected, red = disconnected)
    - Anthropic API key input (password field with toggle)
    - Model selector dropdown (Sonnet/Opus/Haiku)
    - Hint text explaining when API key is needed
  - Auth status auto-checks on load and when API key changes
- **Sidebar** (`extension/sidebar/sidebar.js`):
  - `loadApiSettings()` loads API key and model from `chrome.storage.sync`
  - Both `handleGenerateSummary()` and `handleFollowUp()` pass credentials in messages

**Files Changed:**
- `native-host/anthropic-client.js` - NEW: Anthropic API client with OAuth + API key support
- `native-host/anthropic-client.test.js` - NEW: 23 unit tests
- `native-host/claude-bridge.js` - API-first with CLI fallback
- `native-host/host.js` - Credential pass-through, checkAuth handler
- `extension/settings/settings.html` - Claude API settings section
- `extension/settings/settings.js` - Save/load API settings, auth status check
- `extension/settings/settings.css` - Auth status indicator styles
- `extension/sidebar/sidebar.js` - Load and pass API credentials

### 23. Multi-Content Summarization - Modular Architecture (Phase 1)
**Request:** Extend the extension from YouTube-only to support summarizing any web content — articles, blog posts, selected text, and videos on any platform with caption tracks.

**Implementation (Phase 1 - Architecture Refactor):**
- **Modular Extractor Pattern:**
  - Split monolithic `content.js` (1127 lines) into 7 focused modules
  - `content-detector.js` — Detects content type on any page (youtube_video, article, video_with_captions, selected_text, webpage)
  - `extractors/base-extractor.js` — Shared UI: popup banner, floating button (draggable), sidebar iframe, styles
  - `extractors/youtube-extractor.js` — YouTube transcript/comments extraction (extracted from content.js)
  - `extractors/article-extractor.js` — Article text extraction using DOM heuristics
  - `extractors/webpage-extractor.js` — Fallback page text extraction (strips nav/footer/ads)
  - `extractors/video-extractor.js` — HTML5 video caption extraction (VTT/SRT parsing)
  - `extractors/selection-extractor.js` — Text selection extraction
- **Manifest Changes:**
  - Name: "YouTube Summary with Claude" → "AI Summary with Claude"
  - Version: 1.0.0 → 2.0.0
  - Content scripts run on `<all_urls>` (previously YouTube only)
  - Added `contextMenus` permission for right-click "Summarize with Claude"
- **Content-Type Aware Prompts** (`claude-bridge.js`):
  - `createArticlePrompt()` — Article/webpage-specific system prompt with metadata
  - `createSelectionPrompt()` — Selected text analysis prompt
  - Routes to correct prompt based on `contentType` parameter
- **Context Menu** (`background.js`):
  - Right-click "Summarize with Claude" on selected text
  - Sends `SUMMARIZE_SELECTION` message to content script
- **Sidebar Adaptations** (`sidebar.js`):
  - `CONTENT_INFO` message handler alongside legacy `VIDEO_INFO`
  - `updateUIForContentType()` adapts UI per content type (button text, metadata display, transcript viewer visibility)
  - Passes `contentType`, `author`, `siteName`, `publishDate` to native host
- **Backward Compatibility:**
  - YouTube flow completely unchanged
  - Sends both `VIDEO_INFO` and `CONTENT_INFO` messages for YouTube
  - Old content.js replaced with legacy notice pointing to new modules
- **Tests:** 9 new tests for `createArticlePrompt` and `createSelectionPrompt` (125 total, all passing)

**Files Created:**
- `extension/content-detector.js`
- `extension/extractors/base-extractor.js`
- `extension/extractors/youtube-extractor.js`
- `extension/extractors/article-extractor.js`
- `extension/extractors/webpage-extractor.js`
- `extension/extractors/video-extractor.js`
- `extension/extractors/selection-extractor.js`
- `extension/lib/readability.js` (placeholder for Phase 2)

**Files Modified:**
- `extension/manifest.json` — all_urls, contextMenus, new content scripts
- `extension/content.js` — Replaced with legacy notice
- `extension/sidebar/sidebar.js` — Content type awareness
- `extension/sidebar/sidebar.html` — Content metadata display
- `extension/sidebar/styles.css` — Metadata styles
- `extension/background.js` — Context menu registration
- `native-host/host.js` — Content type routing, follow-up handler fix
- `native-host/claude-bridge.js` — Article/selection prompts
- `native-host/claude-bridge.test.js` — 9 new tests

### 24. Multi-Content Summarization - Article & Webpage Support (Phase 2)
**Request:** Enable summarizing articles, blog posts, documentation, and any text-heavy web page.

**Implementation:**
- **Mozilla Readability.js Integration:**
  - Vendored Mozilla's Readability.js (~90KB, Apache 2.0 license) into `extension/lib/readability.js`
  - Loaded as content script before article-extractor.js so it's available as a global
  - Provides clean article text extraction with title, byline, site name, excerpt
- **Article Extractor** (`extension/extractors/article-extractor.js`):
  - Strategy 1: Mozilla Readability.js (clones document, parses with Readability)
  - Strategy 2: DOM heuristics fallback (`<article>`, main content selectors, body cleanup)
  - Returns structured result with text, title, byline, siteName, excerpt
  - Minimum 100 character threshold to avoid extracting empty pages
- **Article-Specific Prompts** (`native-host/claude-bridge.js`):
  - `createArticlePrompt()` — System prompt says "analyzing a web article" with metadata (author, site, publish date)
  - Includes article text truncated at 50K characters
  - Template-driven output format when templates are configured
- **Sidebar Adaptations** (`extension/sidebar/sidebar.js`):
  - Shows article metadata (author, site name, publish date) instead of video info
  - Button text adapts: "Summarize Article" / "Summarize Page" based on content type
  - Transcript viewer hidden for non-video content types

**Files Created:**
- `extension/lib/readability.js` — Vendored Mozilla Readability.js

**Files Modified:**
- `extension/extractors/article-extractor.js` — Readability.js integration with heuristic fallback
- `extension/manifest.json` — Added `lib/readability.js` to content scripts
- `native-host/claude-bridge.js` — Article-specific prompt construction

### 25. Multi-Content Summarization - Selected Text & Video Captions (Phase 3)
**Request:** Enable summarizing selected text via right-click context menu, and videos with HTML5 caption tracks on any platform.

**Implementation:**
- **Selected Text Extraction** (`extension/extractors/selection-extractor.js`):
  - Extracts `window.getSelection().toString()` with surrounding context
  - Returns page URL, title, and selected text
  - Minimum selection length validation
- **Context Menu** (`extension/background.js`):
  - Registers "Summarize with Claude" context menu item on extension install
  - Appears on right-click when text is selected
  - Sends `SUMMARIZE_SELECTION` message to content script to open sidebar
- **Video Caption Extraction** (`extension/extractors/video-extractor.js`):
  - Finds `<video>` elements with `<track kind="captions|subtitles">`
  - Fetches and parses VTT/SRT caption files into plain text
  - Works on any site with standard HTML5 video + caption tracks (Vimeo, Coursera, etc.)
  - Graceful fallback: offers to summarize page text if no captions found
- **Selection-Specific Prompts** (`native-host/claude-bridge.js`):
  - `createSelectionPrompt()` — Focused analysis prompt for selected text
  - Includes page context (URL, title) for better understanding
  - Template-driven output when templates configured

**Files Created:**
- `extension/extractors/selection-extractor.js`
- `extension/extractors/video-extractor.js`

**Files Modified:**
- `extension/background.js` — Context menu registration
- `native-host/claude-bridge.js` — Selection prompt construction

### 26. User-Configurable Output Templates (Phase 4)
**Request:** Allow users to customize the output format (sections, labels, order) per content type through the Settings page.

**Implementation:**
- **Template Data Structure** (stored in `chrome.storage.sync`):
  - Per content type: `youtube_video`, `article`, `webpage`, `selected_text`, `video_with_captions`
  - Each template has: name, instructions (prompt text), sections array
  - Each section has: id, label (user-editable), enabled (toggle), format (paragraphs/bullets)
- **Settings UI** (`extension/settings/`):
  - Content type dropdown selector to switch between templates
  - Per-type instruction textarea (replaces single `analysisInstructions`)
  - Section list with checkboxes to enable/disable, editable labels, format dropdowns
  - Drag-and-drop section reordering
  - Preset buttons per content type (e.g., YouTube: Default/Educational/Tutorial/Business; Article: Default/Research Paper/News/Technical)
  - Live format preview showing expected output structure
  - Reset to default button per content type
- **Template-Driven Prompts** (`native-host/claude-bridge.js`):
  - `buildOutputFormat(templateSections, context)` — Dynamically builds output format instructions from enabled sections
  - Maps section IDs to appropriate instruction text (e.g., summary → "comprehensive overview", key_learnings → "most valuable insights")
  - `createPrompt()`, `createArticlePrompt()`, `createSelectionPrompt()` all accept template sections
  - Falls back to hardcoded format when no template configured
- **Template-Driven Parsing** (`native-host/claude-bridge.js`):
  - `getParseLabels(templateSections)` — Maps section IDs to user-configured labels (uppercased)
  - `parseResponse()` uses dynamic section labels from templates for boundary detection
  - Boundary regex requires `\n` prefix to avoid matching words within text content
- **Migration:**
  - Existing `analysisInstructions` automatically migrated to `templates.youtube_video.instructions`
  - Legacy `analysisInstructions` still written alongside templates for backward compatibility
- **Presets per content type:**
  - YouTube: Default, Educational, Tutorial, Business
  - Article: Default, Research Paper, News, Technical
  - Selected Text: Explain, Analyze, Simplify
  - Web Page: Default, Technical Documentation, News

**Files Modified:**
- `extension/settings/settings.html` — Template editor UI with type selector, sections list, presets
- `extension/settings/settings.js` — Complete rewrite with template CRUD, section reordering, presets, migration
- `extension/settings/settings.css` — Template selector, editor, sections list, preset button styles
- `extension/sidebar/sidebar.js` — `loadTemplateConfig()`, passes templateSections to native host
- `native-host/host.js` — Extracts and passes templateSections
- `native-host/claude-bridge.js` — `buildOutputFormat()`, `getParseLabels()`, template-driven parsing
- `native-host/claude-bridge.test.js` — 11 new tests for template functions

---

## Pending / Future Ideas

- [ ] Notion integration (API-based export)
- [ ] Batch process multiple videos
- [ ] Keyboard shortcuts
- [x] Custom summary templates (Feature #26 - Phase 4)
- [ ] Obsidian export

---

## Technical Notes

### Key Files Modified
- `extension/content-detector.js` - Content type detection, page metadata extraction, URL change handling
- `extension/extractors/base-extractor.js` - Shared UI: popup banner, floating button, sidebar, content routing
- `extension/extractors/youtube-extractor.js` - YouTube transcript/comments extraction
- `extension/extractors/article-extractor.js` - Article text extraction via DOM heuristics
- `extension/extractors/webpage-extractor.js` - Fallback page text extraction
- `extension/extractors/video-extractor.js` - HTML5 video caption extraction (VTT/SRT)
- `extension/extractors/selection-extractor.js` - Text selection extraction
- `extension/content.js` - Legacy notice (functionality moved to extractors/)
- `extension/sidebar/sidebar.html` - Progress stages UI, back-to-edit button, relevant links section, transcript viewer, search pane, multi-export UI, action items section, content metadata
- `extension/sidebar/sidebar.js` - Progress handling, back-to-edit logic, link display/selection, transcript preview, search functionality, export handlers (clipboard, download), native host check, action items display/save, content type awareness
- `extension/sidebar/styles.css` - Progress stage styling, link item styling, transcript viewer styling, search highlighting, light/dark mode theming, export button styles, action items styling, content metadata styles
- `extension/background.js` - Progress callback routing, context menu registration
- `native-host/host.js` - Progress message sending, description/links pass-through, Apple Reminders integration, checkAuth handler, content type routing
- `native-host/claude-bridge.js` - Progress callbacks, description in prompt, relevant link parsing, ACTION ITEMS section, API-first with CLI fallback, article/selection prompts
- `native-host/anthropic-client.js` - Direct Anthropic API client with OAuth + API key auth
- `native-host/apple-notes.js` - listFolders(), relevant links in saved notes, action items with checkbox symbols
- `native-host/apple-reminders.js` - Apple Reminders integration via AppleScript
- `install.sh` - Improved installer with colored output, Claude CLI detection, auto-detection

### Storage
- `localStorage['youtube-summary-btn-position']` - Floating button position
- `chrome.storage.local['folderSuggestions']` - Previously used folder names
- `chrome.storage.sync['analysisInstructions']` - Custom analysis instructions
- `chrome.storage.sync['remindersCheckedByDefault']` - Whether action items are checked by default (default: true)
- `chrome.storage.sync['anthropicApiKey']` - Anthropic API key (fallback when OAuth unavailable)
- `chrome.storage.sync['claudeModel']` - Claude model selection: 'sonnet' (default), 'opus', or 'haiku'
- `chrome.storage.sync['elevenlabsApiKey']` - ElevenLabs API key
- `chrome.storage.sync['elevenlabsVoiceId']` - Selected voice ID
- `chrome.storage.sync['audioIncludeSummary']` - Include summary in audio (default: true)
- `chrome.storage.sync['audioIncludeLearnings']` - Include key learnings in audio (default: true)
- `chrome.storage.sync['audioIncludeActions']` - Include action items in audio (default: false)
- `chrome.storage.sync['templates']` - Per-content-type output templates with sections, labels, and instructions
