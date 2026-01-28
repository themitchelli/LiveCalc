#!/bin/bash
# Test: Verify examples for common workflows exist
# AC: Document: examples for common workflows (projection-only, projection + solver, full pipeline)

set -e

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
EXAMPLES_DIR="$PROJECT_ROOT/livecalc-orchestrator/examples"

missing_examples=()

# Check projection-only example
if [[ ! -f "$EXAMPLES_DIR/dag_config_projection_only.json" ]]; then
    missing_examples+=("projection-only")
fi

# Check ESG+projection example
if [[ ! -f "$EXAMPLES_DIR/dag_config_esg_projection.json" ]]; then
    missing_examples+=("projection+ESG")
fi

# Check full pipeline example
if [[ ! -f "$EXAMPLES_DIR/dag_config_full_pipeline.json" ]]; then
    missing_examples+=("full pipeline")
fi

if [[ ${#missing_examples[@]} -gt 0 ]]; then
    echo "FAIL: Missing workflow examples"
    echo "Expected: projection-only, projection+ESG, full pipeline"
    echo "Missing: ${missing_examples[*]}"
    exit 1
fi

echo "PASS: Examples exist for common workflows (projection-only, projection + solver, full pipeline)"
exit 0
