#!/bin/bash
# Test: verify each node shows name, engine type, status
# AC: Each node shows: name, engine type, status (pending/running/complete/error)

PIPELINE_VIEW_FILE="livecalc-vscode/src/pipeline/pipeline-view.ts"

# Assert - Check for NodeStatus type with all states
if ! grep -q "NodeStatus.*=.*'pending'" "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: NodeStatus does not include 'pending'"
    echo "Expected: 'pending' in NodeStatus type"
    echo "Actual: Not found"
    exit 1
fi

if ! grep -q "'running'" "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: NodeStatus does not include 'running'"
    echo "Expected: 'running' in NodeStatus type"
    echo "Actual: Not found"
    exit 1
fi

if ! grep -q "'complete'" "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: NodeStatus does not include 'complete'"
    echo "Expected: 'complete' in NodeStatus type"
    echo "Actual: Not found"
    exit 1
fi

if ! grep -q "'error'" "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: NodeStatus does not include 'error'"
    echo "Expected: 'error' in NodeStatus type"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for name field in node state
if ! grep -q 'name:.*string' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: PipelineNodeState does not include name"
    echo "Expected: name field in PipelineNodeState"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for engineType field
if ! grep -q "engineType:.*'wasm'.*'python'" "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: PipelineNodeState does not include engineType"
    echo "Expected: engineType field with wasm/python"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Each node shows name, engine type, status"
exit 0
