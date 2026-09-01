#!/bin/bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLUGIN_DIR="${SWIFTBAR_PLUGIN_DIR:-$HOME/Library/Application Support/SwiftBar/Plugins}"
PLUGIN_PATH="$PLUGIN_DIR/autotranscribe.5s.sh"
GUI_CONFIG_DIR="${AUTOTRANSCRIBE_GUI_CONFIG_DIR:-$HOME/Library/Application Support/AutoTranscribe2}"

if [[ ! -d "/Applications/SwiftBar.app" ]]; then
  echo "SwiftBar is not installed in /Applications. Install SwiftBar, then run npm run gui:install again." >&2
  exit 1
fi

if [[ -e "$PLUGIN_PATH" && ! -f "$PLUGIN_PATH" && ! -L "$PLUGIN_PATH" ]]; then
  echo "Refusing to replace non-file SwiftBar plugin target: $PLUGIN_PATH" >&2
  exit 1
fi

mkdir -p "$PLUGIN_DIR" "$GUI_CONFIG_DIR"
cp "$REPO_ROOT/scripts/gui/autotranscribe.5s.sh" "$PLUGIN_PATH"
chmod +x "$PLUGIN_PATH"
printf '%s\n' "$REPO_ROOT" > "$GUI_CONFIG_DIR/gui-root-path"

echo "Installed AutoTranscribe2 menu-bar plugin at: $PLUGIN_PATH"
echo "SwiftBar will refresh it every five seconds."
