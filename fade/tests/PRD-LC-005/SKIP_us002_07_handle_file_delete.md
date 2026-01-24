# Skip: US-002 AC-07 - Handle file delete gracefully (show error, don't crash)

## Acceptance Criterion
Handle file delete gracefully (show error, don't crash)

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires FileSystemWatcher onDidDelete event handling
- Requires extension error handling and user notification
- Requires crash-resilience verification

## Verification Method
This criterion should be verified via:
1. VS Code extension integration tests
2. Manual testing: delete a critical file while extension is running
