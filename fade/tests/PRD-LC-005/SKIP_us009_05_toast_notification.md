# Skip: US-009 AC-05 - 'toast': VS Code notification toast on completion

## Acceptance Criterion
'toast': VS Code notification toast on completion

## Why Not Testable via Shell
This acceptance criterion requires VS Code runtime environment to test:
- Requires vscode.window.showInformationMessage()
- Requires notification UI inspection
- Requires auto-run completion

## Verification Method
This criterion should be verified via:
1. Manual testing: set notifyOnAutoRun to 'toast', trigger auto-run, observe notification
