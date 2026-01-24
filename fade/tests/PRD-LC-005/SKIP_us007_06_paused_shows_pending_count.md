# Skip: US-007 AC-06 - Paused state shows count of pending changes

## Acceptance Criterion
Paused state shows count of pending changes: 'Paused (3 changes)'

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires pause state with pending file changes
- Requires status bar text update
- Requires file save during pause

## Verification Method
This criterion should be verified via:
1. Manual testing: pause, save files, observe pending count
