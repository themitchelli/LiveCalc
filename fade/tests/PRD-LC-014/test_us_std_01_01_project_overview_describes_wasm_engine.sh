#!/bin/bash
# Test: verify FADE.md Project Overview describes LiveCalc's purpose with WASM engine
# AC: Project Overview section describes LiveCalc's purpose: instant actuarial model feedback with WASM engine

FADE_FILE="./FADE.md"

# Check file exists
if [[ ! -f "$FADE_FILE" ]]; then
    echo "FAIL: FADE.md file not found"
    exit 1
fi

# Check for Project Overview section
if ! grep -q "## Project Overview" "$FADE_FILE"; then
    echo "FAIL: Project Overview section not found in FADE.md"
    echo "Expected: ## Project Overview"
    echo "Actual: Section not found"
    exit 1
fi

# Check for instant actuarial model feedback mention
if ! grep -qi "instant.*actuarial\|actuarial.*instant\|instant.*feedback" "$FADE_FILE"; then
    echo "FAIL: Project Overview does not mention 'instant actuarial feedback'"
    echo "Expected: Description of instant actuarial model feedback"
    echo "Actual: Not found"
    exit 1
fi

# Check for WASM engine mention
if ! grep -qi "WASM" "$FADE_FILE"; then
    echo "FAIL: FADE.md does not mention WASM engine"
    echo "Expected: Reference to WASM engine"
    echo "Actual: 'WASM' not found"
    exit 1
fi

echo "PASS: Project Overview describes LiveCalc's purpose with WASM engine"
exit 0
