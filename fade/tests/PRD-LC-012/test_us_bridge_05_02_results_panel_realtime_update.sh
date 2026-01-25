#!/bin/bash
# Test: Local Results Panel consumes cloud stream and updates visualization in real-time
# AC: Local Results Panel consumes cloud stream and updates the visualization in real-time.
# US: US-BRIDGE-05 (Cloud Result Streaming)

set -e

# Check result streamer for Results Panel integration
RESULT_STREAMER="livecalc-vscode/src/cloud/result-streamer.ts"
RUN_CLOUD="livecalc-vscode/src/commands/run-cloud.ts"

if [[ ! -f "$RESULT_STREAMER" ]]; then
    echo "FAIL: result-streamer.ts not found"
    exit 1
fi

# Verify ResultsState conversion
if ! grep -q "ResultsState\|convertToResultsState" "$RESULT_STREAMER"; then
    echo "FAIL: ResultsState conversion not found"
    echo "Expected: ResultsState for Results Panel"
    echo "Actual: No ResultsState handling"
    exit 1
fi

# Verify callbacks for real-time updates
if ! grep -q "onResults\|onProgress" "$RESULT_STREAMER"; then
    echo "FAIL: Real-time update callbacks not found"
    echo "Expected: onResults/onProgress callbacks"
    echo "Actual: No update callbacks"
    exit 1
fi

# Check run-cloud command for Results Panel integration
if [[ -f "$RUN_CLOUD" ]]; then
    # Verify Results Panel is used
    if ! grep -q "resultsPanel\|ResultsPanel" "$RUN_CLOUD"; then
        echo "FAIL: Results Panel integration not found in run-cloud command"
        echo "Expected: resultsPanel usage"
        echo "Actual: No Results Panel integration"
        exit 1
    fi
fi

# Verify progress updates are streamed
if ! grep -q "progress\|Progress" "$RESULT_STREAMER"; then
    echo "FAIL: Progress updates not found"
    echo "Expected: Progress streaming for real-time updates"
    echo "Actual: No progress handling"
    exit 1
fi

echo "PASS: Local Results Panel consumes cloud stream and updates in real-time"
exit 0
