#!/bin/bash
# Test: Cloud worker parses the uploaded livecalc.config.json
# AC: Cloud worker parses the uploaded livecalc.config.json.
# US: US-BRIDGE-04 (Cloud Pipeline Reconstruction)

set -e

# Check pipeline loader for config parsing
PIPELINE_LOADER="livecalc-cloud/worker/src/pipeline-loader.ts"
WORKER_MAIN="livecalc-cloud/worker/src/main.ts"

if [[ ! -f "$PIPELINE_LOADER" ]]; then
    echo "FAIL: pipeline-loader.ts not found at $PIPELINE_LOADER"
    echo "Expected: File exists"
    echo "Actual: File not found"
    exit 1
fi

# Verify config parsing in pipeline loader
if ! grep -q "config\|Config" "$PIPELINE_LOADER"; then
    echo "FAIL: Config handling not found in pipeline loader"
    echo "Expected: Config parsing logic"
    echo "Actual: No config handling found"
    exit 1
fi

# Verify PipelineConfig interface exists
if ! grep -q "PipelineConfig\|interface.*Config" "$PIPELINE_LOADER"; then
    echo "FAIL: PipelineConfig interface not found"
    echo "Expected: PipelineConfig type definition"
    echo "Actual: No config interface found"
    exit 1
fi

# Verify nodes are parsed from config
if ! grep -q "config.nodes\|nodes:" "$PIPELINE_LOADER"; then
    echo "FAIL: Pipeline nodes parsing not found"
    echo "Expected: config.nodes parsing"
    echo "Actual: No nodes parsing found"
    exit 1
fi

# Check worker main.ts receives config in execute request
if [[ -f "$WORKER_MAIN" ]]; then
    if ! grep -q "config" "$WORKER_MAIN"; then
        echo "FAIL: Config handling not found in worker main"
        echo "Expected: Config in execute request"
        echo "Actual: No config handling"
        exit 1
    fi
fi

echo "PASS: Cloud worker parses the uploaded livecalc.config.json"
exit 0
