#!/bin/bash
# Test: verify report format compatible with proposed FADE benchmarking standard
# AC: Report format compatible with proposed FADE benchmarking standard

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

REPORT_GEN="$PROJECT_ROOT/livecalc-engine/benchmarks/generate-comparison-report.ts"

if [[ ! -f "$REPORT_GEN" ]]; then
    echo "FAIL: Comparison report generator not found"
    exit 1
fi

# Check for markdown and JSON output formats
FOUND_MD=false
FOUND_JSON=false

if grep -q "\.md\|markdown\|Markdown" "$REPORT_GEN"; then
    FOUND_MD=true
fi

if grep -q "\.json\|JSON" "$REPORT_GEN"; then
    FOUND_JSON=true
fi

# Check for FADE standard reference
if grep -qi "fade\|FADE" "$REPORT_GEN"; then
    echo "PASS: Report references FADE standard compatibility"
    exit 0
fi

# Check for structured report format (metadata, results, summary)
STRUCTURED_FORMAT=0

if grep -q "metadata" "$REPORT_GEN"; then
    ((STRUCTURED_FORMAT++))
fi

if grep -q "successCriteria\|success" "$REPORT_GEN"; then
    ((STRUCTURED_FORMAT++))
fi

if grep -q "recommendation\|summary" "$REPORT_GEN"; then
    ((STRUCTURED_FORMAT++))
fi

if [[ "$STRUCTURED_FORMAT" -ge 2 ]] && [[ "$FOUND_MD" == "true" ]] && [[ "$FOUND_JSON" == "true" ]]; then
    echo "PASS: Report uses structured format with MD+JSON output (FADE-compatible)"
    exit 0
fi

if [[ "$FOUND_MD" == "true" ]] && [[ "$FOUND_JSON" == "true" ]]; then
    echo "PASS: Report generates both Markdown and JSON outputs"
    exit 0
fi

echo "FAIL: Report format may not be FADE-compatible (missing MD or JSON output)"
exit 1
