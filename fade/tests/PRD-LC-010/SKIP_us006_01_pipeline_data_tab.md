# SKIP: US-006 AC-01 - Results panel shows 'Pipeline Data' tab when pipeline is used

## Acceptance Criterion
> Results panel shows 'Pipeline Data' tab when pipeline is used

## Why This Is Not Testable Via Shell Scripts

This acceptance criterion involves UI rendering:

1. **VS Code results panel** - Requires VS Code webview runtime
2. **Tab rendering** - Visual verification of tab presence requires UI inspection
3. **Conditional display** - Testing "when pipeline is used" requires runtime state

## Code Evidence

The `data-inspector.ts` module provides the data for this tab:
- `PipelineDataInspector` class for managing data state
- `BusResourceSnapshot` interface for resource data
- `PipelineDataState` for execution state

The results panel integration would use this data to render the Pipeline Data tab.

## Verification Approach

1. Manual testing: Run a pipeline and verify tab appears in results panel
2. Check `results-panel.ts` for Pipeline Data tab integration
3. VS Code extension integration tests

## Recommendation

This requires manual verification or VS Code extension e2e testing.
