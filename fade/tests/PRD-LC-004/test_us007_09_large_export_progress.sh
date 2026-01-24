#!/bin/bash
# Test: verify large exports (>100K scenarios) show progress
# AC: Large exports (>100K scenarios) show progress

EXPORT_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/export.ts"

# Check for large export threshold constant
if ! grep -q "LARGE_EXPORT_THRESHOLD\|100.*000\|100_000" "$EXPORT_FILE"; then
    echo "FAIL: Large export threshold (100K) not found"
    exit 1
fi

# Check withProgress is used
if ! grep -q "withProgress" "$EXPORT_FILE"; then
    echo "FAIL: vscode.window.withProgress not used"
    exit 1
fi

# Check ProgressLocation is specified
if ! grep -q "ProgressLocation" "$EXPORT_FILE"; then
    echo "FAIL: ProgressLocation not found"
    exit 1
fi

# Check progress callback reports percentage
if ! grep -q "progressCallback\|progress.report" "$EXPORT_FILE"; then
    echo "FAIL: Progress reporting not found"
    exit 1
fi

echo "PASS: Large exports (>100K scenarios) show progress"
exit 0
