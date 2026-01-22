# Troubleshooting

Solutions for common issues with the YouTube Summary Extension.

## Connection Issues

### "Could not connect to native messaging host"

**Symptoms:**
- Extension doesn't respond when clicking Generate Summary
- Error message about native host connection

**Solutions:**

1. **Verify install script ran successfully**
   ```bash
   ./install.sh
   ```

2. **Check the Extension ID matches**
   - Go to `chrome://extensions/`
   - Find your Extension ID
   - Verify it matches what's in the native messaging manifest:
   ```bash
   cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.youtube.summary.json
   ```

3. **Verify host.js is executable**
   ```bash
   chmod +x native-host/host.js
   ```

4. **Reload the extension**
   - Go to `chrome://extensions/`
   - Click the Reload button on the extension

5. **Restart Chrome**
   - Completely quit Chrome (Cmd+Q)
   - Reopen Chrome

### Native Host Status Shows "Not configured"

The extension can't communicate with the native host.

1. Re-run the installation script:
   ```bash
   ./install.sh
   ```

2. Make sure Node.js is installed:
   ```bash
   node --version  # Should be v14+
   ```

3. Check native host manifest exists:
   ```bash
   ls ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
   ```

## Claude Issues

### "Claude Code CLI not found"

**Symptoms:**
- Summary generation fails immediately
- Error mentions Claude not found

**Solutions:**

1. **Verify Claude Code is installed**
   ```bash
   which claude
   claude --version
   ```

2. **Install Claude Code**
   ```bash
   curl -fsSL https://claude.ai/install.sh | bash
   ```

3. **Check PATH**
   The native host runs in a different environment. Make sure Claude is in a standard location:
   ```bash
   echo $PATH
   ```

4. **Try running Claude manually**
   ```bash
   echo "Hello" | claude --print
   ```

### Summary Generation Takes Too Long

**Possible Causes:**
- Very long video transcript
- Claude Code processing delay
- Network issues

**Solutions:**

1. **Wait up to 2 minutes** (the default timeout)

2. **Try a shorter video first** to verify the extension works

3. **Check Claude Code is responsive**
   ```bash
   echo "Say hello" | claude --print
   ```

4. **Check the logs**
   ```bash
   tail -f native-host/extension.log
   ```

### Summary Quality Issues

If summaries aren't useful:

1. **Customize instructions** in [Settings](Settings)
2. **Try different presets** (Technical, Business, etc.)
3. **Check video has good captions** (auto-generated captions may be lower quality)

## Transcript Issues

### "Could not fetch transcript"

**Causes:**
- Video doesn't have captions enabled
- Video uses auto-generated captions that failed
- Age-restricted or private video
- YouTube UI changed

**Solutions:**

1. **Check if captions exist**
   - Click CC button on the video
   - If no captions, the extension can't work

2. **Try a different video** with known captions

3. **Refresh the YouTube page** and try again

4. **Check for YouTube UI changes**
   - The extension scrapes YouTube's DOM
   - If YouTube updates their UI, transcript extraction may break

### Transcript Shows "Loading..."

1. **Wait a moment** - transcript fetching can take a few seconds
2. **Make sure the video has loaded** - transcript appears after video starts
3. **Refresh the page** and reopen the sidebar

## Apple Notes Issues

### "Not authorized to control Apple Notes"

**Cause:** macOS hasn't granted automation permissions.

**Solution:**

1. Open **System Settings** → **Privacy & Security** → **Automation**
2. Find `node` in the list
3. Enable **Notes** checkbox
4. Enable **Reminders** checkbox (if using action items)

![Automation Permissions](images/automation-permissions.png)

### Note Not Appearing in Apple Notes

1. **Check the folder name** - make sure you typed it correctly
2. **Look in the correct account** - notes are saved to your default account
3. **Check Apple Notes app** is running

### Duplicate Notes Being Created

The extension tracks note IDs to prevent duplicates. If duplicates appear:

1. **Don't change the video title** between saves
2. **Use "Back to Edit"** instead of generating a new summary
3. The note ID is cached per video URL

## Apple Reminders Issues

### Reminders Not Being Created

1. **Check automation permissions** for Reminders
2. **Verify action items are checked** before saving
3. **Check logs** for errors:
   ```bash
   tail -20 native-host/extension.log
   ```

### Reminders in Wrong List

Reminders are created in a list matching your Apple Notes folder name. To change:
1. Enter a different folder name in the extension
2. The list will be created if it doesn't exist

## Audio Issues

### "ElevenLabs API key not configured"

1. Get an API key from [elevenlabs.io](https://elevenlabs.io/app/settings/api-keys)
2. Open extension Settings (gear icon)
3. Enter your API key
4. Save Settings

### Voice Dropdown Empty

1. **Verify API key is correct**
2. **Wait for voices to load** (takes a few seconds)
3. **Check your ElevenLabs account** has available voices

### Audio Not Playing

1. **Check browser audio permissions**
2. **Try a different voice**
3. **Check ElevenLabs quota** - you may have exceeded your limit

## UI Issues

### Popup Banner Not Appearing

1. **Make sure you're on a YouTube video page** (URL should contain `watch?v=`)
2. **Refresh the page**
3. **Check extension is enabled** in `chrome://extensions/`

### Floating Button Invisible

1. **Check if it's off-screen** - saved position may be outside current viewport
2. **Clear localStorage**:
   - Open DevTools on YouTube (F12)
   - Go to Application → Local Storage
   - Delete `youtube-summary-btn-position`
3. **Refresh the page**

### Sidebar Not Opening

1. **Check for console errors** (F12 → Console)
2. **Reload the extension**
3. **Try a different YouTube video**

### Dark Mode Not Working

The extension uses `prefers-color-scheme` media query. Make sure:
1. Your system is set to dark mode
2. Chrome is respecting system theme

## Checking Logs

The extension logs to `native-host/extension.log`.

### View Live Logs
```bash
tail -f native-host/extension.log
```

### View Recent Logs
```bash
tail -50 native-host/extension.log
```

### Log Rotation
Logs auto-rotate when exceeding 1MB. Old entries are pruned automatically.

## Reporting Issues

If you can't resolve an issue:

1. **Check logs** for error messages
2. **Note the steps to reproduce**
3. **Include browser and OS version**
4. **Open an issue** on [GitHub](https://github.com/altfong/youtube-summary-extension/issues)

Include:
- Error message (if any)
- Relevant log output
- YouTube video URL (if it's video-specific)
- Screenshots of the issue

---

**Back to:** **[Home](Home)** | **[Installation](Installation)** | **[Usage Guide](Usage-Guide)**
