#!/usr/bin/env bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# =============================================================================
# git:resolve-staging - Resolve merge conflicts for release → staging PRs
# =============================================================================
#
# When a PR from release → staging has conflicts, GitHub's "Resolve conflicts"
# button adds commits to the release branch, polluting it for the eventual
# PR to main.
#
# This script resolves conflicts ON STAGING (the target branch) instead,
# keeping the release branch clean.
#
# Usage: pnpm run git:resolve-staging <release-branch>
# Example: pnpm run git:resolve-staging release/CU-doc1-update-script
# =============================================================================

# Validate input
if [ -z "$1" ]; then
  echo -e "${RED}ERROR: No branch specified${NC}"
  echo ""
  echo "Usage: pnpm run git:resolve-staging <release-branch>"
  echo ""
  echo "Example:"
  echo "  pnpm run git:resolve-staging release/CU-abc123-feature"
  echo "  pnpm run git:resolve-staging hotfix/CU-def456-urgent-fix"
  echo ""
  exit 1
fi

BRANCH="$1"

# Validate branch is release/* or hotfix/*
if [[ ! "$BRANCH" == release/* ]] && [[ ! "$BRANCH" == hotfix/* ]]; then
  echo -e "${RED}ERROR: Branch must be release/* or hotfix/*${NC}"
  echo ""
  echo "Provided: $BRANCH"
  echo ""
  exit 1
fi

# Check gh CLI is available and authenticated
if ! command -v gh &> /dev/null; then
  echo -e "${RED}ERROR: GitHub CLI (gh) is not installed${NC}"
  echo "Install it from: https://cli.github.com/"
  exit 1
fi

if ! gh auth status &> /dev/null; then
  echo -e "${RED}ERROR: GitHub CLI is not authenticated${NC}"
  echo "Run: gh auth login"
  exit 1
fi

# Get repo info
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null)
if [ -z "$REPO" ]; then
  echo -e "${RED}ERROR: Could not determine repository${NC}"
  exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Resolve Staging Conflicts${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Repository: ${BLUE}${REPO}${NC}"
echo -e "Branch:     ${YELLOW}${BRANCH}${NC}"
echo -e "Target:     ${YELLOW}staging${NC}"
echo ""

# Save current branch
ORIGINAL_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")

# Check for uncommitted changes and stash if needed
STASHED=false
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo -e "${YELLOW}Stashing uncommitted changes...${NC}"
  git stash push -m "git:resolve-staging auto-stash"
  STASHED=true
fi

# Function to restore state on exit/error
cleanup() {
  EXIT_CODE=$?

  # Re-enable ruleset if we disabled it
  if [ "$RULESET_DISABLED" = true ] && [ -n "$RULESET_ID" ]; then
    echo ""
    echo -e "${YELLOW}Re-enabling staging ruleset...${NC}"
    gh api "repos/${REPO}/rulesets/${RULESET_ID}" -X PUT --input - << EOF > /dev/null 2>&1 || true
{
  "name": "staging-protection",
  "enforcement": "active"
}
EOF
    echo -e "${GREEN}✓${NC} Ruleset re-enabled"
  fi

  # Return to original branch
  if [ -n "$ORIGINAL_BRANCH" ] && [ "$ORIGINAL_BRANCH" != "staging" ]; then
    echo ""
    echo -e "${YELLOW}Returning to ${ORIGINAL_BRANCH}...${NC}"
    git checkout "$ORIGINAL_BRANCH" 2>/dev/null || true
  fi

  # Pop stash if we stashed
  if [ "$STASHED" = true ]; then
    echo -e "${YELLOW}Restoring stashed changes...${NC}"
    git stash pop 2>/dev/null || true
  fi

  exit $EXIT_CODE
}

trap cleanup EXIT

RULESET_DISABLED=false
RULESET_ID=""

# Checkout staging
echo -e "${GREEN}Checking out staging...${NC}"
git checkout staging

# Pull latest staging
echo -e "${GREEN}Pulling latest staging...${NC}"
git pull origin staging

# Fetch the release branch
echo -e "${GREEN}Fetching ${BRANCH}...${NC}"
git fetch origin "$BRANCH"

# Attempt merge
echo ""
echo -e "${GREEN}Merging origin/${BRANCH} into staging...${NC}"
echo ""

if git merge "origin/${BRANCH}" --no-ff -m "chore: merge ${BRANCH} to staging (conflict resolution)"; then
  echo ""
  echo -e "${GREEN}✓ Merge successful (no conflicts)${NC}"
else
  echo ""
  echo -e "${YELLOW}========================================${NC}"
  echo -e "${YELLOW}  Merge Conflicts Detected${NC}"
  echo -e "${YELLOW}========================================${NC}"
  echo ""
  echo -e "Conflicted files:"
  git diff --name-only --diff-filter=U
  echo ""
  echo -e "${YELLOW}Please resolve the conflicts in your editor:${NC}"
  echo "  1. Open each conflicted file"
  echo "  2. Look for <<<<<<< HEAD markers"
  echo "  3. Keep the changes you want"
  echo "  4. Remove the conflict markers"
  echo "  5. Save the files"
  echo ""
  read -p "Press Enter when conflicts are resolved..."

  # Check if conflicts are resolved
  if git diff --check 2>/dev/null | grep -q "conflict"; then
    echo -e "${RED}ERROR: Unresolved conflicts still exist${NC}"
    echo "Please resolve all conflicts and try again."
    git merge --abort
    exit 1
  fi

  # Stage resolved files
  echo -e "${GREEN}Staging resolved files...${NC}"
  git add .

  # Commit with --no-verify to bypass pre-commit hook
  echo -e "${GREEN}Committing merge...${NC}"
  git commit --no-verify -m "chore: merge ${BRANCH} to staging (conflict resolution)"
fi

# Get staging ruleset ID
echo ""
echo -e "${GREEN}Checking for staging ruleset...${NC}"
RULESET_ID=$(gh api "repos/${REPO}/rulesets" --jq '.[] | select(.name=="staging-protection") | .id' 2>/dev/null || echo "")

if [ -n "$RULESET_ID" ]; then
  echo -e "${YELLOW}Temporarily disabling staging ruleset...${NC}"
  gh api "repos/${REPO}/rulesets/${RULESET_ID}" -X PUT --input - << EOF > /dev/null
{
  "name": "staging-protection",
  "enforcement": "disabled"
}
EOF
  RULESET_DISABLED=true
  echo -e "${GREEN}✓${NC} Ruleset disabled"
fi

# Push with --no-verify to bypass pre-push hook
echo ""
echo -e "${GREEN}Pushing to staging...${NC}"
git push origin staging --no-verify

# Re-enable ruleset (will also happen in cleanup trap)
if [ "$RULESET_DISABLED" = true ] && [ -n "$RULESET_ID" ]; then
  echo ""
  echo -e "${GREEN}Re-enabling staging ruleset...${NC}"
  gh api "repos/${REPO}/rulesets/${RULESET_ID}" -X PUT --input - << EOF > /dev/null
{
  "name": "staging-protection",
  "enforcement": "active"
}
EOF
  RULESET_DISABLED=false
  echo -e "${GREEN}✓${NC} Ruleset re-enabled"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Success!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Staging has been updated with ${BRANCH}."
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Close the PR on GitHub (it's now merged manually)"
echo "  2. Continue with: pnpm run git:ship <major|minor|patch>"
echo ""
