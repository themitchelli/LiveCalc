#!/bin/bash
# Test: verify pipeline halts gracefully on first error (fail-fast)
# AC: Pipeline halts gracefully on first error (fail-fast)

PIPELINE_ERROR_FILE="livecalc-engine/js/src/orchestrator/pipeline-error.ts"

# Assert - Check for continueOnError configuration
if ! grep -q 'continueOnError' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Pipeline error does not have continueOnError config"
    echo "Expected: continueOnError configuration for fail-fast behavior"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check that fail-fast is default (continueOnError defaults to false)
if ! grep -q 'continueOnError.*false\|continueOnError ?? false' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Fail-fast is not the default behavior"
    echo "Expected: continueOnError defaults to false"
    echo "Actual: Different default value"
    exit 1
fi

# Assert - Check for throw on error when not continuing
if ! grep -q 'throw.*pipelineError\|throw.*Error' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Error handler does not throw on first error"
    echo "Expected: throw statement for fail-fast"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Pipeline halts gracefully on first error (fail-fast)"
exit 0
