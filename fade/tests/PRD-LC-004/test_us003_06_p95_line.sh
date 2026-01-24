#!/bin/bash
# Test: verify P95 line is marked on chart
# AC: P95 line marked on chart (vertical line, labeled)

WEBVIEW_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/media/results/main.js"

# Check for P95 annotation
if ! grep -q "p95Line" "$WEBVIEW_FILE"; then
    echo "FAIL: p95Line annotation not found"
    exit 1
fi

# Check P95 line is labeled
if ! grep -q "content: 'P95'" "$WEBVIEW_FILE"; then
    echo "FAIL: P95 label not found in annotation"
    exit 1
fi

echo "PASS: P95 line marked on chart (labeled)"
exit 0
