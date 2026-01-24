#!/bin/bash
# Test: verify execution mode (Local / Cloud) is shown
# AC: Execution mode shown (Local / Cloud)

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"
STATE_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-state.ts"
WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check HTML has execution mode field
if ! grep -q "meta-mode" "$PANEL_FILE"; then
    echo "FAIL: meta-mode element not found in panel HTML"
    exit 1
fi

if ! grep -q "Execution Mode" "$PANEL_FILE"; then
    echo "FAIL: 'Execution Mode' label not found in panel HTML"
    exit 1
fi

# Check RunMetadata has executionMode field with union type
if ! grep -q "executionMode: 'local' | 'cloud'" "$STATE_FILE"; then
    echo "FAIL: executionMode union type not found in RunMetadata"
    exit 1
fi

# Check webview displays Local or Cloud
if ! grep -q "'Local'\|'Cloud'" "$WEBVIEW_FILE"; then
    echo "FAIL: Local/Cloud display text not found in main.js"
    exit 1
fi

echo "PASS: Execution mode (Local / Cloud) shown"
exit 0
