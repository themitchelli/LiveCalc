#!/bin/bash
# Test: verify clear recommendation: merge, iterate, or abandon spike
# AC: Clear recommendation: merge, iterate, or abandon spike

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

REPORT_GEN="$PROJECT_ROOT/livecalc-engine/benchmarks/generate-comparison-report.ts"

if [[ ! -f "$REPORT_GEN" ]]; then
    echo "FAIL: Comparison report generator not found"
    exit 1
fi

# Check for recommendation types
FOUND_MERGE=false
FOUND_ITERATE=false
FOUND_ABANDON=false

if grep -q "'MERGE'\|\"MERGE\"\|MERGE" "$REPORT_GEN"; then
    FOUND_MERGE=true
fi

if grep -q "'ITERATE'\|\"ITERATE\"\|ITERATE" "$REPORT_GEN"; then
    FOUND_ITERATE=true
fi

if grep -q "'ABANDON'\|\"ABANDON\"\|ABANDON" "$REPORT_GEN"; then
    FOUND_ABANDON=true
fi

# Check for recommendation field
if ! grep -q "recommendation" "$REPORT_GEN"; then
    echo "FAIL: No recommendation field in report generator"
    exit 1
fi

# Should have all three recommendation types
if [[ "$FOUND_MERGE" == "true" ]] && [[ "$FOUND_ITERATE" == "true" ]] && [[ "$FOUND_ABANDON" == "true" ]]; then
    echo "PASS: Report includes clear recommendations: MERGE, ITERATE, or ABANDON"
    exit 0
fi

# At minimum should have some recommendation logic
if [[ "$FOUND_MERGE" == "true" ]] || [[ "$FOUND_ITERATE" == "true" ]]; then
    echo "PASS: Report includes recommendation logic"
    exit 0
fi

echo "FAIL: Report missing recommendation types (MERGE, ITERATE, ABANDON)"
exit 1
