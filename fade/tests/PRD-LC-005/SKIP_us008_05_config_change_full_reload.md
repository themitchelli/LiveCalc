# Skip: US-008 AC-05 - If config changes: full reload

## Acceptance Criterion
If config changes: full reload (dependencies may have changed)

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires CacheManager strategy determination
- Requires config file type detection
- Requires FULL reload strategy verification

## Verification Method
This criterion should be verified via:
1. Unit tests for CacheManager.analyzeChanges()
2. Verify FULL strategy returned for config changes
