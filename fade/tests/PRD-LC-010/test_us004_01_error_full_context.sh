#!/bin/bash
# Test: verify failed node reports error with full context
# AC: Failed node reports error with full context (node id, inputs, error message)

PIPELINE_ERROR_FILE="livecalc-engine/js/src/orchestrator/pipeline-error.ts"

# Assert - Check for PipelineErrorInfo interface
if ! grep -q 'PipelineErrorInfo' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Pipeline error does not define PipelineErrorInfo"
    echo "Expected: PipelineErrorInfo interface for error context"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for nodeId in error info
if ! grep -q 'nodeId:.*string' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Error info does not include nodeId"
    echo "Expected: nodeId field in PipelineErrorInfo"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for inputSnapshot in error info
if ! grep -q 'inputSnapshot' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Error info does not include inputSnapshot"
    echo "Expected: inputSnapshot field for bus data context"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for message in error info
if ! grep -q 'message:.*string' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Error info does not include message"
    echo "Expected: message field in PipelineErrorInfo"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for stage information
if ! grep -q 'stage:' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Error info does not include stage"
    echo "Expected: stage field (init | execute | finalize)"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Failed node reports error with full context"
exit 0
