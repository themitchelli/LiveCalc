#!/bin/bash
# Test: verify default exclude patterns in package.json
# AC: Exclude patterns: node_modules/**, .git/**, dist/**, build/**

PACKAGE_JSON="$(dirname "$0")/../../../livecalc-vscode/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "FAIL: package.json not found at $PACKAGE_JSON"
    exit 1
fi

# Check watchExclude setting default includes required patterns
SETTING=$(grep -A 10 '"livecalc.watchExclude"' "$PACKAGE_JSON" 2>/dev/null)

if [[ -z "$SETTING" ]]; then
    echo "FAIL: livecalc.watchExclude setting not found"
    exit 1
fi

# Check for node_modules
if ! echo "$SETTING" | grep -q 'node_modules'; then
    echo "FAIL: node_modules should be in default excludes"
    exit 1
fi

# Check for .git
if ! echo "$SETTING" | grep -q '\.git'; then
    echo "FAIL: .git should be in default excludes"
    exit 1
fi

# Check for dist
if ! echo "$SETTING" | grep -q 'dist'; then
    echo "FAIL: dist should be in default excludes"
    exit 1
fi

# Check for build
if ! echo "$SETTING" | grep -q 'build'; then
    echo "FAIL: build should be in default excludes"
    exit 1
fi

echo "PASS: Default exclude patterns include node_modules, .git, dist, build"
exit 0
