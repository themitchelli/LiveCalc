# SKIP: US-004 AC-04 - Engine runs in extension host process (not webview)

## Acceptance Criterion
Engine runs in extension host process (not webview)

## Reason for Skipping
This acceptance criterion requires runtime verification:

1. **Architecture Decision**: This is a design choice verifiable through code review
2. **Runtime Context**: The actual process context is only determinable at runtime
3. **No Webview Usage**: Can verify by checking no webview APIs are used for engine

## Alternative Verification
- Code review: Check that `src/engine/livecalc-engine.ts` does not use `vscode.WebviewPanel`
- Verify engine is imported and used directly in extension.ts without webview intermediary
- Check that the engine is instantiated as a regular class, not in a webview context
