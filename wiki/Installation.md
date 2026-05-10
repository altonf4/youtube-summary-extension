# Installation Guide

This guide walks you through setting up the AI Summary Extension on macOS.
The full Chrome walkthrough is below; for Safari, see [Safari Installation](#safari-installation) at the bottom of this page (or the project README).

## Prerequisites

Before you begin, make sure you have:

- [ ] **macOS** (required for Apple Notes integration)
- [ ] **Google Chrome** / Chromium-based browser, **or Safari**
- [ ] **Node.js v14+** — [Download here](https://nodejs.org/)
- [ ] **At least one AI CLI**, authenticated:
      Claude Code CLI **or** OpenAI Codex CLI (with active subscription)
- [ ] **Xcode** (Safari only — to build the wrapper app)
- [ ] **ElevenLabs API key** (optional — only needed for audio narration)

### Installing Claude Code (one option)

```bash
# Recommended: via install script
curl -fsSL https://claude.ai/install.sh | bash

# Or via Homebrew
brew install --cask claude-code

# Or via npm (deprecated but works)
npm install -g @anthropic-ai/claude-code
```

Verify: `claude --version` and `claude login`.

### Installing OpenAI Codex CLI (the other option)

```bash
npm install -g @openai/codex
codex login
```

You can install both — the extension lets you pick the active provider per task, or run both in **Compare mode**.

## Step 1: Clone the Repository

```bash
git clone https://github.com/altfong/youtube-summary-extension.git
cd youtube-summary-extension
```

## Step 2: Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`

   ![Chrome Extensions Page](images/chrome-extensions.png)

2. Enable **Developer mode** (toggle in top-right corner)

   ![Developer Mode Toggle](images/developer-mode.png)

3. Click **Load unpacked**

4. Select the `extension` folder inside the cloned directory

5. **Copy the Extension ID** - you'll need this in the next step

   ![Extension ID](images/extension-id.png)

   > The Extension ID looks like: `abcdefghijklmnopqrstuvwxyzabcdef`

## Step 3: Run the Installation Script

```bash
./install.sh
```

The script will:
- Install npm dependencies
- Make the native host executable
- Prompt you for the Extension ID
- Install the native messaging manifest

![Install Script](images/install-script.png)

When prompted, paste the Extension ID you copied in Step 2.

### What the Script Does

The installation script creates a native messaging manifest at:
```
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.youtube.summary.json
```

This tells Chrome how to communicate with the local Node.js process that runs Claude.

## Step 4: Reload the Extension

1. Go back to `chrome://extensions/`
2. Click the **Reload** button on the YouTube Summary extension

   ![Reload Extension](images/reload-extension.png)

## Step 5: Grant Permissions (First Use)

The first time you save to Apple Notes, macOS will ask for automation permissions:

1. Open **System Settings** → **Privacy & Security** → **Automation**
2. Find `node` (or your terminal app)
3. Enable access to **Notes** and **Reminders**

![Automation Permissions](images/automation-permissions.png)

## Verifying Installation

To verify everything is working:

1. Navigate to any YouTube video with captions
2. You should see a popup banner: "YouTube Summary Available"
3. Click **Summarize** to open the sidebar

![Verification](images/verification.png)

If you see the popup, you're all set! Head to the **[Usage Guide](Usage-Guide)** to learn how to use the extension.

## Manual Installation (Alternative)

If the install script doesn't work, you can set things up manually:

### 1. Install Dependencies

```bash
cd native-host
npm install
chmod +x host.js
```

### 2. Create Native Messaging Manifest

Create the file at:
```
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.youtube.summary.json
```

With contents:
```json
{
  "name": "com.youtube.summary",
  "description": "YouTube Summary Native Host",
  "path": "/FULL/PATH/TO/youtube-summary-extension/native-host/host.js",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
```

Replace:
- `/FULL/PATH/TO/` with the actual path to your cloned repo
- `YOUR_EXTENSION_ID` with your extension's ID from Chrome

### 3. Reload the Extension

Go to `chrome://extensions/` and click Reload on the extension.

---

## Safari Installation

The Safari build wraps the same `extension/` source in a macOS app — Apple
requires Safari Web Extensions to ship inside an app bundle.

```bash
./install-safari.sh
```

The script builds the Xcode project, installs `AI Summary.app` to
`/Applications`, writes a config file under `~/Library/Application Support/AI Summary/`,
and loads a LaunchAgent so the Claude / Codex CLIs can reach the keychain.

After the script finishes:

1. Open `/Applications/AI Summary.app` once (registers the extension with Safari)
2. Safari → **Settings → Extensions** → enable **AI Summary Extension**
3. If macOS Gatekeeper blocks the app on first launch (because it's
   ad-hoc signed), right-click the app and choose **Open**
4. If Safari refuses to load the unsigned extension, enable
   **Develop → Allow Unsigned Extensions**

Safari shows a spinner instead of staged progress while the summary
generates — final results are identical to Chrome. See
[`docs/safari-troubleshooting.md`](https://github.com/altfong/youtube-summary-extension/blob/main/docs/safari-troubleshooting.md)
in the repo for the full Safari runbook.

---

**Next:** Learn how to use the extension → **[Usage Guide](Usage-Guide)**
