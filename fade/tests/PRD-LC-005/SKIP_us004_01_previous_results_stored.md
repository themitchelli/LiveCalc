# Skip: US-004 AC-01 - Previous run results automatically stored when new run starts

## Acceptance Criterion
Previous run results automatically stored when new run starts

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires active extension with ComparisonManager
- Requires run execution to trigger storage
- Requires internal state inspection

## Verification Method
This criterion should be verified via:
1. VS Code extension integration tests
2. Manual testing: run twice, verify comparison appears
