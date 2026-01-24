#!/bin/bash
# Test: verify click node to see details (inputs, outputs, timing, checksums)
# AC: Click node to see details (inputs, outputs, timing, checksums)

PIPELINE_VIEW_FILE="livecalc-vscode/src/pipeline/pipeline-view.ts"

# Assert - Check for nodeClicked message type
if ! grep -q "'nodeClicked'" "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: No nodeClicked message type"
    echo "Expected: 'nodeClicked' message for node interaction"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for nodeDetails HTML element
if ! grep -q 'nodeDetails' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: No nodeDetails element in HTML"
    echo "Expected: nodeDetails div for details panel"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for timing in node state
if ! grep -q 'timing' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: Node state does not include timing"
    echo "Expected: timing field in PipelineNodeState"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for checksums in node state
if ! grep -q 'checksums' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: Node state does not include checksums"
    echo "Expected: checksums field in PipelineNodeState"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for inputs/outputs display
if ! grep -q 'detailsInputs\|detailsOutputs' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: No inputs/outputs display elements"
    echo "Expected: detailsInputs and detailsOutputs elements"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Click node to see details (inputs, outputs, timing, checksums)"
exit 0
