# Standards Folder

Project-specific standards that Claude reads when performing related work.

## Purpose

Standards files contain actionable guidelines that Claude applies during development.
Unlike general documentation, these are written as instructions Claude can follow.

## Usage

Link standards from FADE.md in the '## Standards' section:

```markdown
## Standards

| Standard | Description |
|----------|-------------|
| [API Security](standards/api-security.md) | Security principles for API development |
| [Git](standards/git.md) | Commit messages and branching conventions |
```

prompt.md instructs Claude to read relevant standards before starting work.

## Creating Custom Standards

1. Create a markdown file in this folder (e.g., `my-standard.md`)
2. Write actionable instructions Claude can apply
3. Keep under 1,500 tokens (~1,100 words) to preserve context window
4. Link from FADE.md '## Standards' section
