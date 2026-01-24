/**
 * Memory Offset Manager for Pipeline Orchestration
 *
 * Manages SharedArrayBuffer allocation for bus:// resources in a pipeline.
 * Automatically calculates memory requirements, assigns 16-byte aligned offsets,
 * and generates MemoryOffsetMaps for workers.
 *
 * ## Memory Layout
 *
 * ```
 * +----------------------------------+
 * | Header (64 bytes)                |  - Pipeline status flags, metadata
 * +----------------------------------+
 * | Status Region (64 bytes)         |  - Per-node atomic status bytes
 * +----------------------------------+
 * | Bus Resources                    |  - Dynamically allocated bus:// blocks
 * |   - bus://scenarios/rates        |    (16-byte aligned)
 * |   - bus://results/npv            |
 * |   - ...                          |
 * +----------------------------------+
 * | Checksum Region                  |  - CRC32 checksums per block
 * +----------------------------------+
 * ```
 *
 * @module orchestrator/memory-manager
 */

import { isSharedArrayBufferAvailable } from '../shared-buffer.js';

/**
 * Memory block information for a single bus:// resource
 */
export interface MemoryBlock {
  /** Bus resource name (e.g., 'bus://scenarios/rates') */
  name: string;
  /** Byte offset into the SharedArrayBuffer */
  offset: number;
  /** Size in bytes */
  sizeBytes: number;
  /** TypedArray type for this block */
  dataType: TypedArrayType;
  /** Number of elements (sizeBytes / element size) */
  elementCount: number;
  /** Checksum offset for integrity verification (if enabled) */
  checksumOffset?: number;
  /** Last computed checksum value */
  checksum?: number;
}

/**
 * Supported TypedArray types for bus resources
 */
export type TypedArrayType =
  | 'Float64Array'
  | 'Float32Array'
  | 'Int32Array'
  | 'Uint32Array'
  | 'Int16Array'
  | 'Uint16Array'
  | 'Int8Array'
  | 'Uint8Array';

/**
 * Memory offset map sent to workers at initialization
 */
export interface MemoryOffsetMap {
  /** Total size of the SharedArrayBuffer in bytes */
  totalSize: number;
  /** Version of the memory layout format */
  version: number;
  /** Header region offset and size */
  header: {
    offset: number;
    size: number;
  };
  /** Status region for atomic signaling */
  status: {
    offset: number;
    size: number;
    /** Map of node ID to status byte offset */
    nodeOffsets: Map<string, number>;
  };
  /** All bus:// resource blocks */
  blocks: MemoryBlock[];
  /** Checksum region offset (if integrity checks enabled) */
  checksumRegion?: {
    offset: number;
    size: number;
  };
  /** Map for quick lookup by bus name */
  blocksByName: Map<string, MemoryBlock>;
}

/**
 * Memory offset map in JSON-serializable format
 */
export interface MemoryOffsetMapJSON {
  totalSize: number;
  version: number;
  header: { offset: number; size: number };
  status: {
    offset: number;
    size: number;
    nodeOffsets: Record<string, number>;
  };
  blocks: Array<{
    name: string;
    offset: number;
    sizeBytes: number;
    dataType: TypedArrayType;
    elementCount: number;
    checksumOffset?: number;
  }>;
  checksumRegion?: { offset: number; size: number };
}

/**
 * Bus resource requirement from pipeline configuration
 */
export interface BusResourceRequirement {
  /** Bus resource name (e.g., 'bus://scenarios/rates') */
  name: string;
  /** Size in bytes */
  sizeBytes: number;
  /** Data type */
  dataType: TypedArrayType;
  /** Node that produces this resource */
  producerNodeId: string;
  /** Nodes that consume this resource */
  consumerNodeIds: string[];
}

/**
 * Configuration for MemoryOffsetManager
 */
export interface MemoryManagerConfig {
  /** Maximum number of pipeline nodes (for status region sizing) */
  maxNodes?: number;
  /** Enable integrity checking (adds checksum region) */
  enableIntegrityChecks?: boolean;
  /** Zero memory between runs for security */
  zeroMemoryBetweenRuns?: boolean;
  /** Platform memory limit in bytes (default: auto-detect) */
  memoryLimit?: number;
}

/**
 * Memory layout constants
 */
const HEADER_SIZE = 64; // 64 bytes for header metadata
const STATUS_SIZE = 64; // 64 bytes for node status (up to 64 nodes)
const ALIGNMENT = 16; // 16-byte alignment for SIMD compatibility
const CHECKSUM_BYTES_PER_BLOCK = 4; // CRC32 is 4 bytes
const MEMORY_MAP_VERSION = 1;

// Header offsets
const HEADER_MAGIC = 0x4C435042; // 'LCPB' - LiveCalc Pipeline Buffer
const OFFSET_MAGIC = 0;
const OFFSET_VERSION = 4;
const OFFSET_TOTAL_SIZE = 8;
const OFFSET_BLOCK_COUNT = 16;
const OFFSET_CREATED_AT = 24;
const OFFSET_FLAGS = 32;

// Platform memory limits (approximate)
const BROWSER_MEMORY_LIMIT = 2 * 1024 * 1024 * 1024; // 2GB practical limit
const NODE_DEFAULT_LIMIT = 8 * 1024 * 1024 * 1024; // 8GB default for Node.js

/**
 * Align a value up to the nearest multiple of alignment
 */
function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

/**
 * Get element size for a TypedArray type
 */
function getElementSize(dataType: TypedArrayType): number {
  switch (dataType) {
    case 'Float64Array':
      return 8;
    case 'Float32Array':
    case 'Int32Array':
    case 'Uint32Array':
      return 4;
    case 'Int16Array':
    case 'Uint16Array':
      return 2;
    case 'Int8Array':
    case 'Uint8Array':
      return 1;
    default:
      return 8; // Default to 8 bytes
  }
}

/**
 * Detect platform memory limit
 */
function detectMemoryLimit(): number {
  // Check if in Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    // In Node.js, use available system memory or default
    try {
      const os = require('os');
      const available = os.freemem();
      // Use 75% of available memory, capped at NODE_DEFAULT_LIMIT
      return Math.min(available * 0.75, NODE_DEFAULT_LIMIT);
    } catch {
      return NODE_DEFAULT_LIMIT;
    }
  }

  // In browser, use conservative limit
  return BROWSER_MEMORY_LIMIT;
}

/**
 * Error thrown when memory allocation fails
 */
export class MemoryAllocationError extends Error {
  constructor(
    message: string,
    public readonly requestedBytes: number,
    public readonly limitBytes: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MemoryAllocationError';
  }
}

/**
 * MemoryOffsetManager handles SharedArrayBuffer allocation and memory mapping
 * for pipeline bus:// resources.
 *
 * @example
 * ```typescript
 * const manager = new MemoryOffsetManager({
 *   enableIntegrityChecks: true,
 *   zeroMemoryBetweenRuns: true,
 * });
 *
 * // Add bus resources from pipeline config
 * manager.addResource({
 *   name: 'bus://scenarios/rates',
 *   sizeBytes: 80000,
 *   dataType: 'Float64Array',
 *   producerNodeId: 'esg',
 *   consumerNodeIds: ['projection'],
 * });
 *
 * // Allocate the buffer
 * manager.allocate(['esg', 'projection']);
 *
 * // Get offset map for workers
 * const offsetMap = manager.getOffsetMap();
 *
 * // Get the SharedArrayBuffer to pass to workers
 * const sab = manager.getBuffer();
 * ```
 */
export class MemoryOffsetManager {
  private readonly _config: Required<MemoryManagerConfig>;
  private readonly _resources: Map<string, BusResourceRequirement> = new Map();
  private _buffer: SharedArrayBuffer | null = null;
  private _offsetMap: MemoryOffsetMap | null = null;
  private _allocated = false;
  private _logger: ((message: string, ...args: unknown[]) => void) | null = null;

  /**
   * Create a new MemoryOffsetManager
   */
  constructor(config: MemoryManagerConfig = {}) {
    this._config = {
      maxNodes: config.maxNodes ?? 64,
      enableIntegrityChecks: config.enableIntegrityChecks ?? false,
      zeroMemoryBetweenRuns: config.zeroMemoryBetweenRuns ?? true,
      memoryLimit: config.memoryLimit ?? detectMemoryLimit(),
    };
  }

  /**
   * Set a logger function for debug output
   */
  setLogger(logger: (message: string, ...args: unknown[]) => void): void {
    this._logger = logger;
  }

  private log(message: string, ...args: unknown[]): void {
    if (this._logger) {
      this._logger(`[MemoryManager] ${message}`, ...args);
    }
  }

  /**
   * Add a bus resource requirement
   *
   * @throws Error if already allocated
   */
  addResource(requirement: BusResourceRequirement): void {
    if (this._allocated) {
      throw new Error('Cannot add resources after allocation');
    }

    // Validate bus name format
    if (!requirement.name.startsWith('bus://')) {
      throw new Error(`Invalid bus resource name: ${requirement.name}. Must start with 'bus://'`);
    }

    // Validate size
    if (requirement.sizeBytes <= 0) {
      throw new Error(`Invalid size for ${requirement.name}: ${requirement.sizeBytes} bytes`);
    }

    this._resources.set(requirement.name, requirement);
    this.log(`Added resource: ${requirement.name} (${requirement.sizeBytes} bytes, ${requirement.dataType})`);
  }

  /**
   * Add multiple bus resources at once
   */
  addResources(requirements: BusResourceRequirement[]): void {
    for (const req of requirements) {
      this.addResource(req);
    }
  }

  /**
   * Clear all resources (for reuse)
   */
  clearResources(): void {
    if (this._allocated) {
      throw new Error('Cannot clear resources after allocation. Call dispose() first.');
    }
    this._resources.clear();
    this.log('Cleared all resources');
  }

  /**
   * Get the total memory requirement (without allocation)
   */
  calculateTotalMemory(): number {
    let total = HEADER_SIZE + STATUS_SIZE;

    // Sum all resource sizes (with alignment)
    for (const resource of this._resources.values()) {
      total += alignUp(resource.sizeBytes, ALIGNMENT);
    }

    // Add checksum region if enabled
    if (this._config.enableIntegrityChecks) {
      const checksumSize = this._resources.size * CHECKSUM_BYTES_PER_BLOCK;
      total += alignUp(checksumSize, ALIGNMENT);
    }

    return total;
  }

  /**
   * Validate that memory requirements don't exceed platform limits
   *
   * @returns Object with valid flag and details
   */
  validateMemoryRequirements(): {
    valid: boolean;
    totalBytes: number;
    limitBytes: number;
    resourceBreakdown: Array<{ name: string; sizeBytes: number; alignedSize: number }>;
    error?: string;
  } {
    const totalBytes = this.calculateTotalMemory();
    const limitBytes = this._config.memoryLimit;
    const breakdown: Array<{ name: string; sizeBytes: number; alignedSize: number }> = [];

    for (const resource of this._resources.values()) {
      breakdown.push({
        name: resource.name,
        sizeBytes: resource.sizeBytes,
        alignedSize: alignUp(resource.sizeBytes, ALIGNMENT),
      });
    }

    if (totalBytes > limitBytes) {
      return {
        valid: false,
        totalBytes,
        limitBytes,
        resourceBreakdown: breakdown,
        error: `Total memory requirement (${formatBytes(totalBytes)}) exceeds platform limit (${formatBytes(limitBytes)})`,
      };
    }

    return { valid: true, totalBytes, limitBytes, resourceBreakdown: breakdown };
  }

  /**
   * Allocate the SharedArrayBuffer and compute memory offsets
   *
   * @param nodeIds - Array of pipeline node IDs for status region
   * @throws MemoryAllocationError if allocation fails
   */
  allocate(nodeIds: string[]): void {
    if (this._allocated) {
      throw new Error('Already allocated. Call dispose() first.');
    }

    if (!isSharedArrayBufferAvailable()) {
      throw new MemoryAllocationError(
        'SharedArrayBuffer is not available. In browsers, ensure cross-origin isolation headers are set.',
        0,
        this._config.memoryLimit
      );
    }

    // Validate memory requirements
    const validation = this.validateMemoryRequirements();
    if (!validation.valid) {
      throw new MemoryAllocationError(
        validation.error!,
        validation.totalBytes,
        validation.limitBytes,
        { resourceBreakdown: validation.resourceBreakdown }
      );
    }

    // Validate node count
    if (nodeIds.length > this._config.maxNodes) {
      throw new Error(`Too many nodes: ${nodeIds.length} exceeds max ${this._config.maxNodes}`);
    }

    this.log(`Allocating ${formatBytes(validation.totalBytes)} for ${this._resources.size} resources`);

    // Allocate the buffer
    try {
      this._buffer = new SharedArrayBuffer(validation.totalBytes);
    } catch (error) {
      throw new MemoryAllocationError(
        `Failed to allocate SharedArrayBuffer: ${error instanceof Error ? error.message : 'Unknown error'}`,
        validation.totalBytes,
        this._config.memoryLimit
      );
    }

    // Build the offset map
    this._offsetMap = this.buildOffsetMap(nodeIds, validation.totalBytes);
    this._allocated = true;

    // Initialize header
    this.initializeHeader(validation.totalBytes);

    // Zero memory if configured
    if (this._config.zeroMemoryBetweenRuns) {
      this.zeroMemory();
    }

    this.logMemoryLayout();
  }

  /**
   * Build the memory offset map
   */
  private buildOffsetMap(nodeIds: string[], totalSize: number): MemoryOffsetMap {
    const blocks: MemoryBlock[] = [];
    const blocksByName = new Map<string, MemoryBlock>();
    const nodeOffsets = new Map<string, number>();

    // Header region
    const headerInfo = { offset: 0, size: HEADER_SIZE };

    // Status region starts after header
    const statusOffset = HEADER_SIZE;

    // Assign status byte offsets to each node
    for (let i = 0; i < nodeIds.length; i++) {
      nodeOffsets.set(nodeIds[i], statusOffset + i);
    }

    const statusInfo = {
      offset: statusOffset,
      size: STATUS_SIZE,
      nodeOffsets,
    };

    // Bus resources start after status region
    let currentOffset = HEADER_SIZE + STATUS_SIZE;

    for (const resource of this._resources.values()) {
      const alignedOffset = alignUp(currentOffset, ALIGNMENT);
      const elementSize = getElementSize(resource.dataType);
      const elementCount = Math.floor(resource.sizeBytes / elementSize);

      const block: MemoryBlock = {
        name: resource.name,
        offset: alignedOffset,
        sizeBytes: resource.sizeBytes,
        dataType: resource.dataType,
        elementCount,
      };

      blocks.push(block);
      blocksByName.set(resource.name, block);

      currentOffset = alignedOffset + resource.sizeBytes;
    }

    // Checksum region (if enabled)
    let checksumRegion: { offset: number; size: number } | undefined;

    if (this._config.enableIntegrityChecks) {
      const checksumOffset = alignUp(currentOffset, ALIGNMENT);
      const checksumSize = blocks.length * CHECKSUM_BYTES_PER_BLOCK;

      checksumRegion = {
        offset: checksumOffset,
        size: alignUp(checksumSize, ALIGNMENT),
      };

      // Assign checksum offsets to blocks
      for (let i = 0; i < blocks.length; i++) {
        blocks[i].checksumOffset = checksumOffset + i * CHECKSUM_BYTES_PER_BLOCK;
      }
    }

    return {
      totalSize,
      version: MEMORY_MAP_VERSION,
      header: headerInfo,
      status: statusInfo,
      blocks,
      checksumRegion,
      blocksByName,
    };
  }

  /**
   * Initialize the header region
   */
  private initializeHeader(totalSize: number): void {
    if (!this._buffer) return;

    const view = new DataView(this._buffer);
    view.setUint32(OFFSET_MAGIC, HEADER_MAGIC, true);
    view.setUint32(OFFSET_VERSION, MEMORY_MAP_VERSION, true);
    view.setBigUint64(OFFSET_TOTAL_SIZE, BigInt(totalSize), true);
    view.setUint32(OFFSET_BLOCK_COUNT, this._resources.size, true);
    view.setBigUint64(OFFSET_CREATED_AT, BigInt(Date.now()), true);

    // Flags: bit 0 = integrity checks enabled, bit 1 = zero memory enabled
    let flags = 0;
    if (this._config.enableIntegrityChecks) flags |= 0x01;
    if (this._config.zeroMemoryBetweenRuns) flags |= 0x02;
    view.setUint32(OFFSET_FLAGS, flags, true);
  }

  /**
   * Zero all bus resource memory (for security between runs)
   */
  zeroMemory(): void {
    if (!this._buffer || !this._offsetMap) {
      return;
    }

    this.log('Zeroing memory for all bus resources');

    for (const block of this._offsetMap.blocks) {
      const view = new Uint8Array(this._buffer, block.offset, block.sizeBytes);
      view.fill(0);
    }

    // Also zero status region
    const statusView = new Uint8Array(
      this._buffer,
      this._offsetMap.status.offset,
      this._offsetMap.status.size
    );
    statusView.fill(0);
  }

  /**
   * Log memory layout for debugging
   */
  private logMemoryLayout(): void {
    if (!this._logger || !this._offsetMap) return;

    this.log('=== Memory Layout ===');
    this.log(`Total size: ${formatBytes(this._offsetMap.totalSize)}`);
    this.log(`Header: offset=0, size=${this._offsetMap.header.size}`);
    this.log(`Status: offset=${this._offsetMap.status.offset}, size=${this._offsetMap.status.size}`);
    this.log(`Blocks (${this._offsetMap.blocks.length}):`);

    for (const block of this._offsetMap.blocks) {
      this.log(
        `  ${block.name}: offset=${block.offset}, size=${formatBytes(block.sizeBytes)}, ` +
          `type=${block.dataType}, elements=${block.elementCount}`
      );
    }

    if (this._offsetMap.checksumRegion) {
      this.log(
        `Checksum region: offset=${this._offsetMap.checksumRegion.offset}, ` +
          `size=${this._offsetMap.checksumRegion.size}`
      );
    }

    this.log('=== End Memory Layout ===');
  }

  /**
   * Get the allocated SharedArrayBuffer
   *
   * @throws Error if not allocated
   */
  getBuffer(): SharedArrayBuffer {
    if (!this._buffer) {
      throw new Error('Buffer not allocated. Call allocate() first.');
    }
    return this._buffer;
  }

  /**
   * Get the memory offset map
   *
   * @throws Error if not allocated
   */
  getOffsetMap(): MemoryOffsetMap {
    if (!this._offsetMap) {
      throw new Error('Buffer not allocated. Call allocate() first.');
    }
    return this._offsetMap;
  }

  /**
   * Get the memory offset map as JSON-serializable object
   *
   * @throws Error if not allocated
   */
  getOffsetMapJSON(): MemoryOffsetMapJSON {
    const map = this.getOffsetMap();

    return {
      totalSize: map.totalSize,
      version: map.version,
      header: map.header,
      status: {
        offset: map.status.offset,
        size: map.status.size,
        nodeOffsets: Object.fromEntries(map.status.nodeOffsets),
      },
      blocks: map.blocks.map((block) => ({
        name: block.name,
        offset: block.offset,
        sizeBytes: block.sizeBytes,
        dataType: block.dataType,
        elementCount: block.elementCount,
        checksumOffset: block.checksumOffset,
      })),
      checksumRegion: map.checksumRegion,
    };
  }

  /**
   * Get a typed array view for a bus resource
   *
   * @param busName - Bus resource name (e.g., 'bus://scenarios/rates')
   * @throws Error if resource not found or not allocated
   */
  getBlockView<T extends TypedArray>(busName: string): T {
    if (!this._buffer || !this._offsetMap) {
      throw new Error('Buffer not allocated. Call allocate() first.');
    }

    const block = this._offsetMap.blocksByName.get(busName);
    if (!block) {
      throw new Error(`Bus resource not found: ${busName}`);
    }

    return createTypedArray(this._buffer, block.dataType, block.offset, block.elementCount) as T;
  }

  /**
   * Get a block's metadata
   */
  getBlock(busName: string): MemoryBlock | undefined {
    return this._offsetMap?.blocksByName.get(busName);
  }

  /**
   * Get all blocks
   */
  getAllBlocks(): MemoryBlock[] {
    return this._offsetMap?.blocks ?? [];
  }

  /**
   * Check if buffer is allocated
   */
  get isAllocated(): boolean {
    return this._allocated;
  }

  /**
   * Get total allocated size in bytes
   */
  get allocatedSize(): number {
    return this._offsetMap?.totalSize ?? 0;
  }

  /**
   * Get resource count
   */
  get resourceCount(): number {
    return this._resources.size;
  }

  /**
   * Dispose of the allocated buffer
   */
  dispose(): void {
    this._buffer = null;
    this._offsetMap = null;
    this._allocated = false;
    this._resources.clear();
    this.log('Disposed');
  }
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * TypedArray union type
 */
type TypedArray =
  | Float64Array
  | Float32Array
  | Int32Array
  | Uint32Array
  | Int16Array
  | Uint16Array
  | Int8Array
  | Uint8Array;

/**
 * Create a typed array view into a buffer
 */
function createTypedArray(
  buffer: ArrayBuffer | SharedArrayBuffer,
  dataType: TypedArrayType,
  offset: number,
  length: number
): TypedArray {
  switch (dataType) {
    case 'Float64Array':
      return new Float64Array(buffer, offset, length);
    case 'Float32Array':
      return new Float32Array(buffer, offset, length);
    case 'Int32Array':
      return new Int32Array(buffer, offset, length);
    case 'Uint32Array':
      return new Uint32Array(buffer, offset, length);
    case 'Int16Array':
      return new Int16Array(buffer, offset, length);
    case 'Uint16Array':
      return new Uint16Array(buffer, offset, length);
    case 'Int8Array':
      return new Int8Array(buffer, offset, length);
    case 'Uint8Array':
      return new Uint8Array(buffer, offset, length);
    default:
      throw new Error(`Unknown data type: ${dataType}`);
  }
}

/**
 * Parse a bus resource size from a config string
 *
 * Supports:
 * - Plain numbers: "1000" -> 1000 bytes
 * - KB/MB/GB suffixes: "100KB", "10MB", "1GB"
 * - Element counts with type: "10000:Float64Array" -> 80000 bytes
 */
export function parseBusResourceSize(sizeSpec: string): { sizeBytes: number; dataType: TypedArrayType } {
  const trimmed = sizeSpec.trim().toUpperCase();

  // Check for element count format: "10000:Float64Array"
  if (sizeSpec.includes(':')) {
    const [countStr, typeStr] = sizeSpec.split(':');
    const count = parseInt(countStr.trim(), 10);
    const dataType = typeStr.trim() as TypedArrayType;
    const elementSize = getElementSize(dataType);
    return { sizeBytes: count * elementSize, dataType };
  }

  // Default data type
  const dataType: TypedArrayType = 'Float64Array';

  // Check for size suffixes
  if (trimmed.endsWith('GB')) {
    return { sizeBytes: parseFloat(trimmed) * 1024 * 1024 * 1024, dataType };
  }
  if (trimmed.endsWith('MB')) {
    return { sizeBytes: parseFloat(trimmed) * 1024 * 1024, dataType };
  }
  if (trimmed.endsWith('KB')) {
    return { sizeBytes: parseFloat(trimmed) * 1024, dataType };
  }
  if (trimmed.endsWith('B')) {
    return { sizeBytes: parseFloat(trimmed), dataType };
  }

  // Plain number (bytes)
  return { sizeBytes: parseInt(sizeSpec, 10), dataType };
}
