#!/bin/bash
# Test: verify panel uses singleton pattern to persist across runs
# AC: Panel persists across runs (updates in place, doesn't create new tabs)

PANEL_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/results-panel.ts"

# Check for singleton pattern
if ! grep -q "private static instance" "$PANEL_FILE"; then
    echo "FAIL: Singleton pattern not implemented (no static instance field)"
    exit 1
fi

if ! grep -q "public static getInstance" "$PANEL_FILE"; then
    echo "FAIL: Singleton pattern not implemented (no getInstance method)"
    exit 1
fi

# Check that show() reveals existing panel instead of creating new one
if ! grep -q "if (this.panel)" "$PANEL_FILE"; then
    echo "FAIL: Panel doesn't check for existing panel before creating new one"
    exit 1
fi

if ! grep -q "this.panel.reveal" "$PANEL_FILE"; then
    echo "FAIL: Panel doesn't reveal existing panel"
    exit 1
fi

echo "PASS: Panel persists across runs (singleton pattern with reveal)"
exit 0
