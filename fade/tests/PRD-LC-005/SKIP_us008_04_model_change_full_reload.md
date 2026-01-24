# Skip: US-008 AC-04 - If model.mga changes: full reload

## Acceptance Criterion
If model.mga changes: full reload (model structure may have changed)

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires CacheManager strategy determination
- Requires model file type detection
- Requires FULL reload strategy verification

## Verification Method
This criterion should be verified via:
1. Unit tests for CacheManager.getFileType() and determineStrategy()
2. Verify FULL strategy returned for model changes
