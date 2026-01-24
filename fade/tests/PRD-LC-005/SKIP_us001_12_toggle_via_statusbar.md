# Skip: US-001 AC-12 - Toggle via status bar click

## Acceptance Criterion
Toggle via status bar click

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires active VS Code window with clickable status bar item
- Requires StatusBarItem.command configuration
- Requires UI interaction testing

## Verification Method
This criterion should be verified via:
1. Manual testing: click the status bar item and verify toggle
2. Code review: verify StatusBarItem has command set
