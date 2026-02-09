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
  echo -e "${YELLOW}Usage: pnpm run git:hotfix <task-id> <description>${NC}"
  echo ""
  echo "  task-id: Your ClickUp task ID (CU- prefix is added automatically)"
  echo ""
  echo "Examples:"
  echo "  pnpm run git:hotfix 86b62v077 critical-payment-bug"
  echo "  pnpm run git:hotfix abc123def security-patch"
  echo ""
  exit 1
fi

TASK_ID="$1"
DESCRIPTION="$2"
TICKET_ID="CU-${TASK_ID}"
BRANCH_NAME="hotfix/${TICKET_ID}-${DESCRIPTION}"

echo -e "${BLUE}Creating hotfix branch: ${BRANCH_NAME}${NC}"
echo ""

# Fetch and update main
echo -e "${GREEN}Fetching latest from origin...${NC}"
git fetch origin

echo -e "${GREEN}Checking out main...${NC}"
git checkout main
git pull origin main

# Create hotfix branch
echo -e "${GREEN}Creating hotfix branch...${NC}"
git checkout -b "$BRANCH_NAME"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Hotfix branch created!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Branch: ${BLUE}${BRANCH_NAME}${NC}"
echo ""
echo -e "${YELLOW}Hotfix workflow:${NC}"
echo "  1. Make your fix commits directly on this branch"
echo "     Example: git commit -m 'fix(${TICKET_ID}): critical payment validation'"
echo ""
echo "  2. Optionally, PR to staging first for UAT:"
echo "     pnpm run git:to-staging"
echo ""
echo "  3. Ship to main with a semver bump:"
echo "     pnpm run git:ship patch"
echo ""
