# Skip: US-007 AC-04 - Status bar shows 'Auto-run: PAUSED' when paused

## Acceptance Criterion
Status bar shows 'Auto-run: PAUSED' when paused

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires status bar UI
- Requires pause state activation
- Requires UI text verification

## Verification Method
This criterion should be verified via:
1. Manual testing: pause auto-run, observe status bar text
