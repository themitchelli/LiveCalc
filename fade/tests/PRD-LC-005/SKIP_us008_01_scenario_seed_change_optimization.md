# Skip: US-008 AC-01 - If only scenario seed changes: regenerate scenarios, keep policies cached

## Acceptance Criterion
If only scenario seed changes: regenerate scenarios, keep policies cached

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires CacheManager instantiation
- Requires cache state tracking
- Requires scenario parameter change detection

## Verification Method
This criterion should be verified via:
1. Unit tests for CacheManager.scenarioParametersChanged()
2. Integration tests with cache statistics logging
