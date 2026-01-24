# Skip: US-008 AC-02 - If only assumption file changes: keep policies cached, reload assumptions

## Acceptance Criterion
If only assumption file changes: keep policies cached, reload assumptions

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires CacheManager.analyzeChanges()
- Requires file hash comparison
- Requires reload strategy verification

## Verification Method
This criterion should be verified via:
1. Unit tests for CacheManager with mocked file content
2. Integration tests with cache statistics logging
