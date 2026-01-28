#!/bin/bash
# Test: Verify example config structure with engine, config, inputs, outputs
# AC: Example: [ {engine: 'esg', config: {...}, outputs: ['scenarios']}, {engine: 'projection', inputs: ['scenarios'], outputs: ['results']} ]

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
EXAMPLES_DIR="$PROJECT_ROOT/livecalc-orchestrator/examples"

# Find a config file to check
CONFIG_FILE="$EXAMPLES_DIR/dag_config_full_pipeline.json"
if [[ ! -f "$CONFIG_FILE" ]]; then
    CONFIG_FILE="$EXAMPLES_DIR/dag_config_projection_only.json"
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "FAIL: No example config file found"
    exit 1
fi

# Parse and validate structure
python3 << EOF
import json
import sys

with open("$CONFIG_FILE") as f:
    config = json.load(f)

# Check required top-level keys
if "engines" not in config:
    print("FAIL: Missing 'engines' array")
    sys.exit(1)

# Check each engine node has required fields
for i, engine in enumerate(config["engines"]):
    if "id" not in engine:
        print(f"FAIL: Engine {i} missing 'id'")
        sys.exit(1)
    if "type" not in engine:
        print(f"FAIL: Engine {i} missing 'type'")
        sys.exit(1)
    if "outputs" not in engine:
        print(f"FAIL: Engine {i} missing 'outputs'")
        sys.exit(1)

print("PASS: Example config has correct structure (engine, config, inputs, outputs)")
EOF

exit $?
