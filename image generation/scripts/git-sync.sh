#!/usr/bin/env bash
# git-sync.sh — stage, commit, and push changes inside the "image generation" folder.
#
# Usage:
#   ./scripts/git-sync.sh "your commit message"
#
# Run from anywhere — the script resolves the folder it lives in. It stages only
# files under the "image generation" folder, so sibling folders in the repo are
# never touched. Heavy/secret files are kept out by .gitignore.
set -euo pipefail

MSG="${1:-Update image generation}"

# The "image generation" folder = the parent of this scripts/ directory.
FOLDER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$FOLDER_DIR"

git add .

if git diff --cached --quiet; then
  echo "Nothing to commit — working tree clean."
  exit 0
fi

echo "Staged changes:"
git diff --cached --stat

git commit -m "$MSG"
git push
echo "✓ Pushed: $MSG"
