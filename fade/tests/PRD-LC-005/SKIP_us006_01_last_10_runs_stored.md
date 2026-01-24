# Skip: US-006 AC-01 - Last 10 runs stored in memory

## Acceptance Criterion
Last 10 runs stored in memory

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires RunHistoryManager instantiation
- Requires multiple run executions
- Requires internal state inspection

## Verification Method
This criterion should be verified via:
1. VS Code extension integration tests
2. Manual testing: run 11+ times, verify only last 10 shown
