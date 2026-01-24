#!/bin/bash
# Test: verify interest rate parameters shown when applicable
# AC: Interest rate parameters shown if applicable

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"

# Check HTML has interest rate section
if ! grep -q "interest-rate-section" "$PANEL_FILE"; then
    echo "FAIL: interest-rate-section not found in panel HTML"
    exit 1
fi

# Check for interest rate parameter fields
FIELDS=("meta-ir-initial" "meta-ir-drift" "meta-ir-volatility" "meta-ir-min" "meta-ir-max")

for field in "${FIELDS[@]}"; do
    if ! grep -q "$field" "$PANEL_FILE"; then
        echo "FAIL: $field element not found in panel HTML"
        exit 1
    fi
done

# Check InterestRateParams interface exists
if ! grep -q "interface InterestRateParams" "$STATE_FILE"; then
    echo "FAIL: InterestRateParams interface not found"
    exit 1
fi

echo "PASS: Interest rate parameters shown when applicable"
exit 0
