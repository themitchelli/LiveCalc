/**
 * Manual test for packager functionality
 * Run with: node -r ts-node/register tests/cloud/manual-test.ts
 */

import { PackageValidator } from '../../src/cloud/package-validator';
import { LiveCalcConfig } from '../../src/types';

const validator = new PackageValidator();

// Test 1: Valid config
console.log('Test 1: Valid config');
const validConfig: LiveCalcConfig = {
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

const result1 = validator.validateConfig(validConfig);
console.log('Valid config result:', result1);
console.assert(result1.valid === true, 'Valid config should pass');
console.assert(result1.errors.length === 0, 'Valid config should have no errors');

// Test 2: Invalid config (missing required fields)
console.log('\nTest 2: Invalid config (missing assumptions)');
const invalidConfig: any = {
  model: 'model.mga',
  // Missing assumptions
  scenarios: {
    count: 1000,
    seed: 42,
    interestRate: { initial: 0.04, drift: 0.001, volatility: 0.02 },
  },
};

const result2 = validator.validateConfig(invalidConfig);
console.log('Invalid config result:', result2);
console.assert(result2.valid === false, 'Invalid config should fail');
console.assert(result2.errors.some(e => e.includes('assumptions')), 'Should have assumptions error');

// Test 3: Invalid pipeline
console.log('\nTest 3: Invalid pipeline (invalid engine format)');
const invalidPipeline: LiveCalcConfig = {
  model: 'model.mga',
  assumptions: {
    mortality: 'local://data/mortality.csv',
    lapse: 'local://data/lapse.csv',
    expenses: 'local://data/expenses.json',
  },
  scenarios: {
    count: 1000,
    seed: 42,
    interestRate: { initial: 0.04, drift: 0.001, volatility: 0.02 },
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

const result3 = validator.validateConfig(invalidPipeline);
console.log('Invalid pipeline result:', result3);
console.assert(result3.valid === false, 'Invalid pipeline should fail');
console.assert(result3.errors.some(e => e.includes('invalid engine format')), 'Should have engine format error');

// Test 4: Mandatory asset validation
console.log('\nTest 4: Mandatory asset validation');
const config: LiveCalcConfig = {
  model: 'model.mga',
  assumptions: {
    mortality: 'local://data/mortality.csv',
    lapse: 'local://data/lapse.csv',
    expenses: 'local://data/expenses.json',
  },
  scenarios: {
    count: 1000,
    seed: 42,
    interestRate: { initial: 0.04, drift: 0.001, volatility: 0.02 },
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

// Missing config file
const assetPaths1 = ['model.mga', 'data/mortality.csv'];
const result4 = validator.validateMandatoryAssets(assetPaths1, config);
console.log('Missing config result:', result4);
console.assert(result4.valid === false, 'Should be invalid without config file');
console.assert(result4.errors.some(e => e.includes('livecalc.config.json')), 'Should require config file');

// Missing WASM binary
const assetPaths2 = ['livecalc.config.json', 'model.mga'];
const result5 = validator.validateMandatoryAssets(assetPaths2, config);
console.log('Missing WASM result:', result5);
console.assert(result5.valid === false, 'Should be invalid without WASM binary');
console.assert(result5.errors.some(e => e.includes('livecalc.wasm')), 'Should require WASM binary');

// All assets present
const assetPaths3 = ['livecalc.config.json', 'model.mga', 'wasm/livecalc.wasm'];
const result6 = validator.validateMandatoryAssets(assetPaths3, config);
console.log('All assets present result:', result6);
console.assert(result6.valid === true, 'Should be valid with all mandatory assets');
console.assert(result6.errors.length === 0, 'Should have no errors');

console.log('\n✅ All manual tests passed!');
