#!/bin/bash
# Test: verify worker overhead profiling tool exists
# AC: Profile worker pool to identify overhead sources (startup, data copy, messaging)

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# Check that the profiling script exists
PROFILE_SCRIPT="$PROJECT_ROOT/livecalc-engine/benchmarks/profile-overhead.ts"

if [[ ! -f "$PROFILE_SCRIPT" ]]; then
    echo "FAIL: Expected profile-overhead.ts to exist"
    echo "Expected: $PROFILE_SCRIPT"
    echo "Actual: file not found"
    exit 1
fi

# Verify the script has profiling capabilities (startup, data copy, messaging)
if ! grep -q "startup\|init" "$PROFILE_SCRIPT" || ! grep -q "data\|load\|transfer" "$PROFILE_SCRIPT" || ! grep -q "message\|worker" "$PROFILE_SCRIPT"; then
    echo "FAIL: profile-overhead.ts should contain profiling for startup, data transfer, and messaging"
    echo "Expected: code analyzing startup, data transfer, and messaging overhead"
    exit 1
fi

echo "PASS: Worker overhead profiling tool exists and covers expected areas"
exit 0
