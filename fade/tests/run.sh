#!/bin/bash
# FADE Regression Test Runner
# Loops through fade/tests/PRD-*/ folders and runs all test scripts
# Exit 0 = all tests pass, Exit 1 = one or more tests failed

set -o pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED_LOG="$TESTS_DIR/failed.log"
FAILED=0
PASSED=0
TOTAL=0

# Clear previous failed.log and write header
# Format: grep-friendly with [TAG] prefixes
# Tags: [FAILURE], [EXIT_CODE], [TIMESTAMP], [EXPECTED], [ACTUAL], [COMMAND], [OUTPUT]
{
    echo "# FADE Test Run"
    echo "[RUN_TIMESTAMP] $(date '+%Y-%m-%d %H:%M:%S')"
    echo "[RUN_DIR] $TESTS_DIR"
    echo ""
} > "$FAILED_LOG"

# Find all PRD-* test directories
PRD_DIRS=$(find "$TESTS_DIR" -maxdepth 1 -type d -name "PRD-*" 2>/dev/null | sort)

if [[ -z "$PRD_DIRS" ]]; then
    echo "No test folders found (fade/tests/PRD-*/). Nothing to test."
    rm -f "$FAILED_LOG"
    exit 0
fi

for prd_dir in $PRD_DIRS; do
    prd_name=$(basename "$prd_dir")
    echo "Testing $prd_name..."

    # Find all test scripts in this PRD folder
    test_files=$(find "$prd_dir" -maxdepth 1 -type f -name "test_*.sh" 2>/dev/null | sort)

    if [[ -z "$test_files" ]]; then
        echo "  No test files in $prd_name"
        continue
    fi

    for test_file in $test_files; do
        test_name=$(basename "$test_file")
        ((TOTAL++))

        # Run the test and capture output
        output=$("$test_file" 2>&1)
        exit_code=$?

        if [[ $exit_code -eq 0 ]]; then
            echo "  ✓ $test_name"
            ((PASSED++))
        else
            echo "  ✗ $test_name"
            ((FAILED++))

            # Log failure details with grep-friendly format
            {
                echo "[FAILURE] $prd_name/$test_name"
                echo "[EXIT_CODE] $exit_code"
                echo "[TIMESTAMP] $(date '+%Y-%m-%d %H:%M:%S')"

                # Extract expected value if present in output
                expected=$(echo "$output" | grep -i "^Expected:" | head -1)
                if [[ -n "$expected" ]]; then
                    echo "[EXPECTED] ${expected#Expected: }"
                fi

                # Extract actual value if present in output
                actual=$(echo "$output" | grep -i "^Actual:" | head -1)
                if [[ -n "$actual" ]]; then
                    echo "[ACTUAL] ${actual#Actual: }"
                fi

                # Extract command/endpoint if present (look for common patterns)
                command=$(echo "$output" | grep -iE "^(Command|Endpoint|URL|Request|curl|Running):" | head -1)
                if [[ -n "$command" ]]; then
                    echo "[COMMAND] ${command#*: }"
                fi

                echo "[OUTPUT]"
                echo "$output" | sed 's/^/  /'
                echo ""
                echo "---"
                echo ""
            } >> "$FAILED_LOG"
        fi
    done
done

echo ""
echo "Results: $PASSED passed, $FAILED failed, $TOTAL total"

if [[ $FAILED -gt 0 ]]; then
    echo ""
    echo "Failures logged to: fade/tests/failed.log"
    exit 1
else
    # Clean up failed.log if no failures
    rm -f "$FAILED_LOG"
    exit 0
fi
