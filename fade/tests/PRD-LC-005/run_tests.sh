#!/bin/bash
# Run all PRD-LC-005 regression tests
# Usage: ./run_tests.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

echo "========================================"
echo "PRD-LC-005: Auto-Run and Hot Reload"
echo "Regression Test Suite"
echo "========================================"
echo ""

# Count skip files
SKIP_COUNT=$(ls SKIP_*.md 2>/dev/null | wc -l | tr -d ' ')

# Run shell tests
for test in test_*.sh; do
    if [[ -f "$test" ]]; then
        echo "Running: $test"
        output=$(bash "$test" 2>&1)
        result=$?

        if [ $result -eq 0 ]; then
            echo "  ✓ PASS"
            ((PASS_COUNT++))
        else
            echo "  ✗ FAIL"
            echo "$output" | sed 's/^/    /'
            ((FAIL_COUNT++))
        fi
    fi
done

echo ""
echo "========================================"
echo "Results Summary"
echo "========================================"
echo "  Passed:  $PASS_COUNT"
echo "  Failed:  $FAIL_COUNT"
echo "  Skipped: $SKIP_COUNT (require VS Code runtime)"
echo ""

if [ $FAIL_COUNT -gt 0 ]; then
    echo "TESTS FAILED"
    exit 1
else
    echo "ALL TESTS PASSED"
    exit 0
fi
