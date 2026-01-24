import { describe, it, expect, beforeEach } from 'vitest';
import {
  IntegrityChecker,
  createIntegrityChecker,
  computeCRC32,
  MemoryOffsetManager,
} from '../src/index.js';

describe('IntegrityChecker', () => {
  let manager: MemoryOffsetManager;
  let sab: SharedArrayBuffer;
  let checker: IntegrityChecker;

  beforeEach(() => {
    // Create memory manager with integrity checks enabled
    manager = new MemoryOffsetManager({
      maxNodes: 8,
      enableIntegrityChecks: true,
      zeroMemoryBetweenRuns: true,
    });

    // Add bus resources
    manager.addResource({
      name: 'bus://scenarios/rates',
      sizeBytes: 800,
      dataType: 'Float64Array',
      producerNodeId: 'esg',
      consumerNodeIds: ['projection'],
    });

    manager.addResource({
      name: 'bus://results/npv',
      sizeBytes: 400,
      dataType: 'Float64Array',
      producerNodeId: 'projection',
      consumerNodeIds: ['aggregator'],
    });

    // Allocate buffer
    manager.allocate(['esg', 'projection', 'aggregator']);
    sab = manager.getBuffer()!;

    // Create integrity checker
    const offsetMap = manager.getOffsetMap();
    checker = new IntegrityChecker(sab, offsetMap, {
      enabled: true,
      logChecks: false,
    });
  });

  describe('CRC32 computation', () => {
    it('should compute CRC32 for empty data', () => {
      const data = new Uint8Array(0);
      const checksum = computeCRC32(data);
      expect(checksum).toBe(0);
    });

    it('should compute CRC32 for simple data', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const checksum = computeCRC32(data);
      expect(checksum).toBeGreaterThan(0);
    });

    it('should produce different checksums for different data', () => {
      const data1 = new Uint8Array([1, 2, 3, 4, 5]);
      const data2 = new Uint8Array([5, 4, 3, 2, 1]);
      const checksum1 = computeCRC32(data1);
      const checksum2 = computeCRC32(data2);
      expect(checksum1).not.toBe(checksum2);
    });

    it('should produce same checksum for identical data', () => {
      const data1 = new Uint8Array([1, 2, 3, 4, 5]);
      const data2 = new Uint8Array([1, 2, 3, 4, 5]);
      const checksum1 = computeCRC32(data1);
      const checksum2 = computeCRC32(data2);
      expect(checksum1).toBe(checksum2);
    });

    it('should compute CRC32 for large data', () => {
      const data = new Uint8Array(10000);
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256;
      }
      const checksum = computeCRC32(data);
      expect(checksum).toBeGreaterThan(0);
    });
  });

  describe('Checksum computation and verification', () => {
    it('should compute checksum for bus resource', () => {
      // Write some data to bus://scenarios/rates
      const block = manager.getOffsetMap().blocksByName.get('bus://scenarios/rates')!;
      const view = new Float64Array(sab, block.offset, 100);
      for (let i = 0; i < 100; i++) {
        view[i] = Math.random();
      }

      const checksum = checker.computeChecksum('bus://scenarios/rates', 'esg');
      expect(checksum).toBeGreaterThan(0);
    });

    it('should verify unchanged data successfully', () => {
      // Write data and compute checksum
      const block = manager.getOffsetMap().blocksByName.get('bus://scenarios/rates')!;
      const view = new Float64Array(sab, block.offset, 100);
      for (let i = 0; i < 100; i++) {
        view[i] = Math.random();
      }

      checker.computeChecksum('bus://scenarios/rates', 'esg');

      // Verify checksum
      const result = checker.verifyChecksum('bus://scenarios/rates', 'projection');
      expect(result.valid).toBe(true);
      expect(result.expectedChecksum).toBe(result.actualChecksum);
      expect(result.culpritNodeId).toBe('esg');
      expect(result.consumerNodeId).toBe('projection');
    });

    it('should detect data corruption', () => {
      // Write data and compute checksum
      const block = manager.getOffsetMap().blocksByName.get('bus://scenarios/rates')!;
      const view = new Float64Array(sab, block.offset, 100);
      for (let i = 0; i < 100; i++) {
        view[i] = Math.random();
      }

      checker.computeChecksum('bus://scenarios/rates', 'esg');

      // Corrupt the data
      view[50] = 999.999;

      // Verify checksum
      const result = checker.verifyChecksum('bus://scenarios/rates', 'projection');
      expect(result.valid).toBe(false);
      expect(result.expectedChecksum).not.toBe(result.actualChecksum);
      expect(result.culpritNodeId).toBe('esg');
      expect(result.consumerNodeId).toBe('projection');
    });

    it('should identify culprit node when data corrupted', () => {
      // Producer writes data
      const block = manager.getOffsetMap().blocksByName.get('bus://scenarios/rates')!;
      const view = new Float64Array(sab, block.offset, 100);
      for (let i = 0; i < 100; i++) {
        view[i] = i;
      }

      checker.computeChecksum('bus://scenarios/rates', 'esg');

      // Someone corrupts it
      view[0] = 123.456;

      // Consumer verifies
      const result = checker.verifyChecksum('bus://scenarios/rates', 'projection');
      expect(result.valid).toBe(false);
      expect(result.culpritNodeId).toBe('esg'); // Last producer
    });
  });

  describe('Integrity report generation', () => {
    it('should generate report for all resources', () => {
      // Write data to both resources
      const block1 = manager.getOffsetMap().blocksByName.get('bus://scenarios/rates')!;
      const view1 = new Float64Array(sab, block1.offset, 100);
      for (let i = 0; i < 100; i++) {
        view1[i] = i;
      }
      checker.computeChecksum('bus://scenarios/rates', 'esg');

      const block2 = manager.getOffsetMap().blocksByName.get('bus://results/npv')!;
      const view2 = new Float64Array(sab, block2.offset, 50);
      for (let i = 0; i < 50; i++) {
        view2[i] = i * 2;
      }
      checker.computeChecksum('bus://results/npv', 'projection');

      // Generate report
      const report = checker.generateReport();
      expect(report.allValid).toBe(true);
      expect(report.totalChecked).toBe(2);
      expect(report.totalFailed).toBe(0);
      expect(report.results).toHaveLength(2);
    });

    it('should report failures in integrity report', () => {
      // Write data to both resources
      const block1 = manager.getOffsetMap().blocksByName.get('bus://scenarios/rates')!;
      const view1 = new Float64Array(sab, block1.offset, 100);
      for (let i = 0; i < 100; i++) {
        view1[i] = i;
      }
      checker.computeChecksum('bus://scenarios/rates', 'esg');

      const block2 = manager.getOffsetMap().blocksByName.get('bus://results/npv')!;
      const view2 = new Float64Array(sab, block2.offset, 50);
      for (let i = 0; i < 50; i++) {
        view2[i] = i * 2;
      }
      checker.computeChecksum('bus://results/npv', 'projection');

      // Corrupt one resource
      view1[0] = 999;

      // Generate report
      const report = checker.generateReport();
      expect(report.allValid).toBe(false);
      expect(report.totalChecked).toBe(2);
      expect(report.totalFailed).toBe(1);
      expect(report.culpritNodeIds).toContain('esg');
    });

    it('should identify multiple culprits', () => {
      // Write and corrupt both resources
      const block1 = manager.getOffsetMap().blocksByName.get('bus://scenarios/rates')!;
      const view1 = new Float64Array(sab, block1.offset, 100);
      for (let i = 0; i < 100; i++) {
        view1[i] = i;
      }
      checker.computeChecksum('bus://scenarios/rates', 'esg');
      view1[0] = 999;

      const block2 = manager.getOffsetMap().blocksByName.get('bus://results/npv')!;
      const view2 = new Float64Array(sab, block2.offset, 50);
      for (let i = 0; i < 50; i++) {
        view2[i] = i * 2;
      }
      checker.computeChecksum('bus://results/npv', 'projection');
      view2[0] = 888;

      // Generate report
      const report = checker.generateReport();
      expect(report.allValid).toBe(false);
      expect(report.totalFailed).toBe(2);
      expect(report.culpritNodeIds).toContain('esg');
      expect(report.culpritNodeIds).toContain('projection');
    });
  });

  describe('Check history', () => {
    it('should track check history', () => {
      // Write data
      const block = manager.getOffsetMap().blocksByName.get('bus://scenarios/rates')!;
      const view = new Float64Array(sab, block.offset, 100);
      for (let i = 0; i < 100; i++) {
        view[i] = i;
      }

      checker.computeChecksum('bus://scenarios/rates', 'esg');

      // Verify multiple times
      checker.verifyChecksum('bus://scenarios/rates', 'projection');
      checker.verifyChecksum('bus://scenarios/rates', 'aggregator');

      const history = checker.getCheckHistory();
      expect(history).toHaveLength(2);
      expect(history[0].consumerNodeId).toBe('projection');
      expect(history[1].consumerNodeId).toBe('aggregator');
    });

    it('should limit history size', () => {
      // Write data
      const block = manager.getOffsetMap().blocksByName.get('bus://scenarios/rates')!;
      const view = new Float64Array(sab, block.offset, 100);
      for (let i = 0; i < 100; i++) {
        view[i] = i;
      }

      checker.computeChecksum('bus://scenarios/rates', 'esg');

      // Verify many times
      for (let i = 0; i < 200; i++) {
        checker.verifyChecksum('bus://scenarios/rates', `consumer-${i}`);
      }

      // Should only keep last 100
      const history = checker.getCheckHistory(100);
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Clear and reset', () => {
    it('should clear checksums and history', () => {
      // Write data and compute checksums
      const block = manager.getOffsetMap().blocksByName.get('bus://scenarios/rates')!;
      const view = new Float64Array(sab, block.offset, 100);
      for (let i = 0; i < 100; i++) {
        view[i] = i;
      }

      checker.computeChecksum('bus://scenarios/rates', 'esg');
      checker.verifyChecksum('bus://scenarios/rates', 'projection');

      // Clear
      checker.clear();

      // History should be empty
      const history = checker.getCheckHistory();
      expect(history).toHaveLength(0);

      // Metadata should be cleared
      const metadata = checker.getMetadata('bus://scenarios/rates');
      expect(metadata).toBeUndefined();
    });
  });

  describe('Disabled integrity checking', () => {
    it('should skip checks when disabled', () => {
      const offsetMap = manager.getOffsetMap();
      const disabledChecker = new IntegrityChecker(sab, offsetMap, { enabled: false });

      // Write data
      const block = manager.getOffsetMap().blocksByName.get('bus://scenarios/rates')!;
      const view = new Float64Array(sab, block.offset, 100);
      for (let i = 0; i < 100; i++) {
        view[i] = i;
      }

      // Compute returns 0
      const checksum = disabledChecker.computeChecksum('bus://scenarios/rates', 'esg');
      expect(checksum).toBe(0);

      // Verify always passes
      view[0] = 999;
      const result = disabledChecker.verifyChecksum('bus://scenarios/rates', 'projection');
      expect(result.valid).toBe(true);
    });
  });

  describe('Helper functions', () => {
    it('should create integrity checker with factory', () => {
      const offsetMap = manager.getOffsetMap();
      const newChecker = createIntegrityChecker(sab, offsetMap, true);
      expect(newChecker).toBeInstanceOf(IntegrityChecker);
      expect(newChecker.isEnabled()).toBe(true);
    });

    it('should verify all resources', () => {
      // Write data to both resources
      const block1 = manager.getOffsetMap().blocksByName.get('bus://scenarios/rates')!;
      const view1 = new Float64Array(sab, block1.offset, 100);
      for (let i = 0; i < 100; i++) {
        view1[i] = i;
      }
      checker.computeChecksum('bus://scenarios/rates', 'esg');

      const block2 = manager.getOffsetMap().blocksByName.get('bus://results/npv')!;
      const view2 = new Float64Array(sab, block2.offset, 50);
      for (let i = 0; i < 50; i++) {
        view2[i] = i * 2;
      }
      checker.computeChecksum('bus://results/npv', 'projection');

      // Verify all
      const failed = checker.verifyAll();
      expect(failed).toHaveLength(0);
    });

    it('should return failed resources from verifyAll', () => {
      // Write data to both resources
      const block1 = manager.getOffsetMap().blocksByName.get('bus://scenarios/rates')!;
      const view1 = new Float64Array(sab, block1.offset, 100);
      for (let i = 0; i < 100; i++) {
        view1[i] = i;
      }
      checker.computeChecksum('bus://scenarios/rates', 'esg');

      const block2 = manager.getOffsetMap().blocksByName.get('bus://results/npv')!;
      const view2 = new Float64Array(sab, block2.offset, 50);
      for (let i = 0; i < 50; i++) {
        view2[i] = i * 2;
      }
      checker.computeChecksum('bus://results/npv', 'projection');

      // Corrupt one
      view1[0] = 999;

      // Verify all
      const failed = checker.verifyAll();
      expect(failed).toHaveLength(1);
      expect(failed).toContain('bus://scenarios/rates');
    });
  });

  describe('Error handling', () => {
    it('should throw on invalid bus resource for compute', () => {
      expect(() => {
        checker.computeChecksum('bus://invalid/resource', 'test');
      }).toThrow('Bus resource not found');
    });

    it('should throw on invalid bus resource for verify', () => {
      expect(() => {
        checker.verifyChecksum('bus://invalid/resource', 'test');
      }).toThrow('Bus resource not found');
    });
  });
});
