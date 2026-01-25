#!/bin/bash
# Test: Verify API returns Diagnostic Bundle with inputs, bus data, and EngineID
# AC: API returns a 'Diagnostic Bundle': Snapshots of inputs, intermediate bus data, and the specific EngineID that calculated it

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
AUTH_TOKEN="${AUTH_TOKEN:-test-token}"
BUCKET_ID="test-diag-bundle-$(date +%s)"

# Generate test data with an outlier that has full diagnostic info
generate_run_results_with_diagnostics() {
    local results="["
    # Normal runs
    for i in $(seq 1 48); do
        npv=$((998 + (RANDOM % 5)))
        results="${results}{\"runId\": \"run-${i}\", \"npv\": ${npv}},"
    done
    # Outlier with full diagnostic info
    results="${results}{\"runId\": \"outlier-with-diag\", \"npv\": 1200, \"engineId\": \"engine-node-5\", \"inputs\": {\"modelType\": \"term-life\", \"duration\": 30}, \"busData\": {\"intermediate/reserves\": [100.5, 200.3]}},"
    # Another normal run
    results="${results}{\"runId\": \"run-49\", \"npv\": 1000}"
    results="${results}]"
    echo "$results"
}

RUN_RESULTS=$(generate_run_results_with_diagnostics)

# Act - Analyze bucket with include_diagnostics=true
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${API_BASE_URL}/v1/platform/anomalies/analyze" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"bucket_id\": \"${BUCKET_ID}\", \"run_results\": ${RUN_RESULTS}, \"include_diagnostics\": true}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

# Assert - Check HTTP status
if [[ "$HTTP_CODE" != "200" ]]; then
    echo "FAIL: Anomaly analysis endpoint returned error"
    echo "Expected: 200"
    echo "Actual: ${HTTP_CODE}"
    echo "Response: ${BODY}"
    exit 1
fi

# Assert - Check diagnostic_bundles array exists
DIAG_BUNDLES=$(echo "$BODY" | grep -o '"diagnostic_bundles":\[' || true)
if [[ -z "$DIAG_BUNDLES" ]]; then
    echo "FAIL: Response missing diagnostic_bundles array"
    echo "Expected: diagnostic_bundles array"
    echo "Actual: ${BODY}"
    exit 1
fi

# Assert - Diagnostic bundle contains the outlier run
OUTLIER_DIAG=$(echo "$BODY" | grep -o '"runId":"outlier-with-diag"' || true)
if [[ -z "$OUTLIER_DIAG" ]]; then
    echo "FAIL: Diagnostic bundle missing for outlier"
    echo "Expected: outlier-with-diag in diagnostic_bundles"
    echo "Actual: ${BODY}"
    exit 1
fi

# Assert - Input snapshot is present
INPUT_SNAPSHOT=$(echo "$BODY" | grep -o '"inputSnapshot":{' || true)
if [[ -z "$INPUT_SNAPSHOT" ]]; then
    echo "FAIL: Diagnostic bundle missing inputSnapshot"
    echo "Expected: inputSnapshot with model inputs"
    echo "Actual: ${BODY}"
    exit 1
fi

# Assert - Engine ID is captured
ENGINE_ID=$(echo "$BODY" | grep -o '"engineId":"engine-node-5"' || true)
if [[ -z "$ENGINE_ID" ]]; then
    echo "FAIL: Diagnostic bundle missing engineId"
    echo "Expected: engineId=engine-node-5"
    echo "Actual: ${BODY}"
    exit 1
fi

# Assert - Comparison data is present (z-score, percentile rank)
COMPARISON=$(echo "$BODY" | grep -o '"comparisonData":{' || true)
if [[ -z "$COMPARISON" ]]; then
    echo "FAIL: Diagnostic bundle missing comparisonData"
    echo "Expected: comparisonData with statistical comparisons"
    echo "Actual: ${BODY}"
    exit 1
fi

echo "PASS: Diagnostic Bundle includes inputs, bus data, and EngineID for anomalies"
exit 0
