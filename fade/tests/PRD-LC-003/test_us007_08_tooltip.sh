#!/bin/bash
# Test: US-007 AC-08 - Tooltip shows detailed status information
# AC: Tooltip shows detailed status information

STATUS_BAR_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/status-bar.ts"

if [[ ! -f "$STATUS_BAR_FILE" ]]; then
    echo "FAIL: Status bar file not found"
    exit 1
fi

# Check for tooltip
if ! grep -q 'tooltip' "$STATUS_BAR_FILE"; then
    echo "FAIL: No tooltip in status bar"
    echo "Expected: tooltip property"
    echo "Actual: not found"
    exit 1
fi

# Check for MarkdownString (detailed tooltip)
if ! grep -q 'MarkdownString' "$STATUS_BAR_FILE"; then
    echo "FAIL: No MarkdownString for detailed tooltip"
    echo "Expected: MarkdownString for rich tooltip"
    echo "Actual: not found"
    exit 1
fi

# Check for updateTooltip method
if ! grep -q 'updateTooltip' "$STATUS_BAR_FILE"; then
    echo "FAIL: No updateTooltip method"
    echo "Expected: updateTooltip method"
    echo "Actual: not found"
    exit 1
fi

echo "PASS: Status bar has detailed tooltip"
exit 0
