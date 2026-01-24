# SKIP: US-003 AC-11 - Validation errors shown in Problems panel if config invalid

## Acceptance Criterion
Validation errors shown in Problems panel if config invalid

## Reason for Skipping
This acceptance criterion cannot be tested via shell scripts because:

1. **Requires VS Code Runtime**: The Problems panel is a VS Code UI component
2. **Diagnostics API**: Uses `vscode.languages.createDiagnosticCollection()` which only works in VS Code
3. **Interactive Verification**: Requires creating an invalid config and checking the Problems panel

## Alternative Verification
- Code review: Check `src/config/config-validator.ts` for `validateAndReport()` method
- Verify it creates diagnostics using `vscode.Diagnostic` objects
- Verify `DiagnosticSeverity.Error` is used for errors
- Test manually by creating an invalid livecalc.config.json
