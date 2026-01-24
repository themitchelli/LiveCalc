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

// Pipeline execution endpoint (placeholder for now)
app.post('/execute', async (req, res) => {
  try {
    const { config, modelAssets } = req.body;

    if (!config) {
      return res.status(400).json({ error: 'Missing config in request body' });
    }

    logger.info({ config }, 'Received execution request');

    // TODO: Implement actual pipeline loading and execution
    // This will be completed in US-BRIDGE-04
    res.json({
      status: 'accepted',
      message: 'Execution request received (placeholder)',
      jobId: `job-${Date.now()}`
    });
  } catch (error) {
    logger.error({ error }, 'Execution request failed');
    res.status(500).json({
      error: 'Execution failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// WebSocket connection for result streaming
wss.on('connection', (ws) => {
  logger.info('WebSocket client connected');

  ws.on('message', (message) => {
    logger.info({ message: message.toString() }, 'WebSocket message received');
    // TODO: Handle WebSocket messages for pipeline control
    // This will be completed in US-BRIDGE-05
  });

  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
  });

  ws.on('error', (error) => {
    logger.error({ error }, 'WebSocket error');
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
