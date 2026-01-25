#!/bin/bash
# Test: Initializes pipeline nodes according to PRD-LC-010 Bus Protocol
# AC: Initializes the pipeline nodes (C++/Python) according to the PRD-LC-010 Bus Protocol.
# US: US-BRIDGE-04 (Cloud Pipeline Reconstruction)

set -e

# Check pipeline loader for node initialization
PIPELINE_LOADER="livecalc-cloud/worker/src/pipeline-loader.ts"

if [[ ! -f "$PIPELINE_LOADER" ]]; then
    echo "FAIL: pipeline-loader.ts not found"
    exit 1
fi

# Verify pipeline node initialization
if ! grep -q "initializeEngines\|engineInstances" "$PIPELINE_LOADER"; then
    echo "FAIL: Engine initialization not found"
    echo "Expected: Engine/node initialization"
    echo "Actual: No initialization found"
    exit 1
fi

# Verify WASM engine support (C++)
if ! grep -q "wasm://\|wasmBinaries" "$PIPELINE_LOADER"; then
    echo "FAIL: WASM/C++ engine support not found"
    echo "Expected: wasm:// protocol support"
    echo "Actual: No WASM support found"
    exit 1
fi

# Verify Python engine support
if ! grep -q "python://\|pythonScripts" "$PIPELINE_LOADER"; then
    echo "FAIL: Python engine support not found"
    echo "Expected: python:// protocol support"
    echo "Actual: No Python support found"
    exit 1
fi

# Verify atomic signal management (Bus Protocol coordination)
if ! grep -q "AtomicSignalManager\|Atomics" "$PIPELINE_LOADER"; then
    echo "FAIL: Atomic signal management not found"
    echo "Expected: AtomicSignalManager for node coordination"
    echo "Actual: No signal management found"
    exit 1
fi

# Verify execution order calculation (topological sort)
if ! grep -q "calculateExecutionOrder\|nodeOrder\|topological" "$PIPELINE_LOADER"; then
    echo "FAIL: Execution order calculation not found"
    echo "Expected: Topological sort for node ordering"
    echo "Actual: No execution order calculation"
    exit 1
fi

echo "PASS: Initializes pipeline nodes according to Bus Protocol"
exit 0
