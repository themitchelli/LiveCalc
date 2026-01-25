#!/bin/bash
# Test: verify FADE.md includes Target Architecture patterns
# AC: Target Architecture section includes: API-first design, bus:// protocol, CalcEngine interface, zero-copy parallelism

FADE_FILE="./FADE.md"

# Check file exists
if [[ ! -f "$FADE_FILE" ]]; then
    echo "FAIL: FADE.md file not found"
    exit 1
fi

# Check for Target Architecture section
if ! grep -qi "Target Architecture" "$FADE_FILE"; then
    echo "FAIL: Target Architecture section not found"
    echo "Expected: Target Architecture section"
    echo "Actual: Not found"
    exit 1
fi

# Check for API-first mention
if ! grep -qi "API-first\|API first" "$FADE_FILE"; then
    echo "FAIL: API-first design not documented"
    echo "Expected: API-first design pattern"
    echo "Actual: Not found"
    exit 1
fi

# Check for bus:// protocol mention
if ! grep -q "bus://" "$FADE_FILE"; then
    echo "FAIL: bus:// protocol not documented"
    echo "Expected: bus:// protocol"
    echo "Actual: Not found"
    exit 1
fi

# Check for CalcEngine interface mention
if ! grep -qi "CalcEngine" "$FADE_FILE"; then
    echo "FAIL: CalcEngine interface not documented"
    echo "Expected: CalcEngine interface"
    echo "Actual: Not found"
    exit 1
fi

# Check for zero-copy mention
if ! grep -qi "zero-copy\|zero copy" "$FADE_FILE"; then
    echo "FAIL: Zero-copy parallelism not documented"
    echo "Expected: zero-copy parallelism"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Target Architecture includes API-first, bus://, CalcEngine, zero-copy"
exit 0
