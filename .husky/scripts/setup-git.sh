#!/usr/bin/env bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Git Repository Setup Script${NC}"
echo -e "${BLUE}  Release Branch Isolation Strategy${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ============================================
# STEP 1: Verify required files exist
# ============================================
echo -e "${BLUE}Step 1: Verifying required files...${NC}"
echo ""

MISSING_FILES=()

# Required hook files
REQUIRED_HOOKS=(
  ".husky/pre-commit"
  ".husky/pre-push"
  ".husky/pre-merge-commit"
  ".husky/commit-msg"
)

# Required script files
REQUIRED_SCRIPTS=(
  ".husky/scripts/git-feature.sh"
  ".husky/scripts/git-sync.sh"
  ".husky/scripts/git-release.sh"
  ".husky/scripts/git-sync-feature.sh"
  ".husky/scripts/git-to-staging.sh"
  ".husky/scripts/git-ship.sh"
  ".husky/scripts/git-hotfix.sh"
  ".husky/scripts/git-status.sh"
  ".husky/scripts/git-merge-staging.sh"
  ".husky/scripts/git-merge-main.sh"
  ".husky/scripts/setup-rulesets.sh"
)

# Required config files
REQUIRED_CONFIGS=(
  "commitlint.config.js"
  ".gitignore"
)

# Check hooks
for file in "${REQUIRED_HOOKS[@]}"; do
  if [ -f "$file" ]; then
    echo -e "  ${GREEN}✓${NC} $file"
  else
    echo -e "  ${RED}✗${NC} $file ${RED}(MISSING)${NC}"
    MISSING_FILES+=("$file")
  fi
done

# Check scripts
for file in "${REQUIRED_SCRIPTS[@]}"; do
  if [ -f "$file" ]; then
    echo -e "  ${GREEN}✓${NC} $file"
  else
    echo -e "  ${RED}✗${NC} $file ${RED}(MISSING)${NC}"
    MISSING_FILES+=("$file")
  fi
done

# Check configs
for file in "${REQUIRED_CONFIGS[@]}"; do
  if [ -f "$file" ]; then
    echo -e "  ${GREEN}✓${NC} $file"
  else
    echo -e "  ${RED}✗${NC} $file ${RED}(MISSING)${NC}"
    MISSING_FILES+=("$file")
  fi
done

echo ""

# Check GitHub workflows
echo -e "${BLUE}Checking GitHub workflows...${NC}"
REQUIRED_WORKFLOWS=(
  ".github/workflows/branch-enforcement.yml"
  ".github/workflows/validate-pr-title.yml"
  ".github/workflows/validate-commits.yml"
  ".github/workflows/sync-staging.yml"
  ".github/workflows/auto-tag-release.yml"
)

for file in "${REQUIRED_WORKFLOWS[@]}"; do
  if [ -f "$file" ]; then
    echo -e "  ${GREEN}✓${NC} $file"
  else
    echo -e "  ${RED}✗${NC} $file ${RED}(MISSING)${NC}"
    MISSING_FILES+=("$file")
  fi
done

echo ""

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
  echo -e "${RED}ERROR: Missing required files. Cannot continue.${NC}"
  echo "Please ensure all required files are copied to this repository."
  exit 1
fi

# ============================================
# STEP 2: Check/install dependencies
# ============================================
echo -e "${BLUE}Step 2: Checking dependencies...${NC}"
echo ""

# Check if package.json exists
if [ ! -f "package.json" ]; then
  echo -e "${YELLOW}No package.json found. Creating one...${NC}"
  echo '{
  "name": "my-project",
  "version": "1.0.0",
  "private": true,
  "scripts": {},
  "devDependencies": {}
}' > package.json
fi

# Check for required devDependencies
DEPS_TO_INSTALL=()

if ! grep -q '"husky"' package.json; then
  DEPS_TO_INSTALL+=("husky")
fi

if ! grep -q '"@commitlint/cli"' package.json; then
  DEPS_TO_INSTALL+=("@commitlint/cli")
fi

if ! grep -q '"@commitlint/config-conventional"' package.json; then
  DEPS_TO_INSTALL+=("@commitlint/config-conventional")
fi

if [ ${#DEPS_TO_INSTALL[@]} -gt 0 ]; then
  echo -e "${GREEN}Installing missing dependencies: ${DEPS_TO_INSTALL[*]}${NC}"

  # Detect package manager
  if command -v pnpm &> /dev/null; then
    pnpm add -D "${DEPS_TO_INSTALL[@]}"
  elif command -v npm &> /dev/null; then
    npm install -D "${DEPS_TO_INSTALL[@]}"
  else
    echo -e "${RED}ERROR: No package manager found (pnpm or npm required)${NC}"
    exit 1
  fi
else
  echo -e "  ${GREEN}✓${NC} All dependencies present"
fi

echo ""

# ============================================
# STEP 3: Add git:* scripts to package.json
# ============================================
echo -e "${BLUE}Step 3: Configuring package.json scripts...${NC}"
echo ""

# Use node to add all scripts at once (handles JSON properly, avoids bash issues)
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts = pkg.scripts || {};

const requiredScripts = {
  'prepare': 'husky',
  'git:feature': 'bash .husky/scripts/git-feature.sh',
  'git:sync': 'bash .husky/scripts/git-sync.sh',
  'git:release': 'bash .husky/scripts/git-release.sh',
  'git:sync-feature': 'bash .husky/scripts/git-sync-feature.sh',
  'git:to-staging': 'bash .husky/scripts/git-to-staging.sh',
  'git:ship': 'bash .husky/scripts/git-ship.sh',
  'git:hotfix': 'bash .husky/scripts/git-hotfix.sh',
  'git:status': 'bash .husky/scripts/git-status.sh',
  'git:setup': 'bash .husky/scripts/setup-git.sh',
  'git:setup-rulesets': 'bash .husky/scripts/setup-rulesets.sh',
  'git:merge-staging': 'bash .husky/scripts/git-merge-staging.sh',
  'git:merge-main': 'bash .husky/scripts/git-merge-main.sh'
};

let added = 0;
let existing = 0;

for (const [name, value] of Object.entries(requiredScripts)) {
  if (pkg.scripts[name]) {
    console.log('  ✓ ' + name + ' (exists)');
    existing++;
  } else {
    console.log('  + Adding ' + name);
    pkg.scripts[name] = value;
    added++;
  }
}

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

if (added > 0) {
  console.log('');
  console.log('  Added ' + added + ' script(s) to package.json');
}
"

echo ""

# ============================================
# STEP 4: Run Husky setup
# ============================================
echo -e "${BLUE}Step 4: Setting up Husky...${NC}"
echo ""

# Run husky to set up git hooks
if command -v pnpm &> /dev/null; then
  pnpm exec husky
elif command -v npx &> /dev/null; then
  npx husky
fi

echo -e "  ${GREEN}✓${NC} Husky hooks configured"
echo ""

# ============================================
# STEP 5: Git repository setup
# ============================================
echo -e "${BLUE}Step 5: Setting up Git branches...${NC}"
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
  echo -e "${YELLOW}No .git folder found. Initializing fresh repository...${NC}"
  git init -b main

  # Create initial commit
  echo -e "${GREEN}Creating initial commit...${NC}"
  git add .
  git commit -m "chore: initial commit - Release Branch Isolation setup"

  # Create staging branch
  echo -e "${GREEN}Creating staging branch...${NC}"
  git checkout -b staging
  git checkout main
else
  echo -e "${YELLOW}Existing git repository detected. Adapting...${NC}"
  echo ""

  # Get current branch
  CURRENT=$(git symbolic-ref --short HEAD 2>/dev/null || echo "detached")

  # Ensure we have a main branch
  if git rev-parse --verify main >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Main branch exists"
    if [ "$CURRENT" != "main" ]; then
      git checkout main
    fi
  elif git rev-parse --verify master >/dev/null 2>&1; then
    echo -e "  ${YELLOW}→${NC} Renaming master to main..."
    git checkout master
    git branch -m master main
  else
    echo -e "  ${YELLOW}→${NC} Creating main branch from current HEAD..."
    git checkout -b main
  fi

  # Ensure we have a staging branch
  if git rev-parse --verify staging >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Staging branch exists"
  else
    echo -e "  ${YELLOW}→${NC} Creating staging branch..."
    git checkout -b staging
    git checkout main
  fi
fi

echo ""
echo -e "${GREEN}Branches:${NC}"
git branch
echo ""

# ============================================
# STEP 6: Commit setup files
# ============================================
echo -e "${BLUE}Step 6: Committing setup files...${NC}"
echo ""

# Files we want to commit (and later lock)
SETUP_FILES=(
  ".husky/"
  ".github/"
  "commitlint.config.js"
  ".gitignore"
  "package.json"
)

# Patterns to lock in .gitignore after committing
LOCK_PATTERNS=(
  ".husky/"
  ".github/"
  "commitlint.config.js"
)

# Step 6a: Temporarily remove lock patterns from .gitignore if present
# This allows us to commit the files even if they were pre-ignored
REMOVED_PATTERNS=()
if [ -f ".gitignore" ]; then
  for pattern in "${LOCK_PATTERNS[@]}"; do
    if grep -qxF "$pattern" .gitignore 2>/dev/null; then
      echo -e "  ${YELLOW}→${NC} Temporarily removing $pattern from .gitignore"
      # Remove the pattern (macOS compatible sed)
      sed -i '' "/^$(echo "$pattern" | sed 's/[\/&]/\\&/g')$/d" .gitignore 2>/dev/null || \
      sed -i "/^$(echo "$pattern" | sed 's/[\/&]/\\&/g')$/d" .gitignore
      REMOVED_PATTERNS+=("$pattern")
    fi
  done
fi

# Step 6b: Add and commit setup files
FILES_TO_ADD=""
for file in "${SETUP_FILES[@]}"; do
  if [ -e "$file" ]; then
    FILES_TO_ADD="$FILES_TO_ADD $file"
  fi
done

if [ -n "$FILES_TO_ADD" ]; then
  git add -f $FILES_TO_ADD 2>/dev/null  # -f to force add even if in .gitignore

  if ! git diff --cached --quiet; then
    echo -e "${GREEN}Committing setup files...${NC}"
    git commit -m "chore(CU-setup): add Release Branch Isolation setup files" --no-verify
    echo -e "  ${GREEN}✓${NC} Setup files committed"
  else
    echo -e "  ${GREEN}✓${NC} Setup files already committed"
  fi
else
  echo -e "  ${GREEN}✓${NC} No setup files to commit"
fi

echo ""

# ============================================
# STEP 6.1: Lock setup files in .gitignore
# ============================================
echo -e "${BLUE}Step 6.1: Locking setup files in .gitignore...${NC}"
echo ""

# Ensure .gitignore exists
if [ ! -f ".gitignore" ]; then
  touch .gitignore
fi

# Check if we need to add the section header
NEEDS_HEADER=0
for pattern in "${LOCK_PATTERNS[@]}"; do
  if ! grep -qxF "$pattern" .gitignore 2>/dev/null; then
    NEEDS_HEADER=1
    break
  fi
done

# Add section header if we're adding new patterns
if [ $NEEDS_HEADER -eq 1 ]; then
  if ! grep -qF "# GIT and GITHUB" .gitignore 2>/dev/null; then
    echo "" >> .gitignore
    echo "# GIT and GITHUB" >> .gitignore
  fi
fi

ADDED_PATTERNS=0
for pattern in "${LOCK_PATTERNS[@]}"; do
  # Check if pattern already exists in .gitignore
  if ! grep -qxF "$pattern" .gitignore 2>/dev/null; then
    echo "$pattern" >> .gitignore
    echo -e "  ${GREEN}+${NC} Added $pattern to .gitignore"
    ADDED_PATTERNS=1
  else
    echo -e "  ${GREEN}✓${NC} $pattern already in .gitignore"
  fi
done

if [ $ADDED_PATTERNS -eq 1 ]; then
  # Commit the .gitignore update
  git add .gitignore
  if ! git diff --cached --quiet; then
    git commit -m "chore(CU-setup): lock setup files in .gitignore" --no-verify
    echo -e "  ${GREEN}✓${NC} .gitignore updated and committed"
  fi
fi

echo ""

# ============================================
# STEP 7: Remote setup
# ============================================
echo -e "${BLUE}Step 7: Remote repository setup...${NC}"
echo ""

# Check if remote already exists
EXISTING_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")

if [ -n "$EXISTING_REMOTE" ]; then
  echo -e "Current remote: ${BLUE}${EXISTING_REMOTE}${NC}"
  echo ""
  read -p "Keep existing remote? (Y/n): " keep_remote
  if [[ "$keep_remote" =~ ^[Nn]$ ]]; then
    read -p "Enter new remote URL: " NEW_REMOTE_URL
    if [ -n "$NEW_REMOTE_URL" ]; then
      git remote set-url origin "$NEW_REMOTE_URL"
      EXISTING_REMOTE="$NEW_REMOTE_URL"
      echo -e "${GREEN}Remote updated.${NC}"
    fi
  fi
else
  read -p "Enter remote URL (git@github.com:owner/repo.git): " NEW_REMOTE_URL
  if [ -n "$NEW_REMOTE_URL" ]; then
    git remote add origin "$NEW_REMOTE_URL"
    EXISTING_REMOTE="$NEW_REMOTE_URL"
    echo -e "${GREEN}Remote added.${NC}"
  else
    echo -e "${YELLOW}Skipped remote setup. Add later with:${NC}"
    echo "  git remote add origin git@github.com:owner/repo.git"
  fi
fi

echo ""

# Push branches if remote is configured
if [ -n "$EXISTING_REMOTE" ]; then
  read -p "Push branches to remote now? (Y/n): " push_now

  if [[ ! "$push_now" =~ ^[Nn]$ ]]; then
    echo ""
    echo -e "${GREEN}Pushing main branch...${NC}"
    if ! git push -u origin main --no-verify 2>&1; then
      echo -e "${YELLOW}Push failed. Remote may have existing history.${NC}"
      echo "You can try: git pull origin main --rebase"
    fi

    echo -e "${GREEN}Pushing staging branch...${NC}"
    if ! git push -u origin staging --no-verify 2>&1; then
      echo -e "${YELLOW}Push failed for staging.${NC}"
    fi
  fi
fi

# ============================================
# COMPLETE
# ============================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. (Admin) Configure GitHub Rulesets:"
echo "     pnpm run git:setup-rulesets"
echo ""
echo "  2. Start your first feature:"
echo "     pnpm run git:feature <task-id> <description>"
echo ""