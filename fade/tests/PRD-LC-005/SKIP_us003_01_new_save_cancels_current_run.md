# Skip: US-003 AC-01 - New save during execution cancels current run

## Acceptance Criterion
New save during execution cancels current run

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires active valuation execution
- Requires CancellationTokenSource handling
- Requires timing-sensitive race condition management

## Verification Method
This criterion should be verified via:
1. VS Code extension integration tests
2. Manual testing: start long valuation, save during execution
