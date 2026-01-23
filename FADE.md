<!-- FADE FADE.md v0.3.1 -->

# Project Name

<!-- FADE.md - Project context for AI coding agents. This file is READ-ONLY for agents. -->

---

## Project Overview

<!--
Describe what this project does and its purpose. Include:
- What problem does it solve?
- Who are the users?
- What's the current state (MVP, production, legacy)?
-->

Brief description of this project.

**Tech Stack:**
- Language:
- Framework:
- Database:

**Repository:** [link]

---

## Coding Standards

<!--
Define how code should be written in this project. Link to external style guides
rather than duplicating them. Include project-specific conventions that differ
from or extend the standard guides.
-->

### Style Guides

- **TypeScript:** [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- **Python:** [PEP 8](https://peps.python.org/pep-0008/)
- **API Design:** [JSON:API Specification](https://jsonapi.org/)

### Project Conventions

- Naming: `camelCase` for variables, `PascalCase` for components
- Tests: Co-locate with source files as `*.test.ts`
- Commits: Conventional commits format (`feat:`, `fix:`, `chore:`)

---

## Standards

<!--
Link to detailed standards documents. These are loaded by Claude when working
on relevant tasks. Add your own project-specific standards as needed.
-->

| Standard | Description |
|----------|-------------|
| [API Security](standards/api-security.md) | Authentication, authorization, input validation, secure error handling |
| [Git](standards/git.md) | Commit messages, branch naming, FADE-specific conventions |
| [Coding](standards/coding.md) | Naming, formatting, error handling, code organization |
| [Testing](standards/testing.md) | Test pyramid, AAA pattern, mocking, coverage requirements |
| [Documentation](standards/documentation.md) | README structure, API docs, code comments, what NOT to document |

---

## Architecture References

<!--
Document the high-level architecture and link to detailed design docs.
Include diagrams, ADRs (Architecture Decision Records), or external references.
This helps agents understand where new code should go and how components interact.
-->

### System Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   API       │────▶│  Database   │
│   (React)   │     │  (Express)  │     │  (Postgres) │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Key Documents

| Document | Location | Description |
|----------|----------|-------------|
| API Design | `docs/api.md` | REST endpoint specifications |
| Data Model | `docs/schema.md` | Database schema and relationships |
| Auth Flow | `docs/auth.md` | Authentication and authorization |

---

## Target Architecture

<!--
Where we're heading. Bias toward these patterns in all work, even when
the current PRD doesn't directly address them. Remove items when achieved.
-->

- Example: Stateless JWT auth (moving away from sessions)
- Example: All writes through service layer (no direct DB in routes)
- Example: Config-driven values (no hardcoding)

---

## Fragile Areas

<!--
Known problem spots. Exercise extra caution here - smaller commits, more
verification, ask before major refactoring. Remove when cleaned up.
-->

| Area | Why it's fragile |
|------|------------------|
| `example/path/` | Example: Changes cascade unpredictably |
| `another/module.py` | Example: Looks simple, always takes 5x longer |

---

## Off-Limits Modules

<!--
List modules, files, or directories that agents should NOT modify.
Common reasons: legacy code pending rewrite, external vendor code,
security-sensitive modules requiring human review, or code with
complex implicit dependencies.

Note: For areas that are risky but not forbidden, see **Fragile Areas** above.
-->

| Path | Reason | Contact |
|------|--------|---------|
| `src/legacy/` | Legacy code scheduled for rewrite in Q2 | @backend-team |
| `src/auth/crypto.ts` | Security-critical, requires human review | @security |
| `vendor/` | Third-party code, do not modify | n/a |

**If you need to modify an off-limits module:** Stop and ask the human for guidance.

---

## Session Boundaries

<!--
Define constraints for AI coding sessions. This helps agents understand
what they can and cannot do, and when to ask for human input.
-->

### Allowed Actions

- Create, modify, delete files in `src/`, `tests/`, `docs/`
- Run tests and linters
- Install dev dependencies
- Create feature branches

### Requires Human Approval

- Changes to CI/CD configuration (`.github/`, `Dockerfile`)
- Database migrations
- Changes to authentication or authorization logic
- Dependency upgrades (major versions)
- Deleting more than 5 files in one session

### Never Do

- Push directly to `main` or `master`
- Modify `.env` files or commit secrets
- Run destructive database commands in production
- Disable security features or linters

---

## System Context

<!--
Provide awareness of where this work fits in the broader project landscape.
This helps agents understand sequencing, dependencies, and what else is happening.
-->

### Current Challenges

<!--
What problems or constraints is the team currently dealing with?
Examples: technical debt, scaling issues, team transitions, deadline pressure
-->

- Challenge 1: description
- Challenge 2: description

### Transition Plan

<!--
If the project is undergoing a migration, refactor, or multi-phase initiative,
document the phases here. Use status indicators:
  - Link to doc (if detailed plan exists elsewhere)
  - NOT WRITTEN (planned but not documented)
  - ✅ COMPLETE (done)
  - ← CURRENT (active phase)
-->

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Description | ✅ COMPLETE |
| Phase 2 | Description | ← CURRENT |
| Phase 3 | Description | NOT WRITTEN |

### Active Work Items

<!--
What else is in flight? This helps agents avoid conflicts and understand priorities.
Include different work types: features, bugs, chores, spikes
Format: [TYPE] Brief description - Owner/Status
-->

- [FEATURE] Example feature being built - @developer / in progress
- [BUG] Example bug being investigated - @developer / blocked
- [CHORE] Example operational task - unassigned
- [SPIKE] Example research/investigation - @developer / complete

---

## Development Environment

### Local Development

- How to run locally
- Required environment variables
- Test commands

### Production/Deployment

- Deployment process
- Production environment details

---

## Additional Context

<!--
Add any other information that helps agents work effectively:
- Known gotchas or quirks
- Recent major changes
- Upcoming planned changes that affect current work
-->
