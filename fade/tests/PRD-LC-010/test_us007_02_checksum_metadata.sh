#!/bin/bash
# Test: verify checksum stored with segment metadata for verification
# AC: Checksum stored with segment metadata for later verification

INTEGRITY_CHECKER_FILE="livecalc-engine/js/src/orchestrator/integrity-checker.ts"

# Assert - Check for ChecksumMetadata interface
if ! grep -q 'ChecksumMetadata' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: No ChecksumMetadata interface"
    echo "Expected: ChecksumMetadata for storing checksum data"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for metadata storage
if ! grep -q '_checksumMetadata\|checksumMetadata' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: No checksum metadata storage"
    echo "Expected: Map or storage for checksum metadata"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for producer node tracking
if ! grep -q 'producerNodeId' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: Metadata does not track producer node"
    echo "Expected: producerNodeId in checksum metadata"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for timestamp in metadata
if ! grep -q 'timestamp' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: Metadata does not include timestamp"
    echo "Expected: timestamp for checksum computation time"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Checksum stored with segment metadata for verification"
exit 0
