# Skip: US-001 AC-05 - Model re-runs when livecalc.config.json is saved

## Acceptance Criterion
Model re-runs when livecalc.config.json is saved

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires active VS Code instance with extension loaded
- Requires FileSystemWatcher API to detect file changes
- Requires actual file save event triggering
- Requires extension activation and config file watching

## Verification Method
This criterion should be verified via:
1. VS Code extension integration tests (`livecalc-vscode/test/suite/auto-run.test.ts`)
2. Manual testing in development environment
