#!/usr/bin/env bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  GitHub Rulesets Setup${NC}"
echo -e "${BLUE}  Release Branch Isolation Strategy${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check gh CLI is available and authenticated
if ! command -v gh &> /dev/null; then
  echo -e "${RED}ERROR: GitHub CLI (gh) is not installed${NC}"
  echo ""
  echo "Install it from: https://cli.github.com/"
  exit 1
fi

if ! gh auth status &> /dev/null; then
  echo -e "${RED}ERROR: GitHub CLI is not authenticated${NC}"
  echo ""
  echo "Run: gh auth login"
  exit 1
fi

# Get repo info
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null)
if [ -z "$REPO" ]; then
  echo -e "${RED}ERROR: Could not determine repository${NC}"
  echo ""
  echo "Make sure you're in a git repository with a GitHub remote."
  exit 1
fi

echo -e "Repository: ${BLUE}${REPO}${NC}"
echo ""

# ============================================
# STEP 1: Configure repository settings
# ============================================
echo -e "${BLUE}Step 1: Configuring repository settings...${NC}"
echo ""

# Set merge commit messages to use PR title
echo -e "  ${GREEN}Setting merge commit messages to use PR title...${NC}"
gh api "repos/${REPO}" -X PATCH --input - << 'EOF' > /dev/null
{
  "squash_merge_commit_title": "PR_TITLE",
  "squash_merge_commit_message": "PR_BODY",
  "merge_commit_title": "PR_TITLE",
  "merge_commit_message": "PR_BODY"
}
EOF
echo -e "  ${GREEN}✓${NC} Squash merge will use PR title as commit message"
echo -e "  ${GREEN}✓${NC} Merge commit will use PR title as commit message"

# Set GitHub Actions workflow permissions
echo -e "  ${GREEN}Setting GitHub Actions workflow permissions...${NC}"
gh api "repos/${REPO}/actions/permissions/workflow" -X PUT --input - << 'EOF' > /dev/null
{
  "default_workflow_permissions": "write",
  "can_approve_pull_request_reviews": true
}
EOF
echo -e "  ${GREEN}✓${NC} GitHub Actions has read/write permissions"
echo -e "  ${GREEN}✓${NC} GitHub Actions can create and approve PRs"
echo ""

# ============================================
# STEP 2: Create rulesets
# ============================================
echo -e "${BLUE}Step 2: Creating branch rulesets...${NC}"
echo ""

# Check for existing rulesets
echo -e "${YELLOW}Checking for existing rulesets...${NC}"
EXISTING=$(gh api "repos/${REPO}/rulesets" --jq '.[].name' 2>/dev/null || echo "")

if echo "$EXISTING" | grep -q "main-protection"; then
  echo -e "${YELLOW}Ruleset 'main-protection' already exists. Skipping.${NC}"
  SKIP_MAIN=true
else
  SKIP_MAIN=false
fi

if echo "$EXISTING" | grep -q "staging-protection"; then
  echo -e "${YELLOW}Ruleset 'staging-protection' already exists. Skipping.${NC}"
  SKIP_STAGING=true
else
  SKIP_STAGING=false
fi

echo ""

# Create main branch ruleset
if [ "$SKIP_MAIN" = false ]; then
  echo -e "${GREEN}Creating 'main-protection' ruleset...${NC}"
  echo -e "  - Merge method: ${BLUE}squash only${NC}"
  echo -e "  - Required approvals: ${BLUE}0 (no review required)${NC}"
  echo -e "  - Required checks: ${BLUE}validate-pr, validate-title, validate-commits${NC}"
  echo -e "  - Block force push: ${BLUE}yes${NC}"
  echo -e "  - Block deletion: ${BLUE}yes${NC}"
  echo ""

  gh api "repos/${REPO}/rulesets" -X POST --input - << 'EOF'
{
  "name": "main-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          {"context": "validate-pr"},
          {"context": "validate-title"},
          {"context": "validate-commits"}
        ]
      }
    },
    {"type": "non_fast_forward"},
    {"type": "deletion"}
  ]
}
EOF

  echo -e "${GREEN}✓ main-protection ruleset created${NC}"
  echo ""
fi

# Create staging branch ruleset
if [ "$SKIP_STAGING" = false ]; then
  echo -e "${GREEN}Creating 'staging-protection' ruleset...${NC}"
  echo -e "  - Merge method: ${BLUE}merge commit only${NC}"
  echo -e "  - Required approvals: ${BLUE}0 (no review required)${NC}"
  echo -e "  - Required checks: ${BLUE}validate-pr, validate-branch-name${NC}"
  echo -e "  - Allow force push: ${BLUE}yes (for reset operations)${NC}"
  echo -e "  - Block deletion: ${BLUE}yes${NC}"
  echo ""

  gh api "repos/${REPO}/rulesets" -X POST --input - << 'EOF'
{
  "name": "staging-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/staging"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          {"context": "validate-pr"},
          {"context": "validate-branch-name"}
        ]
      }
    },
    {"type": "deletion"}
  ]
}
EOF

  echo -e "${GREEN}✓ staging-protection ruleset created${NC}"
  echo ""
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}View rulesets:${NC}"
echo "  https://github.com/${REPO}/settings/rules"
echo ""
echo -e "${YELLOW}What these rulesets enforce:${NC}"
echo ""
echo "  main branch:"
echo "    - PRs must be squash merged (clean history)"
echo "    - PR title becomes the commit message"
echo "    - All status checks must pass"
echo "    - No force push or deletion"
echo ""
echo "  staging branch:"
echo "    - PRs must use merge commit (preserves history)"
echo "    - Basic status checks must pass"
echo "    - Force push allowed (for reset operations)"
echo "    - No deletion"
echo ""
