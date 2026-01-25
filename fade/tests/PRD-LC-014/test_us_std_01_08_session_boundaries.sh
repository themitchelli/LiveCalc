#!/bin/bash
# Test: verify FADE.md includes Session Boundaries
# AC: Session Boundaries clarified: allowed (create features, tests, docs), requires approval (cloud infrastructure changes), never (commit secrets, modify vendor code)

FADE_FILE="./FADE.md"

# Check file exists
if [[ ! -f "$FADE_FILE" ]]; then
    echo "FAIL: FADE.md file not found"
    exit 1
fi

# Check for Session Boundaries section
if ! grep -qi "Session Boundaries\|Allowed Actions\|Requires.*Approval\|Never Do" "$FADE_FILE"; then
    echo "FAIL: Session Boundaries section not found"
    echo "Expected: Session Boundaries section with allowed/approval/never"
    echo "Actual: Not found"
    exit 1
fi

# Check for allowed actions (tests, docs, features)
if ! grep -qi "test\|documentation\|feature" "$FADE_FILE"; then
    echo "FAIL: Allowed actions not documented"
    echo "Expected: Create features, tests, docs as allowed"
    echo "Actual: Not found"
    exit 1
fi

# Check for approval requirements (infrastructure)
if ! grep -qi "infrastructure\|approval\|cloud" "$FADE_FILE"; then
    echo "FAIL: Approval requirements not documented"
    echo "Expected: Cloud infrastructure changes require approval"
    echo "Actual: Not found"
    exit 1
fi

# Check for never do (secrets)
if ! grep -qi "secret\|credential\|never" "$FADE_FILE"; then
    echo "FAIL: Never-do actions not documented"
    echo "Expected: Never commit secrets"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Session Boundaries clarified with allowed/approval/never categories"
exit 0
