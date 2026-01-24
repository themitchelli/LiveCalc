/**
 * Memory Offset Manager Tests
 *
 * Tests for pipeline SharedArrayBuffer memory management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MemoryOffsetManager,
  MemoryAllocationError,
  parseBusResourceSize,
} from '../src/orchestrator/memory-manager.js';
import type {
  BusResourceRequirement,
  MemoryBlock,
  MemoryOffsetMap,
} from '../src/orchestrator/memory-manager.js';

describe('MemoryOffsetManager', () => {
  let manager: MemoryOffsetManager;

  beforeEach(() => {
    manager = new MemoryOffsetManager();
  });

  describe('resource management', () => {
    it('should add a single bus resource', () => {
      manager.addResource({
        name: 'bus://scenarios/rates',
        sizeBytes: 80000,
        dataType: 'Float64Array',
        producerNodeId: 'esg',
        consumerNodeIds: ['projection'],
      });

      expect(manager.resourceCount).toBe(1);
    });

    it('should add multiple bus resources', () => {
      manager.addResources([
        {
          name: 'bus://scenarios/rates',
          sizeBytes: 80000,
          dataType: 'Float64Array',
          producerNodeId: 'esg',
          consumerNodeIds: ['projection'],
        },
        {
          name: 'bus://results/npv',
          sizeBytes: 8000,
          dataType: 'Float64Array',
          producerNodeId: 'projection',
          consumerNodeIds: [],
        },
      ]);

      expect(manager.resourceCount).toBe(2);
    });

    it('should reject invalid bus name', () => {
      expect(() => {
        manager.addResource({
          name: 'scenarios/rates', // Missing bus:// prefix
          sizeBytes: 80000,
          dataType: 'Float64Array',
          producerNodeId: 'esg',
          consumerNodeIds: [],
        });
      }).toThrow("Must start with 'bus://'");
    });

    it('should reject zero or negative size', () => {
      expect(() => {
        manager.addResource({
          name: 'bus://test/data',
          sizeBytes: 0,
          dataType: 'Float64Array',
          producerNodeId: 'test',
          consumerNodeIds: [],
        });
      }).toThrow('Invalid size');

      expect(() => {
        manager.addResource({
          name: 'bus://test/data',
          sizeBytes: -100,
          dataType: 'Float64Array',
          producerNodeId: 'test',
          consumerNodeIds: [],
        });
      }).toThrow('Invalid size');
    });

    it('should clear resources before allocation', () => {
      manager.addResource({
        name: 'bus://test/data',
        sizeBytes: 1000,
        dataType: 'Float64Array',
        producerNodeId: 'test',
        consumerNodeIds: [],
      });

      expect(manager.resourceCount).toBe(1);
      manager.clearResources();
      expect(manager.resourceCount).toBe(0);
    });
  });

  describe('memory calculation', () => {
    it('should calculate total memory requirement', () => {
      manager.addResources([
        {
          name: 'bus://scenarios/rates',
          sizeBytes: 80000,
          dataType: 'Float64Array',
          producerNodeId: 'esg',
          consumerNodeIds: ['projection'],
        },
        {
          name: 'bus://results/npv',
          sizeBytes: 8000,
          dataType: 'Float64Array',
          producerNodeId: 'projection',
          consumerNodeIds: [],
        },
      ]);

      const total = manager.calculateTotalMemory();

      // Header: 64 bytes
      // Status: 64 bytes
      // Resources: 80000 + 8000 = 88000 bytes (already aligned)
      // Total: 64 + 64 + 88000 = 88128 bytes
      expect(total).toBeGreaterThanOrEqual(64 + 64 + 88000);
    });

    it('should include checksum region when enabled', () => {
      const managerWithChecksums = new MemoryOffsetManager({
        enableIntegrityChecks: true,
      });

      managerWithChecksums.addResource({
        name: 'bus://test/data',
        sizeBytes: 1000,
        dataType: 'Float64Array',
        producerNodeId: 'test',
        consumerNodeIds: [],
      });

      const totalWithChecksums = managerWithChecksums.calculateTotalMemory();

      // Without checksums
      manager.addResource({
        name: 'bus://test/data',
        sizeBytes: 1000,
        dataType: 'Float64Array',
        producerNodeId: 'test',
        consumerNodeIds: [],
      });

      const totalWithoutChecksums = manager.calculateTotalMemory();

      expect(totalWithChecksums).toBeGreaterThan(totalWithoutChecksums);
    });

    it('should validate memory requirements', () => {
      manager.addResource({
        name: 'bus://test/data',
        sizeBytes: 1000,
        dataType: 'Float64Array',
        producerNodeId: 'test',
        consumerNodeIds: [],
      });

      const validation = manager.validateMemoryRequirements();

      expect(validation.valid).toBe(true);
      expect(validation.totalBytes).toBeGreaterThan(0);
      expect(validation.resourceBreakdown).toHaveLength(1);
      expect(validation.resourceBreakdown[0].name).toBe('bus://test/data');
    });

    it('should detect memory limit exceeded', () => {
      const managerWithLowLimit = new MemoryOffsetManager({
        memoryLimit: 1000, // Very low limit
      });

      managerWithLowLimit.addResource({
        name: 'bus://test/data',
        sizeBytes: 10000, // Exceeds limit
        dataType: 'Float64Array',
        producerNodeId: 'test',
        consumerNodeIds: [],
      });

      const validation = managerWithLowLimit.validateMemoryRequirements();

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('exceeds platform limit');
    });
  });

  describe('allocation', () => {
    beforeEach(() => {
      manager.addResources([
        {
          name: 'bus://scenarios/rates',
          sizeBytes: 8000, // 1000 Float64 elements
          dataType: 'Float64Array',
          producerNodeId: 'esg',
          consumerNodeIds: ['projection'],
        },
        {
          name: 'bus://results/npv',
          sizeBytes: 800, // 100 Float64 elements
          dataType: 'Float64Array',
          producerNodeId: 'projection',
          consumerNodeIds: [],
        },
      ]);
    });

    it('should allocate SharedArrayBuffer', () => {
      manager.allocate(['esg', 'projection']);

      expect(manager.isAllocated).toBe(true);
      expect(manager.allocatedSize).toBeGreaterThan(0);
    });

    it('should return the SharedArrayBuffer', () => {
      manager.allocate(['esg', 'projection']);

      const buffer = manager.getBuffer();
      expect(buffer).toBeInstanceOf(SharedArrayBuffer);
      expect(buffer.byteLength).toBe(manager.allocatedSize);
    });

    it('should throw if getting buffer before allocation', () => {
      expect(() => manager.getBuffer()).toThrow('not allocated');
    });

    it('should prevent double allocation', () => {
      manager.allocate(['esg', 'projection']);

      expect(() => manager.allocate(['esg', 'projection'])).toThrow('Already allocated');
    });

    it('should prevent adding resources after allocation', () => {
      manager.allocate(['esg', 'projection']);

      expect(() =>
        manager.addResource({
          name: 'bus://new/resource',
          sizeBytes: 1000,
          dataType: 'Float64Array',
          producerNodeId: 'new',
          consumerNodeIds: [],
        })
      ).toThrow('Cannot add resources after allocation');
    });

    it('should throw MemoryAllocationError on limit exceeded', () => {
      const managerWithLowLimit = new MemoryOffsetManager({
        memoryLimit: 100, // Very low limit
      });

      managerWithLowLimit.addResource({
        name: 'bus://test/data',
        sizeBytes: 10000,
        dataType: 'Float64Array',
        producerNodeId: 'test',
        consumerNodeIds: [],
      });

      expect(() => managerWithLowLimit.allocate(['test'])).toThrow(MemoryAllocationError);
    });
  });

  describe('offset map', () => {
    beforeEach(() => {
      manager.addResources([
        {
          name: 'bus://scenarios/rates',
          sizeBytes: 8000,
          dataType: 'Float64Array',
          producerNodeId: 'esg',
          consumerNodeIds: ['projection'],
        },
        {
          name: 'bus://results/npv',
          sizeBytes: 800,
          dataType: 'Float64Array',
          producerNodeId: 'projection',
          consumerNodeIds: [],
        },
      ]);
      manager.allocate(['esg', 'projection']);
    });

    it('should return a valid offset map', () => {
      const map = manager.getOffsetMap();

      expect(map.version).toBe(1);
      expect(map.totalSize).toBeGreaterThan(0);
      expect(map.blocks.length).toBe(2);
    });

    it('should have 16-byte aligned offsets', () => {
      const map = manager.getOffsetMap();

      for (const block of map.blocks) {
        expect(block.offset % 16).toBe(0);
      }
    });

    it('should have correct block metadata', () => {
      const map = manager.getOffsetMap();

      const ratesBlock = map.blocksByName.get('bus://scenarios/rates');
      expect(ratesBlock).toBeDefined();
      expect(ratesBlock!.sizeBytes).toBe(8000);
      expect(ratesBlock!.dataType).toBe('Float64Array');
      expect(ratesBlock!.elementCount).toBe(1000);

      const npvBlock = map.blocksByName.get('bus://results/npv');
      expect(npvBlock).toBeDefined();
      expect(npvBlock!.sizeBytes).toBe(800);
      expect(npvBlock!.elementCount).toBe(100);
    });

    it('should have status region with node offsets', () => {
      const map = manager.getOffsetMap();

      expect(map.status.offset).toBe(64); // After header
      expect(map.status.size).toBe(64);
      expect(map.status.nodeOffsets.get('esg')).toBe(64);
      expect(map.status.nodeOffsets.get('projection')).toBe(65);
    });

    it('should serialize to JSON', () => {
      const json = manager.getOffsetMapJSON();

      expect(json.totalSize).toBe(manager.allocatedSize);
      expect(json.blocks.length).toBe(2);
      expect(json.status.nodeOffsets['esg']).toBe(64);

      // Should be serializable
      const serialized = JSON.stringify(json);
      const parsed = JSON.parse(serialized);
      expect(parsed.totalSize).toBe(json.totalSize);
    });
  });

  describe('block access', () => {
    beforeEach(() => {
      manager.addResource({
        name: 'bus://test/data',
        sizeBytes: 800, // 100 Float64 elements
        dataType: 'Float64Array',
        producerNodeId: 'test',
        consumerNodeIds: [],
      });
      manager.allocate(['test']);
    });

    it('should get block view as typed array', () => {
      const view = manager.getBlockView<Float64Array>('bus://test/data');

      expect(view).toBeInstanceOf(Float64Array);
      expect(view.length).toBe(100);
    });

    it('should allow writing and reading block data', () => {
      const view = manager.getBlockView<Float64Array>('bus://test/data');

      // Write test data
      for (let i = 0; i < view.length; i++) {
        view[i] = i * 1.5;
      }

      // Read back through a fresh view
      const view2 = manager.getBlockView<Float64Array>('bus://test/data');
      expect(view2[0]).toBe(0);
      expect(view2[1]).toBe(1.5);
      expect(view2[99]).toBe(99 * 1.5);
    });

    it('should throw for unknown block', () => {
      expect(() => manager.getBlockView<Float64Array>('bus://unknown/data')).toThrow('not found');
    });

    it('should get block metadata', () => {
      const block = manager.getBlock('bus://test/data');

      expect(block).toBeDefined();
      expect(block!.name).toBe('bus://test/data');
      expect(block!.dataType).toBe('Float64Array');
    });

    it('should get all blocks', () => {
      const blocks = manager.getAllBlocks();

      expect(blocks.length).toBe(1);
      expect(blocks[0].name).toBe('bus://test/data');
    });
  });

  describe('memory zeroing', () => {
    it('should zero memory on allocation when configured', () => {
      manager.addResource({
        name: 'bus://test/data',
        sizeBytes: 800,
        dataType: 'Float64Array',
        producerNodeId: 'test',
        consumerNodeIds: [],
      });

      manager.allocate(['test']);

      const view = manager.getBlockView<Float64Array>('bus://test/data');

      // All values should be zero
      for (let i = 0; i < view.length; i++) {
        expect(view[i]).toBe(0);
      }
    });

    it('should zero memory on demand', () => {
      manager.addResource({
        name: 'bus://test/data',
        sizeBytes: 800,
        dataType: 'Float64Array',
        producerNodeId: 'test',
        consumerNodeIds: [],
      });

      manager.allocate(['test']);

      // Write some data
      const view = manager.getBlockView<Float64Array>('bus://test/data');
      view[0] = 123.456;
      view[99] = 789.012;

      // Zero the memory
      manager.zeroMemory();

      // All values should be zero again
      expect(view[0]).toBe(0);
      expect(view[99]).toBe(0);
    });
  });

  describe('integrity checks', () => {
    it('should include checksum region when enabled', () => {
      const managerWithChecks = new MemoryOffsetManager({
        enableIntegrityChecks: true,
      });

      managerWithChecks.addResources([
        {
          name: 'bus://test/a',
          sizeBytes: 800,
          dataType: 'Float64Array',
          producerNodeId: 'a',
          consumerNodeIds: [],
        },
        {
          name: 'bus://test/b',
          sizeBytes: 400,
          dataType: 'Float64Array',
          producerNodeId: 'b',
          consumerNodeIds: [],
        },
      ]);

      managerWithChecks.allocate(['a', 'b']);

      const map = managerWithChecks.getOffsetMap();

      expect(map.checksumRegion).toBeDefined();
      expect(map.checksumRegion!.size).toBeGreaterThanOrEqual(8); // 2 blocks * 4 bytes

      // Each block should have a checksum offset
      for (const block of map.blocks) {
        expect(block.checksumOffset).toBeDefined();
      }

      managerWithChecks.dispose();
    });

    it('should not include checksum region when disabled', () => {
      manager.addResource({
        name: 'bus://test/data',
        sizeBytes: 800,
        dataType: 'Float64Array',
        producerNodeId: 'test',
        consumerNodeIds: [],
      });

      manager.allocate(['test']);

      const map = manager.getOffsetMap();
      expect(map.checksumRegion).toBeUndefined();
    });
  });

  describe('logging', () => {
    it('should log when logger is set', () => {
      const logMessages: string[] = [];
      manager.setLogger((msg) => logMessages.push(msg));

      manager.addResource({
        name: 'bus://test/data',
        sizeBytes: 800,
        dataType: 'Float64Array',
        producerNodeId: 'test',
        consumerNodeIds: [],
      });

      manager.allocate(['test']);

      expect(logMessages.length).toBeGreaterThan(0);
      expect(logMessages.some((m) => m.includes('Added resource'))).toBe(true);
      expect(logMessages.some((m) => m.includes('Allocating'))).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should release resources on dispose', () => {
      manager.addResource({
        name: 'bus://test/data',
        sizeBytes: 800,
        dataType: 'Float64Array',
        producerNodeId: 'test',
        consumerNodeIds: [],
      });

      manager.allocate(['test']);
      expect(manager.isAllocated).toBe(true);

      manager.dispose();

      expect(manager.isAllocated).toBe(false);
      expect(manager.resourceCount).toBe(0);
      expect(() => manager.getBuffer()).toThrow('not allocated');
    });

    it('should allow reuse after dispose', () => {
      manager.addResource({
        name: 'bus://test/data',
        sizeBytes: 800,
        dataType: 'Float64Array',
        producerNodeId: 'test',
        consumerNodeIds: [],
      });

      manager.allocate(['test']);
      manager.dispose();

      // Add new resources and allocate again
      manager.addResource({
        name: 'bus://new/data',
        sizeBytes: 1600,
        dataType: 'Float64Array',
        producerNodeId: 'new',
        consumerNodeIds: [],
      });

      manager.allocate(['new']);

      expect(manager.isAllocated).toBe(true);
      expect(manager.resourceCount).toBe(1);
    });
  });
});

describe('parseBusResourceSize', () => {
  it('should parse plain bytes', () => {
    const result = parseBusResourceSize('8000');
    expect(result.sizeBytes).toBe(8000);
    expect(result.dataType).toBe('Float64Array');
  });

  it('should parse KB suffix', () => {
    const result = parseBusResourceSize('100KB');
    expect(result.sizeBytes).toBe(100 * 1024);
  });

  it('should parse MB suffix', () => {
    const result = parseBusResourceSize('10MB');
    expect(result.sizeBytes).toBe(10 * 1024 * 1024);
  });

  it('should parse GB suffix', () => {
    const result = parseBusResourceSize('1GB');
    expect(result.sizeBytes).toBe(1 * 1024 * 1024 * 1024);
  });

  it('should parse element count with type', () => {
    const result = parseBusResourceSize('1000:Float64Array');
    expect(result.sizeBytes).toBe(1000 * 8);
    expect(result.dataType).toBe('Float64Array');
  });

  it('should parse element count with Int32Array', () => {
    const result = parseBusResourceSize('2000:Int32Array');
    expect(result.sizeBytes).toBe(2000 * 4);
    expect(result.dataType).toBe('Int32Array');
  });

  it('should handle case insensitivity for suffixes', () => {
    expect(parseBusResourceSize('100kb').sizeBytes).toBe(100 * 1024);
    expect(parseBusResourceSize('100KB').sizeBytes).toBe(100 * 1024);
    expect(parseBusResourceSize('100Kb').sizeBytes).toBe(100 * 1024);
  });

  it('should handle decimal values with suffixes', () => {
    expect(parseBusResourceSize('1.5MB').sizeBytes).toBe(1.5 * 1024 * 1024);
    expect(parseBusResourceSize('0.5GB').sizeBytes).toBe(0.5 * 1024 * 1024 * 1024);
  });
});

describe('MemoryAllocationError', () => {
  it('should contain allocation details', () => {
    const error = new MemoryAllocationError(
      'Test error',
      10000,
      5000,
      { extra: 'info' }
    );

    expect(error.message).toBe('Test error');
    expect(error.requestedBytes).toBe(10000);
    expect(error.limitBytes).toBe(5000);
    expect(error.details).toEqual({ extra: 'info' });
    expect(error.name).toBe('MemoryAllocationError');
  });
});
