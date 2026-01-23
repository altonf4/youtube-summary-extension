# Usage Guide

Learn how to generate AI summaries and save them to Apple Notes.

## Opening the Extension

### 1. Navigate to a YouTube Video

Go to any YouTube video that has captions/subtitles available.

### 2. Click the Popup Banner

When a video loads, you'll see a popup banner in the top-right corner:

![Popup Banner](images/popup-banner.png)

Click **Summarize** to open the sidebar.

### 3. Alternative: Use the Floating Button

If you dismiss the popup (click X), a small floating button appears. You can:
- **Click it** to open the sidebar
- **Drag it** anywhere on the screen (position is saved)

![Floating Button](images/floating-button.png)

## Generating a Summary

### 1. Review the Transcript Preview

Before generating, you can preview the video's transcript in the sidebar:

![Sidebar with Transcript](images/sidebar-generate.png)

### 2. Click "Generate Summary"

Click the orange **Generate Summary** button to start analysis.

### 3. Watch the Progress

You'll see real-time progress as Claude analyzes the video:

| Stage | Description |
|-------|-------------|
| Preparing transcript | Formatting the transcript for Claude |
| Sending to Claude | Transmitting to Claude Code CLI |
| Claude is analyzing | AI is processing (shows token count) |
| Extracting insights | Parsing the response |

![Progress Stages](images/progress-stages.png)

### 4. Review the Results

Once complete, you'll see:

- **Summary** - A 2-3 paragraph overview
- **Key Learnings** - 5-7 actionable takeaways
- **Action Items** - Specific tasks to take (if any)
- **Relevant Links** - Useful links from the video description

![Summary Results](images/summary-results.png)

## Editing Results

All sections are editable before saving:

### Edit Summary
Click anywhere in the summary text to edit it.

### Edit Key Learnings
- Click any learning to edit its text
- Use checkboxes to select which to save
- Click **Select All / Unselect All** to toggle all
- Click the **×** button to delete an item
- Click **+ Add Learning** to add your own

### Edit Action Items
- Edit task text by clicking on it
- Change due dates with the date picker
- Checked items are saved to Apple Reminders


## Extract More Information

Want more details? Use the **Extract More** section:

### Quick Examples
Click a chip to ask a pre-built question:
- **Tools mentioned** - Extract tools and frameworks
- **Statistics** - Find numbers and data points
- **Action items** - Get more tasks
- **Key quotes** - Find memorable phrases

### Custom Questions
Or type your own question:

```
What books or resources were recommended?
What were the main criticisms discussed?
Summarize the technical implementation details.
```


New items are automatically added to Key Learnings or Action Items based on their type.

## Search the Transcript

After generating a summary, you can search the full transcript:

1. Type in the **Search Transcript** box
2. Matches are highlighted in yellow
3. Current match is highlighted in orange
4. Use **↑/↓** buttons or **Enter/Shift+Enter** to navigate


Click the **copy** button to copy the entire transcript.

## Exporting Your Summary

### Quick Export (No Setup Required)

| Option | Description |
|--------|-------------|
| **Copy to Clipboard** | Copies formatted Markdown to clipboard |
| **Download .md** | Downloads as a Markdown file |


### Save to Apple Notes

1. Enter a **folder name** (e.g., "Tech Tutorials", "Business")
   - Suggestions appear as you type
   - New folders are created automatically

2. Click **Save to Apple Notes**

![Export Section](images/export-section.png)

3. View the success message


### What Gets Saved

Your Apple Note includes:
- Video title and URL
- Date saved
- AI-generated summary
- Selected key learnings
- Action items (with checkbox symbols)
- Relevant links
- Your custom notes


### Apple Reminders

Checked action items are automatically synced to Apple Reminders:
- Created in a list matching your folder name
- Includes the video title and URL in the note
- Due dates are preserved


## Audio Narration

Listen to your summary with ElevenLabs text-to-speech:

1. Click the **speaker icon** next to "Summary"
2. First time: Configure your API key in [Settings](Settings)
3. Audio generates and plays automatically
4. Use the player controls:
   - **Play/Pause** button
   - **Progress bar** (click to seek)
   - **Speed** button (1x, 1.5x, 2x)


## Tips & Best Practices

### For Best Results
- Choose videos with **good captions** (auto-generated works, but human captions are better)
- Longer videos may take more time to analyze
- Educational content works best for key learnings extraction

### Organizing Notes
- Use consistent folder names for topics (e.g., "Programming", "Marketing")
- Add your own notes in the "Your Notes" section before saving
- Edit key learnings to make them more actionable for you

### Follow-up Questions
Good follow-up prompts:
- "What specific steps were recommended?"
- "Extract any URLs or resources mentioned"
- "What tools or software were discussed?"
- "Summarize the pros and cons mentioned"

---

**Next:** Explore all features → **[Features](Features)**
