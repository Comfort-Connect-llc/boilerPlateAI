#!/usr/bin/env bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Usage
if [ -z "$1" ] || [ -z "$2" ]; then
  echo -e "${YELLOW}Usage: pnpm run git:feature <task-id> <description>${NC}"
  echo ""
  echo "  task-id: Your ClickUp task ID (CU- prefix is added automatically)"
  echo ""
  echo "Examples:"
  echo "  pnpm run git:feature 86b62v077 user-authentication"
  echo "  pnpm run git:feature abc123def fix-login-redirect"
  echo ""
  exit 1
fi

TASK_ID="$1"
DESCRIPTION="$2"

# Validate task ID is lowercase alphanumeric only
if ! echo "$TASK_ID" | grep -qE '^[a-z0-9]+$'; then
  echo -e "${RED}ERROR: Task ID must be lowercase alphanumeric only${NC}"
  echo ""
  echo "  Invalid: $TASK_ID"
  echo "  Valid examples: abc123, 86b62v077, doc1"
  echo ""
  exit 1
fi

# Validate description is lowercase with hyphens only
if ! echo "$DESCRIPTION" | grep -qE '^[a-z0-9-]+$'; then
  echo -e "${RED}ERROR: Description must be lowercase with hyphens only${NC}"
  echo ""
  echo "  Invalid: $DESCRIPTION"
  echo "  Valid examples: user-login, fix-bug, add-feature"
  echo ""
  exit 1
fi

TICKET_ID="CU-${TASK_ID}"
BRANCH_NAME="feature/${TICKET_ID}-${DESCRIPTION}"

echo -e "${BLUE}Creating feature branch: ${BRANCH_NAME}${NC}"
echo ""

# Ensure we're on main and up to date
echo -e "${GREEN}Fetching latest from origin...${NC}"
git fetch origin

echo -e "${GREEN}Checking out main...${NC}"
git checkout main

echo -e "${GREEN}Pulling latest main...${NC}"
git pull origin main

# Create and switch to feature branch
echo -e "${GREEN}Creating feature branch...${NC}"
git checkout -b "$BRANCH_NAME"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Feature branch created!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Branch: ${BLUE}${BRANCH_NAME}${NC}"
echo ""
echo -e "${YELLOW}Workflow:${NC}"
echo "  1. Make your changes and commit using conventional commits"
echo "     Example: git commit -m 'feat(${TICKET_ID}): add login form'"
echo ""
echo "  2. Sync with main regularly:"
echo "     pnpm run git:sync"
echo ""
echo "  3. When ready for UAT, create a release branch:"
echo "     pnpm run git:release"
echo ""
