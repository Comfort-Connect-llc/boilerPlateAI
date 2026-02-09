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
  echo -e "${YELLOW}Usage: pnpm run git:merge-staging <PR-number>${NC}"
  echo ""
  echo "Merges a PR to staging using merge commit (preserves history)."
  echo ""
  echo "Example:"
  echo "  pnpm run git:merge-staging 42"
  echo ""
  exit 1
fi

PR_NUMBER="$1"

# Verify PR exists and targets staging
PR_INFO=$(gh pr view "$PR_NUMBER" --json baseRefName,state,title 2>/dev/null || echo "")

if [ -z "$PR_INFO" ]; then
  echo -e "${RED}ERROR: PR #${PR_NUMBER} not found${NC}"
  exit 1
fi

BASE_BRANCH=$(echo "$PR_INFO" | sed -n 's/.*"baseRefName":"\([^"]*\)".*/\1/p')
PR_STATE=$(echo "$PR_INFO" | sed -n 's/.*"state":"\([^"]*\)".*/\1/p')
PR_TITLE=$(echo "$PR_INFO" | sed -n 's/.*"title":"\([^"]*\)".*/\1/p')

if [ "$BASE_BRANCH" != "staging" ]; then
  echo -e "${RED}ERROR: PR #${PR_NUMBER} targets '${BASE_BRANCH}', not 'staging'${NC}"
  echo ""
  echo "Use this command only for PRs targeting staging."
  echo "For PRs to main, use: pnpm run git:merge-main ${PR_NUMBER}"
  exit 1
fi

if [ "$PR_STATE" != "OPEN" ]; then
  echo -e "${RED}ERROR: PR #${PR_NUMBER} is ${PR_STATE}, not OPEN${NC}"
  exit 1
fi

echo -e "${BLUE}Merging PR to staging${NC}"
echo ""
echo -e "PR:     ${YELLOW}#${PR_NUMBER}${NC} - ${PR_TITLE}"
echo -e "Method: ${YELLOW}merge commit${NC} (preserves history for UAT iterations)"
echo ""

# Merge with merge commit
if gh pr merge "$PR_NUMBER" --merge; then
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  PR #${PR_NUMBER} merged to staging!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo -e "${YELLOW}Next steps:${NC}"
  echo "  1. Test in staging environment"
  echo "  2. When ready, ship to main:"
  echo "     pnpm run git:ship <major|minor|patch>"
  echo ""
else
  echo ""
  echo -e "${RED}Merge failed${NC}"
  echo ""
  echo "Check if:"
  echo "  - All status checks have passed"
  echo "  - Required approvals are present"
  echo "  - There are no merge conflicts"
  exit 1
fi
