#!/bin/bash
# Test: verify pipeline view shows DAG of nodes with connections
# AC: Pipeline view shows DAG of nodes with connections

PIPELINE_VIEW_FILE="livecalc-vscode/src/pipeline/pipeline-view.ts"

# Assert - Check for PipelineView class
if ! grep -q 'class PipelineView' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: PipelineView class not defined"
    echo "Expected: PipelineView class for DAG visualization"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for nodes in state
if ! grep -q 'nodes:.*PipelineNodeState\[\]' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: Pipeline state does not include nodes"
    echo "Expected: nodes array in PipelineExecutionState"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for connections in state
if ! grep -q 'connections:.*PipelineConnection\[\]' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: Pipeline state does not include connections"
    echo "Expected: connections array for DAG edges"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for SVG element in HTML
if ! grep -q 'pipelineSvg\|<svg' "$PIPELINE_VIEW_FILE"; then
    echo "FAIL: No SVG element for DAG rendering"
    echo "Expected: SVG element for pipeline visualization"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Pipeline view shows DAG of nodes with connections"
exit 0
