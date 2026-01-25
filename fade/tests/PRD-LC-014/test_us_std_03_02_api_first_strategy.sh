#!/bin/bash
# Test: verify api-security.md documents API-First Strategy
# AC: API-First Strategy documented: 'Design OpenAPI/Swagger specification before implementation. All cloud services expose REST APIs. VS Code integration consumes these APIs.'

API_SECURITY_FILE="./standards/api-security.md"

# Check file exists
if [[ ! -f "$API_SECURITY_FILE" ]]; then
    echo "FAIL: standards/api-security.md file not found"
    exit 1
fi

# Check for API-First mention
if ! grep -qi "API-First\|API first" "$API_SECURITY_FILE"; then
    echo "FAIL: API-First Strategy not documented"
    echo "Expected: API-First Strategy section"
    echo "Actual: Not found"
    exit 1
fi

# Check for OpenAPI/Swagger mention
if ! grep -qi "OpenAPI\|Swagger" "$API_SECURITY_FILE"; then
    echo "FAIL: OpenAPI/Swagger not mentioned"
    echo "Expected: OpenAPI/Swagger specification reference"
    echo "Actual: Not found"
    exit 1
fi

# Check for REST API mention
if ! grep -qi "REST API\|REST" "$API_SECURITY_FILE"; then
    echo "FAIL: REST APIs not mentioned"
    echo "Expected: REST API reference"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: API-First Strategy documented with OpenAPI and REST APIs"
exit 0
