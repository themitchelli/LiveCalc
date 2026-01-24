# Skip: US-005 AC-06 - Only show for auto-triggered runs, not manual runs

## Acceptance Criterion
Only show for auto-triggered runs, not manual runs

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires distinguishing auto vs manual runs
- Requires trigger info visibility check
- Requires UI state verification

## Verification Method
This criterion should be verified via:
1. Manual testing: run manually, verify no trigger indicator shown
2. Save file for auto-run, verify trigger indicator appears
