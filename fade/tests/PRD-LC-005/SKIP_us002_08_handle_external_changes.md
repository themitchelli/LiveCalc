# Skip: US-002 AC-08 - Handle external changes (edits from other applications)

## Acceptance Criterion
Handle external changes (edits from other applications)

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires FileSystemWatcher detecting changes from outside VS Code
- Requires cross-application testing
- Requires file system event propagation

## Verification Method
This criterion should be verified via:
1. Manual testing: edit a watched file with an external editor, verify auto-run triggers
