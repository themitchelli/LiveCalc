/**
 * Pipeline Loader for Cloud Worker
 *
 * Reconstructs the SharedArrayBuffer pipeline in the cloud environment
 * exactly as it was configured locally. This ensures parity between
 * local and cloud execution.
 */

import { createHash } from 'crypto';
import pino from 'pino';

const logger = pino({ name: 'pipeline-loader' });

export interface PipelineConfig {
  nodes: PipelineNode[];
  debug?: {
    breakpoints?: string[];
    enableIntegrityChecks?: boolean;
  };
}

export interface PipelineNode {
  id: string;
  engine: string; // e.g., "wasm://livecalc" or "python://custom"
  inputs: Record<string, string>; // bus:// references
  outputs: Record<string, string>; // bus:// references
  config?: Record<string, unknown>;
}

export interface ModelAssets {
  wasmBinaries: Map<string, Uint8Array>;
  pythonScripts: Map<string, string>;
  config: PipelineConfig;
  assumptionRefs: string[];
}

export class PipelineLoader {
  private logger = logger.child({ component: 'PipelineLoader' });

  /**
   * Validates that model assets match expected structure and integrity
   */
  validateAssets(assets: ModelAssets): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check config structure
    if (!assets.config || !assets.config.nodes) {
      errors.push('Missing pipeline configuration or nodes array');
    }

    // Validate each node
    if (assets.config?.nodes) {
      for (const node of assets.config.nodes) {
        if (!node.id || !node.engine) {
          errors.push(`Node missing required fields: ${JSON.stringify(node)}`);
        }

        // Check that referenced engines have corresponding binaries/scripts
        if (node.engine.startsWith('wasm://')) {
          const engineName = node.engine.replace('wasm://', '');
          if (!assets.wasmBinaries.has(engineName)) {
            errors.push(`Missing WASM binary for engine: ${engineName}`);
          }
        } else if (node.engine.startsWith('python://')) {
          const scriptName = node.engine.replace('python://', '');
          if (!assets.pythonScripts.has(scriptName)) {
            errors.push(`Missing Python script for engine: ${scriptName}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Computes SHA-256 hash of all assets for integrity verification
   */
  computeAssetsHash(assets: ModelAssets): string {
    const hash = createHash('sha256');

    // Hash config
    hash.update(JSON.stringify(assets.config));

    // Hash WASM binaries
    const wasmKeys = Array.from(assets.wasmBinaries.keys()).sort();
    for (const key of wasmKeys) {
      hash.update(key);
      hash.update(assets.wasmBinaries.get(key)!);
    }

    // Hash Python scripts
    const pyKeys = Array.from(assets.pythonScripts.keys()).sort();
    for (const key of pyKeys) {
      hash.update(key);
      hash.update(assets.pythonScripts.get(key)!);
    }

    // Hash assumption references
    hash.update(assets.assumptionRefs.sort().join(','));

    return hash.digest('hex');
  }

  /**
   * Loads and initializes pipeline in cloud environment
   * This is a placeholder implementation that will be completed in US-BRIDGE-04
   */
  async loadPipeline(assets: ModelAssets): Promise<{
    success: boolean;
    pipelineId: string;
    assetsHash: string;
    errors?: string[];
  }> {
    this.logger.info('Loading pipeline in cloud worker');

    // Validate assets
    const validation = this.validateAssets(assets);
    if (!validation.valid) {
      this.logger.error({ errors: validation.errors }, 'Asset validation failed');
      return {
        success: false,
        pipelineId: '',
        assetsHash: '',
        errors: validation.errors
      };
    }

    // Compute hash for integrity verification
    const assetsHash = this.computeAssetsHash(assets);
    this.logger.info({ assetsHash }, 'Assets hash computed');

    // Generate pipeline ID
    const pipelineId = `pipeline-${Date.now()}-${assetsHash.substring(0, 8)}`;

    // TODO: Actually load WASM modules and initialize pipeline
    // This will be implemented in US-BRIDGE-04 once PRD-LC-010 is complete

    this.logger.info({ pipelineId, assetsHash }, 'Pipeline loaded successfully (placeholder)');

    return {
      success: true,
      pipelineId,
      assetsHash
    };
  }

  /**
   * Verifies that cloud runtime has parity with local environment
   */
  verifyRuntimeParity(): {
    hasSharedArrayBuffer: boolean;
    hasAtomics: boolean;
    hasSIMD: boolean;
    alignment16Byte: boolean;
    nodeVersion: string;
    isParity: boolean;
  } {
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    const hasAtomics = typeof Atomics !== 'undefined';
    const hasSIMD = process.env.WASM_SIMD === '1';

    // Test 16-byte alignment
    let alignment16Byte = false;
    try {
      const sab = new SharedArrayBuffer(16);
      const view = new Int32Array(sab);
      alignment16Byte = sab.byteLength === 16 && view.byteOffset === 0;
    } catch {
      alignment16Byte = false;
    }

    const isParity = hasSharedArrayBuffer && hasAtomics && hasSIMD && alignment16Byte;

    this.logger.info({
      hasSharedArrayBuffer,
      hasAtomics,
      hasSIMD,
      alignment16Byte,
      isParity
    }, 'Runtime parity verification');

    return {
      hasSharedArrayBuffer,
      hasAtomics,
      hasSIMD,
      alignment16Byte,
      nodeVersion: process.version,
      isParity
    };
  }
}

export const pipelineLoader = new PipelineLoader();
