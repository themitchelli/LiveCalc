#!/bin/bash
# Test: verify Mean NPV is displayed prominently
# AC: Mean NPV displayed as primary metric (large, prominent)

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"

# Check that Mean NPV has stat-primary class in HTML
if ! grep -q "stat-primary" "$PANEL_FILE"; then
    echo "FAIL: stat-primary class not found in panel HTML"
    exit 1
fi

if ! grep -q "Mean NPV" "$PANEL_FILE"; then
    echo "FAIL: 'Mean NPV' label not found in panel HTML"
    exit 1
fi

# Check that stat-primary has distinct styling
if ! grep -q ".stat-card.stat-primary" "$STYLES_FILE"; then
    echo "FAIL: .stat-card.stat-primary style not found"
    exit 1
fi

echo "PASS: Mean NPV displayed as primary metric"
exit 0
