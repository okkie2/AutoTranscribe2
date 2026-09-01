#!/bin/bash

# <xbar.title>AutoTranscribe2</xbar.title>
# <xbar.version>v1.0</xbar.version>
# <xbar.author>AutoTranscribe2</xbar.author>
# <xbar.desc>Shows AutoTranscribe2 runtime state and controls.</xbar.desc>
# <xbar.dependencies>node</xbar.dependencies>

set -uo pipefail

GUI_CONFIG_DIR="${AUTOTRANSCRIBE_GUI_CONFIG_DIR:-$HOME/Library/Application Support/AutoTranscribe2}"
ROOT_PATH_FILE="$GUI_CONFIG_DIR/gui-root-path"
NODE_PATH_FILE="$GUI_CONFIG_DIR/gui-node-path"
ACTION_LOG="$HOME/Library/Logs/AutoTranscribe2/menu-bar-actions.log"

render_unavailable() {
  echo "AT stale | color=orange"
  echo "---"
  echo "Status unavailable: $1"
  echo "Refresh | refresh=true"
}

if [[ ! -r "$ROOT_PATH_FILE" ]]; then
  render_unavailable "Run npm run gui:install from the AutoTranscribe2 repository."
  exit 0
fi

REPO_ROOT="$(<"$ROOT_PATH_FILE")"
if [[ ! -r "$NODE_PATH_FILE" ]]; then
  render_unavailable "Node.js path is unavailable. Run npm run gui:install again."
  exit 0
fi

NODE_BINARY="$(<"$NODE_PATH_FILE")"
if [[ ! -d "$REPO_ROOT" ]]; then
  render_unavailable "Configured AutoTranscribe2 repository is unavailable. Run npm run gui:install again."
  exit 0
fi

if ! cd "$REPO_ROOT"; then
  render_unavailable "Could not open the configured AutoTranscribe2 repository."
  exit 0
fi

if [[ ! -f "$REPO_ROOT/dist/cli/statusJson.js" || ! -f "$REPO_ROOT/dist/cli/swiftBar.js" ]]; then
  render_unavailable "Compiled GUI commands are unavailable. Run npm run gui:install again."
  exit 0
fi

if [[ ! -x "$NODE_BINARY" ]]; then
  render_unavailable "Configured Node.js executable is unavailable. Run npm run gui:install again."
  exit 0
fi

run_action() {
  local action="$1"
  mkdir -p "$(dirname "$ACTION_LOG")"

  case "$action" in
    start)
      "$NODE_BINARY" "$REPO_ROOT/dist/cli/startAll.js" >>"$ACTION_LOG" 2>&1
      ;;
    stop)
      "$NODE_BINARY" "$REPO_ROOT/dist/cli/stopAll.js" >>"$ACTION_LOG" 2>&1
      ;;
    restart)
      "$NODE_BINARY" "$REPO_ROOT/dist/cli/restartAll.js" >>"$ACTION_LOG" 2>&1
      ;;
    open-transcripts)
      local transcript
      transcript="$("$NODE_BINARY" "$REPO_ROOT/dist/cli/statusJson.js" | "$NODE_BINARY" -e 'let data=""; process.stdin.on("data", (chunk) => { data += chunk; }); process.stdin.on("end", () => { try { const value = JSON.parse(data).latestTranscript; process.stdout.write(value ?? ""); } catch { process.exit(1); } });')"
      if [[ -n "$transcript" ]]; then
        open "$(dirname "$transcript")" >>"$ACTION_LOG" 2>&1
      fi
      ;;
    *)
      echo "Unknown menu-bar action: $action" >>"$ACTION_LOG"
      return 1
      ;;
  esac
}

if [[ "${1:-}" == "action" ]]; then
  run_action "${2:-}"
  exit $?
fi

if ! "$NODE_BINARY" "$REPO_ROOT/dist/cli/statusJson.js" | "$NODE_BINARY" "$REPO_ROOT/dist/cli/swiftBar.js" "$0"; then
  render_unavailable "The status command failed. See $ACTION_LOG."
fi
