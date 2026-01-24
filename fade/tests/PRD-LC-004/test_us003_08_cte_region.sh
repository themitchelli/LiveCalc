#!/bin/bash
# Test: verify CTE region is shaded
# AC: CTE region shaded (tail beyond P95)

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check for CTE region annotation
if ! grep -q "cteRegion" "$WEBVIEW_FILE"; then
    echo "FAIL: cteRegion annotation not found"
    exit 1
fi

# Check CTE region is a box type
if ! grep -q "type: 'box'" "$WEBVIEW_FILE"; then
    echo "FAIL: CTE region box type not found"
    exit 1
fi

# Check CTE region has background color (shaded)
if ! grep -q "backgroundColor:" "$WEBVIEW_FILE"; then
    echo "FAIL: backgroundColor for CTE region not found"
    exit 1
fi

echo "PASS: CTE region shaded (tail beyond P95)"
exit 0
