# Skip: US-001 AC-10 - Status bar shows 'Auto-run: ON' or 'Auto-run: OFF'

## Acceptance Criterion
Status bar shows 'Auto-run: ON' or 'Auto-run: OFF'

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires active VS Code window with status bar
- Requires extension activation and StatusBar class
- Requires UI state inspection

## Verification Method
This criterion should be verified via:
1. Manual testing: toggle auto-run and observe status bar
2. Visual inspection during development
