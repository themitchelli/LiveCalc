/**
 * SharedArrayBuffer Manager - Zero-copy data sharing between workers
 *
 * This module provides utilities for storing policy and assumption data in
 * SharedArrayBuffer, enabling zero-copy access from all workers.
 *
 * ## Memory Layout
 *
 * The shared buffer is organized as follows:
 * ```
 * +---------------------------+
 * | Header (32 bytes)         |  - Metadata about buffer contents
 * +---------------------------+
 * | Policies Section          |  - Binary policy data (32 bytes each)
 * +---------------------------+
 * | Mortality Section         |  - Binary mortality table (1936 bytes)
 * +---------------------------+
 * | Lapse Section             |  - Binary lapse table (400 bytes)
 * +---------------------------+
 * | Expenses Section          |  - Binary expense assumptions (32 bytes)
 * +---------------------------+
 * | Results Section           |  - Per-worker result areas (8 bytes × scenarios × workers)
 * +---------------------------+
 * ```
 *
 * ## Browser Requirements
 *
 * SharedArrayBuffer requires cross-origin isolation headers:
 * - Cross-Origin-Opener-Policy: same-origin
 * - Cross-Origin-Embedder-Policy: require-corp
 *
 * @module shared-buffer
 */

import type {
  Policy,
  Gender,
  ProductType,
  MortalityTable,
  LapseTable,
  ExpenseAssumptions,
} from './types.js';

/**
 * Header layout constants (offsets in bytes)
 */
const HEADER_SIZE = 32;
const HEADER_MAGIC = 0x4C435342; // 'LCSB' - LiveCalc SharedBuffer
const HEADER_VERSION = 1;

// Header offsets
const OFFSET_MAGIC = 0;
const OFFSET_VERSION = 4;
const OFFSET_POLICY_COUNT = 8;
const OFFSET_SCENARIO_COUNT = 12;
const OFFSET_WORKER_COUNT = 16;
const OFFSET_POLICIES_OFFSET = 20;
const OFFSET_ASSUMPTIONS_OFFSET = 24;
const OFFSET_RESULTS_OFFSET = 28;

/**
 * Size constants for data sections
 */
const POLICY_SIZE = 32; // 32 bytes per policy (matches C++ struct alignment)
const MORTALITY_TABLE_SIZE = 121 * 2 * 8; // 121 ages × 2 genders × 8 bytes = 1936 bytes
const LAPSE_TABLE_SIZE = 50 * 8; // 50 years × 8 bytes = 400 bytes
const EXPENSES_SIZE = 4 * 8; // 4 fields × 8 bytes = 32 bytes
const TOTAL_ASSUMPTIONS_SIZE = MORTALITY_TABLE_SIZE + LAPSE_TABLE_SIZE + EXPENSES_SIZE;

/**
 * Result of SharedArrayBuffer allocation
 */
export interface SharedBufferAllocation {
  /** The SharedArrayBuffer containing all data */
  buffer: SharedArrayBuffer;
  /** Offset to policies section */
  policiesOffset: number;
  /** Offset to assumptions section */
  assumptionsOffset: number;
  /** Offset to results section */
  resultsOffset: number;
  /** Size of results section per worker */
  resultsPerWorkerSize: number;
}

/**
 * Configuration for creating a shared buffer
 */
export interface SharedBufferConfig {
  /** Maximum number of policies to store */
  maxPolicies: number;
  /** Maximum number of scenarios (for result storage) */
  maxScenarios: number;
  /** Number of workers that will share this buffer */
  workerCount: number;
}

/**
 * Detect if SharedArrayBuffer is available and usable.
 *
 * In browsers, this requires cross-origin isolation:
 * - Cross-Origin-Opener-Policy: same-origin
 * - Cross-Origin-Embedder-Policy: require-corp
 *
 * @returns true if SharedArrayBuffer can be used
 */
export function isSharedArrayBufferAvailable(): boolean {
  // Check if SharedArrayBuffer exists
  if (typeof SharedArrayBuffer === 'undefined') {
    return false;
  }

  // In browsers, check for cross-origin isolation
  if (typeof crossOriginIsolated !== 'undefined') {
    return crossOriginIsolated;
  }

  // In Node.js, SharedArrayBuffer is always available
  if (typeof process !== 'undefined' && process.versions?.node) {
    return true;
  }

  // Fallback: try to create a small SharedArrayBuffer
  try {
    new SharedArrayBuffer(8);
    return true;
  } catch {
    return false;
  }
}

/**
 * Calculate required buffer size for the given configuration.
 */
export function calculateBufferSize(config: SharedBufferConfig): number {
  const policiesSize = config.maxPolicies * POLICY_SIZE;
  const resultsSize = config.maxScenarios * 8 * config.workerCount;

  return (
    HEADER_SIZE +
    policiesSize +
    TOTAL_ASSUMPTIONS_SIZE +
    resultsSize
  );
}

/**
 * SharedBufferManager handles allocation and data transfer for SharedArrayBuffer.
 *
 * @example
 * ```typescript
 * const manager = new SharedBufferManager({
 *   maxPolicies: 100000,
 *   maxScenarios: 10000,
 *   workerCount: 8,
 * });
 *
 * manager.writePolicies(policies);
 * manager.writeMortality(mortalityTable);
 * manager.writeLapse(lapseRates);
 * manager.writeExpenses(expenses);
 *
 * // Pass buffer to workers
 * worker.postMessage({ type: 'attach-sab', buffer: manager.buffer });
 * ```
 */
export class SharedBufferManager {
  private readonly _buffer: SharedArrayBuffer;
  private readonly _header: DataView;
  private readonly _policiesOffset: number;
  private readonly _assumptionsOffset: number;
  private readonly _resultsOffset: number;
  private readonly _maxPolicies: number;
  private readonly _maxScenarios: number;
  private readonly _workerCount: number;

  private _policyCount: number = 0;

  /**
   * Create a new SharedBufferManager with pre-allocated buffer.
   *
   * @param config - Buffer configuration
   * @throws Error if SharedArrayBuffer is not available
   */
  constructor(config: SharedBufferConfig) {
    if (!isSharedArrayBufferAvailable()) {
      throw new Error(
        'SharedArrayBuffer is not available. ' +
        'In browsers, ensure cross-origin isolation headers are set: ' +
        'Cross-Origin-Opener-Policy: same-origin, ' +
        'Cross-Origin-Embedder-Policy: require-corp'
      );
    }

    this._maxPolicies = config.maxPolicies;
    this._maxScenarios = config.maxScenarios;
    this._workerCount = config.workerCount;

    // Calculate offsets
    const policiesSize = config.maxPolicies * POLICY_SIZE;
    this._policiesOffset = HEADER_SIZE;
    this._assumptionsOffset = this._policiesOffset + policiesSize;
    this._resultsOffset = this._assumptionsOffset + TOTAL_ASSUMPTIONS_SIZE;

    // Allocate buffer
    const totalSize = calculateBufferSize(config);
    this._buffer = new SharedArrayBuffer(totalSize);

    // Initialize header
    this._header = new DataView(this._buffer);
    this._header.setUint32(OFFSET_MAGIC, HEADER_MAGIC, true);
    this._header.setUint32(OFFSET_VERSION, HEADER_VERSION, true);
    this._header.setUint32(OFFSET_POLICY_COUNT, 0, true);
    this._header.setUint32(OFFSET_SCENARIO_COUNT, 0, true);
    this._header.setUint32(OFFSET_WORKER_COUNT, config.workerCount, true);
    this._header.setUint32(OFFSET_POLICIES_OFFSET, this._policiesOffset, true);
    this._header.setUint32(OFFSET_ASSUMPTIONS_OFFSET, this._assumptionsOffset, true);
    this._header.setUint32(OFFSET_RESULTS_OFFSET, this._resultsOffset, true);
  }

  /**
   * Get the SharedArrayBuffer.
   */
  get buffer(): SharedArrayBuffer {
    return this._buffer;
  }

  /**
   * Get the current policy count.
   */
  get policyCount(): number {
    return this._policyCount;
  }

  /**
   * Get buffer allocation info for workers.
   */
  getAllocation(): SharedBufferAllocation {
    return {
      buffer: this._buffer,
      policiesOffset: this._policiesOffset,
      assumptionsOffset: this._assumptionsOffset,
      resultsOffset: this._resultsOffset,
      resultsPerWorkerSize: this._maxScenarios * 8,
    };
  }

  /**
   * Write policies to the shared buffer.
   *
   * @param policies - Array of Policy objects
   * @throws Error if policies exceed max capacity
   */
  writePolicies(policies: Policy[]): void {
    if (policies.length > this._maxPolicies) {
      throw new Error(
        `Policy count ${policies.length} exceeds max capacity ${this._maxPolicies}`
      );
    }

    const view = new DataView(this._buffer);
    let offset = this._policiesOffset;

    for (const policy of policies) {
      // Write policy fields (matches C++ struct layout)
      view.setUint32(offset, policy.policyId, true);          // 4 bytes
      view.setUint8(offset + 4, policy.age);                  // 1 byte
      view.setUint8(offset + 5, genderToByte(policy.gender)); // 1 byte
      // 2 bytes padding
      view.setFloat64(offset + 8, policy.sumAssured, true);   // 8 bytes
      view.setFloat64(offset + 16, policy.premium, true);     // 8 bytes
      view.setUint8(offset + 24, policy.term);                // 1 byte
      view.setUint8(offset + 25, productTypeToByte(policy.productType)); // 1 byte
      // 6 bytes padding to reach 32 bytes
      offset += POLICY_SIZE;
    }

    this._policyCount = policies.length;
    this._header.setUint32(OFFSET_POLICY_COUNT, policies.length, true);
  }

  /**
   * Write policies from CSV data (for efficiency, parse and write directly).
   *
   * @param csvData - CSV string containing policy data
   * @returns Number of policies written
   */
  writePoliciesFromCsv(csvData: string): number {
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      return 0; // No data rows
    }

    // Skip header, parse and write each row
    const policies: Policy[] = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].split(',').map(f => f.trim());
      if (fields.length >= 7) {
        policies.push({
          policyId: parseInt(fields[0], 10),
          age: parseInt(fields[1], 10),
          gender: parseGender(fields[2]),
          sumAssured: parseFloat(fields[3]),
          premium: parseFloat(fields[4]),
          term: parseInt(fields[5], 10),
          productType: parseProductType(fields[6]),
        });
      }
    }

    this.writePolicies(policies);
    return policies.length;
  }

  /**
   * Write mortality table to the shared buffer.
   *
   * @param mortality - Mortality table with male and female rates
   */
  writeMortality(mortality: MortalityTable): void {
    const view = new Float64Array(this._buffer, this._assumptionsOffset, 121 * 2);

    // Write male rates (ages 0-120)
    for (let age = 0; age <= 120; age++) {
      view[age] = mortality.male[age] ?? 0;
    }

    // Write female rates (ages 0-120)
    for (let age = 0; age <= 120; age++) {
      view[121 + age] = mortality.female[age] ?? 0;
    }
  }

  /**
   * Write mortality table from CSV data.
   *
   * @param csvData - CSV string containing mortality data
   */
  writeMortalityFromCsv(csvData: string): void {
    const male: number[] = new Array(121).fill(0);
    const female: number[] = new Array(121).fill(0);

    const lines = csvData.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].split(',').map(f => f.trim());
      if (fields.length >= 3) {
        const age = parseInt(fields[0], 10);
        if (age >= 0 && age <= 120) {
          male[age] = parseFloat(fields[1]);
          female[age] = parseFloat(fields[2]);
        }
      }
    }

    this.writeMortality({ male, female });
  }

  /**
   * Write lapse table to the shared buffer.
   *
   * @param lapseRates - Array of lapse rates by year (index 0 = year 1)
   */
  writeLapse(lapseRates: LapseTable): void {
    const offset = this._assumptionsOffset + MORTALITY_TABLE_SIZE;
    const view = new Float64Array(this._buffer, offset, 50);

    for (let year = 0; year < 50; year++) {
      view[year] = lapseRates[year] ?? 0;
    }
  }

  /**
   * Write lapse table from CSV data.
   *
   * @param csvData - CSV string containing lapse data
   */
  writeLapseFromCsv(csvData: string): void {
    const rates: number[] = new Array(50).fill(0);

    const lines = csvData.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].split(',').map(f => f.trim());
      if (fields.length >= 2) {
        const year = parseInt(fields[0], 10);
        if (year >= 1 && year <= 50) {
          rates[year - 1] = parseFloat(fields[1]);
        }
      }
    }

    this.writeLapse(rates);
  }

  /**
   * Write expense assumptions to the shared buffer.
   *
   * @param expenses - Expense assumptions object
   */
  writeExpenses(expenses: ExpenseAssumptions): void {
    const offset = this._assumptionsOffset + MORTALITY_TABLE_SIZE + LAPSE_TABLE_SIZE;
    const view = new Float64Array(this._buffer, offset, 4);

    view[0] = expenses.perPolicyAcquisition;
    view[1] = expenses.perPolicyMaintenance;
    view[2] = expenses.percentOfPremium;
    view[3] = expenses.claimExpense;
  }

  /**
   * Write expense assumptions from CSV data.
   *
   * @param csvData - CSV string containing expense data
   */
  writeExpensesFromCsv(csvData: string): void {
    const expenses: ExpenseAssumptions = {
      perPolicyAcquisition: 0,
      perPolicyMaintenance: 0,
      percentOfPremium: 0,
      claimExpense: 0,
    };

    const lines = csvData.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].split(',').map(f => f.trim());
      if (fields.length >= 2) {
        const name = fields[0].toLowerCase();
        const value = parseFloat(fields[1]);

        if (name.includes('acquisition')) {
          expenses.perPolicyAcquisition = value;
        } else if (name.includes('maintenance')) {
          expenses.perPolicyMaintenance = value;
        } else if (name.includes('percent') || name.includes('premium')) {
          expenses.percentOfPremium = value;
        } else if (name.includes('claim')) {
          expenses.claimExpense = value;
        }
      }
    }

    this.writeExpenses(expenses);
  }

  /**
   * Set the scenario count for result storage.
   *
   * @param count - Number of scenarios
   */
  setScenarioCount(count: number): void {
    if (count > this._maxScenarios) {
      throw new Error(
        `Scenario count ${count} exceeds max capacity ${this._maxScenarios}`
      );
    }
    this._header.setUint32(OFFSET_SCENARIO_COUNT, count, true);
  }

  /**
   * Get the results offset for a specific worker.
   *
   * @param workerId - Worker index (0-based)
   * @returns Byte offset into the buffer for this worker's results
   */
  getWorkerResultsOffset(workerId: number): number {
    if (workerId < 0 || workerId >= this._workerCount) {
      throw new Error(`Invalid worker ID: ${workerId}`);
    }
    return this._resultsOffset + (workerId * this._maxScenarios * 8);
  }

  /**
   * Read results from a specific worker.
   *
   * @param workerId - Worker index (0-based)
   * @param scenarioCount - Number of scenarios to read
   * @returns Array of scenario NPVs
   */
  readWorkerResults(workerId: number, scenarioCount: number): number[] {
    const offset = this.getWorkerResultsOffset(workerId);
    const view = new Float64Array(this._buffer, offset, scenarioCount);
    return Array.from(view);
  }

  /**
   * Read all worker results and combine them.
   *
   * @param activeWorkers - Number of workers that contributed results
   * @param scenariosPerWorker - Array of scenario counts per worker
   * @returns Combined array of all scenario NPVs
   */
  readAllResults(activeWorkers: number, scenariosPerWorker: number[]): number[] {
    const results: number[] = [];

    for (let workerId = 0; workerId < activeWorkers; workerId++) {
      const count = scenariosPerWorker[workerId];
      const workerResults = this.readWorkerResults(workerId, count);
      results.push(...workerResults);
    }

    return results;
  }
}

/**
 * SharedBufferReader provides read-only access to a SharedArrayBuffer from workers.
 *
 * Workers use this to read policy and assumption data without copying.
 */
export class SharedBufferReader {
  private readonly _buffer: SharedArrayBuffer;
  private readonly _header: DataView;

  constructor(buffer: SharedArrayBuffer) {
    this._buffer = buffer;
    this._header = new DataView(buffer);

    // Validate magic number
    const magic = this._header.getUint32(OFFSET_MAGIC, true);
    if (magic !== HEADER_MAGIC) {
      throw new Error('Invalid SharedBuffer: magic number mismatch');
    }
  }

  /**
   * Get the policy count.
   */
  get policyCount(): number {
    return this._header.getUint32(OFFSET_POLICY_COUNT, true);
  }

  /**
   * Get the scenario count.
   */
  get scenarioCount(): number {
    return this._header.getUint32(OFFSET_SCENARIO_COUNT, true);
  }

  /**
   * Get the worker count.
   */
  get workerCount(): number {
    return this._header.getUint32(OFFSET_WORKER_COUNT, true);
  }

  /**
   * Get the policies offset.
   */
  get policiesOffset(): number {
    return this._header.getUint32(OFFSET_POLICIES_OFFSET, true);
  }

  /**
   * Get the assumptions offset.
   */
  get assumptionsOffset(): number {
    return this._header.getUint32(OFFSET_ASSUMPTIONS_OFFSET, true);
  }

  /**
   * Get the results offset.
   */
  get resultsOffset(): number {
    return this._header.getUint32(OFFSET_RESULTS_OFFSET, true);
  }

  /**
   * Get the underlying buffer for WASM access.
   */
  get buffer(): SharedArrayBuffer {
    return this._buffer;
  }

  /**
   * Read policies as a Uint8Array for passing to WASM.
   * Returns a view (not a copy) into the shared buffer.
   */
  getPoliciesView(): Uint8Array {
    const offset = this.policiesOffset;
    const size = this.policyCount * POLICY_SIZE;
    return new Uint8Array(this._buffer, offset, size);
  }

  /**
   * Read mortality table as Float64Array.
   */
  getMortalityView(): Float64Array {
    const offset = this.assumptionsOffset;
    return new Float64Array(this._buffer, offset, 121 * 2);
  }

  /**
   * Read lapse table as Float64Array.
   */
  getLapseView(): Float64Array {
    const offset = this.assumptionsOffset + MORTALITY_TABLE_SIZE;
    return new Float64Array(this._buffer, offset, 50);
  }

  /**
   * Read expenses as Float64Array.
   */
  getExpensesView(): Float64Array {
    const offset = this.assumptionsOffset + MORTALITY_TABLE_SIZE + LAPSE_TABLE_SIZE;
    return new Float64Array(this._buffer, offset, 4);
  }

  /**
   * Get a view into this worker's results area for writing.
   *
   * @param workerId - Worker index (0-based)
   * @param maxScenarios - Maximum scenarios per worker
   */
  getResultsView(workerId: number, maxScenarios: number): Float64Array {
    const offset = this.resultsOffset + (workerId * maxScenarios * 8);
    return new Float64Array(this._buffer, offset, maxScenarios);
  }
}

// ==========================================================================
// Helper Functions
// ==========================================================================

function genderToByte(gender: Gender): number {
  return gender === 'M' ? 0 : 1;
}

function parseGender(value: string): Gender {
  const upper = value.toUpperCase();
  if (upper === 'M' || upper === 'MALE') return 'M';
  return 'F';
}

function productTypeToByte(productType: ProductType): number {
  switch (productType) {
    case 'TERM': return 0;
    case 'WHOLE_LIFE': return 1;
    case 'ENDOWMENT': return 2;
    default: return 0;
  }
}

function parseProductType(value: string): ProductType {
  const upper = value.toUpperCase();
  if (upper === 'WHOLE_LIFE' || upper === 'WL') return 'WHOLE_LIFE';
  if (upper === 'ENDOWMENT' || upper === 'END') return 'ENDOWMENT';
  return 'TERM';
}
