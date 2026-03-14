#!/usr/bin/env bash
# Copy .githooks/* to .git/hooks/ so Git runs them.
# Run from repo root: npm run install-hooks  or  bash scripts/install-hooks.sh
set -e

REPO_ROOT="${1:-.}"
GIT_DIR="$REPO_ROOT/.git"
HOOKS_SRC="$REPO_ROOT/.githooks"

if [[ ! -d "$GIT_DIR" ]]; then
  echo "Not a git repository. Run from the repo root."
  exit 1
fi

if [[ ! -d "$HOOKS_SRC" ]]; then
  echo "No .githooks directory found."
  exit 1
fi

for f in "$HOOKS_SRC"/*; do
  [[ -f "$f" ]] || continue
  name=$(basename "$f")
  dest="$GIT_DIR/hooks/$name"
  cp "$f" "$dest"
  chmod +x "$dest"
  echo "Installed hook: $name"
done

echo "Hooks installed. Pre-push will run 'npm run build' and 'npm test' before each push."
