# Skip: US-001 AC-06 - Only files referenced in config trigger re-run

## Acceptance Criterion
Only files referenced in config trigger re-run (not unrelated files)

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires active VS Code instance with extension loaded
- Requires file watcher filtering based on config file contents
- Requires actual save event triggering
- Requires verification that irrelevant files do NOT trigger runs

## Verification Method
This criterion should be verified via:
1. VS Code extension integration tests (`livecalc-vscode/test/suite/file-watcher.test.ts`)
2. Manual testing: save unrelated files and verify no run triggers
