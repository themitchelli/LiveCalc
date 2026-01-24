/**
 * SIMD Feature Detection
 *
 * Provides runtime detection of WebAssembly SIMD128 support across browsers and Node.js.
 *
 * Browser Support:
 * - Chrome 91+ (May 2021)
 * - Firefox 89+ (June 2021)
 * - Safari 16.4+ (March 2023)
 * - Edge 91+ (May 2021)
 *
 * Node.js Support:
 * - Node 16+ (built-in, no flag needed since Node 16.4)
 * - Node 14.x-15.x with --experimental-wasm-simd flag
 *
 * @module simd-detection
 */

/**
 * SIMD test module - minimal WASM that uses SIMD instruction
 * This is the smallest valid WASM module that requires SIMD support.
 * It contains a v128.const instruction which is the most universally supported
 * SIMD instruction for feature detection.
 *
 * Module structure:
 * - Magic number + version
 * - Type section (function type () -> v128)
 * - Function section
 * - Export section (exports "test" function)
 * - Code section (v128.const with 16 zero bytes, end)
 */
const SIMD_TEST_MODULE = new Uint8Array([
  // WASM header
  0x00, 0x61, 0x73, 0x6d, // Magic number: \0asm
  0x01, 0x00, 0x00, 0x00, // Version: 1

  // Type section (id=1)
  0x01, // Section ID
  0x05, // Section size (5 bytes)
  0x01, // Number of types: 1
  0x60, // Function type
  0x00, // Number of parameters: 0
  0x01, // Number of results: 1
  0x7b, // v128 result type

  // Function section (id=3)
  0x03, // Section ID
  0x02, // Section size (2 bytes)
  0x01, // Number of functions: 1
  0x00, // Function 0 uses type index 0

  // Export section (id=7)
  0x07, // Section ID
  0x08, // Section size (8 bytes)
  0x01, // Number of exports: 1
  0x04, // Export name length: 4
  0x74, 0x65, 0x73, 0x74, // Export name: "test"
  0x00, // Export kind: function
  0x00, // Export function index: 0

  // Code section (id=10)
  0x0a, // Section ID
  0x16, // Section size (22 bytes)
  0x01, // Number of function bodies: 1
  0x14, // Function body size (20 bytes)
  0x00, // Number of local declarations: 0
  0xfd, 0x0c, // v128.const prefix (0xfd is SIMD prefix, 0x0c is v128.const)
  // 16 zero bytes for the v128 constant
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x0b, // end
]);

// Cached detection result
let cachedSimdSupport: boolean | null = null;

/**
 * Detects if WebAssembly SIMD128 is supported in the current environment.
 *
 * This function uses WebAssembly.validate() to test if a minimal SIMD module
 * is valid, which is the recommended approach for feature detection.
 *
 * The result is cached after the first call.
 *
 * @returns true if SIMD128 is supported, false otherwise
 *
 * @example
 * ```typescript
 * import { isSimdSupported } from '@livecalc/engine';
 *
 * if (isSimdSupported()) {
 *   // Use SIMD-optimized WASM module
 *   const module = await import('./livecalc-simd.mjs');
 * } else {
 *   // Fall back to scalar WASM module
 *   const module = await import('./livecalc.mjs');
 * }
 * ```
 */
export function isSimdSupported(): boolean {
  // Return cached result if available
  if (cachedSimdSupport !== null) {
    return cachedSimdSupport;
  }

  try {
    // Check if WebAssembly is available
    if (typeof WebAssembly === 'undefined') {
      cachedSimdSupport = false;
      return false;
    }

    // Use WebAssembly.validate() to check SIMD support
    // This is the recommended approach - it doesn't compile the module,
    // just checks if it would be valid
    cachedSimdSupport = WebAssembly.validate(SIMD_TEST_MODULE);
    return cachedSimdSupport;
  } catch {
    // Any error means SIMD is not supported
    cachedSimdSupport = false;
    return false;
  }
}

/**
 * Clears the cached SIMD detection result.
 * Useful for testing or when environment may have changed.
 */
export function clearSimdCache(): void {
  cachedSimdSupport = null;
}

/**
 * Information about SIMD support in the current environment
 */
export interface SimdSupportInfo {
  /** Whether SIMD128 is supported */
  supported: boolean;
  /** The environment type */
  environment: 'browser' | 'node' | 'unknown';
  /** Browser name if detected */
  browser?: string;
  /** Browser version if detected */
  browserVersion?: string;
  /** Node.js version if detected */
  nodeVersion?: string;
  /** Additional notes about SIMD support */
  notes?: string;
}

/**
 * Gets detailed information about SIMD support in the current environment.
 *
 * @returns Detailed SIMD support information
 *
 * @example
 * ```typescript
 * import { getSimdSupportInfo } from '@livecalc/engine';
 *
 * const info = getSimdSupportInfo();
 * console.log('SIMD supported:', info.supported);
 * console.log('Environment:', info.environment);
 * if (info.browser) {
 *   console.log('Browser:', info.browser, info.browserVersion);
 * }
 * ```
 */
export function getSimdSupportInfo(): SimdSupportInfo {
  const supported = isSimdSupported();
  const info: SimdSupportInfo = {
    supported,
    environment: 'unknown',
  };

  // Detect Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    info.environment = 'node';
    info.nodeVersion = process.versions.node;

    const [major] = info.nodeVersion.split('.').map(Number);
    if (major >= 16) {
      info.notes = 'SIMD is natively supported in Node.js 16+';
    } else if (major >= 14) {
      info.notes = 'SIMD requires --experimental-wasm-simd flag in Node.js 14-15';
    } else {
      info.notes = 'SIMD is not available in Node.js < 14';
    }
    return info;
  }

  // Detect browser environment
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    info.environment = 'browser';
    const ua = navigator.userAgent;

    // Chrome/Edge (Chromium-based)
    const chromeMatch = ua.match(/Chrome\/(\d+)/);
    if (chromeMatch) {
      const version = parseInt(chromeMatch[1], 10);
      info.browser = ua.includes('Edg/') ? 'Edge' : 'Chrome';
      info.browserVersion = chromeMatch[1];
      if (version >= 91) {
        info.notes = `SIMD is natively supported in ${info.browser} 91+`;
      } else {
        info.notes = `SIMD requires ${info.browser} 91+ (current: ${version})`;
      }
      return info;
    }

    // Firefox
    const firefoxMatch = ua.match(/Firefox\/(\d+)/);
    if (firefoxMatch) {
      const version = parseInt(firefoxMatch[1], 10);
      info.browser = 'Firefox';
      info.browserVersion = firefoxMatch[1];
      if (version >= 89) {
        info.notes = 'SIMD is natively supported in Firefox 89+';
      } else {
        info.notes = `SIMD requires Firefox 89+ (current: ${version})`;
      }
      return info;
    }

    // Safari
    const safariMatch = ua.match(/Version\/(\d+\.\d+).*Safari/);
    if (safariMatch) {
      const version = parseFloat(safariMatch[1]);
      info.browser = 'Safari';
      info.browserVersion = safariMatch[1];
      if (version >= 16.4) {
        info.notes = 'SIMD is natively supported in Safari 16.4+';
      } else {
        info.notes = `SIMD requires Safari 16.4+ (current: ${version})`;
      }
      return info;
    }

    info.notes = 'Unknown browser - check caniuse.com for SIMD support';
    return info;
  }

  info.notes = 'Unknown environment - SIMD support cannot be determined from environment';
  return info;
}

/**
 * Configuration for auto-selecting WASM modules based on SIMD support
 */
export interface SimdModuleConfig {
  /** Path or module for SIMD-enabled WASM */
  simdModule: string | (() => Promise<unknown>);
  /** Path or module for scalar (non-SIMD) WASM */
  scalarModule: string | (() => Promise<unknown>);
  /** Force a specific mode instead of auto-detecting */
  forceMode?: 'simd' | 'scalar';
}

/**
 * Result of selecting a WASM module
 */
export interface SimdModuleSelection {
  /** The selected module path or loader function */
  module: string | (() => Promise<unknown>);
  /** Whether SIMD mode was selected */
  isSimd: boolean;
  /** Reason for the selection */
  reason: string;
}

/**
 * Selects the appropriate WASM module based on SIMD support.
 *
 * @param config - Configuration with paths to both SIMD and scalar modules
 * @returns The selected module and selection information
 *
 * @example
 * ```typescript
 * import { selectSimdModule } from '@livecalc/engine';
 *
 * const selection = selectSimdModule({
 *   simdModule: './livecalc-simd.mjs',
 *   scalarModule: './livecalc.mjs',
 * });
 *
 * console.log(`Using ${selection.isSimd ? 'SIMD' : 'scalar'} module: ${selection.reason}`);
 * const createModule = await import(selection.module as string);
 * ```
 */
export function selectSimdModule(config: SimdModuleConfig): SimdModuleSelection {
  // Check for forced mode
  if (config.forceMode === 'simd') {
    return {
      module: config.simdModule,
      isSimd: true,
      reason: 'SIMD forced via configuration',
    };
  }

  if (config.forceMode === 'scalar') {
    return {
      module: config.scalarModule,
      isSimd: false,
      reason: 'Scalar mode forced via configuration',
    };
  }

  // Auto-detect SIMD support
  if (isSimdSupported()) {
    return {
      module: config.simdModule,
      isSimd: true,
      reason: 'SIMD128 detected and available',
    };
  }

  return {
    module: config.scalarModule,
    isSimd: false,
    reason: 'SIMD128 not available, using scalar fallback',
  };
}

/**
 * Minimum browser versions required for SIMD support
 */
export const SIMD_BROWSER_SUPPORT = {
  chrome: 91,
  edge: 91,
  firefox: 89,
  safari: 16.4,
  node: 16,
} as const;

/**
 * Creates a human-readable string describing SIMD browser requirements
 */
export function getSimdBrowserRequirements(): string {
  return [
    `Chrome ${SIMD_BROWSER_SUPPORT.chrome}+`,
    `Firefox ${SIMD_BROWSER_SUPPORT.firefox}+`,
    `Safari ${SIMD_BROWSER_SUPPORT.safari}+`,
    `Edge ${SIMD_BROWSER_SUPPORT.edge}+`,
    `Node.js ${SIMD_BROWSER_SUPPORT.node}+`,
  ].join(', ');
}
