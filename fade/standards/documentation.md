# Documentation Standard

Guidelines for what to document and how. Apply these to avoid under or over-documenting.

---

## Documentation Philosophy

Document the **why**, not the **what**. Code shows what happens; documentation explains why it exists and how to use it.

**Golden rule:** If someone needs information that isn't in the code itself, document it. If the code already tells the story, don't repeat it in prose.

---

## Documentation Layers

Different audiences need different docs:

| Layer | Audience | Location | Updates |
|-------|----------|----------|---------|
| README | New contributors | Repo root | When setup changes |
| API docs | Consumers | `/docs/api/` or inline | When API changes |
| ADRs | Future maintainers | `/docs/adr/` | When decisions made |
| Code comments | Developers | In source | With code changes |
| FADE files | AI agents | `/fade/` | Per session |

---

## README Structure

Every README should answer these questions, in this order:

1. **What** - One paragraph explaining what this project does
2. **Quick start** - Get running in under 5 minutes
3. **Prerequisites** - Required tools and versions
4. **Installation** - Step-by-step setup
5. **Usage** - Common commands or API examples
6. **Configuration** - Environment variables, options

**Keep it short.** Link to detailed docs rather than embedding everything.

```markdown
# Project Name

Brief description (1-2 sentences).

## Quick Start

\`\`\`bash
npm install
npm start
\`\`\`

## Prerequisites

- Node.js 18+
- PostgreSQL 14+

## Configuration

See [Configuration Guide](docs/config.md) for all options.
```

---

## API Documentation

Document public APIs with:

- **Endpoint** - HTTP method and path
- **Parameters** - Required and optional, with types
- **Response** - Success and error shapes
- **Example** - Working request/response

```markdown
## POST /users

Create a new user.

**Request:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User email |
| name | string | No | Display name |

**Response (201):**
\`\`\`json
{ "id": "usr_123", "email": "user@example.com" }
\`\`\`

**Errors:** 400 (validation), 409 (duplicate email)
```

---

## Architecture Decision Records (ADRs)

Use ADRs to capture **why** major decisions were made.

### ADR Template

```markdown
# ADR-001: Use PostgreSQL for primary database

## Status
Accepted (2024-01-15)

## Context
We need a database for user data and transactions.

## Decision
Use PostgreSQL.

## Rationale
- ACID compliance for financial data
- Team expertise
- JSON support for flexible schemas

## Consequences
- Need to manage connection pooling
- Migrations required for schema changes
```

### When to Write an ADR

- Choosing a technology or framework
- Architectural patterns (monolith vs microservices)
- Security model decisions
- Breaking changes to public APIs

---

## Code Comments

See [Coding Standard](coding.md) for detailed comment guidelines.

**Quick rules:**
- Comment **why**, not what
- Link to tickets for workarounds
- Delete commented-out code
- Public APIs need docstrings

---

## FADE-Specific Documentation

### progress.md
- Append after each story completes
- Include: summary, files changed, test status
- Use format from prompt.md

### learned.md
- Only add reusable discoveries
- Must be non-obvious and actionable
- Skip story-specific implementation details

### FADE.md (human-maintained)
- Keep current with project changes
- Update off-limits modules as code evolves
- Review quarterly

---

## What NOT to Document

Avoid creating documentation that:

| Anti-pattern | Why It's Bad | Instead |
|--------------|--------------|---------|
| Restating code | Drifts out of sync | Write clearer code |
| Implementation details | Changes frequently | Document interfaces |
| Obvious setup | Wastes reader time | Assume basic skills |
| Giant walls of text | Nobody reads them | Use bullet points |
| Every function | Maintenance burden | Document public APIs |

**Specifically, do NOT:**
- Add docstrings to private/internal functions
- Document self-explanatory code
- Create README sections for obvious things
- Write tutorials for standard tools
- Duplicate information across files

---

## Quick Reference

| Doc Type | When to Write | Keep Updated |
|----------|---------------|--------------|
| README | Project creation | On setup changes |
| API docs | New/changed endpoints | With API changes |
| ADRs | Major decisions | Never (immutable) |
| Code comments | Complex/non-obvious code | With code changes |
| progress.md | After each story | Each session |
| learned.md | New discoveries | When learned |

---

## When to Read This Standard

Read this document when:
- Creating a new project or module
- Writing or updating documentation
- Reviewing PRs with doc changes
- Deciding whether something needs documenting
- Cleaning up existing documentation
