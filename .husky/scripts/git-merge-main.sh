#!/usr/bin/env bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check gh CLI is available
if ! command -v gh &> /dev/null; then
  echo -e "${RED}ERROR: GitHub CLI (gh) is not installed${NC}"
  echo ""
  echo "Install it from: https://cli.github.com/"
  exit 1
fi

# Require PR number argument
if [ -z "$1" ]; then
  echo -e "${YELLOW}Usage: pnpm run git:merge-main <PR-number>${NC}"
  echo ""
  echo "Merges a PR to main using squash merge (clean history)."
  echo ""
  echo "Example:"
  echo "  pnpm run git:merge-main 42"
  echo ""
  exit 1
fi

PR_NUMBER="$1"

# Verify PR exists and targets main
PR_INFO=$(gh pr view "$PR_NUMBER" --json baseRefName,state,title,headRefName 2>/dev/null || echo "")

if [ -z "$PR_INFO" ]; then
  echo -e "${RED}ERROR: PR #${PR_NUMBER} not found${NC}"
  exit 1
fi

BASE_BRANCH=$(echo "$PR_INFO" | sed -n 's/.*"baseRefName":"\([^"]*\)".*/\1/p')
HEAD_BRANCH=$(echo "$PR_INFO" | sed -n 's/.*"headRefName":"\([^"]*\)".*/\1/p')
PR_STATE=$(echo "$PR_INFO" | sed -n 's/.*"state":"\([^"]*\)".*/\1/p')
PR_TITLE=$(echo "$PR_INFO" | sed -n 's/.*"title":"\([^"]*\)".*/\1/p')

if [ "$BASE_BRANCH" != "main" ]; then
  echo -e "${RED}ERROR: PR #${PR_NUMBER} targets '${BASE_BRANCH}', not 'main'${NC}"
  echo ""
  echo "Use this command only for PRs targeting main."
  echo "For PRs to staging, use: pnpm run git:merge-staging ${PR_NUMBER}"
  exit 1
fi

if [ "$PR_STATE" != "OPEN" ]; then
  echo -e "${RED}ERROR: PR #${PR_NUMBER} is ${PR_STATE}, not OPEN${NC}"
  exit 1
fi

# Verify it's from a release or hotfix branch
if [[ ! "$HEAD_BRANCH" == release/* ]] && [[ ! "$HEAD_BRANCH" == hotfix/* ]]; then
  echo -e "${YELLOW}WARNING: PR is from '${HEAD_BRANCH}'${NC}"
  echo ""
  echo "Only release/* and hotfix/* branches should merge to main."
  echo ""
  read -p "Continue anyway? (y/N): " CONTINUE
  if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo -e "${BLUE}Merging PR to main${NC}"
echo ""
echo -e "PR:     ${YELLOW}#${PR_NUMBER}${NC} - ${PR_TITLE}"
echo -e "From:   ${YELLOW}${HEAD_BRANCH}${NC}"
echo -e "Method: ${YELLOW}squash merge${NC} (clean production history)"
echo ""

# Merge with squash
if gh pr merge "$PR_NUMBER" --squash --delete-branch; then
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  PR #${PR_NUMBER} merged to main!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo -e "${YELLOW}What happens next:${NC}"
  echo "  - Tag will be auto-created by GitHub Actions"
  echo "  - Release branch has been deleted"
  echo "  - Staging will be auto-synced from main"
  echo ""
  echo -e "${YELLOW}IMPORTANT: Do NOT manually sync staging!${NC}"
  echo "  - Staging will auto-sync from main in 2-3 minutes"
  echo "  - The sync-staging workflow handles this automatically"
  echo ""
else
  echo ""
  echo -e "${RED}Merge failed${NC}"
  echo ""
  echo "Check if:"
  echo "  - All status checks have passed"
  echo "  - Required approvals are present"
  echo "  - PR title starts with [major], [minor], or [patch]"
  echo "  - There are no merge conflicts"
  exit 1
fi
