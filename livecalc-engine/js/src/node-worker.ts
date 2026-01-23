/**
 * Node.js Worker Entry Point
 *
 * This file is the entry point for worker_threads workers in Node.js.
 * It wraps the main worker logic with Node.js-specific message handling.
 */

import { parentPort } from 'node:worker_threads';
import type { WorkerMessage, WorkerResponse } from './types.js';
import { handleMessage } from './worker.js';

// Set up message handling from the parent thread
if (parentPort) {
  parentPort.on('message', (data: WorkerMessage) => {
    // Create a MessageEvent-like object for the common handler
    const event = { data } as MessageEvent<WorkerMessage>;
    handleMessage(event);
  });

  // Override the postResponse function to use parentPort
  // We do this by patching the global self.postMessage
  const originalPostMessage =
    typeof self !== 'undefined' ? self.postMessage : null;

  // Create a global self-like object for the worker code
  (globalThis as unknown as { self: { postMessage: (data: unknown) => void } }).self = {
    postMessage: (data: WorkerResponse) => {
      parentPort!.postMessage(data);
    },
    addEventListener: () => {}, // Handled above via parentPort.on
  } as unknown as typeof self;
}
