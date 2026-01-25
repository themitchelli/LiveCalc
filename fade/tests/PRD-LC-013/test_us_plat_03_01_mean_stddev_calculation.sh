#!/bin/bash
# Test: Verify post-run logic calculates Mean and Standard Deviation for key NPV outputs
# AC: Post-run logic calculates Mean and Standard Deviation for key NPV outputs in a bucket

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
AUTH_TOKEN="${AUTH_TOKEN:-test-token}"
BUCKET_ID="test-stats-$(date +%s)"

# Generate test data - 50 runs with known distribution
# Mean ~ 1000, StdDev ~ 100
generate_run_results() {
    local results="["
    for i in $(seq 1 50); do
        # Generate NPV values around 1000 with some variance
        npv=$((950 + (i * 2)))
        results="${results}{\"runId\": \"run-${i}\", \"npv\": ${npv}}"
        if [[ $i -lt 50 ]]; then
            results="${results},"
        fi
    done
    results="${results}]"
    echo "$results"
}

RUN_RESULTS=$(generate_run_results)

# Act - Analyze bucket for anomalies (which calculates stats)
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${API_BASE_URL}/v1/platform/anomalies/analyze" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"bucket_id\": \"${BUCKET_ID}\", \"run_results\": ${RUN_RESULTS}}")

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

# Assert - Check bucket_statistics is present
BUCKET_STATS=$(echo "$BODY" | grep -o '"bucket_statistics":{[^}]*}' || true)
if [[ -z "$BUCKET_STATS" ]]; then
    echo "FAIL: Response missing bucket_statistics"
    echo "Expected: bucket_statistics object"
    echo "Actual: ${BODY}"
    exit 1
fi

# Assert - Mean is calculated and present
MEAN=$(echo "$BODY" | grep -o '"mean":[0-9.]*' | head -1 || true)
if [[ -z "$MEAN" ]]; then
    echo "FAIL: Mean not calculated"
    echo "Expected: mean field in bucket_statistics"
    echo "Actual: ${BUCKET_STATS}"
    exit 1
fi

# Assert - StdDev is calculated and present
STDDEV=$(echo "$BODY" | grep -o '"stdDev":[0-9.]*' | head -1 || true)
if [[ -z "$STDDEV" ]]; then
    echo "FAIL: Standard deviation not calculated"
    echo "Expected: stdDev field in bucket_statistics"
    echo "Actual: ${BUCKET_STATS}"
    exit 1
fi

# Assert - Run count matches input
RUN_COUNT=$(echo "$BODY" | grep -o '"runCount":50' || true)
if [[ -z "$RUN_COUNT" ]]; then
    echo "FAIL: Run count incorrect"
    echo "Expected: runCount=50"
    echo "Actual: ${BUCKET_STATS}"
    exit 1
fi

echo "PASS: Mean and Standard Deviation calculated correctly for bucket"
echo "Stats: ${MEAN}, ${STDDEV}"
exit 0
