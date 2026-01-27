#!/bin/bash
# Integration test for US-006: Command Line Interface

set -e  # Exit on error

ENGINE="../build-cli/livecalc-engine"
DATA_DIR="../data"
EXAMPLES_DIR="../examples"
TEST_OUTPUT="/tmp/livecalc_test_output.json"

echo "=== US-006 CLI Integration Tests ==="
echo

# Test 1: Help flag
echo "Test 1: Help flag displays usage"
$ENGINE --help > /dev/null
echo "  ✓ Help flag works"

# Test 2: Basic run with individual CSV files
echo "Test 2: Basic run with individual CSV files"
$ENGINE \
  --policies $DATA_DIR/sample_policies.csv \
  --mortality $DATA_DIR/sample_mortality.csv \
  --lapse $DATA_DIR/sample_lapse.csv \
  --expenses $DATA_DIR/sample_expenses.csv \
  --scenarios 100 \
  --seed 42 \
  --output $TEST_OUTPUT \
  2>&1 | grep -q "loaded 10 policies"
echo "  ✓ Basic CSV run works"

# Test 3: Assumptions config file
echo "Test 3: Run with assumptions config JSON"
$ENGINE \
  --policies $DATA_DIR/sample_policies.csv \
  --assumptions-config $EXAMPLES_DIR/assumptions.json \
  --output $TEST_OUTPUT \
  2>&1 | grep -q "Loading assumptions config"
echo "  ✓ Assumptions config works"

# Test 4: JSON output contains required fields
echo "Test 4: JSON output validation"
if grep -q "mean_npv" $TEST_OUTPUT && \
   grep -q "std_dev" $TEST_OUTPUT && \
   grep -q "execution_time_ms" $TEST_OUTPUT && \
   grep -q "scenario_count" $TEST_OUTPUT; then
  echo "  ✓ JSON output has required fields"
else
  echo "  ✗ JSON output missing required fields"
  exit 1
fi

# Test 5: Stress testing multipliers
echo "Test 5: Stress testing multipliers"
$ENGINE \
  --policies $DATA_DIR/sample_policies.csv \
  --mortality $DATA_DIR/sample_mortality.csv \
  --lapse $DATA_DIR/sample_lapse.csv \
  --expenses $DATA_DIR/sample_expenses.csv \
  --scenarios 10 \
  --mortality-mult 1.5 \
  --lapse-mult 0.8 \
  --output $TEST_OUTPUT \
  2>&1 | grep -q "Multipliers:"
echo "  ✓ Multipliers work"

# Test 6: Error handling - missing file
echo "Test 6: Error handling for missing file"
if $ENGINE \
  --policies /nonexistent/file.csv \
  --mortality $DATA_DIR/sample_mortality.csv \
  --lapse $DATA_DIR/sample_lapse.csv \
  --expenses $DATA_DIR/sample_expenses.csv \
  2>&1 | grep -q "Error:"; then
  echo "  ✓ Error handling works"
else
  echo "  ✗ Error handling failed"
  exit 1
fi

# Test 7: Execution time reporting
echo "Test 7: Execution time is reported"
$ENGINE \
  --policies $DATA_DIR/sample_policies.csv \
  --mortality $DATA_DIR/sample_mortality.csv \
  --lapse $DATA_DIR/sample_lapse.csv \
  --expenses $DATA_DIR/sample_expenses.csv \
  --scenarios 50 \
  --output $TEST_OUTPUT \
  2>&1 | grep -q "Execution:"
echo "  ✓ Execution time reported"

# Test 8: Scenario generation parameters
echo "Test 8: Scenario generation parameters"
$ENGINE \
  --policies $DATA_DIR/sample_policies.csv \
  --mortality $DATA_DIR/sample_mortality.csv \
  --lapse $DATA_DIR/sample_lapse.csv \
  --expenses $DATA_DIR/sample_expenses.csv \
  --scenarios 20 \
  --seed 12345 \
  --initial-rate 0.05 \
  --drift 0.01 \
  --volatility 0.02 \
  --output $TEST_OUTPUT \
  2>&1 | grep -q "Generating 20 scenarios"
echo "  ✓ Scenario parameters work"

# Cleanup
rm -f $TEST_OUTPUT

echo
echo "=== All CLI Integration Tests Passed ==="
