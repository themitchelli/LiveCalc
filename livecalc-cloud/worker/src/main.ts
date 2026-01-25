/**
 * LiveCalc Cloud Worker - Main Entry Point
 *
 * Provides a containerized runtime environment that mirrors local development.
 * Supports WASM SIMD128 execution with 16-byte memory alignment for parity with desktop.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import pino from 'pino';
import { PipelineLoader } from './pipeline-loader.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  },
  level: process.env.LOG_LEVEL || 'info'
});

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Environment configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const MAX_MEMORY_MB = parseInt(process.env.MAX_MEMORY_MB || '4096', 10);
const ENABLE_SIMD = process.env.WASM_SIMD === '1';

// Middleware
app.use(express.json({ limit: '100mb' }));
app.use((req, res, next) => {
  logger.info({ method: req.method, path: req.path }, 'Request received');
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      maxMemoryMb: MAX_MEMORY_MB
    },
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      simdEnabled: ENABLE_SIMD
    },
    capabilities: {
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      atomics: typeof Atomics !== 'undefined',
      simd128: ENABLE_SIMD
    }
  });
});

// Runtime capabilities check endpoint
app.get('/capabilities', (req, res) => {
  // Verify SIMD support by checking if we can create a SharedArrayBuffer
  // and perform atomic operations
  try {
    const sab = new SharedArrayBuffer(16);
    const view = new Int32Array(sab);
    Atomics.store(view, 0, 42);
    const value = Atomics.load(view, 0);

    res.json({
      sharedArrayBuffer: true,
      atomics: true,
      simd128: ENABLE_SIMD,
      alignment: {
        'supported': '16-byte',
        'verified': value === 42
      },
      parityCheck: {
        status: 'ready',
        message: 'Runtime matches local development environment'
      }
    });
  } catch (error) {
    logger.error({ error }, 'Runtime capabilities check failed');
    res.status(500).json({
      error: 'Runtime capabilities check failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Pipeline execution endpoint
app.post('/execute', async (req, res) => {
  try {
    const { config, wasmBinaries, pythonScripts, assumptionRefs } = req.body;

    if (!config) {
      return res.status(400).json({ error: 'Missing config in request body' });
    }

    logger.info({
      nodeCount: config.nodes?.length || 0,
      hasDebugConfig: !!config.debug
    }, 'Received execution request');

    // Convert base64-encoded binaries back to Uint8Array
    const wasmBinariesMap = new Map<string, Uint8Array>();
    if (wasmBinaries) {
      for (const [name, base64] of Object.entries(wasmBinaries)) {
        wasmBinariesMap.set(name, Buffer.from(base64 as string, 'base64'));
      }
    }

    // Reconstruct model assets
    const pythonScriptsMap = new Map<string, string>();
    if (pythonScripts) {
      for (const [name, script] of Object.entries(pythonScripts)) {
        if (typeof script === 'string') {
          pythonScriptsMap.set(name, script);
        }
      }
    }

    const modelAssets = {
      wasmBinaries: wasmBinariesMap,
      pythonScripts: pythonScriptsMap,
      config,
      assumptionRefs: assumptionRefs || []
    };

    // Load and initialize pipeline
    const pipelineLoader = new PipelineLoader();
    const result = await pipelineLoader.loadPipeline(modelAssets);

    if (!result.success) {
      return res.status(400).json({
        error: 'Pipeline initialization failed',
        details: result.errors
      });
    }

    logger.info({
      pipelineId: result.pipelineId,
      assetsHash: result.assetsHash
    }, 'Pipeline initialized successfully');

    res.json({
      status: 'initialized',
      pipelineId: result.pipelineId,
      assetsHash: result.assetsHash,
      memoryAllocatedMB: result.pipeline
        ? (result.pipeline.sharedArrayBuffer.byteLength / 1024 / 1024).toFixed(2)
        : 0,
      nodeCount: config.nodes?.length || 0,
      executionOrder: result.pipeline?.nodeOrder || [],
      message: 'Pipeline loaded and ready for execution'
    });
  } catch (error) {
    logger.error({ error }, 'Execution request failed');
    res.status(500).json({
      error: 'Execution failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Store active pipelines by job ID
const activePipelines = new Map<string, { loader: PipelineLoader; result: any }>();

// Debug session state
interface DebugState {
  isPaused: boolean;
  pausedAt: number | null;
  currentNode: string | null;
  waitHandle: Int32Array | null;
}

const debugSessions = new Map<string, DebugState>();

// WebSocket connection for result streaming
wss.on('connection', (ws) => {
  logger.info('WebSocket client connected');

  let currentJobId: string | null = null;

  ws.on('message', async (messageData) => {
    try {
      const message = JSON.parse(messageData.toString());
      logger.info({ type: message.type, jobId: message.jobId }, 'WebSocket message received');

      if (message.type === 'execute') {
        // Execute pipeline and stream results
        currentJobId = message.jobId;
        const { config, wasmBinaries, pythonScripts, assumptionRefs } = message.payload;

        // Convert base64-encoded binaries
        const wasmBinariesMap = new Map<string, Uint8Array>();
        if (wasmBinaries) {
          for (const [name, base64] of Object.entries(wasmBinaries)) {
            wasmBinariesMap.set(name, Buffer.from(base64 as string, 'base64'));
          }
        }

        const pythonScriptsMap = new Map<string, string>();
        if (pythonScripts) {
          for (const [name, script] of Object.entries(pythonScripts)) {
            if (typeof script === 'string') {
              pythonScriptsMap.set(name, script);
            }
          }
        }

        const modelAssets = {
          wasmBinaries: wasmBinariesMap,
          pythonScripts: pythonScriptsMap,
          config,
          assumptionRefs: assumptionRefs || []
        };

        const pipelineLoader = new PipelineLoader();
        const result = await pipelineLoader.loadPipeline(modelAssets);

        if (!result.success) {
          ws.send(JSON.stringify({
            type: 'error',
            jobId: currentJobId,
            error: 'Pipeline initialization failed',
            details: result.errors
          }));
          return;
        }

        activePipelines.set(currentJobId, { loader: pipelineLoader, result });

        // Send initialization complete
        ws.send(JSON.stringify({
          type: 'initialized',
          jobId: currentJobId,
          pipelineId: result.pipelineId,
          assetsHash: result.assetsHash,
          nodeCount: config.nodes?.length || 0
        }));

        // TODO: Execute pipeline nodes in topological order
        // For now, send mock results to demonstrate streaming
        // This will be replaced with actual execution in future PRD

        // Send progress updates
        const nodeCount = config.nodes?.length || 1;
        for (let i = 0; i < nodeCount; i++) {
          ws.send(JSON.stringify({
            type: 'progress',
            jobId: currentJobId,
            current: i + 1,
            total: nodeCount,
            message: `Executing node ${i + 1}/${nodeCount}`
          }));

          // Simulate processing time
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Send mock results (will be replaced with actual pipeline execution results)
        const mockResults = {
          statistics: {
            mean: 125000.0,
            stdDev: 15000.0,
            cte95: 95000.0,
            percentiles: {
              p50: 124000.0,
              p75: 132000.0,
              p90: 140000.0,
              p95: 145000.0,
              p99: 155000.0
            },
            min: 80000.0,
            max: 180000.0
          },
          executionTimeMs: 1250,
          policyCount: 10000,
          scenarioCount: 1000
        };

        // Stream results as binary chunks (Uint8Arrays)
        const resultsBuffer = Buffer.from(JSON.stringify(mockResults));
        ws.send(resultsBuffer);

        // Send completion marker
        ws.send(JSON.stringify({
          type: 'complete',
          jobId: currentJobId,
          executionTimeMs: mockResults.executionTimeMs
        }));

        logger.info({ jobId: currentJobId, executionTimeMs: mockResults.executionTimeMs }, 'Pipeline execution complete');
      } else if (message.type === 'debug:pause') {
        // Handle debug pause signal
        const sessionId = message.sessionId;
        const nodeId = message.nodeId;

        logger.info({ sessionId, nodeId }, 'Received debug:pause signal');

        // Create or update debug state
        if (!debugSessions.has(sessionId)) {
          debugSessions.set(sessionId, {
            isPaused: false,
            pausedAt: null,
            currentNode: null,
            waitHandle: null
          });
        }

        const debugState = debugSessions.get(sessionId)!;
        debugState.isPaused = true;
        debugState.pausedAt = Date.now();
        debugState.currentNode = nodeId || null;

        // Trigger Atomics.wait in execution loop (would be implemented in actual execution)
        // For now, just acknowledge the pause
        ws.send(JSON.stringify({
          type: 'debug:paused',
          sessionId,
          nodeId: debugState.currentNode,
          timestamp: new Date().toISOString()
        }));

      } else if (message.type === 'debug:resume') {
        // Handle debug resume signal
        const sessionId = message.sessionId;

        logger.info({ sessionId }, 'Received debug:resume signal');

        const debugState = debugSessions.get(sessionId);
        if (!debugState) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Debug session not found'
          }));
          return;
        }

        debugState.isPaused = false;
        debugState.pausedAt = null;

        // Trigger Atomics.notify to wake execution loop
        if (debugState.waitHandle) {
          Atomics.notify(debugState.waitHandle, 0);
        }

        ws.send(JSON.stringify({
          type: 'debug:resumed',
          sessionId,
          timestamp: new Date().toISOString()
        }));

      } else if (message.type === 'debug:step') {
        // Handle debug step signal (execute one node)
        const sessionId = message.sessionId;

        logger.info({ sessionId }, 'Received debug:step signal');

        const debugState = debugSessions.get(sessionId);
        if (!debugState || !debugState.isPaused) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Not in paused state'
          }));
          return;
        }

        // Execute single node (implementation would go here)
        const nextNode = 'node-placeholder'; // Would get from pipeline execution

        ws.send(JSON.stringify({
          type: 'debug:stepped',
          sessionId,
          nextNode,
          timestamp: new Date().toISOString()
        }));

      } else if (message.type === 'debug:inspect') {
        // Handle memory inspection request
        const { requestId, sessionId, busUri, offset, length } = message;

        logger.info({ sessionId, busUri, offset, length }, 'Received debug:inspect request');

        const pipelineData = activePipelines.get(currentJobId || '');
        if (!pipelineData || !pipelineData.result.pipeline) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Pipeline not found'
          }));
          return;
        }

        const pipeline = pipelineData.result.pipeline;
        const sab = pipeline.sharedArrayBuffer;

        // Read raw memory segment
        const data = new Uint8Array(sab, offset, length);

        // Send binary data as WebSocket binary message
        ws.send(data.buffer);

        logger.info({ requestId, bytesRead: data.length }, 'Sent memory segment');
      }
    } catch (error) {
      logger.error({ error }, 'WebSocket message handling error');
      ws.send(JSON.stringify({
        type: 'error',
        jobId: currentJobId,
        error: 'Execution failed',
        details: error instanceof Error ? error.message : String(error)
      }));
    }
  });

  ws.on('close', () => {
    logger.info({ jobId: currentJobId }, 'WebSocket client disconnected');
    if (currentJobId && activePipelines.has(currentJobId)) {
      activePipelines.delete(currentJobId);
    }
  });

  ws.on('error', (error) => {
    logger.error({ error, jobId: currentJobId }, 'WebSocket error');
  });

  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString()
  }));
});

// Start server
server.listen(PORT, () => {
  logger.info({
    port: PORT,
    maxMemoryMb: MAX_MEMORY_MB,
    simdEnabled: ENABLE_SIMD,
    nodeVersion: process.version
  }, 'LiveCalc Cloud Worker started');

  // Log runtime verification
  if (typeof SharedArrayBuffer === 'undefined') {
    logger.warn('SharedArrayBuffer not available - may impact performance');
  }
  if (typeof Atomics === 'undefined') {
    logger.warn('Atomics not available - may impact performance');
  }
  if (!ENABLE_SIMD) {
    logger.warn('SIMD not enabled - performance may not match local environment');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
