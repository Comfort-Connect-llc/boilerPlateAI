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

# Must be on a release branch
if [[ ! "$CURRENT_BRANCH" == release/* ]]; then
  echo -e "${RED}ERROR: This command should only be run from a release/* branch${NC}"
  echo ""
  echo "Current branch: $CURRENT_BRANCH"
  echo ""
  exit 1
fi

# Derive the matching feature branch: release/CU-xxx-desc -> feature/CU-xxx-desc
FEATURE_SUFFIX=$(echo "$CURRENT_BRANCH" | sed 's|^release/||')
FEATURE_BRANCH="feature/${FEATURE_SUFFIX}"

# Verify the feature branch exists
if ! git rev-parse --verify "$FEATURE_BRANCH" >/dev/null 2>&1; then
  echo -e "${RED}ERROR: Feature branch '${FEATURE_BRANCH}' not found${NC}"
  echo ""
  echo "Expected a matching feature branch for: $CURRENT_BRANCH"
  exit 1
fi

echo -e "${BLUE}Syncing release branch with feature${NC}"
echo ""
echo -e "Release branch: ${YELLOW}${CURRENT_BRANCH}${NC}"
echo -e "Feature branch: ${YELLOW}${FEATURE_BRANCH}${NC}"
echo ""

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo -e "${RED}ERROR: You have uncommitted changes${NC}"
  echo ""
  echo "Please commit or stash your changes before syncing."
  exit 1
fi

# Fetch latest
echo -e "${GREEN}Fetching latest from origin...${NC}"
git fetch origin

# Merge feature into release with --no-ff
echo -e "${GREEN}Merging feature branch into release (--no-ff)...${NC}"
if git merge "$FEATURE_BRANCH" --no-ff -m "chore: sync release with ${FEATURE_BRANCH}"; then
  echo ""
  echo -e "${GREEN}Pushing to origin...${NC}"
  git push origin "$CURRENT_BRANCH"
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  Release synced and pushed!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo -e "${YELLOW}Next steps:${NC}"
  echo "  If there's an open PR to staging, it will auto-update."
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
