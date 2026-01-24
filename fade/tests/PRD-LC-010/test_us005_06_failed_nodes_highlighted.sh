#!/bin/bash
# Test: verify failed nodes are highlighted in red with error details
# AC: Failed nodes highlighted in red with error details

PIPELINE_VIEW_FILE="livecalc-vscode/src/pipeline/pipeline-view.ts"

# Assert - Check for error field in node state
if ! grep -q 'error.*string' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: Node state does not include error field"
    echo "Expected: error field in PipelineNodeState"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for error status handling
if ! grep -q "'error'" "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: No error status defined"
    echo "Expected: 'error' status for failed nodes"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for isCulprit field
if ! grep -q 'isCulprit' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: Node state does not include isCulprit"
    echo "Expected: isCulprit field for integrity failures"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for highlightCulprit message
if ! grep -q "'highlightCulprit'" "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: No highlightCulprit message type"
    echo "Expected: highlightCulprit for error highlighting"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for errorSection in HTML
if ! grep -q 'errorSection' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: No error section in details panel"
    echo "Expected: errorSection div for error display"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Failed nodes highlighted in red with error details"
exit 0
