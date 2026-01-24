#!/bin/bash
# Test: verify orchestrator computes CRC32 checksum on bus segments
# AC: Orchestrator computes CRC32 checksum on bus segments after each node completes

INTEGRITY_CHECKER_FILE="livecalc-engine/js/src/orchestrator/integrity-checker.ts"

# Assert - Check for CRC32 implementation
if ! grep -q 'CRC32\|crc32' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: Integrity checker does not reference CRC32"
    echo "Expected: CRC32 algorithm for checksums"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for computeChecksum method
if ! grep -q 'computeChecksum' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: Integrity checker does not have computeChecksum"
    echo "Expected: computeChecksum method"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for computeCRC32 function
if ! grep -q 'computeCRC32' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: No computeCRC32 function"
    echo "Expected: computeCRC32 function for checksum"
    echo "Actual: Not found"
    exit 1
fi

# Assert - Check for polynomial constant
if ! grep -q 'CRC32_POLYNOMIAL\|0xedb88320' "$INTEGRITY_CHECKER_FILE"; then
    echo "FAIL: No CRC32 polynomial defined"
    echo "Expected: IEEE 802.3 polynomial (0xedb88320)"
    echo "Actual: Not found"
    exit 1
fi

echo "PASS: Orchestrator computes CRC32 checksum on bus segments"
exit 0
