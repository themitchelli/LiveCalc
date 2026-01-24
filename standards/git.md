# Git Standards

## Commit Message Format

### Conventional Commits

Use the **Conventional Commits** format for all commit messages:

```
<type>: <description>

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `chore`: Maintenance (dependency updates, build config)
- `docs`: Documentation only
- `test`: Adding or updating tests
- `refactor`: Code restructuring (no behavior change)
- `perf`: Performance improvement
- `style`: Formatting changes (whitespace, semicolons)

**Examples**:

```
feat: add remote step-through debugging API (PRD-LC-012 US-API-04)

Implements WebSocket-based binary memory streaming for remote debugging.
Allows VS Code to pause cloud workers and inspect SharedArrayBuffer state.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

```
fix: prevent race condition in SAB offset allocation (PRD-LC-010 US-002)

Memory manager was not thread-safe during concurrent allocations.
Added mutex to protect offset calculation and assignment.
```

```
chore: upgrade TypeScript to 5.3.2

Security patch for CVE-2023-XXXX.
```

```
docs: update FADE.md with architecture diagram

Added system overview showing VS Code → WASM → Workers interaction.
```

### Commit Atomicity

**One logical change per commit.** If you can't describe it in one sentence, split it.

```bash
# Bad: Multiple unrelated changes
git commit -m "Fix bug, add feature, update docs, refactor tests"

# Good: Separate commits
git commit -m "fix: handle null policy data in projection"
git commit -m "feat: add anomaly detection to results panel"
git commit -m "docs: update README with deployment instructions"
git commit -m "refactor: extract NPV calculation to pure function"
```

### Reference PRDs

Include PRD ID and User Story when applicable:

```
feat: implement declarative pipeline schema (PRD-LC-010 US-001)

- Add pipeline.nodes array to config schema
- Validate DAG for circular dependencies
- Support bus:// protocol for shared memory resources
```

---

## Branch Naming

### Naming Convention

```
<type>/<identifier>-<short-description>
```

**Types**:
- `feature/` - New feature development
- `fix/` - Bug fixes
- `spike/` - Exploratory work
- `chore/` - Maintenance tasks
- `docs/` - Documentation updates

**Examples**:

```
feature/PRD-LC-012-cloud-runtime-bridge
fix/sab-alignment-issue
spike/pyodide-performance-evaluation
chore/upgrade-dependencies
docs/add-architecture-diagram
```

### Branch Lifecycle

```bash
# 1. Create feature branch from main
git checkout main
git pull origin main
git checkout -b feature/PRD-LC-012-api-bridge

# 2. Develop and commit
git add .
git commit -m "feat: implement model upload endpoint"

# 3. Push to origin
git push -u origin feature/PRD-LC-012-api-bridge

# 4. Create Pull Request (GitHub UI)

# 5. Merge after review/tests pass
# (via GitHub UI or command line)

# 6. Delete branch after merge
git checkout main
git pull
git branch -d feature/PRD-LC-012-api-bridge
git push origin --delete feature/PRD-LC-012-api-bridge
```

---

## Pull Requests

### PR Title

**Reference PRD ID if applicable:**

```
✅ feat: Cloud Runtime Bridge (PRD-LC-012 US-API-00)
✅ fix: Prevent SAB alignment errors
✅ chore: Upgrade to TypeScript 5.3.2

❌ Update code
❌ Fixes
❌ WIP
```

### PR Description

**Template**:

```markdown
## Summary
Brief description of changes and rationale.

## Changes
- Added X
- Modified Y
- Removed Z

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Benchmarks validated (if applicable)

## PRD Reference
PRD-LC-XXX User Story YY

## Checklist
- [ ] Code follows style guide
- [ ] Documentation updated
- [ ] Tests pass locally
- [ ] No breaking changes (or documented)
```

### PR Size

**Keep PRs small and focused.** Aim for < 400 lines changed.

```bash
# Good: Small, focused PR
feature/add-pagination
  api/routes.py         +40 -10
  api/schemas.py        +15 -0
  tests/test_routes.py  +25 -0
  Total: ~80 lines

# Bad: Massive PR (hard to review)
feature/everything
  (47 files changed, +2,847 −1,203)
```

**If a PR is too large**, split into multiple PRs:

1. Refactor/prep work (PR #1)
2. Core feature (PR #2)
3. Documentation/polish (PR #3)

---

## FADE-Specific Conventions

### Co-Authored Commits

When AI agents (Claude, other AIs) contribute significantly to a commit:

```
feat: complete PRD-LC-010 - Modular Orchestration Layer

Implemented bus:// protocol, SAB memory manager, and pipeline orchestrator.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### PRD Completion Commits

When a PRD is fully implemented:

```
feat: complete PRD-LC-010 - Modular Orchestration Layer (PRD-LC-010)

All 9 user stories pass acceptance criteria:
- US-001: Declarative pipeline schema ✓
- US-002: SAB memory offset manager ✓
- US-003: Atomic signal handoff ✓
- US-004: Pipeline error handling ✓
- US-005: Debug pipeline visualization ✓
- US-006: Debug intermediate data inspection ✓
- US-007: Debug bus integrity & culprit ID ✓
- US-008: Debug breakpoints ✓
- US-009: Debug timing profiler ✓

Benchmarks maintained: 1B projections in 36s.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Never Commit to Main Directly

**Except**: Initial repository setup.

All work goes through feature branches and PRs.

```bash
# This is blocked by branch protection
git checkout main
git commit -m "Quick fix"  # ❌ Rejected

# Correct workflow
git checkout -b fix/quick-issue
git commit -m "fix: ..."
git push origin fix/quick-issue
# Create PR, get approval, merge
```

---

## What to Commit

### Do Commit

- Source code (`.ts`, `.py`, `.cpp`, `.h`)
- Configuration (`.json`, `.yaml`, `.toml`)
- Infrastructure as code (`*.tf`, `helm/`)
- Documentation (`.md`, `docs/`)
- Build scripts (`package.json`, `CMakeLists.txt`, `Dockerfile`)
- Tests (`*.test.ts`, `*_test.py`)
- Schemas (JSON Schema, OpenAPI specs)

### Don't Commit

- **Secrets** (`.env`, `credentials.json`, private keys)
- **Generated files** (`dist/`, `build/`, `*.wasm`, `node_modules/`)
- **IDE config** (`.vscode/`, `.idea/`, `*.swp`)
- **OS files** (`.DS_Store`, `Thumbs.db`)
- **Binary artifacts** (unless absolutely necessary)
- **Large files** (> 1MB without good reason)

### `.gitignore`

```gitignore
# Dependencies
node_modules/
__pycache__/
*.pyc

# Build outputs
dist/
build/
*.wasm
*.js.map

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
*.pem
*.key

# Logs
*.log
npm-debug.log*

# Test coverage
coverage/
.nyc_output/
```

---

## Commit Workflow

### Before Committing

```bash
# 1. Check what changed
git status
git diff

# 2. Review your changes
git diff HEAD

# 3. Stage relevant changes
git add src/specific-file.ts
# Or stage all (be careful!)
git add .

# 4. Review staged changes
git diff --staged

# 5. Commit with message
git commit -m "feat: add feature description"

# 6. Push to remote
git push origin feature/branch-name
```

### Amending Commits

**Only amend unpushed commits:**

```bash
# Forgot to add a file
git add forgotten-file.ts
git commit --amend --no-edit

# Fix commit message (not yet pushed)
git commit --amend -m "feat: better description"

# ⚠️ Never amend pushed commits (rewrites history)
```

### Interactive Rebase

**Clean up commit history before merging (optional):**

```bash
# Squash multiple commits into one
git rebase -i HEAD~3

# In editor, change 'pick' to 'squash' for commits to combine
pick abc1234 feat: add endpoint
squash def5678 fix: typo
squash ghi9012 fix: another typo

# Result: One clean commit
# feat: add endpoint
```

**Only rebase unpushed commits** or feature branches (not `main`).

---

## Merge Strategies

### Squash and Merge (Preferred)

Keeps `main` history clean:

```bash
# Feature branch has many commits
feature/add-api:
  - WIP: start API
  - Add endpoint
  - Fix typo
  - Fix another typo
  - Add tests

# After squash merge to main:
main:
  - feat: add job submission API (PRD-LC-012 US-API-01)
```

**How**: Use GitHub "Squash and merge" button, or:

```bash
git checkout main
git merge --squash feature/add-api
git commit -m "feat: add job submission API (PRD-LC-012 US-API-01)"
```

### Merge Commit (Alternative)

Preserves feature branch history:

```bash
git checkout main
git merge --no-ff feature/add-api
# Creates merge commit referencing all feature commits
```

**Use when**: Feature branch has meaningful intermediate commits worth preserving.

### Rebase and Merge (Not Recommended)

Rewrites feature branch commits onto `main`. Loses merge context.

---

## Tags and Releases

### Semantic Versioning

Tag releases with semantic version:

```bash
# Tag a release
git tag -a v1.2.3 -m "Release 1.2.3: Add anomaly detection"
git push origin v1.2.3

# List tags
git tag

# Delete tag (if mistake)
git tag -d v1.2.3
git push origin --delete v1.2.3
```

**Versioning rules**:
- `v1.0.0` → `v2.0.0`: Breaking changes
- `v1.0.0` → `v1.1.0`: New features (backward compatible)
- `v1.0.0` → `v1.0.1`: Bug fixes only

### Release Notes

Create GitHub release with notes:

```markdown
## v1.2.3 - 2026-01-24

### Added
- Anomaly detection with 3-sigma outlier flagging (PRD-LC-012 US-API-03)
- Remote step-through debugging API (PRD-LC-012 US-API-04)

### Fixed
- Race condition in SAB memory allocation (PRD-LC-010 US-002)

### Changed
- Upgraded TypeScript to 5.3.2 for security patch

### Performance
- Maintained 1B projections in 36s benchmark
```

---

## Git Hygiene

### Sync with Remote Regularly

```bash
# Before starting work
git checkout main
git pull origin main

# During work (to get others' changes)
git checkout main
git pull
git checkout feature/my-branch
git merge main  # Or rebase: git rebase main
```

### Clean Up Old Branches

```bash
# List merged branches
git branch --merged main

# Delete local merged branches
git branch -d old-feature-branch

# Delete remote branches
git push origin --delete old-feature-branch

# Prune deleted remote branches
git fetch --prune
```

### Keep Commits Focused

```bash
# Bad: One commit with everything
git add .
git commit -m "Lots of changes"

# Good: Separate logical changes
git add src/api.ts
git commit -m "feat: add job submission endpoint"

git add src/validation.ts
git commit -m "feat: add input validation"

git add tests/
git commit -m "test: add API endpoint tests"
```

---

## Common Workflows

### Starting a New Feature

```bash
git checkout main
git pull origin main
git checkout -b feature/PRD-LC-XXX-description
# ... make changes ...
git add .
git commit -m "feat: description"
git push -u origin feature/PRD-LC-XXX-description
# Create PR on GitHub
```

### Fixing a Bug

```bash
git checkout main
git pull origin main
git checkout -b fix/bug-description
# ... make fix ...
git add .
git commit -m "fix: description of bug fix"
git push -u origin fix/bug-description
# Create PR on GitHub
```

### Updating Branch with Latest Main

```bash
git checkout feature/my-branch
git fetch origin
git merge origin/main
# Or: git rebase origin/main
```

### Undoing Changes

```bash
# Undo unstaged changes
git checkout -- file.ts

# Undo staged changes
git reset HEAD file.ts

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes) ⚠️
git reset --hard HEAD~1
```

---

## Git Configuration

### Initial Setup

```bash
# Set identity
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Default editor
git config --global core.editor "code --wait"

# Default branch name
git config --global init.defaultBranch main

# Helpful aliases
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.st status
git config --global alias.unstage 'reset HEAD --'
git config --global alias.last 'log -1 HEAD'
```

---

## References

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Git Best Practices](https://git-scm.com/book/en/v2/Distributed-Git-Contributing-to-a-Project)
- [GitHub Flow](https://guides.github.com/introduction/flow/)
