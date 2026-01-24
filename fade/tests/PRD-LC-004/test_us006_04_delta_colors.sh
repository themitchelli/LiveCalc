#!/bin/bash
# Test: verify positive changes styled green, negative styled red
# AC: Positive changes styled green, negative styled red

STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"
STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"

# Check StatisticDelta has direction field
if ! grep -q "direction: 'positive' | 'negative' | 'neutral'" "$STATE_FILE"; then
    echo "FAIL: direction union type not found in StatisticDelta"
    exit 1
fi

# Check positive styling with green color
if ! grep -q ".stat-delta.positive" "$STYLES_FILE"; then
    echo "FAIL: .stat-delta.positive style not found"
    exit 1
fi

# Check positive uses green color variable
if ! grep -q "vscode-charts-green" "$STYLES_FILE"; then
    echo "FAIL: vscode-charts-green color not used"
    exit 1
fi

# Check negative styling with red color
if ! grep -q ".stat-delta.negative" "$STYLES_FILE"; then
    echo "FAIL: .stat-delta.negative style not found"
    exit 1
fi

# Check negative uses red color variable
if ! grep -q "vscode-charts-red" "$STYLES_FILE"; then
    echo "FAIL: vscode-charts-red color not used"
    exit 1
fi

echo "PASS: Positive changes green, negative changes red"
exit 0
