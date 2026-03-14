#!/usr/bin/env bash
# Push docs/ wiki-ready pages to the GitHub Wiki.
# One-time: On the repo's GitHub page, open Wiki -> "Create the first page", save a placeholder (e.g. "Home").
# Then run: ./scripts/push-wiki.sh   (or npm run push-wiki)
set -e

REPO_ROOT="${1:-.}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
cd "$REPO_ROOT"
WIKI_DIR="${REPO_ROOT}/.wiki-tmp"

# Wiki repo URL (use HTTPS with token or SSH if you prefer)
WIKI_URL="https://github.com/okkie2/AutoTranscribe2.wiki.git"

echo "Cloning wiki..."
rm -rf "$WIKI_DIR"
git clone "$WIKI_URL" "$WIKI_DIR"
cd "$WIKI_DIR"

echo "Copying wiki pages from docs/..."
cp "$REPO_ROOT/docs/Home.md" Home.md
cp "$REPO_ROOT/docs/Installation.md" Installation.md
cp "$REPO_ROOT/docs/Configuration.md" Configuration.md
cp "$REPO_ROOT/docs/Usage.md" Usage.md
cp "$REPO_ROOT/docs/Architecture.md" Architecture.md
cp "$REPO_ROOT/docs/Development.md" Development.md

git add *.md
if git diff --staged --quiet; then
  echo "No changes to push."
  exit 0
fi

git commit -m "Sync wiki from docs/ (Home, Installation, Configuration, Usage, Architecture, Development)"
git push origin master

echo "Wiki updated. See https://github.com/okkie2/AutoTranscribe2/wiki"
rm -rf "$WIKI_DIR"
