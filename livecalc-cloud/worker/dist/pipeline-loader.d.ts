/**
 * Pipeline Loader for Cloud Worker
 *
 * Reconstructs the SharedArrayBuffer pipeline in the cloud environment
 * exactly as it was configured locally. This ensures parity between
 * local and cloud execution.
 */
import { AtomicSignalManager, type MemoryOffsetMapJSON } from '@livecalc/engine';
export interface PipelineConfig {
    nodes: PipelineNode[];
    debug?: {
        breakpoints?: string[];
        enableIntegrityChecks?: boolean;
        zeroMemoryBetweenRuns?: boolean;
    };
    errorHandling?: {
        continueOnError?: boolean;
        maxErrors?: number;
        timeoutMs?: number;
        captureSnapshots?: boolean;
    };
}
export interface PipelineNode {
    id: string;
    engine: string;
    inputs: Record<string, string>;
    outputs: Record<string, string>;
    config?: Record<string, unknown>;
}
export interface ModelAssets {
    wasmBinaries: Map<string, Uint8Array>;
    pythonScripts: Map<string, string>;
    config: PipelineConfig;
    assumptionRefs: string[];
}
/**
 * Loaded pipeline instance with allocated memory and initialized engines
 */
export interface LoadedPipeline {
    pipelineId: string;
    assetsHash: string;
    sharedArrayBuffer: SharedArrayBuffer;
    memoryOffsetMap: MemoryOffsetMapJSON;
    signalManager: AtomicSignalManager;
    engineInstances: Map<string, unknown>;
    nodeOrder: string[];
}
export declare class PipelineLoader {
    private logger;
    /**
     * Validates that model assets match expected structure and integrity
     */
    validateAssets(assets: ModelAssets): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Computes SHA-256 hash of all assets for integrity verification
     */
    computeAssetsHash(assets: ModelAssets): string;
    /**
     * Loads and initializes pipeline in cloud environment
     */
    loadPipeline(assets: ModelAssets): Promise<{
        success: boolean;
        pipelineId: string;
        assetsHash: string;
        pipeline?: LoadedPipeline;
        errors?: string[];
    }>;
    /**
     * Extracts bus:// resource requirements from pipeline config
     */
    private extractBusResources;
    /**
     * Parses size specification string into bytes and data type
     */
    private parseSizeSpec;
    /**
     * Parses data type string to TypedArrayType
     */
    private parseDataType;
    /**
     * Gets element size for a TypedArrayType
     */
    private getElementSize;
    /**
     * Calculates execution order using topological sort (Kahn's algorithm)
     */
    private calculateExecutionOrder;
    /**
     * Initializes engine instances (WASM, Python, etc.)
     */
    private initializeEngines;
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
    };
}
export declare const pipelineLoader: PipelineLoader;
//# sourceMappingURL=pipeline-loader.d.ts.map