# Skip: US-004 AC-03 - Percentage change shown: ((current - previous) / |previous|) * 100

## Acceptance Criterion
Percentage change shown: ((current - previous) / |previous|) * 100

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires results panel rendering
- Requires percentage calculation verification
- Requires UI element inspection

## Verification Method
This criterion should be verified via:
1. Unit tests for comparison calculation functions
2. Manual testing: verify percentage display format
