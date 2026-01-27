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


if __name__ == '__main__':
    unittest.main()
