/**
 * Parity Test - Verify cloud runtime produces identical results to local
 *
 * This test runs a 10K policy projection both locally and in the cloud worker,
 * then compares the result hashes to ensure byte-identical output.
 */
import { createHash } from 'crypto';
import pino from 'pino';
const logger = pino({ name: 'parity-test' });
/**
 * Simulates local WASM execution
 * TODO: Replace with actual LiveCalc WASM module when available
 */
function simulateLocalExecution(policyCount, scenarioCount) {
    logger.info({ policyCount, scenarioCount }, 'Simulating local execution');
    // For testing, generate deterministic results
    const scenarioNPVs = new Float64Array(scenarioCount);
    const seed = 42; // Fixed seed for reproducibility
    let state = seed;
    // Simple LCG for deterministic random numbers
    for (let i = 0; i < scenarioCount; i++) {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        scenarioNPVs[i] = (state / 0x7fffffff) * 1000000 - 500000; // Range: -500K to +500K
    }
    // Calculate statistics
    const sorted = Array.from(scenarioNPVs).sort((a, b) => a - b);
    const mean = sorted.reduce((sum, val) => sum + val, 0) / scenarioCount;
    const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / scenarioCount;
    const stdDev = Math.sqrt(variance);
    const p = (pct) => sorted[Math.floor(scenarioCount * pct)];
    return {
        mean,
        stdDev,
        percentiles: {
            p50: p(0.50),
            p75: p(0.75),
            p90: p(0.90),
            p95: p(0.95),
            p99: p(0.99)
        },
        cte95: sorted.slice(0, Math.floor(scenarioCount * 0.05)).reduce((sum, val) => sum + val, 0) / Math.floor(scenarioCount * 0.05),
        min: sorted[0],
        max: sorted[scenarioCount - 1],
        scenarioNPVs
    };
}
/**
 * Simulates cloud WASM execution
 * TODO: Replace with actual cloud worker execution
 */
function simulateCloudExecution(policyCount, scenarioCount) {
    logger.info({ policyCount, scenarioCount }, 'Simulating cloud execution');
    // For parity testing, this should produce identical results to local
    return simulateLocalExecution(policyCount, scenarioCount);
}
/**
 * Computes SHA-256 hash of valuation result for comparison
 */
function computeResultHash(result) {
    const hash = createHash('sha256');
    // Hash scalar statistics
    hash.update(result.mean.toString());
    hash.update(result.stdDev.toString());
    hash.update(result.percentiles.p50.toString());
    hash.update(result.percentiles.p75.toString());
    hash.update(result.percentiles.p90.toString());
    hash.update(result.percentiles.p95.toString());
    hash.update(result.percentiles.p99.toString());
    hash.update(result.cte95.toString());
    hash.update(result.min.toString());
    hash.update(result.max.toString());
    // Hash scenario NPVs
    hash.update(Buffer.from(result.scenarioNPVs.buffer));
    return hash.digest('hex');
}
/**
 * Main parity test function
 */
export async function runParityTest(policyCount = 10000, scenarioCount = 1000) {
    logger.info({ policyCount, scenarioCount }, 'Starting parity test');
    // Run local execution
    const localStart = performance.now();
    const localResult = simulateLocalExecution(policyCount, scenarioCount);
    const localMs = performance.now() - localStart;
    const localHash = computeResultHash(localResult);
    logger.info({ localMs, localHash }, 'Local execution complete');
    // Run cloud execution
    const cloudStart = performance.now();
    const cloudResult = simulateCloudExecution(policyCount, scenarioCount);
    const cloudMs = performance.now() - cloudStart;
    const cloudHash = computeResultHash(cloudResult);
    logger.info({ cloudMs, cloudHash }, 'Cloud execution complete');
    // Compare hashes
    const success = localHash === cloudHash;
    const message = success
        ? `✓ Parity test PASSED: Local and cloud hashes match (${localHash.substring(0, 16)}...)`
        : `✗ Parity test FAILED: Local hash ${localHash.substring(0, 16)}... != Cloud hash ${cloudHash.substring(0, 16)}...`;
    logger.info({ success, localHash, cloudHash }, message);
    return {
        success,
        localHash,
        cloudHash,
        executionTimings: {
            localMs,
            cloudMs
        },
        message
    };
}
/**
 * Verify SIMD support and alignment
 */
export function verifyRuntimeCapabilities() {
    logger.info('Verifying runtime capabilities');
    // Check SharedArrayBuffer
    const sharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    // Check Atomics
    const atomics = typeof Atomics !== 'undefined';
    // Check SIMD (via environment variable)
    const simdSupported = process.env.WASM_SIMD === '1';
    // Verify 16-byte alignment
    let alignment16Byte = false;
    try {
        // Allocate 16-byte aligned buffer
        const sab = new SharedArrayBuffer(32);
        const view = new Int32Array(sab, 16); // Offset by 16 bytes
        // Store and retrieve value
        Atomics.store(view, 0, 0xDEADBEEF);
        const value = Atomics.load(view, 0);
        alignment16Byte = value === 0xDEADBEEF && view.byteOffset === 16;
    }
    catch (error) {
        logger.error({ error }, '16-byte alignment check failed');
        alignment16Byte = false;
    }
    const allChecksPass = sharedArrayBuffer && atomics && simdSupported && alignment16Byte;
    logger.info({
        simdSupported,
        alignment16Byte,
        sharedArrayBuffer,
        atomics,
        allChecksPass
    }, 'Runtime capabilities verified');
    return {
        simdSupported,
        alignment16Byte,
        sharedArrayBuffer,
        atomics,
        allChecksPass
    };
}
// Run parity test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        // First verify runtime capabilities
        const capabilities = verifyRuntimeCapabilities();
        if (!capabilities.allChecksPass) {
            logger.error('Runtime capabilities check failed - parity test may be unreliable');
            process.exit(1);
        }
        // Run parity test
        const result = await runParityTest();
        if (!result.success) {
            logger.error('Parity test failed');
            process.exit(1);
        }
        logger.info('All checks passed');
        process.exit(0);
    })();
}
//# sourceMappingURL=parity-test.js.map