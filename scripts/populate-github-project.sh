#!/usr/bin/env bash
# Create a GitHub Project and add issues #1–#10, OR add those issues to an existing project.
# Requires: gh auth with project scope. Run once:  gh auth refresh -s project
# New issues (#8–#10) are created by the sync-issues workflow when docs/issues/*.md are pushed.
#
# Usage:
#   npm run populate-project              # create new project, link to repo, add all issues
#   npm run populate-project -- 2         # add issues #1–#10 to existing project number 2
#
# If your project is empty: get its number from the URL (e.g. .../projects/2 → use 2), then:
#   npm run populate-project -- 2
set -e

OWNER="okkie2"
REPO="AutoTranscribe2"
PROJECT_TITLE="AutoTranscribe2 Roadmap"
ISSUES="1 2 3 4 5 6 7 8 9 10"

EXISTING_PROJECT="$1"

if [[ -n "$EXISTING_PROJECT" ]]; then
  PROJECT_NUM="$EXISTING_PROJECT"
  echo "Adding issues to existing project #$PROJECT_NUM..."
else
  echo "Creating project: $PROJECT_TITLE"
  CREATE=$(gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json)
  PROJECT_NUM=$(echo "$CREATE" | jq -r '.number')
  echo "Created project number: $PROJECT_NUM"

  echo "Linking project to repo $OWNER/$REPO..."
  gh project link "$PROJECT_NUM" --owner "$OWNER" --repo "$OWNER/$REPO"

  echo "Adding issues to project..."
fi

for i in $ISSUES; do
  echo "  Adding issue #$i"
  gh project item-add "$PROJECT_NUM" --owner "$OWNER" --url "https://github.com/$OWNER/$REPO/issues/$i"
done

echo "Done. View project: gh project view $PROJECT_NUM --owner $OWNER --web"
echo "Or: repo -> Projects tab -> open the project."
