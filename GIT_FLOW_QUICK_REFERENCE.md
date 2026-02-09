# Git Strategy Quick Reference

Quick guide for the Release Branch Isolation workflow.

---

## Initial Setup (One-Time)

**Prerequisites:** Node.js 16+, pnpm, git, gh CLI (authenticated), SSH key configured

### Joining an Existing Project
```bash
git clone git@github.com:{owner}/{repo}.git
cd {repo}
pnpm install                      # Installs dependencies + husky hooks
```
You're ready to start working. Skip to [Complete Workflow](#complete-workflow).

### Creating a New Project (Admin)

**Step 1:** Copy from a configured repo:
- `.husky/`, `.github/workflows/`, `commitlint.config.js`, `.gitignore`

**Step 2:** Run setup:
```bash
cd {your-project}
bash .husky/scripts/setup-git.sh   # Creates main + staging branches
pnpm run git:setup-rulesets        # Configure GitHub protections
```

---

## Command Cheat Sheet

| Command | Purpose | Usage |
|---------|---------|-------|
| `pnpm run git:feature <id> <desc>` | Create feature branch | `git:feature doc1 workflow-docs` |
| `pnpm run git:sync` | Sync feature with main | Run from feature branch |
| `pnpm run git:release` | Create release branch | Run from feature branch |
| `pnpm run git:sync-feature` | Sync release with feature updates | Run from release branch |
| `pnpm run git:to-staging` | Create PR to staging | Run from release/hotfix branch |
| `pnpm run git:merge-staging <PR>` | Merge PR to staging (merge commit) | `git:merge-staging 42` |
| `pnpm run git:ship <bump>` | Create PR to main | `git:ship minor` |
| `pnpm run git:merge-main <PR>` | Merge PR to main (squash) | `git:merge-main 43` |
| `pnpm run git:hotfix <id> <desc>` | Create hotfix from main | `git:hotfix def456 fix-crash` |
| `pnpm run git:status` | Show branch status | Run anytime |

**Parameters:**
- `<id>`: ClickUp task ID (without CU- prefix; automatically added)
- `<desc>`: Description in kebab-case
- `<bump>`: One of `major`, `minor`, or `patch`

---

## Workflow Diagram

```
    ┌─────────────┐
    │    main     │ ◄── Production (squash merge only)
    └──────┬──────┘
           │ branch from
           ▼
    ┌─────────────┐
    │  feature/*  │ ◄── Your development work
    └──────┬──────┘
           │ git:release
           ▼
    ┌─────────────┐
    │  release/*  │ ◄── Ready for testing
    └──────┬──────┘
           │ PR (git:to-staging → git:merge-staging)
           ▼
    ┌─────────────┐
    │   staging   │ ◄── UAT environment (merge commit only)
    └─────────────┘
           │
           │ After UAT approval:
           │ PR (git:ship → git:merge-main)
           ▼
    ┌─────────────┐
    │    main     │ ◄── Auto-syncs back to staging
    └─────────────┘
```

**Hotfix:** `main` → `hotfix/*` → PR to `staging` (optional) → PR to `main`

---

## Complete Workflow

### Feature → Production (Step-by-Step)

**1. Start feature:**
```bash
pnpm run git:feature abc123 user-login
# Creates: feature/CU-abc123-user-login
```

**2. Develop (repeat as needed):**
```bash
git add .
git commit -m "feat: add login form"
git push origin feature/CU-abc123-user-login
```

**3. Stay in sync with main (do regularly):**
```bash
pnpm run git:sync
```

**4. Ready for UAT - create release:**
```bash
pnpm run git:release
# Creates: release/CU-abc123-user-login
```

**5. Create PR to staging:**
```bash
pnpm run git:to-staging
# Output shows PR URL and number (e.g., #42)
```

**6. After PR is approved, merge to staging:**
```bash
pnpm run git:merge-staging 42
```

**7. UAT testing happens...**

**8. UAT approved - create PR to main:**
```bash
pnpm run git:ship minor
# Output shows PR URL and number (e.g., #43)
```

**9. After PR is approved, merge to main:**
```bash
pnpm run git:merge-main 43
# Done! Branch auto-deleted, staging auto-synced
```

---

### UAT Bug Fix Cycle

When UAT finds bugs after merging to staging:

```bash
# 1. Go back to feature branch (NOT release)
git checkout feature/CU-abc123-user-login

# 2. Fix bugs
git add .
git commit -m "fix: resolve login validation"
git push origin feature/CU-abc123-user-login

# 3. Go to release branch
git checkout release/CU-abc123-user-login

# 4. Pull fixes from feature into release
pnpm run git:sync-feature

# 5. Push updated release (auto-updates the existing staging PR)
git push origin release/CU-abc123-user-login

# 6. Re-merge to staging after PR approval
pnpm run git:merge-staging 42

# 7. Repeat until UAT passes, then continue to step 8 above
```

**Key rule:** Never commit directly on release branches. Always fix on feature, then sync.

---

### Sync with Main

Run `pnpm run git:sync` from feature branch:
- Daily during active development
- Before creating release branch
- After teammates merge to main

This prevents large merge conflicts later.

---

## Hotfix Flow (Urgent Fixes)

```bash
# 1. Create hotfix from main
pnpm run git:hotfix def456 fix-crash
# Creates: hotfix/CU-def456-fix-crash

# 2. Fix and commit
git add .
git commit -m "fix(CU-def456): critical payment validation"
git push origin hotfix/CU-def456-fix-crash

# 3. (Optional) Quick UAT
pnpm run git:to-staging              # Creates PR #44
pnpm run git:merge-staging 44        # Merge to staging

# 4. Ship to main
pnpm run git:ship patch              # Creates PR #45
pnpm run git:merge-main 45           # Done!
```

---

## Merging PRs (Critical!)

**Always use the merge scripts** to ensure correct merge method:

```bash
# Staging PRs - merge commit (allows PR updates)
pnpm run git:merge-staging <PR_NUMBER>

# Main PRs - squash (clean history)
pnpm run git:merge-main <PR_NUMBER>
```

**Alternative via GitHub UI:**
- Staging: Select "Create a merge commit"
- Main: Select "Squash and merge"

**Alternative via gh CLI:**
```bash
gh pr merge <PR_NUMBER> --merge    # For staging
gh pr merge <PR_NUMBER> --squash   # For main
```

**Why this matters:** Squashing to staging causes conflicts when you try to update the PR with additional commits.

**After merging to main:** Do NOT manually sync staging. The `sync-staging` workflow handles this automatically.

---

## Resolving Merge Conflicts

Conflicts happen during `git:sync` or `git:release` when the same lines were changed in both branches.

### Step-by-Step Resolution

**1. See which files have conflicts:**
```bash
git status
# Shows: "both modified: src/app.js"
```

**2. Open each conflicted file and find the markers:**
```
<<<<<<< HEAD
  your changes
=======
  incoming changes from main
>>>>>>> origin/main
```

**3. Edit the file to keep what you want:**
- Keep your version, their version, or combine both
- Delete all conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)

**4. Mark as resolved and complete the merge:**
```bash
git add src/app.js           # Stage the resolved file
git commit                   # Complete merge (uses auto-generated message)
git push origin <branch>     # Push the resolved merge
```

### Common Conflict Scenarios

**During `git:sync` (main → feature):**
```bash
git status                   # See conflicted files
# Edit and resolve each file
git add .
git commit                   # Complete the merge
# Now continue with git:release
```

**During `git:release` (creating release from feature):**
```bash
git status                   # See conflicted files
# Edit and resolve each file
git add .
git commit
# Release branch now has your resolved changes
```

**During PR merge to staging (release → staging):**

Conflicts here must be resolved ON STAGING, not on release:
```bash
git checkout staging
git pull origin staging
git merge release/CU-xxx-description --no-ff
# Conflict! Resolve in staging
git status
# Edit and resolve each file
git add .
git commit
git push origin staging
```

Why on staging? The release branch should stay clean for the eventual PR to main.

### Abort If Needed

```bash
git merge --abort            # Cancel the merge, go back to before
```

### Prevention Tips

- Run `pnpm run git:sync` frequently (daily)
- Communicate with team about overlapping file changes
- Keep changes small and focused

---

## Branch Naming & Commit Format

### Branch Names
```
feature/CU-{task_id}-{description}
release/CU-{task_id}-{description}
hotfix/CU-{task_id}-{description}
```

### Commit Messages

**Required on:** `main`, `release/*`, `hotfix/*` branches
**NOT enforced on:** `feature/*` branches

**Format:**
```
<type>(<scope>): <subject>
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `release`

**Examples:**
```
feat(CU-abc123): add user login functionality
fix(CU-def456): resolve null pointer in auth module
```

### PR Titles (for PRs to main)

Must start with version bump:
```
[major] Breaking change title
[minor] New feature title
[patch] Bug fix title
```

---

## Quick Troubleshooting

**"You have uncommitted changes"**
```bash
git add .
git commit -m "chore: save work"
# Then retry the command
```

**Check branch status anytime**
```bash
pnpm run git:status
```

**Wrong branch? (before pushing)**
```bash
git reset --soft HEAD~1      # Undo last commit, keep changes
git checkout <correct-branch>
git commit -m "message"
```

**Local Cleanup (After PR Merged):**
```bash
git checkout main && git pull
git branch -d feature/CU-xxx-desc
git branch -d release/CU-xxx-desc
```

---

## Automatic GitHub Actions

When a PR is merged to `main`:
1. **Auto-tag:** Creates version tag (e.g., `v1.2.3`)
2. **Auto-delete:** Removes source branch (release/hotfix)
3. **Auto-sync:** Syncs `main` → `staging`

---

## Branch Rules Summary

| Branch | Purpose | Merge Method |
|--------|---------|--------------|
| `main` | Production | **Squash only** |
| `staging` | UAT testing | **Merge commit only** |
| `feature/*` | Development | N/A |
| `release/*` | UAT/Release | N/A |
| `hotfix/*` | Urgent fixes | N/A |

---

**Last Updated:** February 2026
