#!/bin/bash
# Test: verify metadata section is collapsible
# AC: Collapsible section (default: collapsed)

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
STYLES_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/styles.css"

# Check HTML uses <details> element for collapsible
if ! grep -q "<details id=\"run-metadata\">" "$PANEL_FILE"; then
    echo "FAIL: <details id=\"run-metadata\"> not found in panel HTML"
    exit 1
fi

if ! grep -q "<summary>" "$PANEL_FILE"; then
    echo "FAIL: <summary> element not found in panel HTML"
    exit 1
fi

# Check styling for details element
if ! grep -q "details" "$STYLES_FILE"; then
    echo "FAIL: details styling not found in CSS"
    exit 1
fi

echo "PASS: Metadata section is collapsible (uses <details>)"
exit 0
