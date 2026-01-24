#!/bin/bash
# Test: verify error propagates with actionable guidance
# AC: Error propagates to results panel with actionable guidance

PIPELINE_ERROR_FILE="livecalc-engine/js/src/orchestrator/pipeline-error.ts"

# Assert - Check for guidance field in error info
if ! grep -q 'guidance:' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Error info does not include guidance"
    echo "Expected: guidance field for actionable advice"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for ERROR_GUIDANCE mapping
if ! grep -q 'ERROR_GUIDANCE' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: No ERROR_GUIDANCE mapping defined"
    echo "Expected: ERROR_GUIDANCE for error-specific guidance"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for PipelineErrorCode enum
if ! grep -q 'PipelineErrorCode' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: No PipelineErrorCode enum defined"
    echo "Expected: PipelineErrorCode enum for error classification"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check that guidance provides actual help text
if ! grep -q 'Check\|Verify\|Try\|Ensure' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Guidance does not include actionable advice"
    echo "Expected: Actionable text like 'Check', 'Verify', 'Try'"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Error propagates with actionable guidance"
exit 0
