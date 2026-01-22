# Features

A comprehensive list of all features in the YouTube Summary Extension.

## Core Features

### AI-Powered Summaries

Claude analyzes video transcripts to generate concise, accurate summaries.

- **2-3 paragraph overview** of the video content
- **Context-aware** - understands technical, educational, and entertainment content
- **Editable** - click to modify before saving
- **Customizable** - adjust Claude's focus in [Settings](Settings)

![Summary Example](images/summary-example.png)

### Key Learnings Extraction

Automatically extracts actionable takeaways from the video.

- **5-7 bullet points** by default
- **Selectable** - choose which to save
- **Editable** - modify text inline
- **Deletable** - remove unwanted items
- **Expandable** - add your own learnings

![Key Learnings](images/key-learnings.png)

### Action Items & Reminders

Claude identifies actionable tasks and syncs them to Apple Reminders.

| Feature | Description |
|---------|-------------|
| **Auto-extraction** | Claude identifies tasks from the video |
| **Due dates** | Set default or custom due dates |
| **Apple Reminders** | Synced automatically when saving |
| **Editable** | Modify tasks before saving |

![Action Items](images/action-items-detail.png)

## Transcript Features

### Transcript Preview

View the full transcript before generating a summary.

- Displays immediately when sidebar opens
- Shows character count
- Scrollable preview area
- Helps verify video has good captions

![Transcript Preview](images/transcript-preview-detail.png)

### Transcript Search

Search and navigate through the full transcript.

- **Real-time highlighting** as you type
- **Match count** display
- **Navigation buttons** (Previous/Next)
- **Keyboard shortcuts** (Enter, Shift+Enter)
- **Copy button** to copy full transcript

![Transcript Search](images/transcript-search-detail.png)

## Follow-up Features

### Extract More

Continue prompting Claude for additional information.

#### Quick Examples
Pre-built prompts for common requests:
- **Tools mentioned** - Extract frameworks, software, tools
- **Statistics** - Find numbers, percentages, data
- **Action items** - Get more tasks
- **Key quotes** - Extract memorable phrases

#### Custom Questions
Type any question:
```
What resources were recommended?
Explain the technical architecture discussed.
What were the main arguments for and against?
```

#### Smart Routing
Claude automatically categorizes responses:
- **Insights** → Added to Key Learnings
- **Actions** → Added to Action Items

![Extract More](images/extract-more-detail.png)

## Export Features

### Quick Export

Export without any setup:

| Method | Format | Use Case |
|--------|--------|----------|
| **Copy to Clipboard** | Markdown | Paste into any app |
| **Download .md** | Markdown file | Save locally |

### Apple Notes Integration

Full integration with Apple Notes:

- **Folder organization** - Create or select folders
- **Auto-suggestions** - Recent folders appear as you type
- **Beautiful formatting** - HTML formatting preserved
- **Update support** - Re-save updates existing note

![Apple Notes](images/apple-notes-detail.png)

### Apple Reminders Integration

Action items sync to Apple Reminders:

- **List matching** - Uses same name as Notes folder
- **Due dates** - Preserved from extension
- **Video context** - Title and URL in reminder notes

## Audio Features

### Audio Narration

Generate audio versions of summaries using ElevenLabs.

#### Setup
1. Get an API key from [elevenlabs.io](https://elevenlabs.io)
2. Configure in [Settings](Settings)
3. Select your preferred voice

#### Playback Controls
- **Play/Pause** button
- **Progress bar** with seek
- **Playback speed** (1x, 1.5x, 2x)
- **Time display**

#### Content Options
Choose what to include:
- Summary text
- Key learnings
- Action items

![Audio Player](images/audio-player-detail.png)

## UI Features

### Popup Banner

Notification when a video is detected:
- Appears in top-right corner
- Animated slide-in
- Dismissible with X button
- Non-intrusive positioning

![Popup Banner](images/popup-banner-detail.png)

### Floating Button

Appears after dismissing the popup:
- **Draggable** - Position anywhere on screen
- **Persistent** - Position saved across sessions
- **One-click** - Opens sidebar directly

![Floating Button](images/floating-button-detail.png)

### Light/Dark Mode

Automatically matches your system theme:
- **Light mode** - Warm stone palette
- **Dark mode** - Charcoal with amber accents
- **Auto-switch** - Based on system preference

| Light Mode | Dark Mode |
|------------|-----------|
| ![Light](images/light-mode.png) | ![Dark](images/dark-mode.png) |

### Progress Tracking

Real-time feedback during summary generation:

1. **Preparing transcript** - Formatting for Claude
2. **Sending to Claude** - Transmitting data
3. **Claude is analyzing** - Shows token count
4. **Extracting insights** - Parsing response

![Progress](images/progress-detail.png)

## YouTube Integration

### Description Links

Claude analyzes video descriptions:
- Extracts relevant links
- Filters out YouTube cruft (hashtags, video links)
- Explains why each link is relevant
- Selectable for saving

![Relevant Links](images/relevant-links.png)

### YouTube Comments

Claude can analyze top comments:
- **Creator comments** - Treated as authoritative
- **Viewer comments** - Used for additional context
- Marked with `[From Creator]` when from video author

## Data Management

### Note Caching

Smart handling of saved notes:
- First save creates new note
- Subsequent saves update the same note
- Prevents duplicate notes
- Handles deleted notes gracefully

### Folder Suggestions

Intelligent folder suggestions:
- Shows previously used folders
- Fetches existing Apple Notes folders
- Auto-complete as you type

---

**Next:** Customize the extension → **[Settings](Settings)**
