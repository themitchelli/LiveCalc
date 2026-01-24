#!/bin/bash
# Test: verify partial results available up to failure point
# AC: Partial results available up to failure point

PIPELINE_ERROR_FILE="livecalc-engine/js/src/orchestrator/pipeline-error.ts"

# Assert - Check for PipelineExecutionResult interface
if ! grep -q 'PipelineExecutionResult' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Pipeline error does not define PipelineExecutionResult"
    echo "Expected: PipelineExecutionResult interface"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for partialResults in execution result
if ! grep -q 'partialResults:' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Execution result does not include partialResults"
    echo "Expected: partialResults field in PipelineExecutionResult"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for completedNodes tracking
if ! grep -q 'completedNodes:' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Execution result does not track completedNodes"
    echo "Expected: completedNodes field to track successful nodes"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for skippedNodes tracking
if ! grep -q 'skippedNodes:' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Execution result does not track skippedNodes"
    echo "Expected: skippedNodes field to track nodes after failure"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Partial results available up to failure point"
exit 0
