# SKIP: US-003 AC-12 - Config file changes trigger re-validation

## Acceptance Criterion
Config file changes trigger re-validation

## Reason for Skipping
This acceptance criterion cannot be tested via shell scripts because:

1. **Requires VS Code Runtime**: File watching uses VS Code's file system watcher API
2. **Event-Driven**: Uses `vscode.workspace.createFileSystemWatcher()` which only works at runtime
3. **Async Behavior**: Requires modifying a file and observing the re-validation trigger

## Alternative Verification
- Code review: Check `src/config/config-loader.ts` constructor
- Verify it creates a file watcher: `vscode.workspace.createFileSystemWatcher('**/livecalc.config.json')`
- Verify `onDidChange` handler calls `validateConfigFile()`
