# Skip: US-006 AC-05 - Compare current with any historical run

## Acceptance Criterion
Compare current with any historical run (not just previous)

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires pinning baseline to specific historical run
- Requires comparison calculation
- Requires UI verification

## Verification Method
This criterion should be verified via:
1. Manual testing: pin a historical run as baseline, verify comparison
