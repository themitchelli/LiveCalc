# Skip: US-004 AC-08 - Comparison baseline is always the immediately previous run

## Acceptance Criterion
Comparison baseline is always the immediately previous run

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires run history tracking
- Requires comparison manager state verification
- Requires multiple runs

## Verification Method
This criterion should be verified via:
1. VS Code extension integration tests
2. Manual testing: run 3+ times, verify comparison is always vs immediate previous
