/**
 * Error Types and Classification for LiveCalc Results Panel
 *
 * Provides structured error types with actionable guidance for common errors.
 */

/**
 * Error type classification for display
 */
export type LiveCalcErrorType =
  | 'CONFIG_NOT_FOUND'
  | 'CONFIG_INVALID'
  | 'FILE_NOT_FOUND'
  | 'FILE_INVALID'
  | 'FILE_PARSE_ERROR'
  | 'EXECUTION_TIMEOUT'
  | 'MEMORY_LIMIT'
  | 'ENGINE_ERROR'
  | 'ENGINE_INIT_FAILED'
  | 'CANCELLED'
  | 'VALIDATION_ERROR'
  | 'PIPELINE_ERROR'
  | 'PIPELINE_NODE_FAILED'
  | 'PIPELINE_HANDOFF_FAILED'
  | 'PIPELINE_INTEGRITY_FAILED'
  | 'UNKNOWN';

/**
 * Structured error with classification and guidance
 */
export interface LiveCalcError {
  /** Error type for classification */
  type: LiveCalcErrorType;
  /** User-friendly error message */
  message: string;
  /** Actionable guidance for resolving the error */
  guidance?: string;
  /** Technical details (stack trace, etc.) */
  details?: string;
  /** Related file path if applicable */
  filePath?: string;
  /** Whether this is a recoverable error */
  recoverable: boolean;
  /** Pipeline-specific error info (if applicable) */
  pipelineError?: PipelineErrorDisplay;
}

/**
 * Pipeline-specific error display information
 */
export interface PipelineErrorDisplay {
  /** Node ID where error occurred */
  nodeId: string;
  /** Stage of execution (init, load, execute, finalize, handoff) */
  stage: string;
  /** Pipeline error code */
  code: string;
  /** Input data snapshot at time of error */
  inputSnapshot?: {
    inputs: Array<{ name: string; sample: number[]; min?: number; max?: number; mean?: number }>;
    outputs: Array<{ name: string; sample: number[]; min?: number; max?: number; mean?: number }>;
  };
  /** All node states at time of error */
  nodeStates?: Record<string, string>;
  /** Completed nodes before error */
  completedNodes?: string[];
  /** Skipped nodes due to error */
  skippedNodes?: string[];
  /** Partial results available */
  hasPartialResults?: boolean;
}

/**
 * Warning for non-fatal issues
 */
export interface LiveCalcWarning {
  /** Warning message */
  message: string;
  /** Additional context */
  context?: string;
  /** Related file path if applicable */
  filePath?: string;
  /** Warning category */
  category: 'performance' | 'data' | 'config' | 'engine';
}

/**
 * Error guidance mapping - provides actionable advice for each error type
 */
const ERROR_GUIDANCE: Record<LiveCalcErrorType, string> = {
  CONFIG_NOT_FOUND: 'Run "LiveCalc: Initialize Project" to create a default configuration file, or ensure livecalc.config.json exists in your workspace.',
  CONFIG_INVALID: 'Check the Problems panel for specific validation errors. Ensure all required fields are present and values are valid.',
  FILE_NOT_FOUND: 'Verify the file path in livecalc.config.json is correct. Paths can be relative to the config file or use local:// prefix.',
  FILE_INVALID: 'Check that the file format matches the expected structure. Review the Problems panel for specific issues.',
  FILE_PARSE_ERROR: 'The file could not be parsed. Check for encoding issues, missing columns, or malformed data.',
  EXECUTION_TIMEOUT: 'The valuation took too long. Try reducing the number of scenarios or policies, or increase the timeout in settings.',
  MEMORY_LIMIT: 'Not enough memory to complete the valuation. Try reducing the number of policies or scenarios.',
  ENGINE_ERROR: 'An error occurred in the calculation engine. Check the output logs for more details.',
  ENGINE_INIT_FAILED: 'Failed to initialize the WASM engine. Try reloading the window or reinstalling the extension.',
  CANCELLED: 'The operation was cancelled by the user.',
  VALIDATION_ERROR: 'Data validation failed. Check the Problems panel for specific issues with your data files.',
  PIPELINE_ERROR: 'An error occurred during pipeline execution. Check the error details for the specific node that failed.',
  PIPELINE_NODE_FAILED: 'A pipeline node failed to execute. Check the input data and node configuration.',
  PIPELINE_HANDOFF_FAILED: 'Failed to hand off data between pipeline nodes. Check the bus:// references and memory allocation.',
  PIPELINE_INTEGRITY_FAILED: 'Data integrity check failed. The bus data may have been corrupted by an upstream node.',
  UNKNOWN: 'An unexpected error occurred. Check the output logs for more details.',
};

/**
 * Error titles for display
 */
const ERROR_TITLES: Record<LiveCalcErrorType, string> = {
  CONFIG_NOT_FOUND: 'Configuration Not Found',
  CONFIG_INVALID: 'Invalid Configuration',
  FILE_NOT_FOUND: 'File Not Found',
  FILE_INVALID: 'Invalid File',
  FILE_PARSE_ERROR: 'File Parse Error',
  EXECUTION_TIMEOUT: 'Execution Timeout',
  MEMORY_LIMIT: 'Memory Limit Exceeded',
  ENGINE_ERROR: 'Engine Error',
  ENGINE_INIT_FAILED: 'Engine Initialization Failed',
  CANCELLED: 'Cancelled',
  VALIDATION_ERROR: 'Validation Error',
  PIPELINE_ERROR: 'Pipeline Execution Error',
  PIPELINE_NODE_FAILED: 'Pipeline Node Failed',
  PIPELINE_HANDOFF_FAILED: 'Pipeline Handoff Failed',
  PIPELINE_INTEGRITY_FAILED: 'Data Integrity Check Failed',
  UNKNOWN: 'Error',
};

/**
 * Classify an error and return structured error info
 */
export function classifyError(error: unknown, context?: { filePath?: string }): LiveCalcError {
  const details = error instanceof Error ? error.stack : undefined;
  const filePath = context?.filePath;

  // Handle string errors
  if (typeof error === 'string') {
    return classifyErrorMessage(error, filePath, details);
  }

  // Handle Error objects
  if (error instanceof Error) {
    const message = error.message;

    // Check for specific error types
    if ('code' in error) {
      const code = (error as { code: string }).code;
      return classifyErrorCode(code, message, filePath, details);
    }

    return classifyErrorMessage(message, filePath, details);
  }

  // Fallback for unknown error types
  return {
    type: 'UNKNOWN',
    message: String(error),
    guidance: ERROR_GUIDANCE.UNKNOWN,
    details,
    filePath,
    recoverable: true,
  };
}

/**
 * Classify based on error code
 */
function classifyErrorCode(
  code: string,
  message: string,
  filePath?: string,
  details?: string
): LiveCalcError {
  // Map known error codes to types
  const codeToType: Record<string, LiveCalcErrorType> = {
    // Config errors
    'CONFIG_NOT_FOUND': 'CONFIG_NOT_FOUND',
    'CONFIG_INVALID': 'CONFIG_INVALID',
    'CONFIG_PARSE_ERROR': 'CONFIG_INVALID',

    // File errors
    'FILE_NOT_FOUND': 'FILE_NOT_FOUND',
    'ENOENT': 'FILE_NOT_FOUND',
    'FILE_READ_ERROR': 'FILE_INVALID',
    'FILE_TOO_LARGE': 'FILE_INVALID',
    'PARSE_ERROR': 'FILE_PARSE_ERROR',

    // Data errors
    'NO_POLICIES_PATH': 'FILE_NOT_FOUND',
    'NO_MORTALITY_PATH': 'FILE_NOT_FOUND',
    'NO_LAPSE_PATH': 'FILE_NOT_FOUND',
    'NO_EXPENSES_PATH': 'FILE_NOT_FOUND',
    'LOAD_ERROR': 'FILE_INVALID',
    'VALIDATION_ERROR': 'VALIDATION_ERROR',

    // Engine errors
    'ENGINE_DISPOSED': 'ENGINE_ERROR',
    'ENGINE_NOT_READY': 'ENGINE_ERROR',
    'NO_EXTENSION_PATH': 'ENGINE_INIT_FAILED',
    'INIT_FAILED': 'ENGINE_INIT_FAILED',
    'VALUATION_FAILED': 'ENGINE_ERROR',
    'CANCELLED': 'CANCELLED',

    // Resource errors
    'TIMEOUT': 'EXECUTION_TIMEOUT',
    'MEMORY_LIMIT': 'MEMORY_LIMIT',

    // Pipeline errors
    'PIPELINE_ERROR': 'PIPELINE_ERROR',
    'ENGINE_INIT_FAILED': 'ENGINE_INIT_FAILED',
    'ENGINE_NOT_FOUND': 'ENGINE_ERROR',
    'MEMORY_ALLOCATION_FAILED': 'MEMORY_LIMIT',
    'WORKER_INIT_FAILED': 'ENGINE_INIT_FAILED',
    'DATA_LOAD_FAILED': 'FILE_INVALID',
    'INVALID_INPUT_FORMAT': 'FILE_PARSE_ERROR',
    'MISSING_REQUIRED_INPUT': 'FILE_NOT_FOUND',
    'INPUT_SIZE_MISMATCH': 'VALIDATION_ERROR',
    'EXECUTION_FAILED': 'PIPELINE_NODE_FAILED',
    'OUT_OF_MEMORY': 'MEMORY_LIMIT',
    'NUMERICAL_ERROR': 'PIPELINE_NODE_FAILED',
    'ASSERTION_FAILED': 'PIPELINE_NODE_FAILED',
    'HANDOFF_FAILED': 'PIPELINE_HANDOFF_FAILED',
    'UPSTREAM_TIMEOUT': 'EXECUTION_TIMEOUT',
    'UPSTREAM_ERROR': 'PIPELINE_NODE_FAILED',
    'INTEGRITY_CHECK_FAILED': 'PIPELINE_INTEGRITY_FAILED',
    'OUTPUT_WRITE_FAILED': 'PIPELINE_NODE_FAILED',
    'OUTPUT_SIZE_MISMATCH': 'VALIDATION_ERROR',
  };

  const type = codeToType[code] || 'UNKNOWN';

  return {
    type,
    message,
    guidance: ERROR_GUIDANCE[type],
    details,
    filePath,
    recoverable: type !== 'ENGINE_INIT_FAILED' && type !== 'MEMORY_LIMIT',
  };
}

/**
 * Classify based on error message patterns
 */
function classifyErrorMessage(
  message: string,
  filePath?: string,
  details?: string
): LiveCalcError {
  const lowerMessage = message.toLowerCase();

  // Configuration errors
  if (lowerMessage.includes('config') && lowerMessage.includes('not found')) {
    return createError('CONFIG_NOT_FOUND', message, filePath, details);
  }
  if (lowerMessage.includes('config') && (lowerMessage.includes('invalid') || lowerMessage.includes('failed'))) {
    return createError('CONFIG_INVALID', message, filePath, details);
  }

  // File errors
  if (lowerMessage.includes('not found') || lowerMessage.includes('enoent') || lowerMessage.includes('no such file')) {
    return createError('FILE_NOT_FOUND', message, filePath, details);
  }
  if (lowerMessage.includes('parse') || lowerMessage.includes('unexpected token') || lowerMessage.includes('syntax')) {
    return createError('FILE_PARSE_ERROR', message, filePath, details);
  }
  if (lowerMessage.includes('invalid') && (lowerMessage.includes('file') || lowerMessage.includes('data'))) {
    return createError('FILE_INVALID', message, filePath, details);
  }

  // Execution errors
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return createError('EXECUTION_TIMEOUT', message, filePath, details);
  }
  if (lowerMessage.includes('memory') || lowerMessage.includes('heap') || lowerMessage.includes('allocation')) {
    return createError('MEMORY_LIMIT', message, filePath, details);
  }
  if (lowerMessage.includes('cancelled') || lowerMessage.includes('canceled') || lowerMessage.includes('abort')) {
    return createError('CANCELLED', message, filePath, details);
  }

  // Pipeline errors
  if (lowerMessage.includes('pipeline') || lowerMessage.includes('node')) {
    if (lowerMessage.includes('handoff') || lowerMessage.includes('signal')) {
      return createError('PIPELINE_HANDOFF_FAILED', message, filePath, details);
    }
    if (lowerMessage.includes('integrity') || lowerMessage.includes('checksum') || lowerMessage.includes('corrupt')) {
      return createError('PIPELINE_INTEGRITY_FAILED', message, filePath, details);
    }
    if (lowerMessage.includes('failed') || lowerMessage.includes('error')) {
      return createError('PIPELINE_NODE_FAILED', message, filePath, details);
    }
    return createError('PIPELINE_ERROR', message, filePath, details);
  }

  // Engine errors
  if (lowerMessage.includes('wasm') || lowerMessage.includes('engine')) {
    if (lowerMessage.includes('init') || lowerMessage.includes('initialize')) {
      return createError('ENGINE_INIT_FAILED', message, filePath, details);
    }
    return createError('ENGINE_ERROR', message, filePath, details);
  }

  // Validation errors
  if (lowerMessage.includes('validation')) {
    return createError('VALIDATION_ERROR', message, filePath, details);
  }

  // Fallback
  return createError('UNKNOWN', message, filePath, details);
}

/**
 * Helper to create structured error
 */
function createError(
  type: LiveCalcErrorType,
  message: string,
  filePath?: string,
  details?: string
): LiveCalcError {
  return {
    type,
    message,
    guidance: ERROR_GUIDANCE[type],
    details,
    filePath,
    recoverable: type !== 'ENGINE_INIT_FAILED' && type !== 'MEMORY_LIMIT',
  };
}

/**
 * Get the display title for an error type
 */
export function getErrorTitle(type: LiveCalcErrorType): string {
  return ERROR_TITLES[type];
}

/**
 * Get guidance for an error type
 */
export function getErrorGuidance(type: LiveCalcErrorType): string {
  return ERROR_GUIDANCE[type];
}

/**
 * Create a warning for common issues
 */
export function createWarning(
  message: string,
  category: LiveCalcWarning['category'],
  context?: string,
  filePath?: string
): LiveCalcWarning {
  return {
    message,
    category,
    context,
    filePath,
  };
}

/**
 * Common warning messages for reference
 */
export const COMMON_WARNINGS = {
  LARGE_POLICY_FILE: (count: number) => createWarning(
    `Large policy file (${count.toLocaleString()} policies) may cause slow execution`,
    'performance'
  ),
  AGE_CAPPED: (count: number) => createWarning(
    `${count} policies have age > 100, using capped mortality rates`,
    'data'
  ),
  LAPSE_RATE_HIGH: (year: number, rate: number) => createWarning(
    `High lapse rate (${(rate * 100).toFixed(1)}%) in year ${year} may significantly impact results`,
    'data'
  ),
  MISSING_MORTALITY_AGES: (ages: number[]) => createWarning(
    `Mortality table missing ages: ${ages.join(', ')}. Using nearest available rates.`,
    'data'
  ),
  EXECUTION_SLOW: (seconds: number) => createWarning(
    `Execution took ${seconds.toFixed(1)} seconds. Consider reducing scenarios for faster iteration.`,
    'performance'
  ),
  AM_NOT_SUPPORTED: (ref: string) => createWarning(
    `Cloud assumption reference "${ref}" not yet supported. Using local file fallback.`,
    'config'
  ),
  PIPELINE_PARTIAL_RESULTS: (completedNodes: string[], failedNode: string) => createWarning(
    `Pipeline partially completed. ${completedNodes.length} nodes completed before "${failedNode}" failed.`,
    'engine'
  ),
  PIPELINE_CONTINUE_MODE: () => createWarning(
    'Pipeline is running in continue-on-error mode. Some nodes may have failed.',
    'engine'
  ),
  PIPELINE_SLOW_NODE: (nodeId: string, timeMs: number) => createWarning(
    `Pipeline node "${nodeId}" took ${(timeMs / 1000).toFixed(1)}s. Consider optimizing this stage.`,
    'performance'
  ),
  PIPELINE_SKIPPED_NODES: (skippedNodes: string[]) => createWarning(
    `Skipped ${skippedNodes.length} downstream nodes due to upstream failure: ${skippedNodes.join(', ')}`,
    'engine'
  ),
};

/**
 * Create a structured error from a pipeline error
 */
export function createPipelineError(
  pipelineError: {
    nodeId: string;
    stage: string;
    message: string;
    code: string;
    guidance?: string;
    inputSnapshot?: {
      inputs: Map<string, { name: string; sample: number[]; min?: number; max?: number; mean?: number }>;
      outputs: Map<string, { name: string; sample: number[]; min?: number; max?: number; mean?: number }>;
    };
    allNodeStates?: Record<string, number>;
    stack?: string;
  },
  completedNodes?: string[],
  skippedNodes?: string[]
): LiveCalcError {
  // Map pipeline error codes to LiveCalc error types
  const codeToType: Record<string, LiveCalcErrorType> = {
    ENGINE_INIT_FAILED: 'ENGINE_INIT_FAILED',
    ENGINE_NOT_FOUND: 'ENGINE_ERROR',
    MEMORY_ALLOCATION_FAILED: 'MEMORY_LIMIT',
    WORKER_INIT_FAILED: 'ENGINE_INIT_FAILED',
    DATA_LOAD_FAILED: 'FILE_INVALID',
    INVALID_INPUT_FORMAT: 'FILE_PARSE_ERROR',
    MISSING_REQUIRED_INPUT: 'FILE_NOT_FOUND',
    INPUT_SIZE_MISMATCH: 'VALIDATION_ERROR',
    EXECUTION_FAILED: 'PIPELINE_NODE_FAILED',
    TIMEOUT: 'EXECUTION_TIMEOUT',
    OUT_OF_MEMORY: 'MEMORY_LIMIT',
    NUMERICAL_ERROR: 'PIPELINE_NODE_FAILED',
    ASSERTION_FAILED: 'PIPELINE_NODE_FAILED',
    HANDOFF_FAILED: 'PIPELINE_HANDOFF_FAILED',
    UPSTREAM_TIMEOUT: 'EXECUTION_TIMEOUT',
    UPSTREAM_ERROR: 'PIPELINE_NODE_FAILED',
    INTEGRITY_CHECK_FAILED: 'PIPELINE_INTEGRITY_FAILED',
    OUTPUT_WRITE_FAILED: 'PIPELINE_NODE_FAILED',
    OUTPUT_SIZE_MISMATCH: 'VALIDATION_ERROR',
    CANCELLED: 'CANCELLED',
  };

  const type = codeToType[pipelineError.code] || 'PIPELINE_ERROR';

  // Convert node states to string format
  const nodeStateNames: Record<number, string> = {
    0: 'IDLE',
    1: 'WAITING',
    2: 'RUNNING',
    3: 'COMPLETE',
    4: 'ERROR',
  };

  const nodeStates: Record<string, string> | undefined = pipelineError.allNodeStates
    ? Object.fromEntries(
        Object.entries(pipelineError.allNodeStates).map(([k, v]) => [k, nodeStateNames[v] || 'UNKNOWN'])
      )
    : undefined;

  // Convert input/output snapshots from Map to Array
  const inputSnapshot = pipelineError.inputSnapshot
    ? {
        inputs: Array.from(pipelineError.inputSnapshot.inputs.values()),
        outputs: Array.from(pipelineError.inputSnapshot.outputs.values()),
      }
    : undefined;

  return {
    type,
    message: `Pipeline node "${pipelineError.nodeId}" failed at ${pipelineError.stage} stage: ${pipelineError.message}`,
    guidance: pipelineError.guidance || ERROR_GUIDANCE[type],
    details: pipelineError.stack,
    recoverable: type !== 'MEMORY_LIMIT' && type !== 'ENGINE_INIT_FAILED',
    pipelineError: {
      nodeId: pipelineError.nodeId,
      stage: pipelineError.stage,
      code: pipelineError.code,
      inputSnapshot,
      nodeStates,
      completedNodes,
      skippedNodes,
      hasPartialResults: completedNodes !== undefined && completedNodes.length > 0,
    },
  };
}
