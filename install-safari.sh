#!/bin/bash

# AI Summary — Safari installer
# Builds the Safari Web Extension wrapper app, installs it to /Applications,
# and writes the bridge config that points the extension at the local
# native-host/host.js (which is reused unchanged from the Chrome build).

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
NATIVE_HOST_DIR="$REPO_DIR/native-host"
HOST_JS="$NATIVE_HOST_DIR/host.js"
XCODE_PROJ_DIR="$REPO_DIR/safari/AI Summary"
XCODE_PROJ="$XCODE_PROJ_DIR/AI Summary.xcodeproj"
DERIVED_DATA="$XCODE_PROJ_DIR/build"
APP_BUNDLE="$DERIVED_DATA/Build/Products/Release/AI Summary.app"
INSTALL_DEST="/Applications/AI Summary.app"
CONFIG_DIR="$HOME/Library/Application Support/AI Summary"
CONFIG_FILE="$CONFIG_DIR/config.json"

echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  AI Summary — Safari Installer${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# --- Prereqs ---------------------------------------------------------------

if ! command -v node &>/dev/null; then
    echo -e "${RED}Error: Node.js is required.${NC} Install via https://nodejs.org or 'brew install node'."
    exit 1
fi
NODE_PATH="$(command -v node)"
echo -e "${GREEN}✓${NC} node: $NODE_PATH ($(node --version))"

if ! command -v xcodebuild &>/dev/null; then
    echo -e "${RED}Error: Xcode is required.${NC} Install Xcode from the App Store and run 'sudo xcode-select -s /Applications/Xcode.app/Contents/Developer'."
    exit 1
fi
echo -e "${GREEN}✓${NC} xcodebuild: $(xcodebuild -version | head -1)"

if [ ! -d "$XCODE_PROJ" ]; then
    echo -e "${RED}Error:${NC} Xcode project not found at $XCODE_PROJ"
    exit 1
fi

# --- Install Node dependencies for the native host -------------------------

echo ""
echo "Installing native-host dependencies..."
( cd "$NATIVE_HOST_DIR" && npm install --silent 2>/dev/null || npm install )
chmod +x "$HOST_JS" "$NATIVE_HOST_DIR/run-host.sh" 2>/dev/null || true
echo -e "${GREEN}✓${NC} native-host ready"

# --- Detect signing identity ----------------------------------------------
#
# Safari (and pluginkit) won't register an extension whose containing app is
# only ad-hoc signed — Gatekeeper rejects the bundle and the extension never
# becomes visible in Settings → Extensions. We need a real signing identity.
#
# We try in priority order:
#   1. AISUMMARY_DEVELOPMENT_TEAM (env override)
#   2. The first "Apple Development" identity in the keychain — Xcode handles
#      provisioning profile generation automatically when we let it.
#   3. Fall back to ad-hoc, but warn the user it probably won't load.

DEV_TEAM=""
DEV_IDENTITY=""

if [ -n "$AISUMMARY_DEVELOPMENT_TEAM" ]; then
    DEV_TEAM="$AISUMMARY_DEVELOPMENT_TEAM"
    echo -e "${GREEN}✓${NC} Using team from AISUMMARY_DEVELOPMENT_TEAM: $DEV_TEAM"
else
    # Pull the first Apple Development identity for its display name, then read
    # the actual Team ID from the certificate's Subject OU field.
    # The string in parens after the name (e.g. "Alton Fong (9AG444TLA6)") is
    # the cert serial, NOT the team ID — Xcode rejects that as a team.
    DEV_IDENTITY_LINE=$(security find-identity -v -p codesigning | grep "Apple Development:" | head -1 || true)
    if [ -n "$DEV_IDENTITY_LINE" ]; then
        DEV_IDENTITY=$(echo "$DEV_IDENTITY_LINE" | sed -nE 's/.*"(Apple Development:[^"]+)".*/\1/p')
        # OU=<TEAMID> in the cert subject
        DEV_TEAM=$(security find-certificate -c "Apple Development:" -p 2>/dev/null \
            | openssl x509 -noout -subject 2>/dev/null \
            | sed -nE 's/.*OU=([A-Z0-9]+).*/\1/p')
        if [ -n "$DEV_TEAM" ]; then
            echo -e "${GREEN}✓${NC} Found signing identity: $DEV_IDENTITY"
            echo -e "  Team ID: $DEV_TEAM"
        fi
    fi
fi

# --- Build the Safari app --------------------------------------------------

echo ""
if [ -n "$DEV_TEAM" ]; then
    echo "Building 'AI Summary.app' (Release, signed with team $DEV_TEAM)..."
    # Let Xcode auto-manage provisioning profile generation. This requires the
    # Apple ID to be signed in to Xcode → Settings → Accounts; the script will
    # surface the actual error if it isn't.
    xcodebuild \
        -project "$XCODE_PROJ" \
        -scheme "AI Summary" \
        -configuration Release \
        -derivedDataPath "$DERIVED_DATA" \
        -allowProvisioningUpdates \
        DEVELOPMENT_TEAM="$DEV_TEAM" \
        CODE_SIGN_STYLE=Automatic \
        build >/tmp/aisummary-xcodebuild.log 2>&1 || {
            echo -e "${RED}xcodebuild failed.${NC} See /tmp/aisummary-xcodebuild.log"
            echo ""
            echo "Common causes:"
            echo "  • Apple ID not signed in to Xcode → Settings → Accounts"
            echo "  • Team $DEV_TEAM doesn't have permission to sign this bundle ID"
            echo "  • Network issue blocking Xcode from reaching the developer portal"
            echo ""
            tail -30 /tmp/aisummary-xcodebuild.log
            exit 1
        }
else
    echo -e "${YELLOW}⚠${NC} No Apple Development identity found; building ad-hoc."
    echo -e "${YELLOW}   Safari likely will not load this extension.${NC}"
    xcodebuild \
        -project "$XCODE_PROJ" \
        -scheme "AI Summary" \
        -configuration Release \
        -derivedDataPath "$DERIVED_DATA" \
        CODE_SIGN_IDENTITY=- \
        CODE_SIGNING_REQUIRED=NO \
        CODE_SIGNING_ALLOWED=NO \
        build >/tmp/aisummary-xcodebuild.log 2>&1 || {
            echo -e "${RED}xcodebuild failed.${NC} See /tmp/aisummary-xcodebuild.log"
            tail -30 /tmp/aisummary-xcodebuild.log
            exit 1
        }
fi

if [ ! -d "$APP_BUNDLE" ]; then
    echo -e "${RED}Error:${NC} Build succeeded but app not found at $APP_BUNDLE"
    exit 1
fi
echo -e "${GREEN}✓${NC} Built: $APP_BUNDLE"

# --- Install to /Applications ----------------------------------------------

echo ""
echo "Installing to /Applications..."
if [ -d "$INSTALL_DEST" ]; then
    rm -rf "$INSTALL_DEST"
fi
cp -R "$APP_BUNDLE" "$INSTALL_DEST"
echo -e "${GREEN}✓${NC} Installed: $INSTALL_DEST"

# Force LaunchServices to re-index the new bundle so Safari sees the extension
# without waiting for a login or Spotlight pass.
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister \
    -f "$INSTALL_DEST" >/dev/null 2>&1 || true

# --- Write bridge config ---------------------------------------------------

echo ""
echo "Writing bridge config..."
mkdir -p "$CONFIG_DIR"
SOCKET_PATH="$HOME/Library/Caches/com.altonfong.aisummary/host.sock"
cat > "$CONFIG_FILE" <<EOF
{
  "nodePath": "$NODE_PATH",
  "hostPath": "$HOST_JS",
  "socketPath": "$SOCKET_PATH"
}
EOF
echo -e "${GREEN}✓${NC} Config: $CONFIG_FILE"

# --- Install LaunchAgent (Aqua session) -----------------------------------
#
# The Safari extension's XPC service can't read the user's login keychain
# because it runs in a non-Aqua security session. The Claude CLI's OAuth
# token lives in the keychain, so any spawn from the XPC service reports
# "Not logged in". Fix: run host.js inside a LaunchAgent that's pinned to
# the Aqua session, exposing it on a Unix socket. The XPC service
# becomes a thin transport adapter.

echo ""
echo "Installing LaunchAgent (Aqua session)..."

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
AGENT_LABEL="com.altonfong.aisummary.host"
AGENT_PLIST="$LAUNCH_AGENTS_DIR/$AGENT_LABEL.plist"
AGENT_SERVER_JS="$NATIVE_HOST_DIR/agent-server.js"
AGENT_TEMPLATE="$NATIVE_HOST_DIR/$AGENT_LABEL.plist.template"

if [ ! -f "$AGENT_TEMPLATE" ]; then
    echo -e "${RED}Error:${NC} Missing template at $AGENT_TEMPLATE"
    exit 1
fi
if [ ! -f "$AGENT_SERVER_JS" ]; then
    echo -e "${RED}Error:${NC} Missing agent-server.js at $AGENT_SERVER_JS"
    exit 1
fi

mkdir -p "$LAUNCH_AGENTS_DIR"

# Use the user's actual login PATH so the agent's child host.js (and the
# claude CLI it spawns) can find /usr/local/bin, ~/.local/bin, etc.
LOGIN_PATH="${PATH}"

# sed substitute placeholders in template; '|' as delimiter to avoid path collisions.
sed -e "s|__NODE_PATH__|$NODE_PATH|g" \
    -e "s|__AGENT_SERVER_JS__|$AGENT_SERVER_JS|g" \
    -e "s|__PATH__|$LOGIN_PATH|g" \
    -e "s|__HOME__|$HOME|g" \
    "$AGENT_TEMPLATE" > "$AGENT_PLIST"

# Reload the agent so the new agent-server.js / plist takes effect.
# bootout is asynchronous, so a naïve bootout+bootstrap can race and the
# bootstrap rejects with "Input/output error". Pattern below: bootout, wait
# for the service to actually go away, then bootstrap. If it's not loaded
# yet, bootstrap straight away.
UID_NUM=$(id -u)
DOMAIN="gui/$UID_NUM"

# Best-effort unload; ignore errors (it might not be loaded).
launchctl bootout "$DOMAIN/$AGENT_LABEL" 2>/dev/null || true

# Wait up to ~2.5s for it to fully leave the domain. `launchctl print` exits
# non-zero when the service is gone.
for i in 1 2 3 4 5 6 7 8 9 10; do
    if ! launchctl print "$DOMAIN/$AGENT_LABEL" >/dev/null 2>&1; then
        break
    fi
    sleep 0.25
done

if launchctl bootstrap "$DOMAIN" "$AGENT_PLIST" 2>/tmp/aisummary-bootstrap.log; then
    echo -e "${GREEN}✓${NC} LaunchAgent loaded: $AGENT_LABEL"
elif launchctl print "$DOMAIN/$AGENT_LABEL" >/dev/null 2>&1; then
    # Already loaded somehow — kickstart it so it picks up the new plist's
    # ProgramArguments / env vars.
    launchctl kickstart -k "$DOMAIN/$AGENT_LABEL" 2>/dev/null || true
    echo -e "${GREEN}✓${NC} LaunchAgent kickstarted: $AGENT_LABEL"
else
    echo -e "${RED}launchctl bootstrap failed.${NC} See /tmp/aisummary-bootstrap.log"
    cat /tmp/aisummary-bootstrap.log
    exit 1
fi

# Wait briefly for the agent to bind the socket
for i in 1 2 3 4 5; do
    if [ -S "$SOCKET_PATH" ]; then
        echo -e "${GREEN}✓${NC} Agent socket: $SOCKET_PATH"
        break
    fi
    sleep 0.4
done
if [ ! -S "$SOCKET_PATH" ]; then
    echo -e "${YELLOW}⚠  Agent did not bind socket within 2s. Check /tmp/aisummary-agent.log${NC}"
fi

# --- Done ------------------------------------------------------------------

echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "  ${GREEN}Installation Complete!${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""
echo "Next steps:"
echo ""
echo "  1. Open ${BLUE}/Applications/AI Summary.app${NC} once (it's the wrapper —"
echo "     it just registers the extension with Safari)."
echo ""
echo "  2. In Safari: ${BLUE}Settings → Extensions${NC}, enable 'AI Summary Extension'."
echo ""
echo "  3. Safari may also ask you to allow it on every site. Click 'Always Allow'."
echo ""
echo "  4. To debug: ${BLUE}Develop → Web Extension Background Pages${NC} and"
echo "     ${BLUE}log stream --predicate 'subsystem == \"com.altonfong.aisummary\"'${NC}"
echo "     for the Swift bridge log."
echo ""
echo -e "  ${YELLOW}Note:${NC} Safari is unsigned (ad-hoc). If macOS Gatekeeper blocks"
echo -e "  it, right-click the app and choose 'Open' the first time."
echo ""

# Open the app so the extension registers with Safari
open "$INSTALL_DEST" || true
