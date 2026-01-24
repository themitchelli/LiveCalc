#!/bin/bash
# Test: verify option to continue pipeline despite errors
# AC: Option to continue pipeline despite errors (configurable)

PIPELINE_ERROR_FILE="livecalc-engine/js/src/orchestrator/pipeline-error.ts"
SCHEMA_FILE="livecalc-vscode/schemas/livecalc.config.schema.json"

# Assert - Check for continueOnError in error handler
if ! grep -q 'continueOnError' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Pipeline error handler does not support continueOnError"
    echo "Expected: continueOnError configuration option"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check schema has continueOnError option
if ! grep -q 'continueOnError' "$SCHEMA_FILE"; then
    echo "FAIL: Schema does not include continueOnError option"
    echo "Expected: continueOnError in errorHandling configuration"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for multiple error collection
if ! grep -q 'errors:.*PipelineErrorInfo\[\]\|_errors:.*PipelineError\[\]' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: Error handler does not support multiple errors"
    echo "Expected: Array to collect multiple errors"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for maxErrors limit
if ! grep -q 'maxErrors' "$PIPELINE_ERROR_FILE"; then
    echo "FAIL: No maxErrors limit defined"
    echo "Expected: maxErrors to limit collected errors"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Option to continue pipeline despite errors (configurable)"
exit 0
