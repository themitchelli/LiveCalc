# Skip: US-002 AC-03 - Watch pattern includes: **/*.mga, **/*.csv, **/*.json in workspace

## Acceptance Criterion
Watch pattern includes: **/*.mga, **/*.csv, **/*.json in workspace

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires FileSystemWatcher with glob patterns
- Requires workspace scope verification
- Requires pattern matching verification

## Verification Method
This criterion should be verified via:
1. VS Code extension integration tests
2. Code review of file-watcher.ts pattern definitions
