/**
 * Tests for Pipeline Loader
 *
 * Validates that cloud worker can reconstruct SharedArrayBuffer pipeline
 * exactly as it was configured locally.
 */

import { strict as assert } from 'assert';
import { test, describe } from 'node:test';
import { PipelineLoader } from './pipeline-loader.js';

describe('PipelineLoader', () => {
  test('validates assets with missing config', () => {
    const loader = new PipelineLoader();
    const assets = {
      wasmBinaries: new Map(),
      pythonScripts: new Map(),
      config: null as any,
      assumptionRefs: []
    };

    const result = loader.validateAssets(assets);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('Missing pipeline configuration'));
  });

  test('validates assets with missing WASM binary', () => {
    const loader = new PipelineLoader();
    const assets = {
      wasmBinaries: new Map(),
      pythonScripts: new Map(),
      config: {
        nodes: [
          {
            id: 'node1',
            engine: 'wasm://livecalc',
            inputs: {},
            outputs: {}
          }
        ]
      },
      assumptionRefs: []
    };

    const result = loader.validateAssets(assets);
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes('Missing WASM binary for engine: livecalc'));
  });

  test('validates assets with valid config', () => {
    const loader = new PipelineLoader();
    const assets = {
      wasmBinaries: new Map([['livecalc', new Uint8Array([1, 2, 3])]]),
      pythonScripts: new Map(),
      config: {
        nodes: [
          {
            id: 'node1',
            engine: 'wasm://livecalc',
            inputs: {},
            outputs: { npv: 'bus://results/npv' }
          }
        ]
      },
      assumptionRefs: []
    };

    const result = loader.validateAssets(assets);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  test('computes consistent assets hash', () => {
    const loader = new PipelineLoader();
    const assets1 = {
      wasmBinaries: new Map([['livecalc', new Uint8Array([1, 2, 3])]]),
      pythonScripts: new Map(),
      config: {
        nodes: [
          {
            id: 'node1',
            engine: 'wasm://livecalc',
            inputs: {},
            outputs: {}
          }
        ]
      },
      assumptionRefs: []
    };

    const assets2 = { ...assets1 };

    const hash1 = loader.computeAssetsHash(assets1);
    const hash2 = loader.computeAssetsHash(assets2);

    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64); // SHA-256 hex string
  });

  test('loads simple pipeline successfully', async () => {
    const loader = new PipelineLoader();
    const assets = {
      wasmBinaries: new Map([['livecalc', new Uint8Array([1, 2, 3])]]),
      pythonScripts: new Map(),
      config: {
        nodes: [
          {
            id: 'projection',
            engine: 'wasm://livecalc',
            inputs: {
              policies: '$policies',
              assumptions: '$assumptions'
            },
            outputs: {
              npv: 'bus://results/npv'
            },
            config: {
              npv_size: '10000:float64'
            }
          }
        ]
      },
      assumptionRefs: ['assumptions://mortality:latest']
    };

    const result = await loader.loadPipeline(assets);

    assert.equal(result.success, true);
    assert.ok(result.pipelineId);
    assert.ok(result.assetsHash);
    assert.ok(result.pipeline);
    assert.ok(result.pipeline!.sharedArrayBuffer);
    assert.ok(result.pipeline!.sharedArrayBuffer.byteLength > 0);
    assert.equal(result.pipeline!.nodeOrder.length, 1);
    assert.equal(result.pipeline!.nodeOrder[0], 'projection');
  });

  test('loads multi-node pipeline in correct order', async () => {
    const loader = new PipelineLoader();
    const assets = {
      wasmBinaries: new Map([
        ['livecalc', new Uint8Array([1, 2, 3])],
        ['aggregator', new Uint8Array([4, 5, 6])]
      ]),
      pythonScripts: new Map(),
      config: {
        nodes: [
          {
            id: 'aggregation',
            engine: 'wasm://aggregator',
            inputs: {
              npv: 'bus://results/npv'
            } as Record<string, string>,
            outputs: {
              summary: 'bus://results/summary'
            } as Record<string, string>,
            config: {
              summary_size: '100:float64'
            }
          },
          {
            id: 'projection',
            engine: 'wasm://livecalc',
            inputs: {
              policies: '$policies'
            } as Record<string, string>,
            outputs: {
              npv: 'bus://results/npv'
            } as Record<string, string>,
            config: {
              npv_size: '10000:float64'
            }
          }
        ]
      },
      assumptionRefs: []
    };

    const result = await loader.loadPipeline(assets);

    assert.equal(result.success, true);
    assert.equal(result.pipeline!.nodeOrder.length, 2);
    // Projection must run before aggregation
    assert.equal(result.pipeline!.nodeOrder[0], 'projection');
    assert.equal(result.pipeline!.nodeOrder[1], 'aggregation');
  });

  test('detects circular dependencies', async () => {
    const loader = new PipelineLoader();
    const assets = {
      wasmBinaries: new Map([['livecalc', new Uint8Array([1, 2, 3])]]),
      pythonScripts: new Map(),
      config: {
        nodes: [
          {
            id: 'node1',
            engine: 'wasm://livecalc',
            inputs: {
              data: 'bus://cycle/b'
            },
            outputs: {
              result: 'bus://cycle/a'
            }
          },
          {
            id: 'node2',
            engine: 'wasm://livecalc',
            inputs: {
              data: 'bus://cycle/a'
            },
            outputs: {
              result: 'bus://cycle/b'
            }
          }
        ]
      },
      assumptionRefs: []
    };

    const result = await loader.loadPipeline(assets);

    assert.equal(result.success, false);
    assert.ok(result.errors);
    assert.ok(result.errors[0].includes('circular dependencies'));
  });

  test('verifies runtime parity', () => {
    const loader = new PipelineLoader();
    const parity = loader.verifyRuntimeParity();

    assert.equal(parity.hasSharedArrayBuffer, true);
    assert.equal(parity.hasAtomics, true);
    assert.equal(parity.alignment16Byte, true);
    assert.ok(parity.nodeVersion);
    // SIMD depends on environment variable
    assert.equal(typeof parity.hasSIMD, 'boolean');
  });
});
