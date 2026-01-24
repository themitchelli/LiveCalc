/**
 * Pipeline validation utilities
 *
 * Validates pipeline configurations including:
 * - DAG structure (no circular dependencies)
 * - Node ID uniqueness
 * - Engine reference format
 * - Bus reference format and connectivity
 * - Buffer size matching between producers and consumers
 */

import { PipelineConfig, PipelineNode } from '../types';

/**
 * Result of pipeline validation
 */
export interface PipelineValidationResult {
  valid: boolean;
  errors: PipelineValidationError[];
  warnings: PipelineValidationWarning[];
  /** Topologically sorted node order (if valid) */
  executionOrder?: string[];
  /** Map of bus:// resources to their sizes (if declared) */
  busResources?: Map<string, BusResourceInfo>;
}

/**
 * Validation error with context
 */
export interface PipelineValidationError {
  code: PipelineErrorCode;
  message: string;
  nodeId?: string;
  path?: string;
  details?: Record<string, unknown>;
}

/**
 * Validation warning (non-fatal issues)
 */
export interface PipelineValidationWarning {
  code: PipelineWarningCode;
  message: string;
  nodeId?: string;
  details?: Record<string, unknown>;
}

/**
 * Information about a bus resource
 */
export interface BusResourceInfo {
  /** Node that produces this resource */
  producer: string;
  /** Nodes that consume this resource */
  consumers: string[];
  /** Declared size in bytes (if known) */
  sizeBytes?: number;
  /** Data type (Float64Array, Int32Array, etc.) */
  dataType?: string;
}

/**
 * Error codes for pipeline validation
 */
export enum PipelineErrorCode {
  EMPTY_PIPELINE = 'EMPTY_PIPELINE',
  DUPLICATE_NODE_ID = 'DUPLICATE_NODE_ID',
  INVALID_NODE_ID = 'INVALID_NODE_ID',
  INVALID_ENGINE_REF = 'INVALID_ENGINE_REF',
  INVALID_BUS_REF = 'INVALID_BUS_REF',
  MISSING_OUTPUTS = 'MISSING_OUTPUTS',
  CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',
  UNDEFINED_INPUT = 'UNDEFINED_INPUT',
  BUFFER_SIZE_MISMATCH = 'BUFFER_SIZE_MISMATCH',
  UNREACHABLE_NODE = 'UNREACHABLE_NODE',
}

/**
 * Warning codes for pipeline validation
 */
export enum PipelineWarningCode {
  UNUSED_OUTPUT = 'UNUSED_OUTPUT',
  NO_TERMINAL_OUTPUT = 'NO_TERMINAL_OUTPUT',
  ORPHAN_NODE = 'ORPHAN_NODE',
}

// Regex patterns for validation
const NODE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const ENGINE_REF_PATTERN = /^(wasm|python):\/\/[a-zA-Z][a-zA-Z0-9_-]*$/;
const BUS_REF_PATTERN = /^bus:\/\/[a-zA-Z][a-zA-Z0-9_/-]*$/;
const SPECIAL_INPUT_PATTERN = /^(\$policies|\$assumptions|\$scenarios)$/;

/**
 * Validate a pipeline configuration
 */
export function validatePipeline(config: PipelineConfig): PipelineValidationResult {
  const errors: PipelineValidationError[] = [];
  const warnings: PipelineValidationWarning[] = [];

  // Check for empty pipeline
  if (!config.nodes || config.nodes.length === 0) {
    errors.push({
      code: PipelineErrorCode.EMPTY_PIPELINE,
      message: 'Pipeline must contain at least one node',
      path: 'pipeline.nodes',
    });
    return { valid: false, errors, warnings };
  }

  // Validate individual nodes
  const nodeIds = new Set<string>();
  const outputProducers = new Map<string, string>(); // bus:// -> nodeId
  const inputConsumers = new Map<string, string[]>(); // bus:// -> nodeIds[]

  for (let i = 0; i < config.nodes.length; i++) {
    const node = config.nodes[i];
    const nodePath = `pipeline.nodes[${i}]`;

    // Validate node ID
    if (!node.id) {
      errors.push({
        code: PipelineErrorCode.INVALID_NODE_ID,
        message: 'Node is missing required "id" field',
        path: `${nodePath}.id`,
      });
    } else if (!NODE_ID_PATTERN.test(node.id)) {
      errors.push({
        code: PipelineErrorCode.INVALID_NODE_ID,
        message: `Invalid node ID "${node.id}". Must start with a letter and contain only letters, numbers, underscores, and hyphens`,
        nodeId: node.id,
        path: `${nodePath}.id`,
      });
    } else if (nodeIds.has(node.id)) {
      errors.push({
        code: PipelineErrorCode.DUPLICATE_NODE_ID,
        message: `Duplicate node ID "${node.id}"`,
        nodeId: node.id,
        path: `${nodePath}.id`,
      });
    } else {
      nodeIds.add(node.id);
    }

    // Validate engine reference
    if (!node.engine) {
      errors.push({
        code: PipelineErrorCode.INVALID_ENGINE_REF,
        message: 'Node is missing required "engine" field',
        nodeId: node.id,
        path: `${nodePath}.engine`,
      });
    } else if (!ENGINE_REF_PATTERN.test(node.engine)) {
      errors.push({
        code: PipelineErrorCode.INVALID_ENGINE_REF,
        message: `Invalid engine reference "${node.engine}". Must be in format "wasm://name" or "python://name"`,
        nodeId: node.id,
        path: `${nodePath}.engine`,
      });
    }

    // Validate outputs (required)
    if (!node.outputs || node.outputs.length === 0) {
      errors.push({
        code: PipelineErrorCode.MISSING_OUTPUTS,
        message: 'Node must have at least one output',
        nodeId: node.id,
        path: `${nodePath}.outputs`,
      });
    } else {
      for (let j = 0; j < node.outputs.length; j++) {
        const output = node.outputs[j];
        if (!BUS_REF_PATTERN.test(output)) {
          errors.push({
            code: PipelineErrorCode.INVALID_BUS_REF,
            message: `Invalid output bus reference "${output}". Must be in format "bus://category/name"`,
            nodeId: node.id,
            path: `${nodePath}.outputs[${j}]`,
          });
        } else {
          // Check for duplicate producers
          if (outputProducers.has(output)) {
            errors.push({
              code: PipelineErrorCode.DUPLICATE_NODE_ID,
              message: `Bus resource "${output}" is produced by multiple nodes: "${outputProducers.get(output)}" and "${node.id}"`,
              nodeId: node.id,
              path: `${nodePath}.outputs[${j}]`,
            });
          } else {
            outputProducers.set(output, node.id);
          }
        }
      }
    }

    // Validate inputs (optional)
    if (node.inputs) {
      for (let j = 0; j < node.inputs.length; j++) {
        const input = node.inputs[j];
        // Allow bus:// references or special inputs ($policies, $assumptions, $scenarios)
        if (!BUS_REF_PATTERN.test(input) && !SPECIAL_INPUT_PATTERN.test(input)) {
          errors.push({
            code: PipelineErrorCode.INVALID_BUS_REF,
            message: `Invalid input reference "${input}". Must be "bus://category/name" or a special input ($policies, $assumptions, $scenarios)`,
            nodeId: node.id,
            path: `${nodePath}.inputs[${j}]`,
          });
        } else if (BUS_REF_PATTERN.test(input)) {
          // Track consumers
          if (!inputConsumers.has(input)) {
            inputConsumers.set(input, []);
          }
          inputConsumers.get(input)!.push(node.id);
        }
      }
    }
  }

  // If we have basic validation errors, return early
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Check for undefined inputs (inputs that reference bus:// resources not produced by any node)
  for (const [input, consumers] of inputConsumers) {
    if (!outputProducers.has(input)) {
      errors.push({
        code: PipelineErrorCode.UNDEFINED_INPUT,
        message: `Bus resource "${input}" is consumed by [${consumers.join(', ')}] but not produced by any node`,
        details: { consumers },
      });
    }
  }

  // Check for circular dependencies using topological sort
  const sortResult = topologicalSort(config.nodes, outputProducers, inputConsumers);
  if (sortResult.hasCycle) {
    errors.push({
      code: PipelineErrorCode.CIRCULAR_DEPENDENCY,
      message: `Circular dependency detected in pipeline involving nodes: [${sortResult.cycleNodes?.join(' -> ')}]`,
      details: { cycleNodes: sortResult.cycleNodes },
    });
  }

  // Check for unused outputs (warning)
  for (const [output, producer] of outputProducers) {
    if (!inputConsumers.has(output)) {
      warnings.push({
        code: PipelineWarningCode.UNUSED_OUTPUT,
        message: `Bus resource "${output}" produced by "${producer}" is not consumed by any node`,
        nodeId: producer,
        details: { busResource: output },
      });
    }
  }

  // Build bus resources map
  const busResources = new Map<string, BusResourceInfo>();
  for (const [output, producer] of outputProducers) {
    busResources.set(output, {
      producer,
      consumers: inputConsumers.get(output) || [],
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    executionOrder: sortResult.hasCycle ? undefined : sortResult.order,
    busResources,
  };
}

/**
 * Topological sort result
 */
interface TopologicalSortResult {
  hasCycle: boolean;
  order?: string[];
  cycleNodes?: string[];
}

/**
 * Perform topological sort using Kahn's algorithm
 * Returns execution order or identifies cycle
 */
function topologicalSort(
  nodes: PipelineNode[],
  outputProducers: Map<string, string>,
  inputConsumers: Map<string, string[]>
): TopologicalSortResult {
  // Build adjacency list: nodeId -> set of dependent nodeIds
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  // Initialize
  for (const node of nodes) {
    dependencies.set(node.id, new Set());
    dependents.set(node.id, new Set());
  }

  // Build dependency graph
  for (const node of nodes) {
    if (node.inputs) {
      for (const input of node.inputs) {
        if (BUS_REF_PATTERN.test(input) && outputProducers.has(input)) {
          const producer = outputProducers.get(input)!;
          if (producer !== node.id) {
            dependencies.get(node.id)!.add(producer);
            dependents.get(producer)!.add(node.id);
          }
        }
      }
    }
  }

  // Kahn's algorithm
  const inDegree = new Map<string, number>();
  const queue: string[] = [];
  const order: string[] = [];

  // Calculate in-degrees
  for (const node of nodes) {
    inDegree.set(node.id, dependencies.get(node.id)!.size);
    if (dependencies.get(node.id)!.size === 0) {
      queue.push(node.id);
    }
  }

  // Process nodes with no dependencies
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);

    for (const dependent of dependents.get(nodeId) || []) {
      const newDegree = inDegree.get(dependent)! - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  // Check for cycle
  if (order.length !== nodes.length) {
    // Find nodes involved in cycle
    const cycleNodes = nodes
      .map(n => n.id)
      .filter(id => !order.includes(id));
    return { hasCycle: true, cycleNodes };
  }

  return { hasCycle: false, order };
}

/**
 * Check if a config uses pipeline mode
 */
export function hasPipeline(config: { pipeline?: PipelineConfig }): boolean {
  return !!(config.pipeline && config.pipeline.nodes && config.pipeline.nodes.length > 0);
}

/**
 * Get the execution order for a validated pipeline
 */
export function getExecutionOrder(validationResult: PipelineValidationResult): string[] {
  return validationResult.executionOrder || [];
}

/**
 * Check if a node is a source node (no bus:// inputs)
 */
export function isSourceNode(node: PipelineNode): boolean {
  if (!node.inputs || node.inputs.length === 0) {
    return true;
  }
  // Check if all inputs are special inputs (not bus://)
  return node.inputs.every(input => SPECIAL_INPUT_PATTERN.test(input));
}

/**
 * Check if a node is a sink node (no consumers for its outputs)
 */
export function isSinkNode(
  node: PipelineNode,
  busResources: Map<string, BusResourceInfo>
): boolean {
  for (const output of node.outputs) {
    const info = busResources.get(output);
    if (info && info.consumers.length > 0) {
      return false;
    }
  }
  return true;
}
