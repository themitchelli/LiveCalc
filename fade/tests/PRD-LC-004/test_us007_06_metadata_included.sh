#!/bin/bash
# Test: verify export includes run metadata
# AC: Export includes run metadata (timestamp, config, assumptions)

EXPORT_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/src/ui/export.ts"

# Check CSV includes run metadata
if ! grep -q "Run ID:" "$EXPORT_FILE" || ! grep -q "Timestamp:" "$EXPORT_FILE"; then
    echo "FAIL: Run metadata not included in exports"
    exit 1
fi

# Check CSV includes model
if ! grep -q "Model:" "$EXPORT_FILE"; then
    echo "FAIL: Model not included in exports"
    exit 1
fi

# Check CSV includes policy count
if ! grep -q "Policies:" "$EXPORT_FILE"; then
    echo "FAIL: Policies not included in exports"
    exit 1
fi

# Check CSV includes scenario count
if ! grep -q "Scenarios:" "$EXPORT_FILE"; then
    echo "FAIL: Scenarios not included in exports"
    exit 1
fi

# Check assumptions are included
if ! grep -q "Assumptions" "$EXPORT_FILE"; then
    echo "FAIL: Assumptions section not found in exports"
    exit 1
fi

echo "PASS: Export includes run metadata"
exit 0
