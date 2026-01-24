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
};
