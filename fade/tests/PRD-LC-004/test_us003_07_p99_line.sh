#!/bin/bash
# Test: verify P99 line is marked on chart
# AC: P99 line marked on chart (vertical line, labeled)

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check for P99 annotation
if ! grep -q "p99Line" "$WEBVIEW_FILE"; then
    echo "FAIL: p99Line annotation not found"
    exit 1
fi

# Check P99 line is labeled
if ! grep -q "content: 'P99'" "$WEBVIEW_FILE"; then
    echo "FAIL: P99 label not found in annotation"
    exit 1
fi

echo "PASS: P99 line marked on chart (labeled)"
exit 0
