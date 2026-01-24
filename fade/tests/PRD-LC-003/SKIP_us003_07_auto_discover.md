# SKIP: US-003 AC-07 - Extension auto-discovers config in workspace root

## Acceptance Criterion
Extension auto-discovers config in workspace root

## Reason for Skipping
This acceptance criterion cannot be tested via shell scripts because:

1. **Requires VS Code Runtime**: Config discovery happens within the VS Code extension host
2. **VS Code Workspace API**: Uses `vscode.workspace` APIs that are only available at runtime
3. **Interactive Context**: Requires opening a workspace in VS Code to test

## Alternative Verification
- Code review: Check `src/config/config-loader.ts` for `findConfigFile()` method
- Verify it checks workspace root first: `path.join(rootPath, 'livecalc.config.json')`
- Run VS Code extension tests using @vscode/test-electron
