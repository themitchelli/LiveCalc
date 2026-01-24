#!/bin/bash
# Test: verify coding.md documents comment philosophy
# AC: Comment philosophy documented: 'Leave clear comments for ambiguous or non-obvious code. Do not over-comment self-documenting code. Respect human developers by assuming competence.'

CODING_FILE="./standards/coding.md"

# Check file exists
if [[ ! -f "$CODING_FILE" ]]; then
    echo "FAIL: standards/coding.md file not found"
    exit 1
fi

# Check for comment section
if ! grep -qi "comment" "$CODING_FILE"; then
    echo "FAIL: Comment philosophy not documented"
    echo "Expected: Section about comments"
    echo "Actual: No comment-related content found"
    exit 1
fi

# Check for ambiguous/non-obvious guidance
if ! grep -qi "ambiguous\|non-obvious\|why\|not what" "$CODING_FILE"; then
    echo "FAIL: Guidance about commenting ambiguous code not found"
    echo "Expected: Guidance on when to comment"
    echo "Actual: Not found"
    exit 1
fi

# Check for over-commenting warning
if ! grep -qi "over-comment\|self-documenting\|obvious\|don't comment" "$CODING_FILE"; then
    echo "FAIL: Warning against over-commenting not found"
    echo "Expected: Guidance on avoiding over-commenting"
    echo "Actual: Not found"
    exit 1
fi

# Check for competence assumption
if ! grep -qi "competence\|humans first\|human developer" "$CODING_FILE"; then
    echo "FAIL: Developer competence assumption not documented"
    echo "Expected: Respect for developer competence"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Comment philosophy documented (clear for ambiguous, don't over-comment, assume competence)"
exit 0
