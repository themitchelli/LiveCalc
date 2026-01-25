#!/bin/bash
# Test: Verify individual runs exceeding 3 Sigma from the mean are flagged as Anomaly
# AC: Individual runs exceeding 3 Sigma from the mean are flagged as 'Anomaly'

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
AUTH_TOKEN="${AUTH_TOKEN:-test-token}"
BUCKET_ID="test-3sigma-$(date +%s)"

# Generate test data with known outliers
# 48 runs around mean=1000, stddev~10
# 2 outliers: one at 1050 (5 sigma high), one at 950 (5 sigma low)
generate_run_results_with_outliers() {
    local results="["
    # Normal runs (mean=1000, small variance)
    for i in $(seq 1 48); do
        npv=$((998 + (RANDOM % 5)))  # 998-1002 range
        results="${results}{\"runId\": \"run-${i}\", \"npv\": ${npv}},"
    done
    # Outlier 1: HIGH (significantly above 3 sigma)
    results="${results}{\"runId\": \"outlier-high\", \"npv\": 1100},"
    # Outlier 2: LOW (significantly below 3 sigma)
    results="${results}{\"runId\": \"outlier-low\", \"npv\": 900}"
    results="${results}]"
    echo "$results"
}

RUN_RESULTS=$(generate_run_results_with_outliers)

# Act - Analyze bucket
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

# Assert - Check anomalies array exists
ANOMALIES=$(echo "$BODY" | grep -o '"anomalies":\[' || true)
if [[ -z "$ANOMALIES" ]]; then
    echo "FAIL: Response missing anomalies array"
    echo "Expected: anomalies array"
    echo "Actual: ${BODY}"
    exit 1
fi

# Assert - High outlier is flagged
HIGH_OUTLIER=$(echo "$BODY" | grep -o '"runId":"outlier-high"' || true)
if [[ -z "$HIGH_OUTLIER" ]]; then
    echo "FAIL: High outlier (1100) not flagged as anomaly"
    echo "Expected: outlier-high in anomalies"
    echo "Actual: ${BODY}"
    exit 1
fi

# Assert - Low outlier is flagged
LOW_OUTLIER=$(echo "$BODY" | grep -o '"runId":"outlier-low"' || true)
if [[ -z "$LOW_OUTLIER" ]]; then
    echo "FAIL: Low outlier (900) not flagged as anomaly"
    echo "Expected: outlier-low in anomalies"
    echo "Actual: ${BODY}"
    exit 1
fi

# Assert - Anomaly type is 3_sigma variant
SIGMA_TYPE=$(echo "$BODY" | grep -o '"anomalyType":"[35]_sigma' || true)
if [[ -z "$SIGMA_TYPE" ]]; then
    echo "FAIL: Anomaly type not properly categorized"
    echo "Expected: anomalyType=3_sigma_high or 3_sigma_low or 5_sigma"
    echo "Actual: ${BODY}"
    exit 1
fi

echo "PASS: Runs exceeding 3 Sigma correctly flagged as anomalies"
exit 0
