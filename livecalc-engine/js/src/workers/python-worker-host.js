/**
 * Python Worker Host - Web Worker script for Pyodide runtime
 *
 * This worker hosts the Pyodide (WASM Python) runtime in a background thread
 * to prevent blocking the main VS Code UI during Python execution.
 *
 * The worker receives Python scripts from the orchestrator, executes them,
 * and communicates results back via postMessage.
 *
 * Architecture:
 * - Main thread: Orchestrator sends Python code and data
 * - Worker thread: Pyodide executes Python, returns results
 * - Communication: postMessage (structured clone for data transfer)
 *
 * Performance characteristics:
 * - Pyodide cold start: ~2-3s (one-time initialization)
 * - Warm execution: ~100ms for typical shocks
 * - Memory: ~50MB baseline + script requirements
 */

// Import EngineWorkerContext for message handling
import { EngineWorkerContext } from '../engine-worker.js';

// Global Pyodide instance (lazy-loaded)
let pyodideReady = false;
let pyodideInitPromise = null;

/**
 * Load Pyodide runtime from CDN.
 * Cached globally to avoid re-initialization.
 */
async function ensurePyodideLoaded() {
  if (pyodideReady) {
    return;
  }

  if (!pyodideInitPromise) {
    pyodideInitPromise = initializePyodide();
  }

  await pyodideInitPromise;
  pyodideReady = true;
}

/**
 * Initialize Pyodide runtime.
 */
async function initializePyodide() {
  try {
    // Load Pyodide from CDN (or bundled assets)
    // Version 0.25+ recommended for stability and NumPy performance
    const pyodideUrl = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';

    // Import Pyodide script (self.importScripts for Web Workers)
    self.importScripts(pyodideUrl);

    // Initialize Pyodide environment
    const pyodide = await self.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
    });

    // Pre-load core packages for performance
    // NumPy is essential for array operations
    await pyodide.loadPackage(['numpy']);

    // Make pyodide available globally in this worker
    self.pyodide = pyodide;

    console.log('[PythonWorkerHost] Pyodide initialized successfully');
  } catch (error) {
    console.error('[PythonWorkerHost] Failed to initialize Pyodide:', error);
    throw new Error(`Pyodide initialization failed: ${error.message}`);
  }
}

/**
 * Worker message handler using EngineWorkerContext.
 */
const workerContext = new EngineWorkerContext();

self.addEventListener('message', async (event) => {
  const message = event.data;

  try {
    // Ensure Pyodide is loaded before handling any engine messages
    if (message.type === 'engine-init' && message.engineType === 'pyodide') {
      await ensurePyodideLoaded();
    }

    // Delegate to EngineWorkerContext for standardized message handling
    const response = await workerContext.handleMessage(message);

    self.postMessage(response);
  } catch (error) {
    // Error handling for worker-level failures
    self.postMessage({
      type: 'engine-error',
      message: `Worker error: ${error instanceof Error ? error.message : String(error)}`,
      code: 'WORKER_ERROR',
    });
  }
});

/**
 * Worker initialization message.
 */
self.postMessage({
  type: 'worker-ready',
  capabilities: {
    pyodide: true,
    numpy: true,
    pandas: false, // Loaded on demand
    scipy: false, // Loaded on demand
  },
});

console.log('[PythonWorkerHost] Python worker host initialized and ready');
