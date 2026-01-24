#!/bin/bash
# Test: verify export timing data as JSON
# AC: Export timing data as JSON for external analysis

TIMING_PROFILER_FILE="livecalc-vscode/src/pipeline/timing-profiler.ts"

# Assert - Check for exportToJson method
if ! grep -q 'exportToJson' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No exportToJson method"
    echo "Expected: exportToJson for JSON export"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for exportAllToJson method
if ! grep -q 'exportAllToJson' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: No exportAllToJson method"
    echo "Expected: exportAllToJson for full history export"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for JSON.stringify usage
if ! grep -q 'JSON\.stringify' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: Does not use JSON.stringify"
    echo "Expected: JSON.stringify for serialization"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check return type is string
if ! grep -q 'exportToJson.*:.*string\|exportAllToJson.*:.*string' "$TIMING_PROFILER_FILE"; then
    echo "FAIL: Export methods do not return string"
    echo "Expected: String return type for JSON"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Export timing data as JSON for external analysis"
exit 0
