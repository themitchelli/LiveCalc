#!/bin/bash
# Test: verify connections show bus:// resource names and data sizes
# AC: Connections show bus:// resource names and data sizes

PIPELINE_VIEW_FILE="livecalc-vscode/src/pipeline/pipeline-view.ts"

# Assert - Check for PipelineConnection interface
if ! grep -q 'PipelineConnection' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: PipelineConnection interface not defined"
    echo "Expected: PipelineConnection for DAG edges"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for busResource field in connection
if ! grep -q 'busResource:.*string' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: Connection does not include busResource"
    echo "Expected: busResource field for bus:// name"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for dataSize field in connection
if ! grep -q 'dataSize.*:.*number' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: Connection does not include dataSize"
    echo "Expected: dataSize field for size display"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for from/to fields
if ! grep -q 'from:.*string' "$PIPELINE_VIEW_FILE" && ! grep -q 'to:.*string' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: Connection does not include from/to fields"
    echo "Expected: from and to fields for connection endpoints"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Connections show bus:// resource names and data sizes"
exit 0
