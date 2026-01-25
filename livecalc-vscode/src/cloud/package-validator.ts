/**
 * Package Asset Validation
 *
 * Validates that all required model assets are present and well-formed
 */

import { LiveCalcConfig } from '../types';
import { Logger } from '../logging/logger';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class PackageValidator {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Validate config structure and required assets
   */
  validateConfig(config: LiveCalcConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required: model file
    if (!config.model) {
      errors.push('Config missing required field: model');
    }

    // Required: assumptions
    if (!config.assumptions) {
      errors.push('Config missing required field: assumptions');
    } else {
      if (!config.assumptions.mortality) {
        errors.push('Config missing required assumption: mortality');
      }
      if (!config.assumptions.lapse) {
        errors.push('Config missing required assumption: lapse');
      }
      if (!config.assumptions.expenses) {
        errors.push('Config missing required assumption: expenses');
      }
    }

    // Required: scenarios
    if (!config.scenarios) {
      errors.push('Config missing required field: scenarios');
    } else {
      if (typeof config.scenarios.count !== 'number' || config.scenarios.count < 1) {
        errors.push('Config scenarios.count must be a positive number');
      }
    }

    // Validate pipeline if present
    if (config.pipeline) {
      const pipelineResult = this.validatePipeline(config.pipeline);
      errors.push(...pipelineResult.errors);
      warnings.push(...pipelineResult.warnings);
    }

    // Warn if using Assumptions Manager references
    if (config.assumptions.mortality?.startsWith('assumptions://')) {
      warnings.push('Mortality references Assumptions Manager - ensure cloud worker has access');
    }
    if (config.assumptions.lapse?.startsWith('assumptions://')) {
      warnings.push('Lapse references Assumptions Manager - ensure cloud worker has access');
    }
    if (config.assumptions.expenses?.startsWith('assumptions://')) {
      warnings.push('Expenses references Assumptions Manager - ensure cloud worker has access');
    }

    // Warn if no policies specified
    if (!config.policies) {
      warnings.push('No policy data source specified - cloud job will need to provide policy data');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate pipeline structure
   */
  private validatePipeline(pipeline: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!pipeline.nodes || !Array.isArray(pipeline.nodes) || pipeline.nodes.length === 0) {
      errors.push('Pipeline must have at least one node');
      return { valid: false, errors, warnings };
    }

    const nodeIds = new Set<string>();

    for (let i = 0; i < pipeline.nodes.length; i++) {
      const node = pipeline.nodes[i];

      // Validate node ID
      if (!node.id) {
        errors.push(`Pipeline node at index ${i} missing required field: id`);
      } else {
        if (nodeIds.has(node.id)) {
          errors.push(`Duplicate node ID: ${node.id}`);
        }
        nodeIds.add(node.id);
      }

      // Validate engine
      if (!node.engine) {
        errors.push(`Pipeline node ${node.id} missing required field: engine`);
      } else {
        if (!node.engine.startsWith('wasm://') && !node.engine.startsWith('python://')) {
          errors.push(`Pipeline node ${node.id} has invalid engine format: ${node.engine} (must start with wasm:// or python://)`);
        }
      }

      // Validate outputs
      if (!node.outputs || !Array.isArray(node.outputs) || node.outputs.length === 0) {
        errors.push(`Pipeline node ${node.id} must have at least one output`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate that mandatory assets are present in the package
   */
  validateMandatoryAssets(assetPaths: string[], config: LiveCalcConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Must have config
    if (!assetPaths.includes('livecalc.config.json')) {
      errors.push('Package missing mandatory asset: livecalc.config.json');
    }

    // Must have model file
    const modelFileName = config.model.split('/').pop() || config.model;
    if (!assetPaths.some(p => p.includes(modelFileName))) {
      errors.push(`Package missing mandatory asset: ${modelFileName}`);
    }

    // Validate WASM binaries for pipeline nodes
    if (config.pipeline?.nodes) {
      for (const node of config.pipeline.nodes) {
        if (node.engine.startsWith('wasm://')) {
          const wasmName = node.engine.replace('wasm://', '');
          if (!assetPaths.some(p => p.includes(`${wasmName}.wasm`))) {
            errors.push(`Package missing WASM binary for node ${node.id}: ${wasmName}.wasm`);
          }
        } else if (node.engine.startsWith('python://')) {
          const pyName = node.engine.replace('python://', '');
          if (!assetPaths.some(p => p.includes(`${pyName}.py`))) {
            errors.push(`Package missing Python script for node ${node.id}: ${pyName}.py`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
