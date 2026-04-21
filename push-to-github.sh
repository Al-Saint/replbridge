#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ReplBridge — push to GitHub
#
# Usage:
#   chmod +x push-to-github.sh
#   ./push-to-github.sh YOUR_GITHUB_USERNAME
#
# What this does:
#   1. Adds the GitHub remote (public repo named "replbridge")
#   2. Pushes the main branch
#
# Prerequisites:
#   - Create an empty repo on github.com named "replbridge" (no README, no license)
#   - Have git configured with your credentials (or SSH key)
# ─────────────────────────────────────────────────────────────────────────────

set -e

USERNAME=${1:-""}

if [ -z "$USERNAME" ]; then
  echo ""
  echo "Usage: ./push-to-github.sh YOUR_GITHUB_USERNAME"
  echo ""
  echo "Example: ./push-to-github.sh alexsantos"
  echo ""
  exit 1
fi

REMOTE="https://github.com/${USERNAME}/replbridge.git"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ReplBridge — pushing to GitHub"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  Remote: ${REMOTE}"
echo ""

# Add remote (or update if it already exists)
if git remote get-url origin &>/dev/null; then
  git remote set-url origin "$REMOTE"
  echo "  ✓ Updated remote origin"
else
  git remote add origin "$REMOTE"
  echo "  ✓ Added remote origin"
fi

# Push
echo "  Pushing main branch..."
git push -u origin main

echo ""
echo "  ✓ Done! Your repo is live at:"
echo "  https://github.com/${USERNAME}/replbridge"
echo ""
echo "  Next step: run ./setup-local.sh to install dependencies"
echo ""
