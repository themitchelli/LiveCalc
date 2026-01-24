# Skip: US-009 AC-07 - Errors always show toast regardless of setting

## Acceptance Criterion
Errors always show toast regardless of setting

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires error condition during auto-run
- Requires notification verification with 'none' setting
- Requires toast display inspection

## Verification Method
This criterion should be verified via:
1. Manual testing: set notifyOnAutoRun to 'none', trigger error, verify toast appears
