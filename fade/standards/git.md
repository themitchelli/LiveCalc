# Git Standard

Guidelines for commits, branches, and version control. Apply these when working with git.

---

## Commit Message Format

Use conventional commits: `<type>: <description>`

```
feat: add user authentication endpoint
fix: handle null values in order calculation
docs: update API reference for new endpoints
```

### Type Prefixes

| Type | When to Use |
|------|-------------|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `chore:` | Maintenance, dependencies, config |
| `refactor:` | Code restructure, no behavior change |
| `test:` | Adding or updating tests |
| `spike:` | Exploratory work (spike branches only) |

### Writing Good Messages

**Do:**
- Start with lowercase after the colon
- Use imperative mood ("add feature" not "added feature")
- Keep first line under 72 characters
- Explain what and why, not how

**Don't:**
- Include ticket numbers in the subject (use body if needed)
- Use vague messages like "fix bug" or "update code"
- Combine unrelated changes in one commit

```bash
# Good
feat: add rate limiting to auth endpoints
fix: prevent duplicate order submissions
refactor: extract validation logic into middleware

# Bad
feat: Added new stuff
fix: bug fix
chore: updates
```

---

## Branch Strategy

### Trunk-Based Development (Default)

Work directly on `main` or short-lived feature branches.

**Apply:**
- Keep branches short-lived (hours to days, not weeks)
- Merge frequently to avoid drift
- Use feature flags for incomplete features in main
- Delete branches after merging

### Feature Branches

For larger work that can't be completed quickly:

```bash
# Naming convention
feature/add-user-auth
bugfix/order-calculation-null
chore/upgrade-dependencies
```

**Branch naming:**
- Use kebab-case (lowercase, hyphens)
- Prefix with type: `feature/`, `bugfix/`, `chore/`, `spike/`
- Keep names descriptive but concise

---

## FADE-Specific Conventions

### Story Completion Commits

When completing a FADE user story:

```bash
git add -A && git commit -m "feat: complete US-XXX - Story Title"
```

Use the appropriate type based on the work:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation PRDs
- `chore:` for maintenance PRDs

### PRD Checkpoint Commits

After each story completion:
1. Stage all changes: `git add -A`
2. Commit with story reference: `feat: complete US-001 - Add login page`
3. Include the story ID and title for traceability

### Spike Branches

Spikes are exploratory work that stays isolated:

```bash
# Create spike branch
git checkout -b spike/investigate-caching-options

# All spike work stays here
spike: add caching prototype
spike: test Redis vs Memcached performance

# Do NOT merge to main
# Create outputArtifact documenting findings
```

**Spike rules:**
- Always create a dedicated branch
- Use `spike:` prefix for all commits
- Never merge spike branches to main
- Document findings in the spike's outputArtifact

---

## Commit Hygiene

### Atomic Commits

Each commit should be a single logical change.

```bash
# Good - separate concerns
git commit -m "feat: add User model"
git commit -m "feat: add user registration endpoint"
git commit -m "test: add user registration tests"

# Bad - multiple unrelated changes
git commit -m "add user stuff and fix order bug and update docs"
```

### What to Commit

**Always commit:**
- Source code changes
- Test files
- Documentation updates
- Configuration changes

**Never commit:**
- `.env` files or secrets
- Build artifacts (`dist/`, `node_modules/`)
- IDE settings (unless shared)
- Temporary files

### Before Pushing

1. Run tests locally
2. Check for unintended files: `git status`
3. Review changes: `git diff --staged`
4. Ensure commit messages are clear

---

## Protected Branches

### Never Do

- Force push to `main` or `master`
- Push directly to protected branches (use PRs)
- Rewrite history on shared branches

### Main Branch Rules

- All changes via pull request
- Tests must pass before merge
- At least one approval required (if configured)
- Squash or rebase merges preferred

---

## Quick Reference

| Task | Command |
|------|---------|
| Stage all | `git add -A` |
| Commit | `git commit -m "type: message"` |
| Create branch | `git checkout -b type/name` |
| Switch branch | `git checkout branch-name` |
| Delete branch | `git branch -d branch-name` |
| View history | `git log --oneline -10` |

---

## When to Read This Standard

Read this document when:
- Making commits to the repository
- Creating or managing branches
- Completing FADE user stories
- Working on spike PRDs
