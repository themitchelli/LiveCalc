# Discoveries Folder

Discovery documents from `fade discover` sessions.

## Purpose

Discovery docs capture implementation decisions BEFORE writing a PRD.
They help surface edge cases, constraints, and technical choices early.

## Workflow

1. Run `fade discover "feature name"` for interactive exploration
2. Session output saved to `{slug}.md` in this folder
3. Reference when writing the PRD in `fade/prds/`
4. Optionally link from PRD via `"discoveryDoc": "discoveries/{slug}.md"`

## Format

Each discovery doc contains:
- **Summary**: What was discussed
- **Decisions**: Technical choices made
- **Open Questions**: Items needing resolution
- **Suggested Stories**: Potential user stories for PRD
