/**
 * Pipeline Loader for Cloud Worker
 *
 * Reconstructs the SharedArrayBuffer pipeline in the cloud environment
 * exactly as it was configured locally. This ensures parity between
 * local and cloud execution.
 */
import { createHash } from 'crypto';
import pino from 'pino';
import { MemoryOffsetManager, AtomicSignalManager, NodeState } from '@livecalc/engine';
const logger = pino({ name: 'pipeline-loader' });
export class PipelineLoader {
    logger = logger.child({ component: 'PipelineLoader' });
    /**
     * Validates that model assets match expected structure and integrity
     */
    validateAssets(assets) {
        const errors = [];
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
                }
                else if (node.engine.startsWith('python://')) {
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
    computeAssetsHash(assets) {
        const hash = createHash('sha256');
        // Hash config
        hash.update(JSON.stringify(assets.config));
        // Hash WASM binaries
        const wasmKeys = Array.from(assets.wasmBinaries.keys()).sort();
        for (const key of wasmKeys) {
            hash.update(key);
            hash.update(assets.wasmBinaries.get(key));
        }
        // Hash Python scripts
        const pyKeys = Array.from(assets.pythonScripts.keys()).sort();
        for (const key of pyKeys) {
            hash.update(key);
            hash.update(assets.pythonScripts.get(key));
        }
        // Hash assumption references
        hash.update(assets.assumptionRefs.sort().join(','));
        return hash.digest('hex');
    }
    /**
     * Loads and initializes pipeline in cloud environment
     */
    async loadPipeline(assets) {
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
        try {
            // Extract bus:// resource requirements from pipeline config
            const busResources = this.extractBusResources(assets.config);
            this.logger.info({ resourceCount: busResources.length }, 'Extracted bus resources');
            // Calculate execution order (topological sort)
            const nodeOrder = this.calculateExecutionOrder(assets.config.nodes);
            this.logger.info({ nodeOrder }, 'Calculated execution order');
            // Create memory offset manager and allocate SharedArrayBuffer
            const memoryManager = new MemoryOffsetManager({
                enableIntegrityChecks: assets.config.debug?.enableIntegrityChecks ?? false,
                zeroMemoryBetweenRuns: assets.config.debug?.zeroMemoryBetweenRuns ?? true,
                maxNodes: assets.config.nodes.length
            });
            // Set logger
            memoryManager.setLogger((msg) => this.logger.debug(msg));
            // Add all bus resources to the memory manager
            for (const resource of busResources) {
                memoryManager.addResource(resource);
            }
            // Allocate the SharedArrayBuffer
            const nodeIds = assets.config.nodes.map(n => n.id);
            memoryManager.allocate(nodeIds);
            const buffer = memoryManager.getBuffer();
            const offsetMap = memoryManager.getOffsetMapJSON();
            this.logger.info({
                totalSize: buffer.byteLength,
                totalSizeMB: (buffer.byteLength / 1024 / 1024).toFixed(2)
            }, 'SharedArrayBuffer allocated');
            // Create signal manager for node coordination
            const signalManager = new AtomicSignalManager(buffer, offsetMap.status.offset, nodeIds);
            // Initialize all nodes to IDLE state
            for (const nodeId of nodeIds) {
                signalManager.signal(nodeId, NodeState.IDLE);
            }
            // Initialize engine instances (WASM modules, Python engines, etc.)
            const engineInstances = await this.initializeEngines(assets, buffer, offsetMap);
            this.logger.info({
                pipelineId,
                assetsHash,
                nodeCount: nodeIds.length,
                engineCount: engineInstances.size
            }, 'Pipeline loaded successfully');
            return {
                success: true,
                pipelineId,
                assetsHash,
                pipeline: {
                    pipelineId,
                    assetsHash,
                    sharedArrayBuffer: buffer,
                    memoryOffsetMap: offsetMap,
                    signalManager,
                    engineInstances,
                    nodeOrder
                }
            };
        }
        catch (error) {
            this.logger.error({ error }, 'Pipeline loading failed');
            return {
                success: false,
                pipelineId,
                assetsHash,
                errors: [error instanceof Error ? error.message : String(error)]
            };
        }
    }
    /**
     * Extracts bus:// resource requirements from pipeline config
     */
    extractBusResources(config) {
        const resources = new Map();
        // First pass: Find producers
        for (const node of config.nodes) {
            for (const [key, busRef] of Object.entries(node.outputs || {})) {
                if (busRef.startsWith('bus://')) {
                    if (!resources.has(busRef)) {
                        // Parse size spec (e.g., "10000:float64" or "80KB")
                        const sizeSpec = node.config?.[`${key}_size`] ?? '10000:float64';
                        const { sizeBytes, dataType } = this.parseSizeSpec(sizeSpec);
                        resources.set(busRef, {
                            sizeBytes,
                            dataType,
                            producerNodeId: node.id,
                            consumerNodeIds: []
                        });
                    }
                }
            }
        }
        // Second pass: Find consumers
        for (const node of config.nodes) {
            for (const busRef of Object.values(node.inputs || {})) {
                if (busRef.startsWith('bus://')) {
                    const resource = resources.get(busRef);
                    if (resource) {
                        resource.consumerNodeIds.push(node.id);
                    }
                }
            }
        }
        return Array.from(resources.entries()).map(([name, resource]) => ({
            name,
            ...resource
        }));
    }
    /**
     * Parses size specification string into bytes and data type
     */
    parseSizeSpec(spec) {
        // Handle format like "10000:float64" or "80KB"
        if (spec.includes(':')) {
            const [count, type] = spec.split(':');
            const elementCount = parseInt(count, 10);
            const dataType = this.parseDataType(type);
            const elementSize = this.getElementSize(dataType);
            return { sizeBytes: elementCount * elementSize, dataType };
        }
        // Handle byte suffixes (KB, MB, GB)
        const match = spec.match(/^(\d+(?:\.\d+)?)\s*(bytes?|KB|MB|GB)$/i);
        if (match) {
            const value = parseFloat(match[1]);
            const unit = match[2].toUpperCase();
            let sizeBytes = value;
            if (unit.startsWith('KB'))
                sizeBytes *= 1024;
            else if (unit.startsWith('MB'))
                sizeBytes *= 1024 * 1024;
            else if (unit.startsWith('GB'))
                sizeBytes *= 1024 * 1024 * 1024;
            return { sizeBytes, dataType: 'Float64Array' };
        }
        // Default: interpret as element count with Float64Array
        const elementCount = parseInt(spec, 10);
        return { sizeBytes: elementCount * 8, dataType: 'Float64Array' };
    }
    /**
     * Parses data type string to TypedArrayType
     */
    parseDataType(type) {
        const normalized = type.toLowerCase();
        if (normalized.includes('float64') || normalized.includes('f64'))
            return 'Float64Array';
        if (normalized.includes('float32') || normalized.includes('f32'))
            return 'Float32Array';
        if (normalized.includes('int32') || normalized.includes('i32'))
            return 'Int32Array';
        if (normalized.includes('uint32') || normalized.includes('u32'))
            return 'Uint32Array';
        if (normalized.includes('int16') || normalized.includes('i16'))
            return 'Int16Array';
        if (normalized.includes('uint16') || normalized.includes('u16'))
            return 'Uint16Array';
        if (normalized.includes('int8') || normalized.includes('i8'))
            return 'Int8Array';
        if (normalized.includes('uint8') || normalized.includes('u8'))
            return 'Uint8Array';
        return 'Float64Array'; // Default
    }
    /**
     * Gets element size for a TypedArrayType
     */
    getElementSize(dataType) {
        switch (dataType) {
            case 'Float64Array': return 8;
            case 'Float32Array':
            case 'Int32Array':
            case 'Uint32Array': return 4;
            case 'Int16Array':
            case 'Uint16Array': return 2;
            case 'Int8Array':
            case 'Uint8Array': return 1;
        }
    }
    /**
     * Calculates execution order using topological sort (Kahn's algorithm)
     */
    calculateExecutionOrder(nodes) {
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const inDegree = new Map();
        const adjacencyList = new Map();
        // Initialize
        for (const node of nodes) {
            inDegree.set(node.id, 0);
            adjacencyList.set(node.id, []);
        }
        // Build graph
        for (const node of nodes) {
            for (const inputBus of Object.values(node.inputs || {})) {
                // Find which node produces this bus resource
                const producer = nodes.find(n => Object.values(n.outputs || {}).includes(inputBus));
                if (producer) {
                    adjacencyList.get(producer.id).push(node.id);
                    inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
                }
            }
        }
        // Topological sort
        const queue = [];
        const order = [];
        for (const [nodeId, degree] of inDegree) {
            if (degree === 0) {
                queue.push(nodeId);
            }
        }
        while (queue.length > 0) {
            const current = queue.shift();
            order.push(current);
            for (const neighbor of adjacencyList.get(current) || []) {
                inDegree.set(neighbor, inDegree.get(neighbor) - 1);
                if (inDegree.get(neighbor) === 0) {
                    queue.push(neighbor);
                }
            }
        }
        // Check for cycles
        if (order.length !== nodes.length) {
            throw new Error('Pipeline contains circular dependencies');
        }
        return order;
    }
    /**
     * Initializes engine instances (WASM, Python, etc.)
     */
    async initializeEngines(assets, sharedArrayBuffer, memoryOffsetMap) {
        const engineInstances = new Map();
        // For now, we'll create placeholder instances
        // Real WASM loading will be implemented when we have actual binaries
        for (const [engineName, wasmBinary] of assets.wasmBinaries) {
            this.logger.info({ engineName, size: wasmBinary.byteLength }, 'Loading WASM engine');
            // TODO: Actually instantiate WASM module
            // For now, store metadata
            engineInstances.set(`wasm://${engineName}`, {
                type: 'wasm',
                name: engineName,
                binary: wasmBinary,
                memoryOffsetMap
            });
        }
        for (const [scriptName, scriptContent] of assets.pythonScripts) {
            this.logger.info({ scriptName, size: scriptContent.length }, 'Loading Python engine');
            // TODO: Initialize Pyodide and load script
            // For now, store metadata
            engineInstances.set(`python://${scriptName}`, {
                type: 'python',
                name: scriptName,
                script: scriptContent,
                memoryOffsetMap
            });
        }
        return engineInstances;
    }
    /**
     * Verifies that cloud runtime has parity with local environment
     */
    verifyRuntimeParity() {
        const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
        const hasAtomics = typeof Atomics !== 'undefined';
        const hasSIMD = process.env.WASM_SIMD === '1';
        // Test 16-byte alignment
        let alignment16Byte = false;
        try {
            const sab = new SharedArrayBuffer(16);
            const view = new Int32Array(sab);
            alignment16Byte = sab.byteLength === 16 && view.byteOffset === 0;
        }
        catch {
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
//# sourceMappingURL=pipeline-loader.js.map