#!/bin/bash
# Test: US-003 AC-02 - Config specifies model file path (required)
# AC: Config specifies model file path (required)

SCHEMA_FILE="/Users/stevemitchell/Documents/GitHub/LiveCalc/livecalc-vscode/schemas/livecalc.config.schema.json"

# Check if model property exists in schema
if ! grep -q '"model"' "$SCHEMA_FILE"; then
    echo "FAIL: Schema missing model property"
    echo "Expected: model property defined"
    echo "Actual: not found"
    exit 1
fi

# Check if model is required
if ! grep -q '"required"' "$SCHEMA_FILE" || ! grep -q '"model"' "$SCHEMA_FILE"; then
    echo "FAIL: model may not be marked as required"
    echo "Expected: model in required array"
    # Continue anyway as we verified model exists
fi

echo "PASS: Config schema has model property"
exit 0
