#!/bin/bash

set -euo pipefail

PLUGIN_DIR="${SWIFTBAR_PLUGIN_DIR:-$HOME/Library/Application Support/SwiftBar/Plugins}"
PLUGIN_PATH="$PLUGIN_DIR/autotranscribe.5s.sh"
GUI_CONFIG_DIR="${AUTOTRANSCRIBE_GUI_CONFIG_DIR:-$HOME/Library/Application Support/AutoTranscribe2}"
ROOT_PATH_FILE="$GUI_CONFIG_DIR/gui-root-path"
NODE_PATH_FILE="$GUI_CONFIG_DIR/gui-node-path"

if [[ -e "$PLUGIN_PATH" && ! -f "$PLUGIN_PATH" && ! -L "$PLUGIN_PATH" ]]; then
  echo "Refusing to remove non-file SwiftBar plugin target: $PLUGIN_PATH" >&2
  exit 1
fi

rm -f "$PLUGIN_PATH"
rm -f "$ROOT_PATH_FILE"
rm -f "$NODE_PATH_FILE"
rmdir "$GUI_CONFIG_DIR" 2>/dev/null || true

echo "Removed the AutoTranscribe2 menu-bar plugin. AutoTranscribe2 runtime data was not changed."
