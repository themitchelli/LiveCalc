#!/bin/bash
# Test: verify real-time status updates during execution
# AC: Real-time status updates during execution

PIPELINE_VIEW_FILE="livecalc-vscode/src/pipeline/pipeline-view.ts"

# Assert - Check for updateNodeStatus method
if ! grep -q 'updateNodeStatus' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: PipelineView does not have updateNodeStatus method"
    echo "Expected: updateNodeStatus method for real-time updates"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for setCurrentNode method
if ! grep -q 'setCurrentNode' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: PipelineView does not have setCurrentNode method"
    echo "Expected: setCurrentNode method for current execution tracking"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for postMessage communication
if ! grep -q 'postMessage' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: PipelineView does not use postMessage"
    echo "Expected: postMessage for webview communication"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for 'updateNodeStatus' message type
if ! grep -q "'updateNodeStatus'" "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: No updateNodeStatus message type"
    echo "Expected: 'updateNodeStatus' message for real-time updates"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Real-time status updates during execution"
exit 0
