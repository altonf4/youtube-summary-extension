#!/bin/bash

# YouTube Summary Extension Installer
# Installs native messaging host for Chrome

set -e

echo "========================================="
echo "YouTube Summary Extension Installer"
echo "========================================="
echo ""

# Get the absolute path to the extension directory
EXTENSION_DIR="$(cd "$(dirname "$0")" && pwd)"
NATIVE_HOST_DIR="$EXTENSION_DIR/native-host"
MANIFEST_FILE="com.youtube.summary.json"

echo "Extension directory: $EXTENSION_DIR"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js found: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed."
    exit 1
fi

echo "✓ npm found: $(npm --version)"
echo ""

# Install npm dependencies
echo "Installing npm dependencies..."
cd "$NATIVE_HOST_DIR"
npm install
echo "✓ Dependencies installed"
echo ""

# Make host.js executable
echo "Making host.js executable..."
chmod +x "$NATIVE_HOST_DIR/host.js"
echo "✓ host.js is now executable"
echo ""

# Prompt for extension ID
echo "========================================="
echo "Extension ID Required"
echo "========================================="
echo ""
echo "To complete the installation, you need to load the extension in Chrome first:"
echo ""
echo "1. Open Chrome and navigate to: chrome://extensions/"
echo "2. Enable 'Developer mode' (toggle in top-right)"
echo "3. Click 'Load unpacked'"
echo "4. Select this directory: $EXTENSION_DIR/extension"
echo "5. Copy the Extension ID (it looks like: abcdefghijklmnopqrstuvwxyzabcdef)"
echo ""
read -p "Enter the Extension ID: " EXTENSION_ID

if [ -z "$EXTENSION_ID" ]; then
    echo "Error: Extension ID cannot be empty"
    exit 1
fi

echo ""
echo "Extension ID: $EXTENSION_ID"
echo ""

# Update native messaging manifest
echo "Updating native messaging manifest..."
MANIFEST_TEMPLATE="$NATIVE_HOST_DIR/$MANIFEST_FILE"
MANIFEST_DEST="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/$MANIFEST_FILE"

# Create directory if it doesn't exist
mkdir -p "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

# Replace placeholders in manifest
sed "s|EXTENSION_PATH_PLACEHOLDER|$EXTENSION_DIR|g" "$MANIFEST_TEMPLATE" | \
sed "s|EXTENSION_ID_PLACEHOLDER|$EXTENSION_ID|g" > "$MANIFEST_DEST"

echo "✓ Manifest installed to: $MANIFEST_DEST"
echo ""

# Verify installation
echo "========================================="
echo "Verifying Installation"
echo "========================================="
echo ""

if [ -f "$MANIFEST_DEST" ]; then
    echo "✓ Native messaging manifest found"
else
    echo "✗ Native messaging manifest not found"
    exit 1
fi

if [ -x "$NATIVE_HOST_DIR/host.js" ]; then
    echo "✓ Native host is executable"
else
    echo "✗ Native host is not executable"
    exit 1
fi

echo ""
echo "========================================="
echo "Installation Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Refresh the extension in Chrome (chrome://extensions/)"
echo "2. Navigate to any YouTube video"
echo "3. Click the 'AI Summary' button to test"
echo ""
echo "Note: You may need to grant permissions for AppleScript to control Notes."
echo "This will be prompted when you first save a note to Apple Notes."
echo ""
echo "Logs are written to: ~/.youtube-summary-extension.log"
echo ""
