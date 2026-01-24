# Skip: US-002 AC-02 - Watch the config file itself

## Acceptance Criterion
Watch the config file itself

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires FileSystemWatcher API
- Requires config file detection
- Requires watcher lifecycle management

## Verification Method
This criterion should be verified via:
1. VS Code extension integration tests
2. Manual testing: modify config, verify watcher recreation
