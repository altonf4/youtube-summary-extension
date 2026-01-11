#!/bin/bash

# YouTube Summary Extension Installer
# Installs native messaging host for Chrome

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  YouTube Summary Extension Installer${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Get the absolute path to the extension directory
EXTENSION_DIR="$(cd "$(dirname "$0")" && pwd)"
NATIVE_HOST_DIR="$EXTENSION_DIR/native-host"
MANIFEST_FILE="com.youtube.summary.json"
CHROME_NATIVE_HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

echo -e "Extension directory: ${BLUE}$EXTENSION_DIR${NC}"
echo ""

# =========================================
# PREREQUISITE CHECKS
# =========================================

echo "Checking prerequisites..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo ""
    echo "Node.js is required for the native messaging host."
    echo "Install options:"
    echo "  - Download from: https://nodejs.org/"
    echo "  - Using Homebrew: brew install node"
    echo ""
    exit 1
fi
echo -e "${GREEN}✓${NC} Node.js found: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed.${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} npm found: $(npm --version)"

# Check Claude CLI (important but not blocking)
CLAUDE_PATH=""
CLAUDE_LOCATIONS=(
    "claude"
    "/usr/local/bin/claude"
    "$HOME/.local/bin/claude"
    "/opt/homebrew/bin/claude"
    "$HOME/.claude/local/claude"
)

for loc in "${CLAUDE_LOCATIONS[@]}"; do
    if command -v "$loc" &> /dev/null 2>&1; then
        CLAUDE_PATH="$loc"
        break
    fi
done

if [ -z "$CLAUDE_PATH" ]; then
    echo ""
    echo -e "${YELLOW}⚠  Claude CLI not found in common locations${NC}"
    echo ""
    echo "The Claude CLI is required for AI summary generation."
    echo ""
    echo "To install Claude CLI:"
    echo "  1. Visit: https://claude.ai/download"
    echo "  2. Download and install Claude Code"
    echo "  3. Run: claude --version (to verify installation)"
    echo ""
    echo "If Claude is installed in a custom location, enter the full path:"
    read -p "Claude path (or press Enter to skip): " CUSTOM_CLAUDE

    if [ -n "$CUSTOM_CLAUDE" ]; then
        if [ -x "$CUSTOM_CLAUDE" ]; then
            CLAUDE_PATH="$CUSTOM_CLAUDE"
            echo -e "${GREEN}✓${NC} Claude found at: $CLAUDE_PATH"
        else
            echo -e "${YELLOW}Warning: Path is not executable or not found${NC}"
        fi
    fi

    if [ -z "$CLAUDE_PATH" ]; then
        echo ""
        echo -e "${YELLOW}Continuing without Claude CLI verification.${NC}"
        echo "Note: Summary generation will fail until Claude CLI is installed."
        echo ""
    fi
else
    CLAUDE_VERSION=$("$CLAUDE_PATH" --version 2>/dev/null || echo "unknown version")
    echo -e "${GREEN}✓${NC} Claude CLI found: $CLAUDE_PATH ($CLAUDE_VERSION)"
fi

echo ""

# =========================================
# INSTALL NPM DEPENDENCIES
# =========================================

echo "Installing npm dependencies..."
cd "$NATIVE_HOST_DIR"
npm install --silent 2>/dev/null || npm install
echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

# Make host.js executable
chmod +x "$NATIVE_HOST_DIR/host.js"
echo -e "${GREEN}✓${NC} host.js is now executable"
echo ""

# =========================================
# EXTENSION ID DETECTION
# =========================================

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  Extension ID Setup${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Try to auto-detect extension ID from Chrome profile
DETECTED_ID=""
CHROME_EXTENSIONS_DIR="$HOME/Library/Application Support/Google/Chrome/Default/Extensions"

# Look for our extension in the extensions directory
if [ -d "$CHROME_EXTENSIONS_DIR" ]; then
    # Check each extension's manifest for our extension name
    for ext_dir in "$CHROME_EXTENSIONS_DIR"/*/; do
        if [ -d "$ext_dir" ]; then
            for version_dir in "$ext_dir"*/; do
                if [ -f "$version_dir/manifest.json" ]; then
                    if grep -q "YouTube Summary" "$version_dir/manifest.json" 2>/dev/null; then
                        DETECTED_ID=$(basename "$ext_dir")
                        break 2
                    fi
                fi
            done
        fi
    done
fi

if [ -n "$DETECTED_ID" ]; then
    echo -e "${GREEN}✓${NC} Auto-detected extension ID: ${BLUE}$DETECTED_ID${NC}"
    echo ""
    read -p "Use this ID? (Y/n): " USE_DETECTED
    if [[ "$USE_DETECTED" =~ ^[Nn] ]]; then
        DETECTED_ID=""
    fi
fi

if [ -z "$DETECTED_ID" ]; then
    echo "To get your extension ID:"
    echo ""
    echo "  1. Open Chrome and go to: ${BLUE}chrome://extensions/${NC}"
    echo "  2. Enable 'Developer mode' (toggle in top-right)"
    echo "  3. Click 'Load unpacked'"
    echo "  4. Select: ${BLUE}$EXTENSION_DIR/extension${NC}"
    echo "  5. Copy the ID shown under the extension name"
    echo "     (e.g., abcdefghijklmnopqrstuvwxyzabcdef)"
    echo ""
    read -p "Enter the Extension ID: " EXTENSION_ID

    if [ -z "$EXTENSION_ID" ]; then
        echo -e "${RED}Error: Extension ID cannot be empty${NC}"
        exit 1
    fi

    # Validate format (32 lowercase letters)
    if ! [[ "$EXTENSION_ID" =~ ^[a-z]{32}$ ]]; then
        echo -e "${YELLOW}Warning: Extension ID format looks unusual.${NC}"
        echo "Expected: 32 lowercase letters (e.g., abcdefghijklmnopqrstuvwxyzabcdef)"
        read -p "Continue anyway? (y/N): " CONTINUE
        if [[ ! "$CONTINUE" =~ ^[Yy] ]]; then
            exit 1
        fi
    fi
else
    EXTENSION_ID="$DETECTED_ID"
fi

echo ""
echo -e "Using Extension ID: ${BLUE}$EXTENSION_ID${NC}"
echo ""

# =========================================
# INSTALL NATIVE MESSAGING MANIFEST
# =========================================

echo "Installing native messaging manifest..."

# Create directory if needed
mkdir -p "$CHROME_NATIVE_HOST_DIR"

# Generate manifest from template
MANIFEST_TEMPLATE="$NATIVE_HOST_DIR/$MANIFEST_FILE"
MANIFEST_DEST="$CHROME_NATIVE_HOST_DIR/$MANIFEST_FILE"

sed "s|EXTENSION_PATH_PLACEHOLDER|$EXTENSION_DIR|g" "$MANIFEST_TEMPLATE" | \
sed "s|EXTENSION_ID_PLACEHOLDER|$EXTENSION_ID|g" > "$MANIFEST_DEST"

echo -e "${GREEN}✓${NC} Manifest installed to:"
echo "   $MANIFEST_DEST"
echo ""

# =========================================
# VERIFICATION
# =========================================

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  Verifying Installation${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

ERRORS=0

if [ -f "$MANIFEST_DEST" ]; then
    echo -e "${GREEN}✓${NC} Native messaging manifest exists"
else
    echo -e "${RED}✗${NC} Native messaging manifest not found"
    ERRORS=$((ERRORS + 1))
fi

if [ -x "$NATIVE_HOST_DIR/host.js" ]; then
    echo -e "${GREEN}✓${NC} Native host is executable"
else
    echo -e "${RED}✗${NC} Native host is not executable"
    ERRORS=$((ERRORS + 1))
fi

if [ -n "$CLAUDE_PATH" ]; then
    echo -e "${GREEN}✓${NC} Claude CLI is available"
else
    echo -e "${YELLOW}⚠${NC} Claude CLI not verified (summary generation requires it)"
fi

echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${BLUE}=========================================${NC}"
    echo -e "  ${GREEN}Installation Complete!${NC}"
    echo -e "${BLUE}=========================================${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Refresh the extension in Chrome (chrome://extensions/)"
    echo "  2. Navigate to any YouTube video"
    echo "  3. Click the popup banner or floating button to open sidebar"
    echo ""
    echo "Features available:"
    echo -e "  ${GREEN}✓${NC} Copy to clipboard (always works)"
    echo -e "  ${GREEN}✓${NC} Download as markdown (always works)"
    if [ -n "$CLAUDE_PATH" ]; then
        echo -e "  ${GREEN}✓${NC} AI summary generation (Claude CLI ready)"
    else
        echo -e "  ${YELLOW}⚠${NC} AI summary generation (needs Claude CLI)"
    fi
    echo -e "  ${GREEN}✓${NC} Save to Apple Notes (macOS)"
    echo ""
    echo "Logs: ~/.youtube-summary-extension.log"
else
    echo -e "${RED}Installation completed with $ERRORS error(s).${NC}"
    echo "Please fix the issues above and try again."
    exit 1
fi
