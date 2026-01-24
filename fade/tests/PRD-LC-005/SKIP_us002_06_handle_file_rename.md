# Skip: US-002 AC-06 - Handle file rename gracefully (treat as delete + create)

## Acceptance Criterion
Handle file rename gracefully (treat as delete + create)

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires FileSystemWatcher onDidDelete and onDidCreate events
- Requires file rename operation within watched directory
- Requires event handling verification

## Verification Method
This criterion should be verified via:
1. VS Code extension integration tests
2. Manual testing: rename a watched file, verify auto-run triggers
