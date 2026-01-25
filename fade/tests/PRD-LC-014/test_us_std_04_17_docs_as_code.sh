#!/bin/bash
# Test: verify infrastructure.md documents documentation as code
# AC: Documentation as Code: 'API specs in OpenAPI YAML. Architecture diagrams in Mermaid/PlantUML.'

INFRA_FILE="./standards/infrastructure.md"

# Check file exists
if [[ ! -f "$INFRA_FILE" ]]; then
    echo "FAIL: standards/infrastructure.md file not found"
    exit 1
fi

# Check for documentation as code mention
if ! grep -qi "documentation.*code\|OpenAPI\|Mermaid\|PlantUML" "$INFRA_FILE"; then
    echo "FAIL: Documentation as Code not documented"
    echo "Expected: API specs in OpenAPI, diagrams in Mermaid"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Documentation as Code documented"
exit 0
