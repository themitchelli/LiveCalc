# Skip: US-001 AC-04 - Model re-runs when assumption JSON file is saved

## Acceptance Criterion
Model re-runs when assumption JSON file is saved

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires active VS Code instance with extension loaded
- Requires FileSystemWatcher API to detect file changes
- Requires actual file save event (not just file modification)
- Requires extension activation and auto-run controller initialization

## Verification Method
This criterion should be verified via:
1. VS Code extension integration tests (`livecalc-vscode/test/suite/auto-run.test.ts`)
2. Manual testing in development environment
