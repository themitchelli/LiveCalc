# Skip: US-002 AC-10 - Watcher recreated when config file changes

## Acceptance Criterion
Watcher recreated when config file changes

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires active file watchers
- Requires config change detection
- Requires watcher lifecycle management verification

## Verification Method
This criterion should be verified via:
1. VS Code extension integration tests
2. Manual testing: change config, add new file reference, verify new file triggers run
