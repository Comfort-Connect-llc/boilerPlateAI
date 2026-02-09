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

# Verify we're on a release or hotfix branch
if [[ ! "$CURRENT_BRANCH" == release/* ]] && [[ ! "$CURRENT_BRANCH" == hotfix/* ]]; then
  echo -e "${RED}ERROR: This command should only be run from a release/* or hotfix/* branch${NC}"
  echo ""
  echo "Current branch: $CURRENT_BRANCH"
  echo ""
  exit 1
fi

echo -e "${BLUE}Preparing PR to staging${NC}"
echo ""
echo -e "Source branch: ${YELLOW}${CURRENT_BRANCH}${NC}"
echo -e "Target branch: ${YELLOW}staging${NC}"
echo ""

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo -e "${RED}ERROR: You have uncommitted changes${NC}"
  echo ""
  echo "Please commit your changes first."
  exit 1
fi

# Push branch to origin
echo -e "${GREEN}Pushing branch to origin...${NC}"
git push -u origin "$CURRENT_BRANCH"

echo ""

# Extract task ID from branch name (e.g., release/CU-abc123-description -> CU-abc123)
TICKET_ID=$(echo "$CURRENT_BRANCH" | sed -n 's|.*/\(CU-[a-z0-9]*\)-.*|\1|p')

# Extract description from branch name and convert to readable format
BRANCH_DESC=$(echo "$CURRENT_BRANCH" | sed -n 's|.*/CU-[a-z0-9]*-\(.*\)|\1|p')
DESCRIPTION=$(echo "$BRANCH_DESC" | tr '-' ' ')

# Build PR title
if [ -n "$TICKET_ID" ] && [ -n "$DESCRIPTION" ]; then
  PR_TITLE="chore(${TICKET_ID}): ${DESCRIPTION} to staging"
else
  # Fallback if extraction fails
  PR_TITLE="chore: ${CURRENT_BRANCH} to staging"
fi

# Check if gh CLI is available
if command -v gh &> /dev/null; then
  echo -e "${GREEN}Creating PR to staging...${NC}"

  # Check if PR already exists
  EXISTING_PR=$(gh pr list --head "$CURRENT_BRANCH" --base staging --json url -q '.[0].url' 2>/dev/null)

  if [ -n "$EXISTING_PR" ]; then
    echo -e "${YELLOW}PR already exists for this branch${NC}"
    PR_URL="$EXISTING_PR"
  else
    # Create new PR
    if gh pr create --base staging --title "$PR_TITLE" --body "Merge ${CURRENT_BRANCH} to staging for UAT testing." >/dev/null 2>&1; then
      PR_URL=$(gh pr view --json url -q '.url' 2>/dev/null)
    else
      echo -e "${RED}Failed to create PR${NC}"
      exit 1
    fi
  fi

  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  PR created to staging!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo -e "PR URL: ${BLUE}${PR_URL}${NC}"
  echo ""
  echo -e "${YELLOW}Next steps:${NC}"
  echo "  1. Get PR reviewed and merged"
  echo "  2. Perform UAT testing on staging"
  echo "  3. When approved, ship to main:"
  echo "     pnpm run git:ship <major|minor|patch>"
  echo ""
else
  echo -e "${YELLOW}gh CLI not found - showing manual instructions${NC}"
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  Branch pushed! Now create a PR${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo -e "${YELLOW}Create PR to staging:${NC}"
  echo ""
  echo "  gh pr create --base staging --title \"${PR_TITLE}\""
  echo ""
  echo -e "${YELLOW}Or via GitHub UI:${NC}"
  echo "  https://github.com/malhar212/git-strategy-demo/compare/staging...${CURRENT_BRANCH}"
  echo ""
  echo -e "${YELLOW}After PR is merged:${NC}"
  echo "  1. Perform UAT testing on staging"
  echo "  2. When approved, ship to main:"
  echo "     pnpm run git:ship <major|minor|patch>"
  echo ""
fi
