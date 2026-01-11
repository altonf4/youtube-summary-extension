#!/bin/bash

# Native Host Wrapper Script
# Finds Node.js regardless of installation method and runs host.js
# This solves the issue where Chrome doesn't inherit shell PATH settings

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_SCRIPT="$SCRIPT_DIR/host.js"

# Function to find Node.js
find_node() {
    # 1. Check if node is directly in PATH (works for standard installs)
    if command -v node &> /dev/null; then
        echo "$(command -v node)"
        return 0
    fi

    # 2. Common installation locations
    local NODE_LOCATIONS=(
        # Homebrew (Apple Silicon)
        "/opt/homebrew/bin/node"
        # Homebrew (Intel)
        "/usr/local/bin/node"
        # System
        "/usr/bin/node"
    )

    for loc in "${NODE_LOCATIONS[@]}"; do
        if [ -x "$loc" ]; then
            echo "$loc"
            return 0
        fi
    done

    # 3. nvm - check default and current versions
    if [ -d "$HOME/.nvm/versions/node" ]; then
        # Try to find the default version first
        if [ -f "$HOME/.nvm/alias/default" ]; then
            local DEFAULT_VERSION=$(cat "$HOME/.nvm/alias/default")
            if [ -x "$HOME/.nvm/versions/node/$DEFAULT_VERSION/bin/node" ]; then
                echo "$HOME/.nvm/versions/node/$DEFAULT_VERSION/bin/node"
                return 0
            fi
        fi
        # Fall back to the latest installed version
        local LATEST=$(ls -v "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)
        if [ -n "$LATEST" ] && [ -x "$HOME/.nvm/versions/node/$LATEST/bin/node" ]; then
            echo "$HOME/.nvm/versions/node/$LATEST/bin/node"
            return 0
        fi
    fi

    # 4. fnm
    if [ -d "$HOME/.fnm/node-versions" ]; then
        local LATEST=$(ls -v "$HOME/.fnm/node-versions" 2>/dev/null | tail -1)
        if [ -n "$LATEST" ] && [ -x "$HOME/.fnm/node-versions/$LATEST/installation/bin/node" ]; then
            echo "$HOME/.fnm/node-versions/$LATEST/installation/bin/node"
            return 0
        fi
    fi

    # Also check Library location for fnm
    if [ -d "$HOME/Library/Application Support/fnm/node-versions" ]; then
        local LATEST=$(ls -v "$HOME/Library/Application Support/fnm/node-versions" 2>/dev/null | tail -1)
        if [ -n "$LATEST" ] && [ -x "$HOME/Library/Application Support/fnm/node-versions/$LATEST/installation/bin/node" ]; then
            echo "$HOME/Library/Application Support/fnm/node-versions/$LATEST/installation/bin/node"
            return 0
        fi
    fi

    # 5. volta
    if [ -x "$HOME/.volta/bin/node" ]; then
        echo "$HOME/.volta/bin/node"
        return 0
    fi

    # 6. asdf
    if [ -d "$HOME/.asdf/installs/nodejs" ]; then
        local LATEST=$(ls -v "$HOME/.asdf/installs/nodejs" 2>/dev/null | tail -1)
        if [ -n "$LATEST" ] && [ -x "$HOME/.asdf/installs/nodejs/$LATEST/bin/node" ]; then
            echo "$HOME/.asdf/installs/nodejs/$LATEST/bin/node"
            return 0
        fi
    fi

    # 7. mise (formerly rtx)
    if [ -d "$HOME/.local/share/mise/installs/node" ]; then
        local LATEST=$(ls -v "$HOME/.local/share/mise/installs/node" 2>/dev/null | tail -1)
        if [ -n "$LATEST" ] && [ -x "$HOME/.local/share/mise/installs/node/$LATEST/bin/node" ]; then
            echo "$HOME/.local/share/mise/installs/node/$LATEST/bin/node"
            return 0
        fi
    fi

    # Not found
    return 1
}

# Find Node.js
NODE_PATH=$(find_node)

if [ -z "$NODE_PATH" ]; then
    # Log error for debugging
    echo "Error: Node.js not found. Checked: PATH, /opt/homebrew, /usr/local, nvm, fnm, volta, asdf, mise" >&2
    exit 1
fi

# Get the directory containing Node.js and add it to PATH
# This ensures child processes (like claude CLI) can also find node
NODE_DIR=$(dirname "$NODE_PATH")
export PATH="$NODE_DIR:$HOME/.claude/local:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

# Run the host script with the found Node.js
exec "$NODE_PATH" "$HOST_SCRIPT"
