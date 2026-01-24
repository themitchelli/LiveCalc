# Skip: US-003 AC-08 - Results panel shows 'Cancelled - new run starting...' message

## Acceptance Criterion
Results panel shows 'Cancelled - new run starting...' message

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires results panel webview
- Requires UI message inspection
- Requires cancellation during run

## Verification Method
This criterion should be verified via:
1. Manual testing: trigger cancellation, observe results panel message
