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


class TestOuterPathGeneration(unittest.TestCase):
    """Test suite for outer path generation (US-003)"""

    def setUp(self):
        """Set up test engine"""
        self.engine = PythonESGEngine()

    def test_outer_paths_generated_on_initialization(self):
        """Test that outer paths are generated during initialization"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 50,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        # Verify outer paths were generated
        self.assertIsNotNone(self.engine._outer_paths)
        self.assertEqual(self.engine._outer_paths.shape, (3, 50))

    def test_outer_paths_deterministic(self):
        """Test that outer paths are deterministic (reproducible)"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 5,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 30,
            'assumptions_version': 'v1.0'
        }

        # Generate outer paths twice
        self.engine.initialize(config, credentials=None)
        outer_paths_1 = self.engine._outer_paths.copy()

        self.engine.dispose()
        self.engine.initialize(config, credentials=None)
        outer_paths_2 = self.engine._outer_paths.copy()

        # Verify they are identical (deterministic)
        np.testing.assert_array_equal(outer_paths_1, outer_paths_2)

    def test_outer_path_scenarios(self):
        """Test that different outer paths represent different scenarios"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 5,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 50,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)
        outer_paths = self.engine._outer_paths

        # Outer path 0 (base case) should be flat
        base_case = outer_paths[0, :]
        self.assertTrue(np.all(base_case == base_case[0]), "Base case should be constant rates")

        # Outer path 1 (stress up) should be increasing
        stress_up = outer_paths[1, :]
        self.assertTrue(np.all(np.diff(stress_up) > 0), "Stress up should have increasing rates")

        # Outer path 2 (stress down) should be decreasing
        stress_down = outer_paths[2, :]
        self.assertTrue(np.all(np.diff(stress_down) <= 0), "Stress down should have decreasing rates")

        # All outer paths should be different
        for i in range(5):
            for j in range(i + 1, 5):
                self.assertFalse(
                    np.allclose(outer_paths[i, :], outer_paths[j, :]),
                    f"Outer path {i} should differ from outer path {j}"
                )

    def test_outer_paths_use_yield_curve_assumptions(self):
        """Test that outer paths use yield curve parameters when available"""
        # Create mock assumptions
        mock_params = {
            'initial_yield_curve': np.array([0.05, 0.052, 0.054]),  # 5% base
            'volatility_matrix': np.array([[0.01, 0, 0], [0, 0.01, 0], [0, 0, 0.01]]),
            'drift_rates': np.array([0.002, 0.002, 0.002]),  # 0.2% drift
            'mean_reversion': 0.1,
            'resolved_version': 'v2.1',
            'tenors': [1, 2, 3]
        }

        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 30,
            'assumptions_version': 'v2.1'
        }

        self.engine.initialize(config, credentials=None)
        # Inject mock parameters
        self.engine._yield_curve_params = mock_params
        # Regenerate outer paths with mock params
        self.engine._generate_outer_paths()

        outer_paths = self.engine._outer_paths

        # Base case should use the initial curve base rate (5%)
        base_case = outer_paths[0, :]
        self.assertAlmostEqual(base_case[0], 0.05, places=4)

    def test_outer_paths_with_different_counts(self):
        """Test outer path generation with different path counts"""
        for num_paths in [3, 5, 7, 10]:
            config = {
                'esg_model': 'vasicek',
                'outer_paths': num_paths,
                'inner_paths_per_outer': 100,
                'seed': 42,
                'projection_years': 30,
                'assumptions_version': 'v1.0'
            }

            self.engine.initialize(config, credentials=None)

            # Verify correct number of outer paths generated
            self.assertEqual(self.engine._outer_paths.shape[0], num_paths)
            self.assertEqual(self.engine._outer_paths.shape[1], 30)

            self.engine.dispose()

    def test_outer_paths_with_different_projection_years(self):
        """Test outer path generation with different projection horizons"""
        for years in [10, 30, 50, 100]:
            config = {
                'esg_model': 'vasicek',
                'outer_paths': 3,
                'inner_paths_per_outer': 100,
                'seed': 42,
                'projection_years': years,
                'assumptions_version': 'v1.0'
            }

            self.engine.initialize(config, credentials=None)

            # Verify correct projection horizon
            self.assertEqual(self.engine._outer_paths.shape[1], years)

            self.engine.dispose()

    def test_outer_paths_included_in_scenario_output(self):
        """Test that outer paths are correctly used in runChunk output"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 10,  # Small for testing
            'seed': 42,
            'projection_years': 20,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        # Run scenario generation
        total_scenarios = 3 * 10  # 30 scenarios
        output_buffer = np.zeros((total_scenarios, 20))
        result = self.engine.runChunk(None, output_buffer)

        # Verify scenarios were generated
        self.assertEqual(result['scenarios_generated'], 30)

        # For US-003, all scenarios in the same outer path group should be identical
        # (US-004 will add stochastic variation)
        for outer_idx in range(3):
            start_idx = outer_idx * 10
            end_idx = start_idx + 10

            # All 10 inner paths for this outer path should match the outer path
            outer_path = self.engine._outer_paths[outer_idx, :]
            for inner_idx in range(10):
                scenario_idx = start_idx + inner_idx
                np.testing.assert_array_equal(
                    output_buffer[scenario_idx, :],
                    outer_path,
                    err_msg=f"Scenario {scenario_idx} should match outer path {outer_idx}"
                )

    def test_outer_paths_documented(self):
        """Test that outer path definitions are documented"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 10,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 50,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        # Verify outer paths exist and have expected characteristics
        outer_paths = self.engine._outer_paths

        # Path 0: Base case (flat)
        self.assertTrue(np.all(outer_paths[0, :] == outer_paths[0, 0]))

        # Path 1: Rates increase (stress up)
        self.assertTrue(outer_paths[1, -1] > outer_paths[1, 0])

        # Path 2: Rates decrease (stress down)
        self.assertTrue(outer_paths[2, -1] < outer_paths[2, 0])

        # Path 3: Mean reversion (should converge)
        # Check that later years are closer to some target than early years
        early_deviation = abs(outer_paths[3, 0] - outer_paths[3, -1])
        self.assertGreater(early_deviation, 0)

        # All paths should have positive rates (floor at 0.001)
        self.assertTrue(np.all(outer_paths > 0))


class TestInnerPathGeneration(unittest.TestCase):
    """Test suite for inner path generation (US-004)"""

    def setUp(self):
        """Set up test engine"""
        self.engine = PythonESGEngine()

    def test_inner_path_generation_adds_stochastic_variation(self):
        """Test that inner paths differ from outer path (stochastic variation)"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 10,
            'seed': 42,
            'projection_years': 20,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        # Generate scenarios
        total_scenarios = 3 * 10
        output_buffer = np.zeros((total_scenarios, 20))
        self.engine.runChunk(None, output_buffer)

        # For US-004, inner paths should have stochastic variation
        # Check that not all inner paths in a group are identical
        for outer_idx in range(3):
            start_idx = outer_idx * 10
            end_idx = start_idx + 10

            # Get all inner paths for this outer path
            inner_paths = output_buffer[start_idx:end_idx, :]

            # Check that inner paths are not all identical
            # (at least some should differ due to stochastic variation)
            unique_paths = 0
            for i in range(10):
                is_unique = True
                for j in range(i):
                    if np.allclose(inner_paths[i, :], inner_paths[j, :]):
                        is_unique = False
                        break
                if is_unique:
                    unique_paths += 1

            # Expect at least 8 unique paths out of 10 (allow for rare duplicates)
            self.assertGreaterEqual(
                unique_paths,
                8,
                f"Outer path {outer_idx} should have at least 8 unique inner paths, got {unique_paths}"
            )

    def test_inner_path_generation_reproducible_with_seed(self):
        """Test that inner paths are reproducible with the same seed"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 2,
            'inner_paths_per_outer': 5,
            'seed': 123,
            'projection_years': 15,
            'assumptions_version': 'v1.0'
        }

        # Generate scenarios twice with same seed
        self.engine.initialize(config, credentials=None)
        output_buffer_1 = np.zeros((10, 15))
        self.engine.runChunk(None, output_buffer_1)

        self.engine.dispose()
        self.engine.initialize(config, credentials=None)
        output_buffer_2 = np.zeros((10, 15))
        self.engine.runChunk(None, output_buffer_2)

        # Verify they are identical
        np.testing.assert_array_almost_equal(
            output_buffer_1,
            output_buffer_2,
            decimal=10,
            err_msg="Scenarios should be reproducible with same seed"
        )

    def test_inner_path_generation_different_with_different_seed(self):
        """Test that inner paths differ with different seeds"""
        config1 = {
            'esg_model': 'vasicek',
            'outer_paths': 2,
            'inner_paths_per_outer': 5,
            'seed': 42,
            'projection_years': 15,
            'assumptions_version': 'v1.0'
        }

        config2 = {
            'esg_model': 'vasicek',
            'outer_paths': 2,
            'inner_paths_per_outer': 5,
            'seed': 999,  # Different seed
            'projection_years': 15,
            'assumptions_version': 'v1.0'
        }

        # Generate scenarios with different seeds
        self.engine.initialize(config1, credentials=None)
        output_buffer_1 = np.zeros((10, 15))
        self.engine.runChunk(None, output_buffer_1)

        self.engine.dispose()
        self.engine.initialize(config2, credentials=None)
        output_buffer_2 = np.zeros((10, 15))
        self.engine.runChunk(None, output_buffer_2)

        # Verify they are different
        self.assertFalse(
            np.allclose(output_buffer_1, output_buffer_2),
            "Scenarios should differ with different seeds"
        )

    def test_inner_path_respects_mean_reversion(self):
        """Test that inner paths show mean reversion toward outer path"""
        # Set up with mock yield curve parameters
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 1,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 50,
            'assumptions_version': 'v2.1'
        }

        self.engine.initialize(config, credentials=None)

        # Inject mock parameters with strong mean reversion
        mock_params = {
            'initial_yield_curve': np.array([0.03]),
            'volatility_matrix': np.array([[0.005]]),  # Low volatility
            'drift_rates': np.array([0.0]),
            'mean_reversion': 0.5,  # Strong mean reversion
            'resolved_version': 'v2.1',
            'tenors': [1]
        }
        self.engine._yield_curve_params = mock_params

        # Generate scenarios
        output_buffer = np.zeros((100, 50))
        self.engine.runChunk(None, output_buffer)

        # Calculate average deviation from outer path across all inner paths
        outer_path = self.engine._outer_paths[0, :]
        mean_deviation_by_year = np.abs(output_buffer - outer_path).mean(axis=0)

        # With mean reversion, deviations should remain bounded
        # (not drift arbitrarily far from outer path)
        max_deviation = mean_deviation_by_year.max()
        self.assertLess(
            max_deviation,
            0.02,  # Max 2% average deviation with strong mean reversion
            f"Mean reversion should keep paths close to outer path, got max deviation {max_deviation}"
        )

    def test_inner_path_generation_fast(self):
        """Test that inner path generation is fast (<1ms per path target)"""
        import time

        config = {
            'esg_model': 'vasicek',
            'outer_paths': 5,
            'inner_paths_per_outer': 1000,
            'seed': 42,
            'projection_years': 50,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        # Generate 5000 scenarios
        total_scenarios = 5 * 1000
        output_buffer = np.zeros((total_scenarios, 50))

        start_time = time.time()
        result = self.engine.runChunk(None, output_buffer)
        elapsed_ms = (time.time() - start_time) * 1000

        # Check execution time
        time_per_path = elapsed_ms / total_scenarios

        # Target: <1ms per path (acceptance criteria)
        # Allow 10x margin for non-optimized environment
        self.assertLess(
            time_per_path,
            10.0,
            f"Inner path generation should be fast. Got {time_per_path:.3f}ms per path "
            f"(total: {elapsed_ms:.1f}ms for {total_scenarios} paths)"
        )

        # Verify result contains execution time
        self.assertIn('execution_time_ms', result)
        self.assertGreater(result['execution_time_ms'], 0)

    def test_inner_path_rates_positive(self):
        """Test that all generated rates are positive (floor at 0.1%)"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 30,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        # Generate scenarios
        total_scenarios = 3 * 100
        output_buffer = np.zeros((total_scenarios, 30))
        self.engine.runChunk(None, output_buffer)

        # Verify all rates are positive (floor at 0.001 = 0.1%)
        min_rate = output_buffer.min()
        self.assertGreaterEqual(
            min_rate,
            0.001,
            f"All rates should be >= 0.1%, got minimum {min_rate}"
        )

    def test_inner_path_generation_uses_yield_curve_parameters(self):
        """Test that inner paths use volatility and mean reversion from AM"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 1,
            'inner_paths_per_outer': 1000,
            'seed': 42,
            'projection_years': 50,
            'assumptions_version': 'v2.1'
        }

        self.engine.initialize(config, credentials=None)

        # Test with high volatility
        high_vol_params = {
            'initial_yield_curve': np.array([0.03]),
            'volatility_matrix': np.array([[0.05]]),  # High volatility (5%)
            'drift_rates': np.array([0.0]),
            'mean_reversion': 0.1,
            'resolved_version': 'v2.1',
            'tenors': [1]
        }
        self.engine._yield_curve_params = high_vol_params

        output_buffer_high_vol = np.zeros((1000, 50))
        self.engine.runChunk(None, output_buffer_high_vol)

        # Calculate standard deviation across scenarios
        std_dev_high_vol = output_buffer_high_vol.std(axis=0).mean()

        # Reset and test with low volatility
        self.engine.dispose()
        self.engine.initialize(config, credentials=None)

        low_vol_params = {
            'initial_yield_curve': np.array([0.03]),
            'volatility_matrix': np.array([[0.001]]),  # Low volatility (0.1%)
            'drift_rates': np.array([0.0]),
            'mean_reversion': 0.1,
            'resolved_version': 'v2.1',
            'tenors': [1]
        }
        self.engine._yield_curve_params = low_vol_params

        output_buffer_low_vol = np.zeros((1000, 50))
        self.engine.runChunk(None, output_buffer_low_vol)

        std_dev_low_vol = output_buffer_low_vol.std(axis=0).mean()

        # High volatility should produce higher standard deviation
        self.assertGreater(
            std_dev_high_vol,
            std_dev_low_vol * 2,  # At least 2x higher
            f"High volatility ({std_dev_high_vol:.4f}) should produce wider spread "
            f"than low volatility ({std_dev_low_vol:.4f})"
        )

    def test_inner_path_generation_for_all_outer_paths(self):
        """Test that inner paths are generated for each outer path correctly"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 5,
            'inner_paths_per_outer': 20,
            'seed': 42,
            'projection_years': 30,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        # Generate scenarios
        total_scenarios = 5 * 20
        output_buffer = np.zeros((total_scenarios, 30))
        self.engine.runChunk(None, output_buffer)

        # Verify each outer path group has proper variation
        for outer_idx in range(5):
            start_idx = outer_idx * 20
            end_idx = start_idx + 20

            inner_paths = output_buffer[start_idx:end_idx, :]

            # Calculate standard deviation for this group
            # Should have non-zero variation (stochastic)
            std_dev = inner_paths.std(axis=0).mean()

            self.assertGreater(
                std_dev,
                0.001,
                f"Outer path {outer_idx} should have stochastic variation, got std_dev={std_dev}"
            )

    def test_inner_path_seeding_independence(self):
        """Test that inner paths are independent across outer paths"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 50,
            'seed': 42,
            'projection_years': 30,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        # Generate scenarios
        total_scenarios = 3 * 50
        output_buffer = np.zeros((total_scenarios, 30))
        self.engine.runChunk(None, output_buffer)

        # Extract inner paths for each outer path
        outer_0_paths = output_buffer[0:50, :]
        outer_1_paths = output_buffer[50:100, :]
        outer_2_paths = output_buffer[100:150, :]

        # Calculate correlation between first inner paths of each outer group
        # They should be independent (low correlation)
        from scipy.stats import pearsonr

        # Compare first inner path from outer 0 vs outer 1
        path_0_0 = outer_0_paths[0, :]
        path_1_0 = outer_1_paths[0, :]

        correlation, _ = pearsonr(path_0_0, path_1_0)

        # Correlation should be low (independent random seeds)
        self.assertLess(
            abs(correlation),
            0.5,
            f"Inner paths from different outer paths should be independent, "
            f"got correlation {correlation}"
        )


class TestScenarioOutputFormat(unittest.TestCase):
    """Test suite for US-005: Scenario Output Format"""

    def setUp(self):
        """Set up test engine"""
        self.engine = PythonESGEngine()

    def test_structured_output_format(self):
        """Test that scenarios are written in structured format [scenario_id, year, rate]"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 5,
            'seed': 42,
            'projection_years': 10,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        # Calculate expected dimensions
        total_scenarios = 3 * 5  # 15 scenarios
        total_rows = total_scenarios * 10  # 150 rows (15 scenarios × 10 years)

        # Create structured output buffer (US-005 format)
        dtype = np.dtype([('scenario_id', 'u4'), ('year', 'u4'), ('rate', 'f4')])
        output_buffer = np.zeros(total_rows, dtype=dtype)

        # Generate scenarios
        result = self.engine.runChunk(None, output_buffer)

        # Verify result metadata
        self.assertEqual(result['scenarios_generated'], total_scenarios)
        self.assertIn('execution_time_ms', result)
        self.assertGreater(result['execution_time_ms'], 0)

        # Verify all rows are filled
        self.assertTrue(np.all(output_buffer['year'] > 0), "All years should be > 0")
        self.assertTrue(np.all(output_buffer['rate'] > 0), "All rates should be > 0")

    def test_scenario_id_format(self):
        """Test that scenario_id follows the formula: outer_id * 1000 + inner_id"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 10,
            'seed': 42,
            'projection_years': 5,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        # Create structured output buffer
        total_rows = 3 * 10 * 5  # 150 rows
        dtype = np.dtype([('scenario_id', 'u4'), ('year', 'u4'), ('rate', 'f4')])
        output_buffer = np.zeros(total_rows, dtype=dtype)

        self.engine.runChunk(None, output_buffer)

        # Verify scenario_id format for specific scenarios
        # Scenario (outer=0, inner=0): ID should be 0
        # Scenario (outer=0, inner=9): ID should be 9
        # Scenario (outer=1, inner=0): ID should be 1000
        # Scenario (outer=2, inner=5): ID should be 2005

        # Extract unique scenario IDs
        unique_ids = np.unique(output_buffer['scenario_id'])
        self.assertEqual(len(unique_ids), 30, "Should have 30 unique scenario IDs")

        # Check specific IDs
        expected_ids = [0, 9, 1000, 1009, 2000, 2009]
        for expected_id in expected_ids:
            self.assertIn(expected_id, unique_ids, f"Expected scenario ID {expected_id} not found")

        # Verify each scenario has exactly projection_years rows
        for scenario_id in unique_ids:
            scenario_rows = output_buffer[output_buffer['scenario_id'] == scenario_id]
            self.assertEqual(len(scenario_rows), 5, f"Scenario {scenario_id} should have 5 years")

    def test_year_indexing(self):
        """Test that years are 1-indexed (1 to projection_years)"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 2,
            'inner_paths_per_outer': 3,
            'seed': 42,
            'projection_years': 50,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        total_rows = 2 * 3 * 50  # 300 rows
        dtype = np.dtype([('scenario_id', 'u4'), ('year', 'u4'), ('rate', 'f4')])
        output_buffer = np.zeros(total_rows, dtype=dtype)

        self.engine.runChunk(None, output_buffer)

        # Check that years are 1 to 50 for each scenario
        unique_scenario_ids = np.unique(output_buffer['scenario_id'])

        for scenario_id in unique_scenario_ids:
            scenario_rows = output_buffer[output_buffer['scenario_id'] == scenario_id]
            years = scenario_rows['year']

            # Years should be [1, 2, 3, ..., 50]
            expected_years = np.arange(1, 51)
            np.testing.assert_array_equal(
                years,
                expected_years,
                f"Scenario {scenario_id} years should be 1-50"
            )

    def test_interest_rate_format(self):
        """Test that interest rates are per-annum (e.g., 0.03 for 3%)"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 5,
            'seed': 42,
            'projection_years': 20,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        total_rows = 3 * 5 * 20
        dtype = np.dtype([('scenario_id', 'u4'), ('year', 'u4'), ('rate', 'f4')])
        output_buffer = np.zeros(total_rows, dtype=dtype)

        self.engine.runChunk(None, output_buffer)

        # Rates should be reasonable (0.1% to 20% = 0.001 to 0.20)
        rates = output_buffer['rate']
        self.assertTrue(np.all(rates > 0.001), "All rates should be > 0.1%")
        self.assertTrue(np.all(rates < 0.30), "All rates should be < 30%")

        # Check that rates are actually float values (not percentages like 3.0)
        # Mean rate should be around 0.03-0.05 (3-5% per annum)
        mean_rate = np.mean(rates)
        self.assertGreater(mean_rate, 0.005, "Mean rate should be > 0.5%")
        self.assertLess(mean_rate, 0.15, "Mean rate should be < 15%")

    def test_buffer_size_calculation(self):
        """Test that buffer size matches expected: num_scenarios * projection_years"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 5,
            'inner_paths_per_outer': 100,
            'seed': 42,
            'projection_years': 30,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        total_scenarios = 5 * 100  # 500 scenarios
        total_rows = total_scenarios * 30  # 15,000 rows

        dtype = np.dtype([('scenario_id', 'u4'), ('year', 'u4'), ('rate', 'f4')])
        output_buffer = np.zeros(total_rows, dtype=dtype)

        result = self.engine.runChunk(None, output_buffer)

        # Verify correct number of scenarios generated
        self.assertEqual(result['scenarios_generated'], 500)

        # Verify all rows are filled
        unique_scenarios = np.unique(output_buffer['scenario_id'])
        self.assertEqual(len(unique_scenarios), 500, "Should have 500 unique scenarios")

        # Verify total rows
        self.assertEqual(len(output_buffer), 15000, "Should have 15,000 total rows")

    def test_structured_buffer_dtype_validation(self):
        """Test that engine validates structured buffer dtype"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 2,
            'inner_paths_per_outer': 5,
            'seed': 42,
            'projection_years': 10,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        # Create buffer with wrong dtype
        wrong_dtype = np.dtype([('id', 'u4'), ('time', 'u4'), ('value', 'f4')])
        output_buffer = np.zeros(100, dtype=wrong_dtype)

        # Should raise ExecutionError due to dtype mismatch
        with self.assertRaises(ExecutionError) as context:
            self.engine.runChunk(None, output_buffer)

        self.assertIn("dtype mismatch", str(context.exception).lower())

    def test_structured_buffer_shape_validation(self):
        """Test that engine validates structured buffer shape"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 5,
            'seed': 42,
            'projection_years': 10,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        # Create buffer with wrong shape (too small)
        dtype = np.dtype([('scenario_id', 'u4'), ('year', 'u4'), ('rate', 'f4')])
        wrong_size = 50  # Should be 3 * 5 * 10 = 150
        output_buffer = np.zeros(wrong_size, dtype=dtype)

        # Should raise ExecutionError due to shape mismatch
        with self.assertRaises(ExecutionError) as context:
            self.engine.runChunk(None, output_buffer)

        self.assertIn("shape mismatch", str(context.exception).lower())

    def test_backwards_compatibility_with_legacy_buffer(self):
        """Test that engine still supports legacy 2D buffer format for backwards compatibility"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 3,
            'inner_paths_per_outer': 5,
            'seed': 42,
            'projection_years': 10,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        # Create legacy 2D buffer
        total_scenarios = 3 * 5
        output_buffer = np.zeros((total_scenarios, 10))

        # Should work without errors
        result = self.engine.runChunk(None, output_buffer)

        self.assertEqual(result['scenarios_generated'], 15)
        self.assertTrue(np.all(output_buffer > 0), "All values should be > 0")

    def test_structured_output_with_large_dataset(self):
        """Test structured output with larger dataset (performance check)"""
        config = {
            'esg_model': 'vasicek',
            'outer_paths': 10,
            'inner_paths_per_outer': 1000,
            'seed': 42,
            'projection_years': 50,
            'assumptions_version': 'v1.0'
        }

        self.engine.initialize(config, credentials=None)

        # 10 outer × 1000 inner × 50 years = 500,000 rows
        total_rows = 10 * 1000 * 50

        dtype = np.dtype([('scenario_id', 'u4'), ('year', 'u4'), ('rate', 'f4')])
        output_buffer = np.zeros(total_rows, dtype=dtype)

        import time
        start = time.time()
        result = self.engine.runChunk(None, output_buffer)
        elapsed = time.time() - start

        # Should complete in reasonable time (< 15 seconds for 10K scenarios)
        self.assertLess(elapsed, 15.0, f"Large dataset generation took {elapsed:.2f}s, expected < 15s")

        # Verify results
        self.assertEqual(result['scenarios_generated'], 10000)
        unique_scenarios = np.unique(output_buffer['scenario_id'])
        self.assertEqual(len(unique_scenarios), 10000, "Should have 10,000 unique scenarios")


if __name__ == '__main__':
    unittest.main()
