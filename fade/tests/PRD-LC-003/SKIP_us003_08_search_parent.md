# SKIP: US-003 AC-08 - Extension searches parent directories if not in root

## Acceptance Criterion
Extension searches parent directories if not in root

## Reason for Skipping
This acceptance criterion cannot be tested via shell scripts because:

1. **Requires VS Code Runtime**: Parent directory search happens within the VS Code extension host
2. **VS Code Workspace API**: Uses `vscode.workspace.fs` APIs that are only available at runtime
3. **Dynamic Behavior**: Depends on the workspace folder being opened

## Alternative Verification
- Code review: Check `src/config/config-loader.ts` for `searchParentDirectories()` method
- Verify it iterates up to 5 parent directories looking for `livecalc.config.json`
- The implementation shows: `const maxLevels = 5`
