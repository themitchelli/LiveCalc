/**
 * Parity Test - Verify cloud runtime produces identical results to local
 *
 * This test runs a 10K policy projection both locally and in the cloud worker,
 * then compares the result hashes to ensure byte-identical output.
 */
/**
 * Main parity test function
 */
export declare function runParityTest(policyCount?: number, scenarioCount?: number): Promise<{
    success: boolean;
    localHash: string;
    cloudHash: string;
    executionTimings: {
        localMs: number;
        cloudMs: number;
    };
    message: string;
}>;
/**
 * Verify SIMD support and alignment
 */
export declare function verifyRuntimeCapabilities(): {
    simdSupported: boolean;
    alignment16Byte: boolean;
    sharedArrayBuffer: boolean;
    atomics: boolean;
    allChecksPass: boolean;
};
//# sourceMappingURL=parity-test.d.ts.map