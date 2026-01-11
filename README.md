# YouTube Summary Extension with Claude Code

Generate AI summaries of YouTube videos using your Claude Code subscription and save key learnings to Apple Notes with folder-based organization.

## Features

- **AI-Powered Summaries**: Uses Claude Code CLI to generate concise summaries of YouTube videos
- **Key Learnings Extraction**: Automatically extracts 5-7 actionable takeaways
- **Apple Notes Integration**: Save summaries to Apple Notes with folder organization
- **No API Costs**: Uses your existing Claude Code subscription via Native Messaging
- **YouTube Transcript**: Automatically fetches video transcripts
- **Beautiful UI**: Clean sidebar interface on YouTube

## Prerequisites

- **macOS** (for Apple Notes integration)
- **Google Chrome** or Chromium-based browser
- **Node.js** (v14 or higher) - [Download](https://nodejs.org/)
- **Claude Code CLI** - Must be installed and accessible in your PATH
- **Claude Code Subscription** - Required to generate summaries

### Installing Claude Code

If you don't have Claude Code installed:

```bash
# Install via npm (recommended)
npm install -g claude-code

# Or follow instructions at: https://code.claude.com
```

Verify installation:
```bash
claude-code --version
```

## Installation

### Step 1: Clone or Download

```bash
# Navigate to where you downloaded this extension
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

## Usage

### Generating Summaries

1. Navigate to any YouTube video with captions/subtitles
2. Click the **AI Summary** button that appears in the video controls
3. A sidebar will open on the right
4. Click **Generate Summary**
5. Wait while Claude Code analyzes the transcript (this may take 1-2 minutes)
6. Review the summary and key learnings

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
┌─────────────────┐
│  YouTube Page   │
│  (Content.js)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Sidebar UI     │
│  (sidebar.js)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Background.js  │
│  (Service Worker)
└────────┬────────┘
         │ Native Messaging
         ▼
┌─────────────────┐
│   host.js       │
│  (Node.js)      │
└────────┬────────┘
         │
    ┌────┴────┬────────────┬────────────┐
    ▼         ▼            ▼            ▼
┌────────┐ ┌──────┐ ┌────────────┐ ┌──────────┐
│YouTube │ │Claude│ │Apple Notes │ │          │
│Transcript│ │Code │ │(AppleScript)│ │          │
└────────┘ └──────┘ └────────────┘ └──────────┘
```

## File Structure

```
youtube-summary-extension/
├── extension/                  # Chrome extension
│   ├── manifest.json           # Extension config
│   ├── content.js              # Injected into YouTube
│   ├── background.js           # Native messaging handler
│   └── sidebar/
│       ├── sidebar.html        # Sidebar UI
│       ├── sidebar.js          # Sidebar logic
│       └── styles.css          # Styling
├── native-host/                # Native messaging host
│   ├── host.js                 # Main entry point
│   ├── transcript-extractor.js # YouTube transcript fetching
│   ├── claude-bridge.js        # Claude Code integration
│   ├── apple-notes.js          # AppleScript wrapper
│   ├── package.json            # Dependencies
│   └── com.youtube.summary.json # Native messaging manifest
├── install.sh                  # Installation script
└── README.md                   # This file
```

## Troubleshooting

### Extension Not Connecting to Native Host

**Error**: "Could not connect to native messaging host"

**Solutions**:
1. Ensure you ran `./install.sh` successfully
2. Verify the Extension ID matches what you provided during installation
3. Check that `host.js` is executable: `chmod +x native-host/host.js`
4. Reload the extension in `chrome://extensions/`

### Claude Code Not Found

**Error**: "Claude Code CLI not found"

**Solutions**:
1. Verify Claude Code is installed: `which claude-code`
2. Ensure it's in your PATH
3. Try running `claude-code` directly in terminal
4. Reinstall Claude Code if needed

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
- Check Claude Code is working: `echo "Hello" | claude-code`

### Check Logs

View debug logs:
```bash
tail -f ~/.youtube-summary-extension.log
```

## Limitations

- **macOS only** (due to Apple Notes integration)
- **Videos with transcripts only** (captions/subtitles must be available)
- **Processing time**: 1-2 minutes for summary generation
- **Claude Code required**: Must have active subscription

## Future Enhancements

Potential features for future versions:

- Spaced repetition reminders via Apple Reminders
- Support for other video platforms (Vimeo, etc.)
- Export to other note apps (Notion, Obsidian)
- Custom prompt templates
- Batch processing of playlists
- Export summaries as PDF/Markdown

## Contributing

This is a personal project. Feel free to fork and modify for your own use.

## License

MIT License - use freely for personal or commercial projects.

## Credits

Built with:
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/)
- [Claude Code CLI](https://code.claude.com)
- [youtube-transcript](https://www.npmjs.com/package/youtube-transcript)
- AppleScript for Notes integration

---

**Questions or Issues?**

Check the logs at `~/.youtube-summary-extension.log` for debugging information.
