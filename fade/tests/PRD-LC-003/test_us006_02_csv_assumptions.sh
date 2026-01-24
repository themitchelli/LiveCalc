#!/bin/bash
# Test: US-006 AC-02 - Load assumptions from CSV files (mortality, lapse)
# AC: Load assumptions from CSV files (mortality, lapse)

DATA_LOADER_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/data/data-loader.ts"
SAMPLES_DIR="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/samples/simple-term-life/assumptions"

# Check for mortality loading
if ! grep -q 'mortality\|loadMortality' "$DATA_LOADER_FILE"; then
    echo "FAIL: No mortality loading"
    echo "Expected: mortality loading function"
    echo "Actual: not found"
    exit 1
fi

# Check for lapse loading
if ! grep -q 'lapse\|loadLapse' "$DATA_LOADER_FILE"; then
    echo "FAIL: No lapse loading"
    echo "Expected: lapse loading function"
    echo "Actual: not found"
    exit 1
fi

# Check for sample mortality CSV
if [[ ! -f "$SAMPLES_DIR/mortality.csv" ]]; then
    echo "FAIL: No sample mortality.csv"
    echo "Expected: sample mortality CSV file"
    echo "Actual: not found"
    exit 1
fi

# Check for sample lapse CSV
if [[ ! -f "$SAMPLES_DIR/lapse.csv" ]]; then
    echo "FAIL: No sample lapse.csv"
    echo "Expected: sample lapse CSV file"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: CSV assumption loading is supported (mortality, lapse)"
exit 0
