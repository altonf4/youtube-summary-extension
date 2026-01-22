# Installation Guide

This guide walks you through setting up the YouTube Summary Extension on macOS.

## Prerequisites

Before you begin, make sure you have:

- [ ] **macOS** (required for Apple Notes integration)
- [ ] **Google Chrome** or a Chromium-based browser
- [ ] **Node.js v14+** - [Download here](https://nodejs.org/)
- [ ] **Claude Code CLI** with an active subscription

### Installing Claude Code

If you don't have Claude Code installed:

```bash
# Recommended: via install script
curl -fsSL https://claude.ai/install.sh | bash

# Or via Homebrew
brew install --cask claude-code

# Or via npm (deprecated but works)
npm install -g @anthropic-ai/claude-code
```

Verify the installation:
```bash
claude --version
```

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

**Next:** Learn how to use the extension → **[Usage Guide](Usage-Guide)**
