#!/bin/bash
# Test: verify each node specifies 'id', 'engine', 'inputs', 'outputs'
# AC: Each node specifies 'id', 'engine' (wasm/python), 'inputs', 'outputs'

SCHEMA_FILE="livecalc-vscode/schemas/livecalc.config.schema.json"

# Assert - Check that id field is required in node schema
if ! grep -q '"id"' "$SCHEMA_FILE"; then
    echo "FAIL: Node schema does not contain 'id' field"
    echo "Expected: 'id' field defined for pipeline nodes"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check that engine field is required in node schema
if ! grep -q '"engine"' "$SCHEMA_FILE"; then
    echo "FAIL: Node schema does not contain 'engine' field"
    echo "Expected: 'engine' field defined for pipeline nodes"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check that engine pattern validates wasm/python format
if ! grep -q 'wasm.*python\|python.*wasm' "$SCHEMA_FILE" && ! grep -q '"wasm|python"' "$SCHEMA_FILE"; then
    # Try alternate pattern check
    if ! grep -q '"pattern":.*wasm' "$SCHEMA_FILE"; then
        echo "FAIL: Engine field does not validate wasm/python format"
        echo "Expected: Engine pattern to validate 'wasm://' or 'python://' prefix"
        echo "Actual: Pattern not found"
        exit 1
    fi
fi

# Assert - Check that inputs field exists
if ! grep -q '"inputs"' "$SCHEMA_FILE"; then
    echo "FAIL: Node schema does not contain 'inputs' field"
    echo "Expected: 'inputs' field defined for pipeline nodes"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check that outputs field exists
if ! grep -q '"outputs"' "$SCHEMA_FILE"; then
    echo "FAIL: Node schema does not contain 'outputs' field"
    echo "Expected: 'outputs' field defined for pipeline nodes"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Node schema includes id, engine, inputs, outputs fields"
exit 0
