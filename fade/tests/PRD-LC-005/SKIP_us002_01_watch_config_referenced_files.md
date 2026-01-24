# Skip: US-002 AC-01 - Watch all files referenced in livecalc.config.json

## Acceptance Criterion
Watch all files referenced in livecalc.config.json

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires FileSystemWatcher API
- Requires config file parsing and watcher creation
- Requires verification of active file watchers

## Verification Method
This criterion should be verified via:
1. VS Code extension integration tests (`livecalc-vscode/test/suite/file-watcher.test.ts`)
2. Debug logging showing watched files
