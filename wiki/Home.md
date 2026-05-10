# AI Summary Extension

> Generate AI-powered summaries of YouTube videos, articles, web pages, and text selections using Claude or Codex — and save them to Apple Notes.

## What is this?

AI Summary Extension is a Chrome and Safari web extension that uses your Claude Code or OpenAI Codex subscription to generate concise summaries and key learnings from web content. It works on YouTube videos with captions, articles, generic web pages, HTML5 videos with captions, and any text you highlight on a page. Results save directly to Apple Notes with folder organization, and action items can sync to Apple Reminders.

## Key Features

| Feature | Description |
|---------|-------------|
| **AI Summaries** | Claude or Codex analyzes content to create concise summaries |
| **Two providers** | Switch between Claude and Codex, or run both side-by-side in **Compare mode** |
| **Works on anything** | YouTube, articles, web pages, HTML5 videos, text selections |
| **Key Learnings** | Automatically extracts 5–7 actionable takeaways |
| **Action Items** | Generates tasks and syncs them to Apple Reminders |
| **Audio Narration** | Listen to summaries with ElevenLabs text-to-speech (optional) |
| **Apple Notes** | Save everything organized by folder |
| **Transcript Search** | Search and highlight text in the full transcript |
| **Follow-up Chat** | Multi-turn conversation with the full content in context |
| **Custom Templates** | Per-content-type prompts and output sections |

## Quick Start

1. **[Installation](Installation)** - Set up the extension and native host
2. **[Usage Guide](Usage-Guide)** - Learn how to generate and save summaries
3. **[Features](Features)** - Explore all capabilities
4. **[Settings](Settings)** - Customize the analysis
5. **[Troubleshooting](Troubleshooting)** - Fix common issues

## How It Works

```
Web content → Extract (transcript / article text / selection)
            → Claude or Codex analysis
            → Summary + Learnings + Action items
            → Apple Notes / Reminders / Audio
```

The extension uses Chrome's Native Messaging API (or, on Safari, an XPC + LaunchAgent bridge) to communicate with a local Node.js process that runs the Claude or Codex CLI. This means:

- **No AI API costs** — uses your existing Claude or Codex CLI subscription
- **Privacy first** — everything runs locally on your machine
- **macOS integration** — native Apple Notes and Reminders support

## Requirements

- macOS (for Apple Notes integration)
- Google Chrome / Chromium **or** Safari
- Node.js v14+
- At least one of: Claude Code CLI, or OpenAI Codex CLI — with an active subscription
- (Optional) ElevenLabs API key for audio narration

## Screenshots

### Popup Banner
When you visit a YouTube video, a popup appears offering to summarize it.

![Popup Banner](images/popup-banner.png)

### Sidebar with Transcript
Open the sidebar to preview the transcript and generate a summary.

![Sidebar Generate](images/sidebar-generate.png)

### Progress Tracking
Watch real-time progress as Claude analyzes the video.

![Progress Stages](images/progress-stages.png)

### Summary Results
View the summary, key learnings, and use "Extract More" for follow-up questions.

![Summary Results](images/summary-results.png)

### Export Options
Copy to clipboard, download as Markdown, or save to Apple Notes.

![Export Section](images/export-section.png)

---

**Ready to get started?** Head to the **[Installation Guide](Installation)** →
