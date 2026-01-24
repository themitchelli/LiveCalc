# Skip: US-008 AC-03 - If only policy file changes: reload policies, keep assumptions cached

## Acceptance Criterion
If only policy file changes: reload policies, keep assumptions cached

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires CacheManager strategy determination
- Requires policy file change detection
- Requires cache invalidation verification

## Verification Method
This criterion should be verified via:
1. Unit tests for CacheManager.analyzeChanges()
2. Verify POLICIES_ONLY strategy returned
