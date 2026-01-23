/**
 * SharedArrayBuffer Implementation Tests
 *
 * Tests for zero-copy data sharing between workers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SharedBufferManager,
  SharedBufferReader,
  isSharedArrayBufferAvailable,
  calculateBufferSize,
} from '../src/shared-buffer.js';
import type {
  Policy,
  MortalityTable,
  LapseTable,
  ExpenseAssumptions,
} from '../src/types.js';

// Test data
const SAMPLE_POLICIES: Policy[] = [
  { policyId: 1, age: 30, gender: 'M', sumAssured: 100000, premium: 500, term: 20, productType: 'TERM' },
  { policyId: 2, age: 35, gender: 'F', sumAssured: 150000, premium: 750, term: 25, productType: 'TERM' },
  { policyId: 3, age: 45, gender: 'M', sumAssured: 200000, premium: 1200, term: 15, productType: 'WHOLE_LIFE' },
];

const SAMPLE_MORTALITY: MortalityTable = {
  male: new Array(121).fill(0).map((_, age) => 0.001 * Math.exp(0.05 * age)),
  female: new Array(121).fill(0).map((_, age) => 0.0008 * Math.exp(0.048 * age)),
};

const SAMPLE_LAPSE: LapseTable = [
  0.15, 0.12, 0.10, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03, 0.02,
  ...new Array(40).fill(0.01),
];

const SAMPLE_EXPENSES: ExpenseAssumptions = {
  perPolicyAcquisition: 500,
  perPolicyMaintenance: 50,
  percentOfPremium: 0.05,
  claimExpense: 100,
};

describe('isSharedArrayBufferAvailable', () => {
  it('should detect SharedArrayBuffer availability', () => {
    // In Node.js test environment, SAB should be available
    const available = isSharedArrayBufferAvailable();
    expect(typeof available).toBe('boolean');

    // If SAB is defined, it should be available in Node.js
    if (typeof SharedArrayBuffer !== 'undefined') {
      expect(available).toBe(true);
    }
  });
});

describe('calculateBufferSize', () => {
  it('should calculate correct buffer size', () => {
    const size = calculateBufferSize({
      maxPolicies: 1000,
      maxScenarios: 100,
      workerCount: 4,
    });

    // Header: 32 bytes
    // Policies: 1000 * 32 = 32,000 bytes
    // Mortality: 121 * 2 * 8 = 1,936 bytes
    // Lapse: 50 * 8 = 400 bytes
    // Expenses: 4 * 8 = 32 bytes
    // Results: 100 * 8 * 4 = 3,200 bytes
    // Total: 32 + 32,000 + 1,936 + 400 + 32 + 3,200 = 37,600 bytes

    const expected = 32 + 1000 * 32 + (121 * 2 * 8) + (50 * 8) + (4 * 8) + (100 * 8 * 4);
    expect(size).toBe(expected);
  });

  it('should scale with policies', () => {
    const size1k = calculateBufferSize({ maxPolicies: 1000, maxScenarios: 100, workerCount: 4 });
    const size10k = calculateBufferSize({ maxPolicies: 10000, maxScenarios: 100, workerCount: 4 });

    expect(size10k).toBeGreaterThan(size1k);
    expect(size10k - size1k).toBe(9000 * 32); // 9000 more policies * 32 bytes each
  });

  it('should scale with scenarios and workers', () => {
    const baseSize = calculateBufferSize({ maxPolicies: 1000, maxScenarios: 100, workerCount: 4 });
    const moreScenarios = calculateBufferSize({ maxPolicies: 1000, maxScenarios: 1000, workerCount: 4 });
    const moreWorkers = calculateBufferSize({ maxPolicies: 1000, maxScenarios: 100, workerCount: 8 });

    expect(moreScenarios).toBeGreaterThan(baseSize);
    expect(moreWorkers).toBeGreaterThan(baseSize);
  });
});

describe('SharedBufferManager', () => {
  let manager: SharedBufferManager;

  beforeEach(() => {
    manager = new SharedBufferManager({
      maxPolicies: 1000,
      maxScenarios: 100,
      workerCount: 4,
    });
  });

  describe('initialization', () => {
    it('should create a SharedArrayBuffer', () => {
      expect(manager.buffer).toBeInstanceOf(SharedArrayBuffer);
    });

    it('should report zero policy count initially', () => {
      expect(manager.policyCount).toBe(0);
    });

    it('should provide allocation info', () => {
      const allocation = manager.getAllocation();

      expect(allocation.buffer).toBe(manager.buffer);
      expect(allocation.policiesOffset).toBeGreaterThan(0); // After header
      expect(allocation.assumptionsOffset).toBeGreaterThan(allocation.policiesOffset);
      expect(allocation.resultsOffset).toBeGreaterThan(allocation.assumptionsOffset);
      expect(allocation.resultsPerWorkerSize).toBe(100 * 8); // 100 scenarios * 8 bytes
    });
  });

  describe('writePolicies', () => {
    it('should write policies to the buffer', () => {
      manager.writePolicies(SAMPLE_POLICIES);

      expect(manager.policyCount).toBe(3);
    });

    it('should throw if policy count exceeds max', () => {
      const tooManyPolicies = new Array(1001).fill(SAMPLE_POLICIES[0]);

      expect(() => manager.writePolicies(tooManyPolicies)).toThrow(/exceeds max capacity/);
    });

    it('should handle empty array', () => {
      manager.writePolicies([]);
      expect(manager.policyCount).toBe(0);
    });
  });

  describe('writePoliciesFromCsv', () => {
    it('should parse and write CSV policies', () => {
      const csv = `policy_id,age,gender,sum_assured,premium,term,product_type
1,30,M,100000,500,20,TERM
2,35,F,150000,750,25,TERM`;

      const count = manager.writePoliciesFromCsv(csv);

      expect(count).toBe(2);
      expect(manager.policyCount).toBe(2);
    });

    it('should handle various gender formats', () => {
      const csv = `policy_id,age,gender,sum_assured,premium,term,product_type
1,30,M,100000,500,20,TERM
2,35,Female,150000,750,25,TERM
3,40,male,200000,1000,15,TERM`;

      const count = manager.writePoliciesFromCsv(csv);
      expect(count).toBe(3);
    });

    it('should return 0 for empty CSV', () => {
      const csv = 'policy_id,age,gender,sum_assured,premium,term,product_type';
      const count = manager.writePoliciesFromCsv(csv);
      expect(count).toBe(0);
    });
  });

  describe('writeMortality', () => {
    it('should write mortality table to buffer', () => {
      manager.writeMortality(SAMPLE_MORTALITY);

      // Read back and verify (will test via reader)
      const reader = new SharedBufferReader(manager.buffer);
      const view = reader.getMortalityView();

      // Check a few values
      expect(view[0]).toBeCloseTo(SAMPLE_MORTALITY.male[0], 10);
      expect(view[30]).toBeCloseTo(SAMPLE_MORTALITY.male[30], 10);
      expect(view[121]).toBeCloseTo(SAMPLE_MORTALITY.female[0], 10);
      expect(view[121 + 30]).toBeCloseTo(SAMPLE_MORTALITY.female[30], 10);
    });
  });

  describe('writeMortalityFromCsv', () => {
    it('should parse and write CSV mortality', () => {
      const csv = `age,male_qx,female_qx
0,0.001,0.0008
30,0.002,0.0015
60,0.010,0.008`;

      manager.writeMortalityFromCsv(csv);

      const reader = new SharedBufferReader(manager.buffer);
      const view = reader.getMortalityView();

      expect(view[0]).toBeCloseTo(0.001, 10);
      expect(view[30]).toBeCloseTo(0.002, 10);
      expect(view[60]).toBeCloseTo(0.010, 10);
      expect(view[121]).toBeCloseTo(0.0008, 10);
      expect(view[121 + 30]).toBeCloseTo(0.0015, 10);
    });
  });

  describe('writeLapse', () => {
    it('should write lapse table to buffer', () => {
      manager.writeLapse(SAMPLE_LAPSE);

      const reader = new SharedBufferReader(manager.buffer);
      const view = reader.getLapseView();

      expect(view[0]).toBeCloseTo(0.15, 10); // Year 1
      expect(view[1]).toBeCloseTo(0.12, 10); // Year 2
      expect(view[9]).toBeCloseTo(0.02, 10); // Year 10
    });
  });

  describe('writeLapseFromCsv', () => {
    it('should parse and write CSV lapse', () => {
      const csv = `year,lapse_rate
1,0.15
2,0.12
5,0.08`;

      manager.writeLapseFromCsv(csv);

      const reader = new SharedBufferReader(manager.buffer);
      const view = reader.getLapseView();

      expect(view[0]).toBeCloseTo(0.15, 10);
      expect(view[1]).toBeCloseTo(0.12, 10);
      expect(view[4]).toBeCloseTo(0.08, 10);
    });
  });

  describe('writeExpenses', () => {
    it('should write expense assumptions to buffer', () => {
      manager.writeExpenses(SAMPLE_EXPENSES);

      const reader = new SharedBufferReader(manager.buffer);
      const view = reader.getExpensesView();

      expect(view[0]).toBeCloseTo(500, 10);   // perPolicyAcquisition
      expect(view[1]).toBeCloseTo(50, 10);    // perPolicyMaintenance
      expect(view[2]).toBeCloseTo(0.05, 10);  // percentOfPremium
      expect(view[3]).toBeCloseTo(100, 10);   // claimExpense
    });
  });

  describe('writeExpensesFromCsv', () => {
    it('should parse and write CSV expenses', () => {
      const csv = `name,value
per_policy_acquisition,500
per_policy_maintenance,50
percent_of_premium,0.05
claim_expense,100`;

      manager.writeExpensesFromCsv(csv);

      const reader = new SharedBufferReader(manager.buffer);
      const view = reader.getExpensesView();

      expect(view[0]).toBeCloseTo(500, 10);
      expect(view[1]).toBeCloseTo(50, 10);
      expect(view[2]).toBeCloseTo(0.05, 10);
      expect(view[3]).toBeCloseTo(100, 10);
    });
  });

  describe('scenario count', () => {
    it('should set scenario count', () => {
      manager.setScenarioCount(50);

      const reader = new SharedBufferReader(manager.buffer);
      expect(reader.scenarioCount).toBe(50);
    });

    it('should throw if scenario count exceeds max', () => {
      expect(() => manager.setScenarioCount(101)).toThrow(/exceeds max capacity/);
    });
  });

  describe('results', () => {
    it('should provide worker result offsets', () => {
      const offset0 = manager.getWorkerResultsOffset(0);
      const offset1 = manager.getWorkerResultsOffset(1);
      const offset2 = manager.getWorkerResultsOffset(2);

      expect(offset0).toBeGreaterThan(0);
      expect(offset1).toBeGreaterThan(offset0);
      expect(offset2).toBeGreaterThan(offset1);

      // Each worker's area is maxScenarios * 8 bytes
      expect(offset1 - offset0).toBe(100 * 8);
      expect(offset2 - offset1).toBe(100 * 8);
    });

    it('should throw for invalid worker ID', () => {
      expect(() => manager.getWorkerResultsOffset(-1)).toThrow(/Invalid worker ID/);
      expect(() => manager.getWorkerResultsOffset(4)).toThrow(/Invalid worker ID/);
    });

    it('should read and write worker results', () => {
      // Simulate writing results from workers
      const allocation = manager.getAllocation();

      // Write some results for worker 0
      const resultsView = new Float64Array(manager.buffer, allocation.resultsOffset, 100);
      for (let i = 0; i < 10; i++) {
        resultsView[i] = 1000 + i * 100;
      }

      // Read back
      const results = manager.readWorkerResults(0, 10);

      expect(results.length).toBe(10);
      expect(results[0]).toBeCloseTo(1000, 10);
      expect(results[9]).toBeCloseTo(1900, 10);
    });

    it('should read all results from multiple workers', () => {
      const allocation = manager.getAllocation();

      // Write results for 4 workers, 5 scenarios each
      for (let w = 0; w < 4; w++) {
        const offset = allocation.resultsOffset + w * allocation.resultsPerWorkerSize;
        const view = new Float64Array(manager.buffer, offset, 5);
        for (let i = 0; i < 5; i++) {
          view[i] = w * 100 + i;
        }
      }

      // Read all results
      const scenariosPerWorker = [5, 5, 5, 5];
      const allResults = manager.readAllResults(4, scenariosPerWorker);

      expect(allResults.length).toBe(20);
      // Check values from each worker
      expect(allResults[0]).toBe(0);   // Worker 0, scenario 0
      expect(allResults[4]).toBe(4);   // Worker 0, scenario 4
      expect(allResults[5]).toBe(100); // Worker 1, scenario 0
      expect(allResults[10]).toBe(200); // Worker 2, scenario 0
      expect(allResults[15]).toBe(300); // Worker 3, scenario 0
    });
  });
});

describe('SharedBufferReader', () => {
  let manager: SharedBufferManager;
  let reader: SharedBufferReader;

  beforeEach(() => {
    manager = new SharedBufferManager({
      maxPolicies: 1000,
      maxScenarios: 100,
      workerCount: 4,
    });

    // Write test data
    manager.writePolicies(SAMPLE_POLICIES);
    manager.writeMortality(SAMPLE_MORTALITY);
    manager.writeLapse(SAMPLE_LAPSE);
    manager.writeExpenses(SAMPLE_EXPENSES);
    manager.setScenarioCount(50);

    reader = new SharedBufferReader(manager.buffer);
  });

  it('should validate magic number', () => {
    // Create a buffer without valid header
    const invalidBuffer = new SharedArrayBuffer(1000);
    expect(() => new SharedBufferReader(invalidBuffer)).toThrow(/magic number mismatch/);
  });

  it('should read policy count', () => {
    expect(reader.policyCount).toBe(3);
  });

  it('should read scenario count', () => {
    expect(reader.scenarioCount).toBe(50);
  });

  it('should read worker count', () => {
    expect(reader.workerCount).toBe(4);
  });

  it('should read offsets', () => {
    expect(reader.policiesOffset).toBeGreaterThan(0);
    expect(reader.assumptionsOffset).toBeGreaterThan(reader.policiesOffset);
    expect(reader.resultsOffset).toBeGreaterThan(reader.assumptionsOffset);
  });

  it('should provide policies view', () => {
    const view = reader.getPoliciesView();

    expect(view).toBeInstanceOf(Uint8Array);
    expect(view.byteLength).toBe(3 * 32); // 3 policies * 32 bytes
  });

  it('should provide mortality view', () => {
    const view = reader.getMortalityView();

    expect(view).toBeInstanceOf(Float64Array);
    expect(view.length).toBe(121 * 2); // 121 ages * 2 genders
  });

  it('should provide lapse view', () => {
    const view = reader.getLapseView();

    expect(view).toBeInstanceOf(Float64Array);
    expect(view.length).toBe(50);
  });

  it('should provide expenses view', () => {
    const view = reader.getExpensesView();

    expect(view).toBeInstanceOf(Float64Array);
    expect(view.length).toBe(4);
  });

  it('should provide results view for writing', () => {
    const view = reader.getResultsView(0, 100);

    expect(view).toBeInstanceOf(Float64Array);
    expect(view.length).toBe(100);

    // Write some values
    view[0] = 1234.56;
    view[99] = 9876.54;

    // Verify they're in the shared buffer
    const results = manager.readWorkerResults(0, 100);
    expect(results[0]).toBeCloseTo(1234.56, 10);
    expect(results[99]).toBeCloseTo(9876.54, 10);
  });
});

describe('memory efficiency', () => {
  it('should use less memory than copying to each worker', () => {
    const policyCount = 10000;
    const scenarioCount = 1000;
    const workerCount = 8;

    const sabSize = calculateBufferSize({
      maxPolicies: policyCount,
      maxScenarios: scenarioCount,
      workerCount,
    });

    // Without SAB: each worker gets a copy of policies
    // Just policy data: policyCount * 32 bytes * workerCount
    const copySize = policyCount * 32 * workerCount;

    // SAB should use significantly less memory
    // Shared policies: policyCount * 32 bytes (once)
    // Results: scenarioCount * 8 * workerCount (still needed)
    const sharedPoliciesSize = policyCount * 32;
    const resultsSize = scenarioCount * 8 * workerCount;

    expect(sabSize).toBeLessThan(copySize);

    // SAB should be roughly: shared policies + results + assumptions + header
    // Much less than copying all policies to each worker
    const expectedSabApprox = sharedPoliciesSize + resultsSize + 2400 + 32;
    expect(sabSize).toBeCloseTo(expectedSabApprox, -3); // Within 1000 bytes

    // Calculate savings percentage
    const savings = (copySize - sabSize) / copySize;
    expect(savings).toBeGreaterThan(0.7); // At least 70% savings
  });
});
