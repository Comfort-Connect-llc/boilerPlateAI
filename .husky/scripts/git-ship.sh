#!/usr/bin/env bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
BUMP_TYPE=""
CUSTOM_DESC=""
OVERRIDE=false

for arg in "$@"; do
  case "$arg" in
    --override|-o)
      OVERRIDE=true
      ;;
    major|minor|patch)
      BUMP_TYPE="$arg"
      ;;
    *)
      # Anything else is treated as custom description
      if [ -z "$CUSTOM_DESC" ]; then
        CUSTOM_DESC="$arg"
      fi
      ;;
  esac
done

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

# Require a bump type argument
if [ -z "$BUMP_TYPE" ]; then
  echo -e "${YELLOW}Usage: pnpm run git:ship <major|minor|patch> [\"description\"] [--override|-o]${NC}"
  echo ""
  echo "Examples:"
  echo "  pnpm run git:ship minor"
  echo "  pnpm run git:ship patch \"custom PR description\""
  echo "  pnpm run git:ship major --override"
  echo ""
  echo "Options:"
  echo "  --override, -o  Skip open staging PR check"
  echo ""
  exit 1
fi

echo -e "${BLUE}Preparing PR to main${NC}"
echo ""
echo -e "Source branch: ${YELLOW}${CURRENT_BRANCH}${NC}"
echo -e "Bump type:     ${YELLOW}[${BUMP_TYPE}]${NC}"
echo ""

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo -e "${RED}ERROR: You have uncommitted changes${NC}"
  echo ""
  echo "Please commit your changes first."
  exit 1
fi

# For release branches, verify staging PR status (if gh is available)
if [[ "$CURRENT_BRANCH" == release/* ]] && command -v gh &> /dev/null; then
  # Check for open staging PRs first
  OPEN_STAGING_PR=$(gh pr list --head "$CURRENT_BRANCH" --base staging --state open --json number,url -q '.[0]' 2>/dev/null)

  if [ -n "$OPEN_STAGING_PR" ] && [ "$OPEN_STAGING_PR" != "null" ]; then
    OPEN_PR_NUM=$(echo "$OPEN_STAGING_PR" | sed -n 's/.*"number":\([0-9]*\).*/\1/p')
    OPEN_PR_URL=$(echo "$OPEN_STAGING_PR" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')

    if [ "$OVERRIDE" = true ]; then
      echo -e "${YELLOW}WARNING: Overriding open staging PR #${OPEN_PR_NUM}${NC}"
      echo ""
    else
      echo -e "${RED}ERROR: Open PR #${OPEN_PR_NUM} to staging exists${NC}"
      echo ""
      echo "  URL: ${OPEN_PR_URL}"
      echo ""
      echo "Please merge or close the staging PR before shipping to main."
      echo ""
      echo "To override, use: pnpm run git:ship ${BUMP_TYPE} --override"
      exit 1
    fi
  fi

  # Check for merged staging PR
  STAGING_PR_MERGED=$(gh pr list --head "$CURRENT_BRANCH" --base staging --state merged --json number -q '.[0].number' 2>/dev/null)

  if [ -z "$STAGING_PR_MERGED" ]; then
    echo -e "${YELLOW}WARNING: No merged PR to staging found for this branch${NC}"
    echo ""
    echo "The workflow expects: release → staging (PR) → main (PR)"
    echo ""
    read -p "Skip staging and PR directly to main? (y/N): " SKIP_STAGING
    if [[ ! "$SKIP_STAGING" =~ ^[Yy]$ ]]; then
      echo ""
      echo "Run 'pnpm run git:to-staging' first, then merge the PR."
      exit 1
    fi
    echo ""
  else
    echo -e "${GREEN}Staging PR #${STAGING_PR_MERGED} was merged. Proceeding to main...${NC}"
    echo ""
  fi
fi
# Hotfix branches skip the staging check (can go direct to main)

# Push branch to origin
echo -e "${GREEN}Pushing branch to origin...${NC}"
git push -u origin "$CURRENT_BRANCH"

echo ""

# Check if gh CLI is available
if command -v gh &> /dev/null; then
  echo -e "${GREEN}Creating PR to main...${NC}"

  # Check if PR already exists
  EXISTING_PR=$(gh pr list --head "$CURRENT_BRANCH" --base main --json url -q '.[0].url' 2>/dev/null)

  if [ -n "$EXISTING_PR" ]; then
    echo -e "${YELLOW}PR already exists for this branch${NC}"
    PR_URL="$EXISTING_PR"
  else
    # Extract task ID from branch: release/CU-doc1-workflow-docs -> CU-doc1
    TICKET_ID=$(echo "$CURRENT_BRANCH" | sed -n 's|.*/\(CU-[a-z0-9]*\)-.*|\1|p')

    # Validate extraction was successful
    if [ -z "$TICKET_ID" ]; then
      echo -e "${RED}ERROR: Could not extract task ID from branch name${NC}"
      echo ""
      echo "  Branch: $CURRENT_BRANCH"
      echo "  Expected format: release/CU-{taskid}-{description}"
      echo "                   hotfix/CU-{taskid}-{description}"
      echo ""
      exit 1
    fi

    # Determine commit type based on branch prefix
    if [[ "$CURRENT_BRANCH" == hotfix/* ]]; then
      COMMIT_TYPE="fix"
    else
      COMMIT_TYPE="feat"
    fi

    # Get description: use custom if provided, otherwise extract from branch name
    if [ -n "$CUSTOM_DESC" ]; then
      DESCRIPTION="$CUSTOM_DESC"
    else
      # Extract description from branch: release/CU-doc1-workflow-docs -> workflow-docs
      BRANCH_DESC=$(echo "$CURRENT_BRANCH" | sed -n 's|.*/CU-[a-z0-9]*-\(.*\)|\1|p')
      # Convert hyphens to spaces: workflow-docs -> workflow docs
      DESCRIPTION=$(echo "$BRANCH_DESC" | tr '-' ' ')
    fi

    # Validate description was extracted
    if [ -z "$DESCRIPTION" ]; then
      echo -e "${RED}ERROR: Could not extract description from branch name${NC}"
      echo ""
      echo "  Branch: $CURRENT_BRANCH"
      echo "  Expected format: release/CU-{taskid}-{description}"
      echo ""
      echo "You can provide a custom description:"
      echo "  pnpm run git:ship ${BUMP_TYPE} \"your description here\""
      echo ""
      exit 1
    fi

    # Build PR title: [patch] feat(CU-doc1): workflow docs
    PR_TITLE="[${BUMP_TYPE}] ${COMMIT_TYPE}(${TICKET_ID}): ${DESCRIPTION}"

    # Create new PR
    if gh pr create --base main --title "$PR_TITLE" --body "Ship ${CURRENT_BRANCH} to production.

Squash merge of ${CURRENT_BRANCH}." >/dev/null 2>&1; then
      PR_URL=$(gh pr view --json url -q '.url' 2>/dev/null)
    else
      echo -e "${RED}Failed to create PR${NC}"
      exit 1
    fi
  fi

  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  PR created to main!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo -e "PR URL: ${BLUE}${PR_URL}${NC}"
  echo ""
  echo -e "${YELLOW}After PR is merged:${NC}"
  echo "  - Tag will be auto-created by GitHub Actions"
  echo "  - Release branch will be auto-deleted"
  echo "  - Staging will be auto-synced from main"
  echo ""
else
  echo -e "${YELLOW}gh CLI not found - showing manual instructions${NC}"
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  Branch pushed! Now create a PR${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo -e "${YELLOW}Create PR to main:${NC}"
  echo ""
  # Build title same way as above
  TICKET_ID=$(echo "$CURRENT_BRANCH" | sed -n 's|.*/\(CU-[a-z0-9]*\)-.*|\1|p')
  if [[ "$CURRENT_BRANCH" == hotfix/* ]]; then
    COMMIT_TYPE="fix"
  else
    COMMIT_TYPE="feat"
  fi
  if [ -n "$CUSTOM_DESC" ]; then
    DESCRIPTION="$CUSTOM_DESC"
  else
    BRANCH_DESC=$(echo "$CURRENT_BRANCH" | sed -n 's|.*/CU-[a-z0-9]*-\(.*\)|\1|p')
    DESCRIPTION=$(echo "$BRANCH_DESC" | tr '-' ' ')
  fi
  MANUAL_TITLE="[${BUMP_TYPE}] ${COMMIT_TYPE}(${TICKET_ID}): ${DESCRIPTION}"
  echo "  gh pr create --base main --title \"${MANUAL_TITLE}\""
  echo ""
  echo -e "${YELLOW}Or via GitHub UI:${NC}"
  echo "  https://github.com/malhar212/git-strategy-demo/compare/main...${CURRENT_BRANCH}"
  echo ""
  echo -e "${YELLOW}After PR is merged:${NC}"
  echo "  - Tag will be auto-created by GitHub Actions"
  echo "  - Release branch will be auto-deleted"
  echo "  - Staging will be auto-synced from main"
  echo ""
fi
