# SKIP: Success toast notification on export
## AC: Success toast notification on export

### Reason for Skip
This acceptance criterion requires VS Code runtime to verify that information messages (toasts) are displayed after successful exports. The code does return success results, but the actual toast display is handled by the command layer that consumes the export result.

### What Can Be Verified
The export functions do return an `ExportResult` object with `success: true` and a `message` field:
```typescript
return {
  success: true,
  message: `Results exported to ${uri.fsPath}`,
  filePath: uri.fsPath,
};
```

The clipboard export returns:
```typescript
return {
  success: true,
  message: 'Results summary copied to clipboard',
};
```

### Recommendation
Create an integration test in the VS Code extension test suite that:
1. Triggers an export
2. Verifies `vscode.window.showInformationMessage` is called with the success message
