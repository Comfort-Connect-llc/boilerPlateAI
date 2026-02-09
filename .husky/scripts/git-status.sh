#!/usr/bin/env bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Git Branch Status${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get current branch
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "DETACHED")

echo -e "Current branch: ${CYAN}${CURRENT_BRANCH}${NC}"
echo ""

# Fetch to get accurate remote info
git fetch origin --quiet 2>/dev/null || true

# Show branch type and status
if [[ "$CURRENT_BRANCH" == feature/* ]]; then
  echo -e "Branch type: ${GREEN}Feature${NC}"
  echo ""
  echo -e "${YELLOW}Available commands:${NC}"
  echo "  pnpm run git:sync      - Sync with main"
  echo "  pnpm run git:release   - Create release branch"

elif [[ "$CURRENT_BRANCH" == release/* ]]; then
  echo -e "Branch type: ${YELLOW}Release${NC}"
  echo ""
  echo -e "${YELLOW}Available commands:${NC}"
  echo "  pnpm run git:sync-feature             - Sync with latest feature changes"
  echo "  pnpm run git:to-staging               - Push and create PR to staging for UAT"
  echo "  pnpm run git:ship <major|minor|patch> - Push and create PR to main"

elif [[ "$CURRENT_BRANCH" == hotfix/* ]]; then
  echo -e "Branch type: ${RED}Hotfix${NC}"
  echo ""
  echo -e "${YELLOW}Available commands:${NC}"
  echo "  pnpm run git:to-staging               - Push and create PR to staging (optional)"
  echo "  pnpm run git:ship <major|minor|patch> - Push and create PR to main"

elif [[ "$CURRENT_BRANCH" == "main" ]]; then
  echo -e "Branch type: ${RED}Protected (main)${NC}"
  echo ""
  echo -e "${YELLOW}Available commands:${NC}"
  echo "  pnpm run git:feature <task-id> <desc> - Start new feature"
  echo "  pnpm run git:hotfix <task-id> <desc>  - Start hotfix"

elif [[ "$CURRENT_BRANCH" == "staging" ]]; then
  echo -e "Branch type: ${RED}Protected (staging)${NC}"
  echo ""
  echo -e "${YELLOW}Note:${NC} Switch to main to start new work"

else
  echo -e "Branch type: ${YELLOW}Unknown${NC}"
  echo ""
  echo -e "${YELLOW}Expected branch patterns:${NC}"
  echo "  feature/CU-{task_id}-description"
  echo "  release/CU-{task_id}-description"
  echo "  hotfix/CU-{task_id}-description"
fi

echo ""

# Commits ahead/behind main
if [[ "$CURRENT_BRANCH" != "main" ]] && [[ "$CURRENT_BRANCH" != "DETACHED" ]]; then
  echo -e "${BLUE}Comparison with main:${NC}"

  AHEAD=$(git rev-list --count origin/main.."$CURRENT_BRANCH" 2>/dev/null || echo "?")
  BEHIND=$(git rev-list --count "$CURRENT_BRANCH"..origin/main 2>/dev/null || echo "?")

  if [ "$AHEAD" != "?" ] && [ "$BEHIND" != "?" ]; then
    echo -e "  Ahead:  ${GREEN}${AHEAD}${NC} commits"
    echo -e "  Behind: ${YELLOW}${BEHIND}${NC} commits"

    if [ "$BEHIND" -gt 0 ]; then
      echo ""
      echo -e "${YELLOW}Tip:${NC} Run 'pnpm run git:sync' to sync with main"
    fi
  fi
  echo ""
fi

# Recent commits
echo -e "${BLUE}Recent commits on this branch:${NC}"
git log --oneline -5 2>/dev/null || echo "  (no commits)"
echo ""

# Working directory status
echo -e "${BLUE}Working directory:${NC}"
CHANGES=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
if [ "$CHANGES" -gt 0 ]; then
  echo -e "  ${YELLOW}${CHANGES} uncommitted changes${NC}"
  git status --short
else
  echo -e "  ${GREEN}Clean${NC}"
fi
echo ""
