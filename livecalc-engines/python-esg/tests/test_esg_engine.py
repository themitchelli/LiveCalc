"""
Unit tests for Python ESG Engine (US-001)

Tests the ICalcEngine interface implementation including:
- Engine initialization
- Configuration validation
- runChunk execution
- Resource disposal
- Error handling
"""

import unittest
import numpy as np
import sys
import os

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from esg_engine import PythonESGEngine, ESGConfig
from calc_engine_interface import (
    EngineInfo,
    InitializationError,
    ConfigurationError,
    ExecutionError
)


class TestESGConfig(unittest.TestCase):
    """Test ESGConfig validation"""

    def test_valid_config(self):
        """Test that valid configuration passes validation"""
        config = ESGConfig(
            esg_model='vasicek',
            outer_paths=5,
            inner_paths_per_outer=1000,
            seed=42,
            projection_years=50,
            assumptions_version='v2.1'
        )
        # Should not raise
        config.validate()

    def test_invalid_esg_model(self):
        """Test that invalid model type raises error"""
        config = ESGConfig(
            esg_model='invalid_model',
            outer_paths=5,
            inner_paths_per_outer=1000,
            seed=42,
            projection_years=50
        )
        with self.assertRaises(ConfigurationError) as ctx:
            config.validate()
        self.assertIn("Invalid esg_model", str(ctx.exception))

    def test_outer_paths_too_few(self):
        """Test that outer_paths < 3 raises error"""
        config = ESGConfig(
            esg_model='vasicek',
            outer_paths=2,
            inner_paths_per_outer=1000,
            seed=42,
            projection_years=50
        )
        with self.assertRaises(ConfigurationError) as ctx:
            config.validate()
        self.assertIn("Invalid outer_paths", str(ctx.exception))

    def test_outer_paths_too_many(self):
        """Test that outer_paths > 10 raises error"""
        config = ESGConfig(
            esg_model='vasicek',
            outer_paths=11,
            inner_paths_per_outer=1000,
            seed=42,
            projection_years=50
        )
        with self.assertRaises(ConfigurationError) as ctx:
            config.validate()
        self.assertIn("Invalid outer_paths", str(ctx.exception))

    def test_inner_paths_too_few(self):
        """Test that inner_paths_per_outer < 100 raises error"""
        config = ESGConfig(
            esg_model='vasicek',
            outer_paths=5,
            inner_paths_per_outer=50,
            seed=42,
            projection_years=50
        )
        with self.assertRaises(ConfigurationError) as ctx:
            config.validate()
        self.assertIn("Invalid inner_paths_per_outer", str(ctx.exception))

    def test_inner_paths_too_many(self):
        """Test that inner_paths_per_outer > 10000 raises error"""
        config = ESGConfig(
            esg_model='vasicek',
            outer_paths=5,
            inner_paths_per_outer=10001,
            seed=42,
            projection_years=50
        )
        with self.assertRaises(ConfigurationError) as ctx:
            config.validate()
        self.assertIn("Invalid inner_paths_per_outer", str(ctx.exception))

    def test_projection_years_too_few(self):
        """Test that projection_years < 1 raises error"""
        config = ESGConfig(
            esg_model='vasicek',
            outer_paths=5,
            inner_paths_per_outer=1000,
            seed=42,
            projection_years=0
        )
        with self.assertRaises(ConfigurationError) as ctx:
            config.validate()
        self.assertIn("Invalid projection_years", str(ctx.exception))

    def test_projection_years_too_many(self):
        """Test that projection_years > 100 raises error"""
        config = ESGConfig(
            esg_model='vasicek',
            outer_paths=5,
            inner_paths_per_outer=1000,
            seed=42,
            projection_years=101
        )
        with self.assertRaises(ConfigurationError) as ctx:
            config.validate()
        self.assertIn("Invalid projection_years", str(ctx.exception))


class TestPythonESGEngine(unittest.TestCase):
    """Test PythonESGEngine ICalcEngine implementation"""

    def setUp(self):
        """Create engine instance for testing"""
        self.engine = PythonESGEngine()

    def tearDown(self):
        """Dispose engine after each test"""
        if self.engine.is_initialized:
            self.engine.dispose()

    def test_engine_not_initialized_initially(self):
        """Test that engine is not initialized on construction"""
        self.assertFalse(self.engine.is_initialized)

    def test_get_info_before_init(self):
        """Test that get_info() works before initialization"""
        info = self.engine.get_info()
        self.assertIsInstance(info, EngineInfo)
        self.assertEqual(info.name, "Python ESG Engine")
        self.assertEqual(info.version, "1.0.0")
        self.assertEqual(info.engine_type, "esg")

    def test_initialize_with_valid_config(self):
        """Test successful initialization with valid configuration"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 50,
            'assumptions_version': 'v2.1'
        }

        self.engine.initialize(config, credentials=None)
        self.assertTrue(self.engine.is_initialized)

    def test_initialize_with_invalid_config(self):
        """Test that initialization fails with invalid configuration"""
        config = {
            'esg_model': 'invalid_model',
            'outer_paths': 3,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 50
        }

        with self.assertRaises(ConfigurationError):
            self.engine.initialize(config, credentials=None)

    def test_initialize_with_defaults(self):
        """Test that initialization works with minimal config (uses defaults)"""
        config = {}

        self.engine.initialize(config, credentials=None)
        self.assertTrue(self.engine.is_initialized)

    def test_runChunk_before_init(self):
        """Test that runChunk fails if engine not initialized"""
        output_buffer = np.zeros((300, 50), dtype=np.float64)

        with self.assertRaises(ExecutionError) as ctx:
            self.engine.runChunk(None, output_buffer)
        self.assertIn("not initialized", str(ctx.exception))

    def test_runChunk_with_correct_buffer_shape(self):
        """Test successful runChunk with correctly shaped output buffer"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 50
        }
        self.engine.initialize(config, credentials=None)

        # Create output buffer with correct shape
        total_scenarios = 3 * 100  # 300
        output_buffer = np.zeros((total_scenarios, 50), dtype=np.float64)

        result = self.engine.runChunk(None, output_buffer)

        # Verify result structure
        self.assertIn('execution_time_ms', result)
        self.assertIn('scenarios_generated', result)
        self.assertIn('warnings', result)

        # Verify execution metrics
        self.assertEqual(result['scenarios_generated'], 300)
        self.assertGreater(result['execution_time_ms'], 0)
        self.assertIsInstance(result['warnings'], list)

        # Verify scenarios were written to buffer
        self.assertGreater(np.sum(output_buffer), 0)  # Should have non-zero values

    def test_runChunk_with_wrong_buffer_shape(self):
        """Test that runChunk fails with incorrectly shaped output buffer"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 50
        }
        self.engine.initialize(config, credentials=None)

        # Create output buffer with wrong shape
        output_buffer = np.zeros((100, 50), dtype=np.float64)  # Wrong: should be 300

        with self.assertRaises(ExecutionError) as ctx:
            self.engine.runChunk(None, output_buffer)
        self.assertIn("shape mismatch", str(ctx.exception))

    def test_scenario_generation_deterministic(self):
        """Test that scenario generation is deterministic with same seed"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 50
        }

        # First run
        engine1 = PythonESGEngine()
        engine1.initialize(config, credentials=None)
        output1 = np.zeros((300, 50), dtype=np.float64)
        engine1.runChunk(None, output1)
        engine1.dispose()

        # Second run with same seed
        engine2 = PythonESGEngine()
        engine2.initialize(config, credentials=None)
        output2 = np.zeros((300, 50), dtype=np.float64)
        engine2.runChunk(None, output2)
        engine2.dispose()

        # Results should be identical
        np.testing.assert_array_equal(output1, output2)

    def test_scenario_values_reasonable(self):
        """Test that generated scenario values are in reasonable range"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 50
        }
        self.engine.initialize(config, credentials=None)

        output_buffer = np.zeros((300, 50), dtype=np.float64)
        self.engine.runChunk(None, output_buffer)

        # All rates should be positive and reasonable (< 50%)
        self.assertTrue(np.all(output_buffer > 0))
        self.assertTrue(np.all(output_buffer < 0.5))

    def test_dispose_clears_state(self):
        """Test that dispose clears engine state"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 50
        }
        self.engine.initialize(config, credentials=None)
        self.assertTrue(self.engine.is_initialized)

        self.engine.dispose()
        self.assertFalse(self.engine.is_initialized)

    def test_dispose_without_init(self):
        """Test that dispose works even if engine not initialized"""
        # Should not raise
        self.engine.dispose()


class TestYieldCurveResolution(unittest.TestCase):
    """Test yield curve assumption resolution (US-002)"""

    def setUp(self):
        """Create engine instance for testing"""
        self.engine = PythonESGEngine()

    def tearDown(self):
        """Dispose engine after each test"""
        if self.engine.is_initialized:
            self.engine.dispose()

    def test_parse_structured_yield_curve(self):
        """Test parsing structured yield curve parameters from AM"""
        # Simulate structured response from AM
        structured_params = {
            'initial_yield_curve': [0.02, 0.025, 0.03, 0.032, 0.034],
            'volatility_matrix': [
                [0.01, 0.005, 0.003, 0.002, 0.001],
                [0.005, 0.01, 0.005, 0.003, 0.002],
                [0.003, 0.005, 0.01, 0.005, 0.003],
                [0.002, 0.003, 0.005, 0.01, 0.005],
                [0.001, 0.002, 0.003, 0.005, 0.01]
            ],
            'drift_rates': [0.001, 0.0012, 0.0015, 0.0016, 0.0018],
            'mean_reversion': 0.15,
            'version': 'v2.1',
            'tenors': [1, 2, 3, 5, 10]
        }

        parsed = self.engine._parse_yield_curve_structure(structured_params)

        # Verify all fields parsed correctly
        self.assertEqual(len(parsed['initial_yield_curve']), 5)
        self.assertEqual(parsed['volatility_matrix'].shape, (5, 5))
        self.assertEqual(len(parsed['drift_rates']), 5)
        self.assertEqual(parsed['mean_reversion'], 0.15)
        self.assertEqual(parsed['resolved_version'], 'v2.1')

    def test_parse_flat_yield_curve_20_tenors(self):
        """Test parsing flat array format (20 tenors)"""
        # Create a flat array: 20 rates + 400 vol values + 20 drift + 1 mean_rev = 441
        flat_params = []

        # Initial yield curve (20 values)
        flat_params.extend([0.02 + i * 0.001 for i in range(20)])

        # Volatility matrix (20x20 = 400 values)
        for i in range(20):
            for j in range(20):
                if i == j:
                    flat_params.append(0.01)  # Diagonal
                else:
                    flat_params.append(0.005)  # Off-diagonal

        # Drift rates (20 values)
        flat_params.extend([0.001 + i * 0.0001 for i in range(20)])

        # Mean reversion (1 value)
        flat_params.append(0.15)

        parsed = self.engine._parse_flat_yield_curve(flat_params)

        # Verify structure
        self.assertEqual(len(parsed['initial_yield_curve']), 20)
        self.assertEqual(parsed['volatility_matrix'].shape, (20, 20))
        self.assertEqual(len(parsed['drift_rates']), 20)
        self.assertEqual(parsed['mean_reversion'], 0.15)
        self.assertEqual(len(parsed['tenors']), 20)

    def test_parse_flat_yield_curve_wrong_size(self):
        """Test that flat array with wrong size raises error"""
        # Wrong size array (not 441)
        flat_params = [0.02] * 100

        with self.assertRaises(InitializationError) as ctx:
            self.engine._parse_flat_yield_curve(flat_params)
        self.assertIn("Unexpected flat array size", str(ctx.exception))

    def test_validate_yield_curve_success(self):
        """Test successful validation of complete yield curve parameters"""
        params = {
            'initial_yield_curve': np.array([0.02, 0.025, 0.03]),
            'volatility_matrix': np.array([
                [0.01, 0.005, 0.003],
                [0.005, 0.01, 0.005],
                [0.003, 0.005, 0.01]
            ]),
            'drift_rates': np.array([0.001, 0.0012, 0.0015]),
            'mean_reversion': 0.15
        }

        # Should not raise
        self.engine._validate_yield_curve_parameters(params)

    def test_validate_missing_initial_yield_curve(self):
        """Test validation fails when initial_yield_curve is missing"""
        params = {
            'volatility_matrix': np.array([[0.01]]),
            'drift_rates': np.array([0.001]),
            'mean_reversion': 0.15
        }

        with self.assertRaises(InitializationError) as ctx:
            self.engine._validate_yield_curve_parameters(params)
        self.assertIn("Missing required yield curve parameters", str(ctx.exception))
        self.assertIn("initial_yield_curve", str(ctx.exception))

    def test_validate_missing_volatility_matrix(self):
        """Test validation fails when volatility_matrix is missing"""
        params = {
            'initial_yield_curve': np.array([0.02]),
            'drift_rates': np.array([0.001]),
            'mean_reversion': 0.15
        }

        with self.assertRaises(InitializationError) as ctx:
            self.engine._validate_yield_curve_parameters(params)
        self.assertIn("volatility_matrix", str(ctx.exception))

    def test_validate_missing_drift_rates(self):
        """Test validation fails when drift_rates is missing"""
        params = {
            'initial_yield_curve': np.array([0.02]),
            'volatility_matrix': np.array([[0.01]]),
            'mean_reversion': 0.15
        }

        with self.assertRaises(InitializationError) as ctx:
            self.engine._validate_yield_curve_parameters(params)
        self.assertIn("drift_rates", str(ctx.exception))

    def test_validate_missing_mean_reversion(self):
        """Test validation fails when mean_reversion is missing"""
        params = {
            'initial_yield_curve': np.array([0.02]),
            'volatility_matrix': np.array([[0.01]]),
            'drift_rates': np.array([0.001])
        }

        with self.assertRaises(InitializationError) as ctx:
            self.engine._validate_yield_curve_parameters(params)
        self.assertIn("mean_reversion", str(ctx.exception))

    def test_validate_empty_initial_curve(self):
        """Test validation fails when initial_yield_curve is empty"""
        params = {
            'initial_yield_curve': np.array([]),
            'volatility_matrix': np.array([[0.01]]),
            'drift_rates': np.array([0.001]),
            'mean_reversion': 0.15
        }

        with self.assertRaises(InitializationError) as ctx:
            self.engine._validate_yield_curve_parameters(params)
        self.assertIn("initial_yield_curve is empty", str(ctx.exception))

    def test_validate_volatility_not_square(self):
        """Test validation fails when volatility matrix is not 2D"""
        params = {
            'initial_yield_curve': np.array([0.02, 0.025]),
            'volatility_matrix': np.array([0.01, 0.005]),  # 1D instead of 2D
            'drift_rates': np.array([0.001, 0.0012]),
            'mean_reversion': 0.15
        }

        with self.assertRaises(InitializationError) as ctx:
            self.engine._validate_yield_curve_parameters(params)
        self.assertIn("volatility_matrix must be 2D", str(ctx.exception))

    def test_validate_volatility_wrong_shape(self):
        """Test validation fails when volatility matrix shape doesn't match curve"""
        params = {
            'initial_yield_curve': np.array([0.02, 0.025, 0.03]),
            'volatility_matrix': np.array([[0.01, 0.005], [0.005, 0.01]]),  # 2x2 instead of 3x3
            'drift_rates': np.array([0.001, 0.0012, 0.0015]),
            'mean_reversion': 0.15
        }

        with self.assertRaises(InitializationError) as ctx:
            self.engine._validate_yield_curve_parameters(params)
        self.assertIn("volatility_matrix shape", str(ctx.exception))

    def test_validate_drift_wrong_length(self):
        """Test validation fails when drift_rates length doesn't match curve"""
        params = {
            'initial_yield_curve': np.array([0.02, 0.025, 0.03]),
            'volatility_matrix': np.array([
                [0.01, 0.005, 0.003],
                [0.005, 0.01, 0.005],
                [0.003, 0.005, 0.01]
            ]),
            'drift_rates': np.array([0.001, 0.0012]),  # Only 2 instead of 3
            'mean_reversion': 0.15
        }

        with self.assertRaises(InitializationError) as ctx:
            self.engine._validate_yield_curve_parameters(params)
        self.assertIn("drift_rates length", str(ctx.exception))

    def test_validate_mean_reversion_not_numeric(self):
        """Test validation fails when mean_reversion is not numeric"""
        params = {
            'initial_yield_curve': np.array([0.02]),
            'volatility_matrix': np.array([[0.01]]),
            'drift_rates': np.array([0.001]),
            'mean_reversion': "not_a_number"
        }

        with self.assertRaises(InitializationError) as ctx:
            self.engine._validate_yield_curve_parameters(params)
        self.assertIn("mean_reversion must be numeric", str(ctx.exception))


if __name__ == '__main__':
    unittest.main()
