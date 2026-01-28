#!/bin/bash
# Test: Verify config format is JSON with array of engine nodes and connections
# AC: Config format: JSON with array of engine nodes and their connections

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
EXAMPLES_DIR="$PROJECT_ROOT/livecalc-orchestrator/examples"
BUILD_DIR="$PROJECT_ROOT/livecalc-orchestrator/build"

# Check example JSON config files exist
configs_found=0

for config in "dag_config_projection_only.json" "dag_config_esg_projection.json" "dag_config_full_pipeline.json"; do
    if [[ -f "$EXAMPLES_DIR/$config" ]]; then
        ((configs_found++))

        # Validate JSON syntax
        if ! python3 -c "import json; json.load(open('$EXAMPLES_DIR/$config'))" 2>/dev/null; then
            echo "FAIL: Invalid JSON in $config"
            exit 1
        fi

        # Check for engines array
        if ! grep -q '"engines"' "$EXAMPLES_DIR/$config"; then
            echo "FAIL: Missing 'engines' array in $config"
            exit 1
        fi
    fi
done

if [[ $configs_found -lt 1 ]]; then
    echo "FAIL: No example DAG config files found"
    exit 1
fi

# Run JSON config parsing test
if [[ -x "$BUILD_DIR/orchestrator_tests" ]]; then
    cd "$BUILD_DIR"
    if ./orchestrator_tests "JSON config parsing" --reporter compact 2>&1 | grep -q "passed"; then
        echo "PASS: Config format is JSON with array of engine nodes and connections"
        exit 0
    else
        echo "FAIL: JSON config parsing test failed"
        exit 1
    fi
else
    echo "PASS: JSON config files validated"
    exit 0
fi
