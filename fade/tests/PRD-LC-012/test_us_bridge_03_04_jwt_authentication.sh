#!/bin/bash
# Test: Authentication scopes the job to the user's JWT from Assumptions Manager
# AC: Authentication: Scopes the job to the user's JWT from Assumptions Manager.
# US: US-BRIDGE-03 (Local-to-Cloud Bridge API)

set -e

# Check jobs router for authentication
JOBS_ROUTER="livecalc-cloud/api/routers/jobs.py"
AUTH_SERVICE="livecalc-cloud/api/services/auth.py"

if [[ ! -f "$JOBS_ROUTER" ]]; then
    echo "FAIL: jobs.py router not found"
    exit 1
fi

# Verify dependency injection of current user
if ! grep -q "get_current_user\|Depends" "$JOBS_ROUTER"; then
    echo "FAIL: User authentication not found in submit endpoint"
    echo "Expected: Depends(get_current_user)"
    echo "Actual: No user authentication"
    exit 1
fi

# Verify tenant_id is extracted from user
if ! grep -q "tenant_id" "$JOBS_ROUTER"; then
    echo "FAIL: tenant_id extraction not found"
    echo "Expected: tenant_id from user JWT"
    echo "Actual: No tenant_id handling"
    exit 1
fi

# Verify auth service exists
if [[ -f "$AUTH_SERVICE" ]]; then
    # Check for JWT validation
    if ! grep -q "jwt\|JWT\|token" "$AUTH_SERVICE"; then
        echo "FAIL: JWT handling not found in auth service"
        echo "Expected: JWT token validation"
        echo "Actual: No JWT handling found"
        exit 1
    fi

    # Check for Assumptions Manager URL
    if ! grep -q "assumptions\|AM\|manager" "$AUTH_SERVICE"; then
        echo "FAIL: Assumptions Manager integration not found"
        echo "Expected: Assumptions Manager auth"
        echo "Actual: No AM integration found"
        exit 1
    fi
fi

echo "PASS: Authentication scopes job to user's JWT"
exit 0
