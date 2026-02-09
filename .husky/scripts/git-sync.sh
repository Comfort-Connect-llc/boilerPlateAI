#!/usr/bin/env bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get current branch
CURRENT_BRANCH=$(git symbolic-ref --short HEAD)

# Verify we're on a feature branch
if [[ ! "$CURRENT_BRANCH" == feature/* ]]; then
  echo -e "${RED}ERROR: This command should only be run from a feature branch${NC}"
  echo ""
  echo "Current branch: $CURRENT_BRANCH"
  echo ""
  echo "Expected: feature/*"
  exit 1
fi

echo -e "${BLUE}Syncing feature branch with main${NC}"
echo ""
echo -e "Current branch: ${YELLOW}${CURRENT_BRANCH}${NC}"
echo ""

# Fetch latest
echo -e "${GREEN}Fetching latest from origin...${NC}"
git fetch origin

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo -e "${RED}ERROR: You have uncommitted changes${NC}"
  echo ""
  echo "Please commit or stash your changes before syncing."
  exit 1
fi

# Merge main with --no-ff to preserve history
echo -e "${GREEN}Merging main into feature branch (--no-ff)...${NC}"
if git merge origin/main --no-ff -m "chore: sync with main"; then
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  Sync complete!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo -e "Your feature branch is now up to date with main."
  echo ""
else
  echo ""
  echo -e "${RED}========================================${NC}"
  echo -e "${RED}  Merge conflicts detected!${NC}"
  echo -e "${RED}========================================${NC}"
  echo ""
  echo -e "${YELLOW}Please resolve the conflicts and then:${NC}"
  echo "  1. git add <resolved-files>"
  echo "  2. git commit"
  echo ""
  exit 1
fi
