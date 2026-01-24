# SKIP: US-004 AC-06 - Error state visible in pipeline debug view

## Acceptance Criterion
> Error state visible in pipeline debug view

## Why This Is Not Testable Via Shell Scripts

This acceptance criterion involves UI rendering in VS Code:

1. **VS Code webview** - The pipeline debug view is a webview component that requires the VS Code runtime
2. **Visual validation** - Verifying "visibility" requires UI inspection or screenshot comparison
3. **Integration testing scope** - Requires VS Code extension host and webview communication

## Code Evidence

The pipeline view tracks error state through:
- `PipelineNodeState` in `pipeline-view.ts` includes `status: 'error'` state
- `NodeStatus` type includes `'error'` as a valid status
- Connection to `PipelineError` for error context

## Verification Approach

1. Manual testing: Open a pipeline with errors and verify error state display
2. VS Code extension integration tests (if available)
3. Check that `pipeline-view.ts` exposes error state to the webview

## Recommendation

This requires manual verification or VS Code extension e2e testing framework.
