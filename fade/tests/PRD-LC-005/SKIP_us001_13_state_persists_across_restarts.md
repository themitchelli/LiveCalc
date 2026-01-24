# Skip: US-001 AC-13 - Auto-run state persists across VS Code restarts

## Acceptance Criterion
Auto-run state persists across VS Code restarts

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires context.workspaceState storage
- Requires VS Code restart simulation
- Requires state persistence verification across sessions

## Verification Method
This criterion should be verified via:
1. Manual testing: toggle auto-run, restart VS Code, verify state
2. Integration tests with workspace state mocking
