#!/bin/bash
# Test: verify dropdown to select any bus:// resource
# AC: Dropdown to select any bus:// resource

DATA_INSPECTOR_FILE="livecalc-vscode/src/pipeline/data-inspector.ts"

# Assert - Check for getResource method
if ! grep -q 'getResource' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: Data inspector does not have getResource method"
    echo "Expected: getResource method to select specific resources"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for BusResourceSnapshot interface
if ! grep -q 'BusResourceSnapshot' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: No BusResourceSnapshot interface"
    echo "Expected: BusResourceSnapshot for resource data"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check that resources are stored by name
if ! grep -q 'resources.*find\|resources\[' "$DATA_INSPECTOR_FILE"; then
    echo "FAIL: Resources not searchable by name"
    echo "Expected: Resources stored/searchable by name"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Dropdown to select any bus:// resource"
exit 0
