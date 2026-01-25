#!/bin/bash
# Test: Job API streams binary result chunks over WebSocket using raw Uint8Arrays
# AC: Job API streams binary result chunks over WebSocket using raw Uint8Arrays.
# US: US-BRIDGE-05 (Cloud Result Streaming)

set -e

# Check worker main.ts for WebSocket binary streaming
WORKER_MAIN="livecalc-cloud/worker/src/main.ts"
RESULT_STREAMER="livecalc-vscode/src/cloud/result-streamer.ts"

if [[ ! -f "$WORKER_MAIN" ]]; then
    echo "FAIL: Worker main.ts not found"
    exit 1
fi

# Verify WebSocket server is created
if ! grep -q "WebSocketServer\|WebSocket" "$WORKER_MAIN"; then
    echo "FAIL: WebSocket server not found in worker"
    echo "Expected: WebSocketServer setup"
    echo "Actual: No WebSocket server found"
    exit 1
fi

# Verify binary data sending (Buffer or Uint8Array)
if ! grep -q "Buffer.from\|Uint8Array\|resultsBuffer" "$WORKER_MAIN"; then
    echo "FAIL: Binary data streaming not found"
    echo "Expected: Buffer.from or Uint8Array for binary streaming"
    echo "Actual: No binary data handling"
    exit 1
fi

# Check result streamer for binary reception
if [[ -f "$RESULT_STREAMER" ]]; then
    # Verify Uint8Array handling
    if ! grep -q "Uint8Array\|ArrayBuffer" "$RESULT_STREAMER"; then
        echo "FAIL: Uint8Array handling not found in result streamer"
        echo "Expected: Uint8Array/ArrayBuffer parsing"
        echo "Actual: No binary handling found"
        exit 1
    fi

    # Verify WebSocket message handling
    if ! grep -q "handleMessage\|onmessage" "$RESULT_STREAMER"; then
        echo "FAIL: WebSocket message handler not found"
        echo "Expected: Message handling logic"
        echo "Actual: No message handler"
        exit 1
    fi
fi

echo "PASS: Job API streams binary result chunks over WebSocket"
exit 0
