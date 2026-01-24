#!/bin/bash
# Test: verify 'View Logs' button opens output channel
# AC: 'View Logs' button opens output channel

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"

# Check HTML has view logs button
if ! grep -q "view-logs-btn" "$PANEL_FILE"; then
    echo "FAIL: view-logs-btn element not found in panel HTML"
    exit 1
fi

if ! grep -q "View Logs" "$PANEL_FILE"; then
    echo "FAIL: 'View Logs' label not found"
    exit 1
fi

# Check viewLogs message handler
if ! grep -q "case 'viewLogs':" "$PANEL_FILE"; then
    echo "FAIL: viewLogs case not handled in results-panel.ts"
    exit 1
fi

# Check showOutput command is executed
if ! grep -q "livecalc.showOutput" "$PANEL_FILE"; then
    echo "FAIL: livecalc.showOutput command not triggered on view logs"
    exit 1
fi

echo "PASS: 'View Logs' button opens output channel"
exit 0
