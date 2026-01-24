# PRDs Folder

Place your PRD files here using the naming convention:

```
{TYPE}-{NUMBER}-{slug}.json
```

## Examples

- `FEAT-001-user-authentication.json`
- `BUG-002-login-timeout.json`
- `CHORE-003-upgrade-dependencies.json`
- `ENH-004-improve-performance.json`
- `SPIKE-005-evaluate-caching.json`

## Selection Order

FADE picks the lowest-numbered PRD with incomplete stories.
Priority: fade/prd.json (if exists) → fade/prds/ folder (by number)
