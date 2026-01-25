/**
 * Model Packager Tests
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { ModelPackager, PackageOptions } from '../../src/cloud/model-packager';
import { PackageValidator } from '../../src/cloud/package-validator';
import { LiveCalcConfig } from '../../src/types';

suite('ModelPackager Tests', () => {
  const testDataDir = path.join(__dirname, '..', '..', '..', 'samples', 'simple-term-life');
  let packager: ModelPackager;
  let validator: PackageValidator;

  setup(() => {
    packager = new ModelPackager(testDataDir);
    validator = new PackageValidator();
  });

  test('Package validation: valid config', () => {
    const config: LiveCalcConfig = {
      model: 'model.mga',
      policies: 'local://data/policies.csv',
      assumptions: {
        mortality: 'local://data/mortality.csv',
        lapse: 'local://data/lapse.csv',
        expenses: 'local://data/expenses.json',
      },
      scenarios: {
        count: 1000,
        seed: 42,
        interestRate: {
          initial: 0.05,
          drift: 0.02,
          volatility: 0.1,
        },
      },
    };

    const result = validator.validateConfig(config);
    assert.strictEqual(result.valid, true, 'Config should be valid');
    assert.strictEqual(result.errors.length, 0, 'Should have no errors');
  });

  test('Package validation: missing required fields', () => {
    const config: any = {
      model: 'model.mga',
      // Missing assumptions
      scenarios: {
        count: 1000,
      },
    };

    const result = validator.validateConfig(config);
    assert.strictEqual(result.valid, false, 'Config should be invalid');
    assert.ok(result.errors.some(e => e.includes('assumptions')), 'Should have assumptions error');
  });

  test('Package validation: invalid pipeline', () => {
    const config: LiveCalcConfig = {
      model: 'model.mga',
      assumptions: {
        mortality: 'local://data/mortality.csv',
        lapse: 'local://data/lapse.csv',
        expenses: 'local://data/expenses.json',
      },
      scenarios: {
        count: 1000,
      },
      pipeline: {
        nodes: [
          {
            id: 'node1',
            engine: 'invalid-engine', // Should start with wasm:// or python://
            outputs: ['bus://results/npv'],
          },
        ],
      },
    };

    const result = validator.validateConfig(config);
    assert.strictEqual(result.valid, false, 'Config with invalid pipeline should be invalid');
    assert.ok(result.errors.some(e => e.includes('invalid engine format')), 'Should have engine format error');
  });

  test('Package validation: Assumptions Manager warning', () => {
    const config: LiveCalcConfig = {
      model: 'model.mga',
      assumptions: {
        mortality: 'assumptions://mortality-standard:latest',
        lapse: 'local://data/lapse.csv',
        expenses: 'local://data/expenses.json',
      },
      scenarios: {
        count: 1000,
      },
    };

    const result = validator.validateConfig(config);
    assert.strictEqual(result.valid, true, 'Config should be valid');
    assert.ok(result.warnings.some(w => w.includes('Assumptions Manager')), 'Should warn about AM references');
  });

  test('Package validation: duplicate node IDs', () => {
    const config: LiveCalcConfig = {
      model: 'model.mga',
      assumptions: {
        mortality: 'local://data/mortality.csv',
        lapse: 'local://data/lapse.csv',
        expenses: 'local://data/expenses.json',
      },
      scenarios: {
        count: 1000,
      },
      pipeline: {
        nodes: [
          {
            id: 'node1',
            engine: 'wasm://livecalc',
            outputs: ['bus://results/npv'],
          },
          {
            id: 'node1', // Duplicate
            engine: 'python://processor',
            outputs: ['bus://processed/data'],
          },
        ],
      },
    };

    const result = validator.validateConfig(config);
    assert.strictEqual(result.valid, false, 'Config with duplicate node IDs should be invalid');
    assert.ok(result.errors.some(e => e.includes('Duplicate node ID')), 'Should have duplicate ID error');
  });

  test('Mandatory asset validation: config file', () => {
    const config: LiveCalcConfig = {
      model: 'model.mga',
      assumptions: {
        mortality: 'local://data/mortality.csv',
        lapse: 'local://data/lapse.csv',
        expenses: 'local://data/expenses.json',
      },
      scenarios: {
        count: 1000,
      },
    };

    const assetPaths = ['model.mga', 'data/mortality.csv'];
    const result = validator.validateMandatoryAssets(assetPaths, config);
    assert.strictEqual(result.valid, false, 'Should be invalid without config file');
    assert.ok(result.errors.some(e => e.includes('livecalc.config.json')), 'Should require config file');
  });

  test('Mandatory asset validation: WASM binaries', () => {
    const config: LiveCalcConfig = {
      model: 'model.mga',
      assumptions: {
        mortality: 'local://data/mortality.csv',
        lapse: 'local://data/lapse.csv',
        expenses: 'local://data/expenses.json',
      },
      scenarios: {
        count: 1000,
      },
      pipeline: {
        nodes: [
          {
            id: 'node1',
            engine: 'wasm://livecalc',
            outputs: ['bus://results/npv'],
          },
        ],
      },
    };

    const assetPaths = ['livecalc.config.json', 'model.mga'];
    const result = validator.validateMandatoryAssets(assetPaths, config);
    assert.strictEqual(result.valid, false, 'Should be invalid without WASM binary');
    assert.ok(result.errors.some(e => e.includes('livecalc.wasm')), 'Should require WASM binary');
  });

  test('Mandatory asset validation: Python scripts', () => {
    const config: LiveCalcConfig = {
      model: 'model.mga',
      assumptions: {
        mortality: 'local://data/mortality.csv',
        lapse: 'local://data/lapse.csv',
        expenses: 'local://data/expenses.json',
      },
      scenarios: {
        count: 1000,
      },
      pipeline: {
        nodes: [
          {
            id: 'node1',
            engine: 'python://processor',
            outputs: ['bus://results/data'],
          },
        ],
      },
    };

    const assetPaths = ['livecalc.config.json', 'model.mga'];
    const result = validator.validateMandatoryAssets(assetPaths, config);
    assert.strictEqual(result.valid, false, 'Should be invalid without Python script');
    assert.ok(result.errors.some(e => e.includes('processor.py')), 'Should require Python script');
  });

  test('Mandatory asset validation: all present', () => {
    const config: LiveCalcConfig = {
      model: 'model.mga',
      assumptions: {
        mortality: 'local://data/mortality.csv',
        lapse: 'local://data/lapse.csv',
        expenses: 'local://data/expenses.json',
      },
      scenarios: {
        count: 1000,
      },
      pipeline: {
        nodes: [
          {
            id: 'node1',
            engine: 'wasm://livecalc',
            outputs: ['bus://results/npv'],
          },
        ],
      },
    };

    const assetPaths = ['livecalc.config.json', 'model.mga', 'wasm/livecalc.wasm'];
    const result = validator.validateMandatoryAssets(assetPaths, config);
    assert.strictEqual(result.valid, true, 'Should be valid with all mandatory assets');
    assert.strictEqual(result.errors.length, 0, 'Should have no errors');
  });
});
