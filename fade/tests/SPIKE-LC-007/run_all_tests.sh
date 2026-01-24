#!/bin/bash
# Run all regression tests for SPIKE-LC-007
# Usage: ./run_all_tests.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

echo "========================================"
echo "SPIKE-LC-007 Regression Tests"
echo "========================================"
echo ""

# Count skipped tests
SKIP_FILES=$(ls SKIP_*.md 2>/dev/null | wc -l)
SKIP_COUNT=$SKIP_FILES

# Run all test scripts
for test_file in test_*.sh; do
    if [[ -f "$test_file" ]]; then
        echo "Running: $test_file"
        if bash "$test_file"; then
            ((PASS_COUNT++))
        else
            ((FAIL_COUNT++))
            echo "  ^^^ FAILED ^^^"
        fi
        echo ""
    fi
done

echo "========================================"
echo "Summary"
echo "========================================"
echo "Passed: $PASS_COUNT"
echo "Failed: $FAIL_COUNT"
echo "Skipped: $SKIP_COUNT (see SKIP_*.md files)"
echo ""

if [[ "$FAIL_COUNT" -gt 0 ]]; then
    echo "RESULT: SOME TESTS FAILED"
    exit 1
else
    echo "RESULT: ALL TESTS PASSED"
    exit 0
fi
