# Complete Setup Guide: Release Branch Isolation Strategy

Welcome! This guide provides step-by-step instructions to set up the Release Branch Isolation Strategy for your development team. This is the definitive resource for new developers getting started from scratch.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Essential Files Required](#essential-files-required)
3. [Local Setup Steps](#local-setup-steps)
4. [GitHub Configuration](#github-configuration)
5. [Verification Tests](#verification-tests)
6. [Troubleshooting](#troubleshooting)
7. [Next Steps](#next-steps)

---

## Prerequisites

Before starting the setup process, ensure you have the following installed and configured:

### Required Tools

- **Node.js** (v16 or later)
  - Download from: https://nodejs.org/
  - Verify: `node --version`

- **pnpm** (v7 or later)
  - Install globally: `npm install -g pnpm`
  - Verify: `pnpm --version`

- **Git** (v2.30 or later)
  - Already installed on most systems
  - Verify: `git --version`

- **GitHub CLI (`gh`)** (v2.0 or later)
  - Install from: https://cli.github.com/
  - Verify: `gh --version`

### GitHub Account Requirements

- **GitHub account** with appropriate permissions
- **Repository access**: Admin or maintain permissions on the target repository
- **Team plan or higher**: Required for branch protection rules on private repositories
  - Free accounts can use branch protection on public repositories
  - See [GitHub pricing](https://github.com/pricing) for details

### SSH Configuration

- **SSH key** configured for GitHub
  - Generate if needed: `ssh-keygen -t ed25519 -C "your_email@example.com"`
  - Add to GitHub: https://github.com/settings/keys
  - Test connection: `ssh -T git@github.com`

### GitHub CLI Authentication

- Authenticate with GitHub: `gh auth login`
- Verify authentication: `gh auth status`

---

## Essential Files Required

The Release Branch Isolation Strategy requires specific files and configurations in the repository. Ensure all are present:

| File/Directory | Purpose | Status |
|---|---|---|
| `.github/workflows/validate-pr-title.yml` | Validates PR titles contain semver bump prefix ([major\|minor\|patch]) | Core |
| `.github/workflows/validate-commits.yml` | Validates commit message format using commitlint | Core |
| `.github/workflows/branch-enforcement.yml` | Enforces branch naming conventions and PR rules | Core |
| `.github/workflows/validate-pr.yml` | General PR validation (if present) | Optional |
| `.github/workflows/sync-staging.yml` | Auto-syncs main to staging on PR merge | Core |
| `.github/workflows/auto-tag-release.yml` | Auto-tags releases on main branch merge | Optional |
| `.github/workflows/fix-pr-target.yml` | Auto-fixes incorrect PR targets | Optional |
| `.github/workflows/cleanup-stale-branches.yml` | Cleans up stale feature branches | Optional |
| `.github/workflows/sandbox-deploy.yml` | Deploys to sandbox environment | Optional |
| `.husky/` | Git hooks directory | Core |
| `.husky/scripts/setup-git.sh` | Initial repository setup script | Core |
| `.husky/scripts/git-feature.sh` | Creates feature branches | Core |
| `.husky/scripts/git-release.sh` | Creates release branches | Core |
| `.husky/scripts/git-to-staging.sh` | Merges release to staging | Core |
| `.husky/scripts/git-ship.sh` | Ships release to production (main) | Core |
| `.husky/scripts/git-hotfix.sh` | Creates hotfix branches | Core |
| `.husky/scripts/git-sync.sh` | Syncs feature with main | Core |
| `.husky/scripts/git-sync-feature.sh` | Syncs release with feature updates | Core |
| `.husky/scripts/git-status.sh` | Shows branch status | Optional |
| `.husky/scripts/git-merge-staging.sh` | Merges PR to staging (merge commit) | Core |
| `.husky/scripts/git-merge-main.sh` | Merges PR to main (squash) | Core |
| `.husky/scripts/setup-rulesets.sh` | Configures GitHub Rulesets | Core |
| `.husky/pre-commit` | Hook to block commits on main/staging/release | Core |
| `.husky/pre-push` | Hook to validate branch names and prevent direct pushes to main/staging | Core |
| `.husky/pre-merge-commit` | Hook to enforce merge source restrictions | Core |
| `.husky/commit-msg` | Hook to validate commit messages (uses commitlint) | Core |
| `commitlint.config.js` | Commit message linting configuration | Core |
| `.gitignore` | Standard ignore patterns (node_modules, .env, etc.) | Core |
| `package.json` | npm scripts and dependencies (see npm scripts section) | Core |
| `pnpm-lock.yaml` | Dependency lock file | Generated |

### Required npm Scripts

The following scripts are automatically added to `package.json` by the setup script:

| Script | Purpose |
|--------|---------|
| `git:feature` | Create feature branch |
| `git:sync` | Sync feature with main |
| `git:release` | Create release branch |
| `git:sync-feature` | Sync release with feature updates |
| `git:to-staging` | Create PR to staging |
| `git:ship` | Create PR to main |
| `git:hotfix` | Create hotfix branch |
| `git:status` | Show branch status |
| `git:setup` | Initial repository setup |
| `git:setup-rulesets` | Configure GitHub Rulesets |
| `git:merge-staging` | Merge PR to staging (merge commit) |
| `git:merge-main` | Merge PR to main (squash) |
| `prepare` | Husky hook setup |

### Required Dependencies

Ensure `package.json` includes:

```json
{
  "devDependencies": {
    "husky": "^9.0.0",
    "@commitlint/cli": "^19.0.0",
    "@commitlint/config-conventional": "^19.0.0"
  }
}
```

---

## Local Setup Steps

Follow these steps to set up the repository on your local machine.

### Step 0: Copy Required Files (Fresh Repos Only)

If setting up a brand new project (not cloning an existing configured repo), copy these files first:

| Files | Purpose |
|-------|---------|
| `.husky/` | Git hooks and workflow scripts |
| `.github/workflows/` | GitHub Actions for enforcement |
| `commitlint.config.js` | Commit message validation config |
| `.gitignore` | Standard ignore patterns |

Then run setup directly via bash (npm scripts don't exist yet):
```bash
bash .husky/scripts/setup-git.sh
```

---

### Step 1: Clone the Repository

```bash
# Clone the repository using SSH
git clone git@github.com:{owner}/{repo}.git
cd {repo}

# Example:
# git clone git@github.com:mycompany/my-service.git
# cd my-service
```

**Note**: Use the SSH URL (beginning with `git@github.com:`) to avoid authentication issues. If you haven't configured SSH yet, see the [Prerequisites](#prerequisites) section.

### Step 2: Install Dependencies

This step installs npm packages and automatically sets up Husky git hooks:

```bash
pnpm install
```

**What happens during installation:**

1. All npm packages are installed (including husky)
2. The `prepare` npm script runs automatically (only during fresh install)
3. The `prepare` script runs `husky` which sets up git hooks
4. Git hooks are installed in `.husky/` directory
5. Pre-push and pre-merge-commit hooks are now active

**Verify Husky is set up correctly:**

```bash
ls -la .husky/
# You should see: pre-push, pre-merge-commit, commit-msg, etc.
```

### Step 3: Run the Setup Script

This creates the main and staging branches with proper history:

```bash
pnpm run git:setup
```

**Fresh repos:** Run `bash .husky/scripts/setup-git.sh` directly (npm scripts don't exist yet)

**The setup script will:**

1. Check if you're in a git repository
2. If existing, prompt to delete and reinitialize (destructive operation)
3. Initialize with `git init -b main` (explicitly creates `main` as default branch)
4. Create an initial commit
5. Create the `staging` branch
6. Prompt to set up the remote and push branches

**Important: `git init -b main` is required**

The setup script uses `git init -b main` to ensure the default branch is `main`. Without the `-b main` flag, Git creates `master` as the default branch, which causes the script to fail with:
```
error: pathspec 'main' did not match any file(s) known to git
```

If you encounter this error:
```bash
git branch -m master main   # Rename master to main
```

**Remote Setup: No force push needed**

For fresh repositories, regular push is sufficient:
```bash
git push -u origin main      # Regular push works fine
git push -u origin staging   # No --force needed
```
Force push (`--force`) is only needed when rewriting existing history, not for initial setup.

**Expected output:**

```
========================================
  Git Repository Setup Script
  Release Branch Isolation Strategy
========================================

Initializing new git repository...
Creating initial commit...
Creating staging branch...

Local repository setup complete!

Branches created:
  - main (default)
  - staging

...setup will prompt for remote configuration...
```

**Note**: If you get authentication errors during remote setup:
- Verify SSH key is configured: `ssh -T git@github.com`
- Check GitHub CLI is authenticated: `gh auth status`
- Use HTTPS if SSH fails: `git remote set-url origin https://github.com/{owner}/{repo}.git`

### Verification: Local Setup Complete

After completing the local setup steps, verify everything is working:

```bash
# Check branch creation
git branch -a
# Expected output includes: main, staging

# Check Husky hooks installed
ls -la .husky/
# Should show: pre-push, pre-merge-commit, commit-msg, etc.

# Check npm scripts available
pnpm run | grep git:
# Should list all git:* scripts
```

---

## Git Workflow Commands Reference

This section explains each pnpm git command and what it does under the hood.

### pnpm run git:setup

**Purpose**: Initial repository setup

**What it does** (runs `.husky/scripts/setup-git.sh`):
1. Initializes git with `git init -b main`
2. Creates initial commit
3. Creates staging branch from main
4. Optionally configures remote and pushes branches

**When to use**: Once when first setting up a repository.

---

### pnpm run git:feature {task_id} {description}

**Purpose**: Create a feature branch for new development

**What it does** (runs `.husky/scripts/git-feature.sh`):
1. Fetches latest from origin
2. Checks out and pulls latest main
3. Creates `feature/CU-{task_id}-{description}` branch

**When to use**: Every time you start new work. No need to manually pull main first.

---

### pnpm run git:sync

**Purpose**: Sync feature branch with latest main

**What it does** (runs `.husky/scripts/git-sync.sh`):
1. Merges `origin/main` into current feature branch with `--no-ff`

**When to use**: Regularly during development to catch integration issues early. **Run before git:release**.

**Requirements**: Must be on a `feature/*` branch.

---

### pnpm run git:release

**Purpose**: Create release branch for UAT testing

**What it does** (runs `.husky/scripts/git-release.sh`):
1. Fetches and pulls latest main
2. Creates `release/CU-{task_id}-{description}` from main
3. Merges feature branch into release with `--no-ff`

**When to use**: When feature is code-complete and ready for UAT.

**Requirements**: Must be on a `feature/*` branch.

**Important**: Does NOT sync feature with main first. Run `git:sync` before this if needed.

---

### pnpm run git:sync-feature

**Purpose**: Sync release branch with feature branch updates

**What it does** (runs `.husky/scripts/git-sync-feature.sh`):
1. Merges associated feature branch into current release with `--no-ff`

**When to use**: When UAT finds bugs, you fix in feature branch, then sync to release.

**Requirements**: Must be on a `release/*` branch.

---

### pnpm run git:to-staging

**Purpose**: Create PR to staging for UAT

**What it does** (runs `.husky/scripts/git-to-staging.sh`):
1. Pushes current branch to origin
2. Creates GitHub PR from current branch to staging

**When to use**: When release/hotfix is ready for UAT testing.

**Requirements**: Must be on `release/*` or `hotfix/*` branch. GitHub CLI must be authenticated.

---

### pnpm run git:ship {major|minor|patch}

**Purpose**: Create PR to main (production)

**What it does** (runs `.husky/scripts/git-ship.sh`):
1. Pushes current branch to origin
2. Creates GitHub PR with `[major|minor|patch]` prefix in title

**Parameters**:
- `major` - Breaking changes
- `minor` - New features (backwards-compatible)
- `patch` - Bug fixes

**When to use**: After UAT approval, to deploy to production.

**Requirements**: Must be on `release/*` or `hotfix/*` branch.

---

### pnpm run git:hotfix {task_id} {description}

**Purpose**: Create hotfix branch for urgent production fixes

**What it does** (runs `.husky/scripts/git-hotfix.sh`):
1. Fetches and pulls latest main
2. Creates `hotfix/CU-{task_id}-{description}` from main

**When to use**: Critical issues that need to bypass normal feature workflow.

**Typical flow**:
```bash
pnpm run git:hotfix {task_id} {description}
# ... fix and commit ...
pnpm run git:to-staging   # Quick UAT if possible
pnpm run git:ship patch   # Deploy to production
```

---

### pnpm run git:status

**Purpose**: Show current branch status and available commands

**What it does** (runs `.husky/scripts/git-status.sh`):
1. Displays current branch type
2. Shows available commands for that branch type

**When to use**: Anytime to see where you are and what's available.

---

## GitHub Configuration

Configure GitHub to enforce the Release Branch Isolation Strategy. This section includes both UI and CLI instructions.

### Step 1: Set Workflow Permissions (REQUIRED FIRST)

This step must be completed before branch protection rules will work properly.

#### Via GitHub UI

1. Go to repository: `Settings` > `Actions` > `General`
2. Scroll to "Workflow permissions" section
3. Select **"Read and write permissions"**
4. Check the box: **"Allow GitHub Actions to create and approve pull requests"**
5. Click **Save**

#### Via GitHub CLI

```bash
# Set workflow to have write permissions
gh api repos/{owner}/{repo}/actions/permissions/workflow \
  --method PUT \
  --field default_workflow_permissions=write \
  --field can_approve_pull_request_reviews=true

# Example:
# gh api repos/mycompany/my-service/actions/permissions/workflow \
#   --method PUT \
#   --field default_workflow_permissions=write \
#   --field can_approve_pull_request_reviews=true
```

**Verify workflow permissions:**

```bash
gh api repos/{owner}/{repo}/actions/permissions/workflow
```

---

### Step 2: Configure Branch Protection Rules

Branch protection enforces the strategy at the GitHub level. You'll set up rules for two branches: `main` and `staging`.

#### Main Branch Protection (Pattern: `main`)

This is the production branch. It requires all PRs to be reviewed and meet all status checks.

**Via GitHub UI:**

1. Go to repository: `Settings` > `Branches`
2. Click **Add rule** (or edit existing `main` rule)
3. **Branch name pattern**: `main`
4. Enable the following settings:

| Setting | Value | Purpose |
|---------|-------|---------|
| Require a pull request before merging | ✅ | Prevent direct pushes |
| Require approvals | ✅ | At least 1 approval required |
| Require review from code owners | (Optional) | If CODEOWNERS file exists |
| Dismiss stale pull request approvals when new commits are pushed | ✅ | Keep reviews current |
| Require status checks to pass before merging | ✅ | All tests must pass |
| Status checks that must pass | (See list below) | Enforce workflow validation |
| Require branches to be up to date before merging | ✅ | Prevent stale merges |
| Require conversation resolution before merging | ✅ | Resolve all review comments |
| Require signed commits | (Optional) | Your organization's policy |
| Allow force pushes | ❌ | Prevent history rewriting |
| Allow deletions | ❌ | Prevent branch deletion |
| Restrict who can push to matching branches | (Optional) | Limit to maintainers |

**Required status checks for main:**

The following GitHub Actions must pass:

- `validate-pr-title` - Validates PR title has semver prefix
- `validate-commits` - Validates conventional commit format
- `branch-enforcement` - Enforces branch naming and PR rules
- `validate-pr` (if present) - Additional PR validations

**CLI command for main branch protection:**

```bash
gh api repos/{owner}/{repo}/branches/main/protection \
  --method PUT \
  --field required_status_checks='{
    "strict": true,
    "contexts": [
      "validate-pr-title",
      "validate-commits",
      "branch-enforcement"
    ]
  }' \
  --field required_pull_request_reviews='{"dismissal_restrictions":{},"require_code_owner_reviews":false,"required_approving_review_count":1,"require_last_push_approval":false}' \
  --field enforce_admins=true \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

---

#### Staging Branch Protection (Pattern: `staging`)

This is the UAT/pre-production branch. It's more permissive to allow the sync workflow to function.

**Via GitHub UI:**

1. Go to repository: `Settings` > `Branches`
2. Click **Add rule** (or edit existing `staging` rule)
3. **Branch name pattern**: `staging`
4. Enable the following settings:

| Setting | Value | Purpose |
|---------|-------|---------|
| Require a pull request before merging | ✅ | Prevent direct pushes |
| Require approvals | ✅ | At least 1 approval required |
| Require review from code owners | (Optional) | If CODEOWNERS file exists |
| Require status checks to pass before merging | ✅ | All tests must pass |
| Status checks that must pass | (See list below) | Enforce workflow validation |
| Require branches to be up to date before merging | ✅ | Prevent stale merges |
| Allow force pushes | ❌ | Prevent history rewriting |
| Allow deletions | ❌ | Prevent branch deletion |
| Bypass branch protections | ✅ (for actions) | Allow sync workflow |

**Note on bypassing protections:** This allows GitHub Actions to bypass the branch protection for the sync workflow. This is necessary to allow the automated `main` -> `staging` sync to work.

**Required status checks for staging:**

- `validate-pr-title` - Validates PR title format
- `branch-enforcement` - Enforces branch naming rules

**CLI command for staging branch protection:**

```bash
gh api repos/{owner}/{repo}/branches/staging/protection \
  --method PUT \
  --field required_status_checks='{
    "strict": true,
    "contexts": [
      "validate-pr-title",
      "branch-enforcement"
    ]
  }' \
  --field required_pull_request_reviews='{"dismissal_restrictions":{},"require_code_owner_reviews":false,"required_approving_review_count":1,"require_last_push_approval":false}' \
  --field enforce_admins=true \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --field allow_auto_merge=false
```

---

### Step 3: Configure Merge Settings

Configure how PRs can be merged.

**Via GitHub UI:**

1. Go to repository: `Settings` > `General` > `Pull Requests`
2. Configure merge options:

| Option | Setting | Why |
|--------|---------|-----|
| Allow merge commits | ✅ Checked | Required for staging PRs (preserves history for UAT iterations) |
| Allow squash merging | ✅ Checked | Required for main PRs (clean production history) |
| Allow rebase merging | ❌ Unchecked | Can create confusing history |
| Default commit message | Pull request title | Uses PR title for commit message |
| Automatically delete head branches | ✅ Checked | Clean up feature branches after merge |

**IMPORTANT**: Both merge commits AND squash must be enabled because:
- **Staging PRs**: Use merge commit (`--merge`) to allow iterating on UAT feedback
- **Main PRs**: Use squash (`--squash`) for clean production history

See Step 3.1 below for enforcing the correct merge method per branch using Rulesets.

---

### Step 3.1: Configure GitHub Rulesets (Recommended)

GitHub Rulesets allow per-branch enforcement of merge methods and other rules. This is more powerful than branch protection rules alone.

**Why Rulesets?**
- Enforce squash-only on main, merge-only on staging
- More granular control than repo-wide merge settings
- Can enforce rules that branch protection cannot

#### Ruleset for Main Branch (Squash Only)

```bash
gh api repos/{owner}/{repo}/rulesets -X POST --input - << 'EOF'
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
        "allowed_merge_methods": ["squash"],
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_approving_review_count": 1,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "required_status_checks": [
          {"context": "validate-pr"},
          {"context": "validate-title"},
          {"context": "validate-commits"},
          {"context": "validate-branch-name"}
        ],
        "strict_required_status_checks_policy": true
      }
    },
    {
      "type": "non_fast_forward"
    },
    {
      "type": "deletion"
    }
  ]
}
EOF
```

#### Ruleset for Staging Branch (Merge Commit Only)

```bash
gh api repos/{owner}/{repo}/rulesets -X POST --input - << 'EOF'
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
        "allowed_merge_methods": ["merge"],
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_approving_review_count": 1,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "required_status_checks": [
          {"context": "validate-pr"},
          {"context": "validate-branch-name"}
        ],
        "strict_required_status_checks_policy": false
      }
    }
  ]
}
EOF
```

#### Verify Rulesets

```bash
# List all rulesets
gh api repos/{owner}/{repo}/rulesets

# Get specific ruleset details
gh api repos/{owner}/{repo}/rulesets/{ruleset_id}
```

#### Rulesets vs Branch Protection vs GitHub Actions

| Rule | Rulesets | Branch Protection | GitHub Actions |
|------|----------|-------------------|----------------|
| Merge method per branch | ✅ | ❌ (repo-wide) | ❌ |
| Required approvals | ✅ | ✅ | ❌ |
| Required status checks | ✅ | ✅ | ❌ |
| Block force push | ✅ | ✅ | ❌ |
| PR source branch validation | ❌ | ❌ | ✅ (`branch-enforcement.yml`) |
| PR title format | ❌ | ❌ | ✅ (`validate-pr-title.yml`) |
| Conventional commits | ❌ | ❌ | ✅ (`validate-commits.yml`) |
| Staleness check | ❌ | ❌ | ✅ (`branch-enforcement.yml`) |

**Recommendation**: Use Rulesets for merge method enforcement + Branch Protection for basic rules + GitHub Actions for custom validations.

---

### Step 4: Create Labels for Workflow

Labels help organize and track PRs in the Release Branch Isolation Strategy.

**Via GitHub CLI:**

```bash
# Create "skip-staging" label
gh label create "skip-staging" \
  --description "PR skipped staging, going directly to production" \
  --color "FFA500" \
  --force

# Create "sync-conflict" label
gh label create "sync-conflict" \
  --description "Sync workflow encountered conflicts requiring manual resolution" \
  --color "FF0000" \
  --force

# Create "urgent" label
gh label create "urgent" \
  --description "Requires immediate attention and priority handling" \
  --color "FF0000" \
  --force
```

**Via GitHub UI:**

1. Go to repository: `Issues` > `Labels`
2. Click **New label** for each:

| Label | Color | Description |
|-------|-------|---|
| `skip-staging` | FFA500 (orange) | PR skipped staging, going directly to production |
| `sync-conflict` | FF0000 (red) | Sync workflow encountered conflicts requiring manual resolution |
| `urgent` | FF0000 (red) | Requires immediate attention and priority handling |

---

### Step 5: (Optional) Configure Deployment Environments

If using deployment workflows, configure GitHub Environments:

1. Go to repository: `Settings` > `Environments`
2. Create environments: `sandbox`, `staging`, `production`
3. Configure protection rules and required reviewers as needed

---

## Verification Tests

After completing all setup steps, verify that the strategy is working correctly by running these tests.

### Test 1: Direct Push to Main (Should Fail)

This test verifies the pre-push hook prevents direct pushes to main.

```bash
# Create a test branch
git checkout -b test/direct-push

# Make a change
echo "test" > test.txt
git add test.txt
git commit -m "test: verify pre-push hook"

# Attempt to push to main (should fail)
git push -u origin main 2>&1 | grep -i "error"
```

**Expected result**: Push fails with error about direct push not allowed.

**Cleanup:**
```bash
git checkout main
git branch -D test/direct-push
```

---

### Test 2: Feature PR to Main (Should Fail)

This test verifies GitHub prevents feature/* branches from PRing to main directly.

```bash
# Create feature branch
pnpm run git:feature test-123 verification-test

# Make a change
echo "test" > test.txt
git add test.txt
git commit -m "feat(CU-test-123): verification test"
git push -u origin feature/CU-test-123

# Create PR to main (use gh CLI)
gh pr create --base main --head feature/CU-test-123 \
  --title "[minor] feat(CU-test-123): verification test"
```

**Expected result**:
- PR is created but branch-enforcement workflow fails
- Error message says only release/* and hotfix/* can PR to main

**Cleanup:**
```bash
git checkout main
git branch -D feature/CU-test-123
gh pr close 1  # Replace 1 with actual PR number
```

---

### Test 3: PR Without Semver Prefix (Should Fail)

This test verifies PR titles must have [major|minor|patch] prefix when targeting main.

```bash
# Create release branch
git checkout -b release/CU-test-456-no-prefix

# Make a change
echo "test" > test.txt
git add test.txt
git commit -m "feat(CU-test-456): missing semver"
git push -u origin release/CU-test-456-no-prefix

# Create PR without semver prefix
gh pr create --base main --head release/CU-test-456-no-prefix \
  --title "feat(CU-test-456): missing semver prefix"
```

**Expected result**:
- PR is created but validate-pr-title workflow fails
- Error message explains the [major|minor|patch] requirement

**Cleanup:**
```bash
git checkout main
git branch -D release/CU-test-456-no-prefix
```

---

### Test 4: Invalid Branch Name (Should Fail)

This test verifies branch naming validation in pre-push hook.

```bash
# Create branch with invalid name
git checkout -b invalid-branch-name

# Make a change
echo "test" > test.txt
git add test.txt
git commit -m "test: invalid branch"

# Attempt to push (should fail)
git push -u origin invalid-branch-name 2>&1 | grep -i "branch"
```

**Expected result**: Push fails with error about invalid branch naming pattern.

**Cleanup:**
```bash
git checkout main
git branch -D invalid-branch-name
```

---

### Test 5: Complete Release Flow (Should Pass)

This is the success scenario demonstrating the full workflow works correctly.

```bash
# Step 1: Create feature branch
pnpm run git:feature success-123 complete-flow-test

# Step 2: Make changes
echo "# Feature implementation" > feature.md
git add feature.md
git commit -m "feat(CU-success-123): implement core functionality"
git commit -m "test(CU-success-123): add unit tests"
git push -u origin feature/CU-success-123

# Step 3: Create release branch (in real workflow, you'd do this when ready)
pnpm run git:release

# Step 4: Create PR to staging with valid title
gh pr create --base staging --head release/CU-success-123-complete-flow-test \
  --title "[minor] feat(CU-success-123): complete flow test"

# Approve and merge the PR to staging
gh pr review <PR_NUMBER> --approve
gh pr merge <PR_NUMBER> --squash

# Step 5: Create PR from staging to main
gh pr create --base main --head release/CU-success-123-complete-flow-test \
  --title "[minor] feat(CU-success-123): complete flow test"

# Approve and merge
gh pr review <PR_NUMBER> --approve
gh pr merge <PR_NUMBER> --squash
```

**Expected result**:
- All PRs pass validation checks
- Merges succeed
- Feature branch is automatically cleaned up (if enabled)
- Staging is automatically synced to main (if sync workflow exists)

---

## Troubleshooting

Common issues and their solutions.

### Issue: "command not found: husky"

**Problem**: Husky is not installed or not in PATH.

**Solution**:
```bash
# Reinstall dependencies including husky
pnpm install

# Manually set up husky if needed
pnpm husky install
```

---

### Issue: Pre-push hook not running

**Problem**: Git hooks aren't executing before push.

**Solutions**:

1. Verify hooks are executable:
   ```bash
   ls -la .husky/pre-push
   chmod +x .husky/pre-push
   ```

2. Check if hooks are bypassed:
   ```bash
   # Don't use --no-verify (removes hook enforcement)
   git push origin main --no-verify  # This bypasses hooks!
   ```

3. Reinitialize hooks:
   ```bash
   pnpm husky install
   ```

---

### Issue: SSH authentication fails

**Problem**: "Permission denied (publickey)" during git operations.

**Solutions**:

1. Verify SSH key is set up:
   ```bash
   ssh -T git@github.com
   # Should output: "Hi {username}! You've successfully authenticated..."
   ```

2. Generate SSH key if not present:
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   cat ~/.ssh/id_ed25519.pub  # Copy and add to GitHub SSH keys
   ```

3. Add SSH key to ssh-agent:
   ```bash
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519
   ```

4. Use HTTPS as fallback:
   ```bash
   git clone https://github.com/{owner}/{repo}.git
   git remote set-url origin https://github.com/{owner}/{repo}.git
   ```

---

### Issue: "fatal: not a git repository"

**Problem**: Running setup in wrong directory.

**Solution**:
```bash
# Ensure you're in the repository directory
cd /path/to/repository
pwd  # Verify current directory
git status  # Should work if in correct directory
```

---

### Issue: GitHub Actions workflows not running

**Problem**: Workflow files exist but don't trigger.

**Solutions**:

1. Verify workflow syntax:
   ```bash
   gh workflow view validate-pr-title
   ```

2. Check if workflows are enabled:
   - Go to `Actions` tab in repository
   - Ensure workflows aren't disabled

3. Verify workflow triggers:
   ```bash
   # View workflow file
   cat .github/workflows/validate-pr-title.yml | grep -A 5 "on:"
   ```

4. Check workflow permissions (Step 1 of GitHub Configuration):
   ```bash
   gh api repos/{owner}/{repo}/actions/permissions/workflow
   ```

---

### Issue: Branch protection rules not enforcing

**Problem**: PRs merge without meeting protection requirements.

**Solutions**:

1. Verify rules are set:
   ```bash
   gh api repos/{owner}/{repo}/branches/main/protection
   ```

2. Check status check requirements:
   ```bash
   # Ensure status checks are in the "required" list
   gh api repos/{owner}/{repo}/branches/main/protection | grep -A 10 "required_status_checks"
   ```

3. Verify workflow has correct name in protection rules:
   - Workflow name in `.github/workflows/*.yml` must match exactly
   - Use `jobs:` name as status check name, not workflow name

4. Allow some time after merging:
   - GitHub sometimes takes a moment to update protection status
   - Wait 30 seconds before retrying if unclear

---

### Issue: "Commit message validation failed"

**Problem**: Commits don't follow conventional commits format.

**Expected commit format**:
```
<type>(<scope>): <subject>

# Examples:
feat(CU-123): add user authentication
fix(CU-456): resolve payment bug
docs(general): update README
test(auth): add login tests
```

**Allowed commit types** (from `commitlint.config.js`):
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting, semicolons, etc.
- `refactor` - Code restructuring
- `test` - Test additions/updates
- `chore` - Maintenance tasks
- `release` - Release commits

**Solution**:
```bash
# Fix the commit message
git commit --amend -m "feat(CU-123): correct message"

# Or stage changes and create new commit
git add .
git commit -m "feat(CU-123): valid commit message"
```

---

### Issue: PR merge blocked by stale branch

**Problem**: "This branch is out of date with the base branch"

**Solution**:
```bash
# Update your branch with latest main
git fetch origin
git rebase origin/main

# Or merge main into your branch (creates merge commit)
git merge origin/main

# Push updated branch
git push origin feature/CU-xxx-description
```

---

### Issue: Setup script fails with existing .git

**Problem**: Running setup on repository with existing history.

**Solution**:
```bash
# The script will ask for confirmation to delete .git
# Type 'yes' to proceed with clean setup
# Or preserve existing history:
git remote add origin git@github.com:{owner}/{repo}.git
git push -u origin main
git push -u origin staging
```

---

## Next Steps

Congratulations! Your Release Branch Isolation Strategy is now configured. Here's what to do next:

### For Project Leads / Administrators

1. **Document team workflows**: Create guidelines for your team
   - Release cadence (weekly, bi-weekly, etc.)
   - Branch naming conventions specific to your project
   - Code review expectations

2. **Set up team permissions**:
   - Configure code owners: Create `CODEOWNERS` file
   - Set branch protection "Require review from code owners"
   - Restrict who can approve merges if needed

3. **Enable deployment workflows** (if applicable):
   - Configure deployment environments
   - Set up CI/CD pipelines
   - Test deployment from staging and main

4. **Create onboarding documentation**:
   - Customize this guide for your team
   - Add team-specific examples
   - Document deployment procedures

### For Developers Getting Started

1. **Clone and set up locally**:
   ```bash
   git clone git@github.com:{owner}/{repo}.git
   cd {repo}
   pnpm install
   ```

2. **Create your first feature**:
   ```bash
   pnpm run git:feature {task_id} {description}
   ```
   This command automatically:
   - Fetches from origin
   - Checks out and pulls latest main
   - Creates your feature branch from the updated main

   No need to manually pull main first!

3. **Make commits** (conventional format NOT enforced on feature branches):
   ```bash
   git commit -m "feat(CU-YOUR-TASK-ID): add awesome feature"
   git commit -m "test(CU-YOUR-TASK-ID): add tests"
   ```

4. **Keep in sync with main**:
   ```bash
   pnpm run git:sync  # Regularly merge main into your feature
   ```

5. **When ready for UAT**:
   ```bash
   pnpm run git:release  # Create release branch
   ```

6. **Complete the release cycle**:
   - Create PR to staging
   - Test in staging environment
   - Create PR to main
   - Merge to production

### For All Team Members

- **Read the related documentation**:
  - `README.md` - Project overview
  - `DEVELOPMENT_LIFECYCLE.md` - Detailed workflow steps (if available)
  - `BRANCH_PROTECTION_SETUP.md` - Advanced branch protection details (if available)

- **Understand the branch structure**:
  - `main` - Production (protected, requires PRs and approvals)
  - `staging` - Pre-production UAT (protected, requires PRs)
  - `feature/CU-xxx-description` - Your development branch (local, pushed for PR)
  - `release/CU-xxx-description` - For UAT testing before production
  - `hotfix/CU-xxx-description` - For emergency production fixes

- **Ask questions**:
  - If something isn't clear, ask a team member
  - These workflows are designed to protect quality
  - Understanding the "why" helps you use it effectively

---

## Summary Checklist

Use this checklist to verify all setup steps are complete:

### Local Setup
- [ ] Node.js v16+ installed
- [ ] pnpm v7+ installed
- [ ] GitHub CLI authenticated
- [ ] SSH key configured for GitHub
- [ ] Repository cloned with SSH
- [ ] Dependencies installed (`pnpm install`)
- [ ] Setup script run (`pnpm run git:setup`)
- [ ] Husky hooks active (`ls -la .husky/`)

### GitHub Configuration
- [ ] Workflow permissions set (Settings > Actions > General)
- [ ] Main branch protection configured
- [ ] Staging branch protection configured
- [ ] Merge settings configured
- [ ] Labels created (skip-staging, sync-conflict, urgent)
- [ ] (Optional) Deployment environments configured

### Verification
- [ ] Direct push to main blocked locally
- [ ] Feature PR to main blocked by GitHub
- [ ] PR without semver prefix blocked
- [ ] Invalid branch names blocked
- [ ] Complete release flow passes all checks

### Documentation
- [ ] Team has access to this guide
- [ ] Team understands branch structure
- [ ] Team knows which git commands to use
- [ ] Questions documented and answered

---

## Additional Resources

- [Conventional Commits](https://www.conventionalcommits.org/) - Commit message specification
- [Semantic Versioning](https://semver.org/) - Version numbering scheme
- [GitHub Branch Protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches) - Official documentation
- [Husky Docs](https://typicode.github.io/husky/) - Git hooks framework
- [GitHub Actions](https://github.com/features/actions) - CI/CD automation
- [Git Documentation](https://git-scm.com/doc) - Git reference

---

**Last Updated**: February 2025
**Strategy Version**: 1.0 - Release Branch Isolation
**Compatibility**: Node.js 16+, pnpm 7+, Git 2.30+, GitHub 2.0+
