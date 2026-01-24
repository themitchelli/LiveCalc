# SKIP: US-007 AC-04 - UI highlights upstream node in red when integrity check fails

## Acceptance Criterion
> UI highlights upstream node in red when integrity check fails

## Why This Is Not Testable Via Shell Scripts

This acceptance criterion involves UI rendering:

1. **VS Code webview** - Visual highlighting requires webview runtime
2. **Color/style verification** - "Red highlighting" requires visual inspection
3. **Event propagation** - Requires full pipeline view integration

## Code Evidence

The pipeline view implements culprit highlighting:
- `highlightCulprit` message type in `pipeline-view.ts`
- `isCulprit` field in `PipelineNodeState`
- CSS would apply red styling based on culprit state

## Verification Approach

1. Manual testing: Run pipeline with integrity failure, verify red highlight
2. Check CSS in `media/pipeline/styles.css` for culprit styling
3. VS Code extension integration tests

## Recommendation

This requires manual verification or VS Code extension e2e testing.
