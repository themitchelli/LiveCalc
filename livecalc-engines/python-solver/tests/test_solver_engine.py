"""
Unit tests for SolverEngine (US-001).

Tests cover:
- Interface implementation
- Configuration validation
- Callback-based optimization
- Timeout protection
- Error handling
"""

import unittest
import time
from typing import Dict
import sys
import os

# Add parent directory to path to import solver_engine
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.solver_engine import (
    SolverEngine,
    OptimizationResult,
    ValuationResult,
    ProjectionCallback
)
from src.calc_engine_interface import (
    InitializationError,
    ConfigurationError,
    ExecutionError,
    TimeoutError
)


class TestSolverEngineInterface(unittest.TestCase):
    """Test ICalcEngine interface implementation."""

    def test_get_info(self):
        """Test engine metadata."""
        engine = SolverEngine()
        info = engine.get_info()

        self.assertEqual(info.name, "PythonSolverEngine")
        self.assertEqual(info.version, "1.0.0")
        self.assertEqual(info.engine_type, "solver")

    def test_is_initialized_before_init(self):
        """Test is_initialized returns False before initialization."""
        engine = SolverEngine()
        self.assertFalse(engine.is_initialized)

    def test_is_initialized_after_init(self):
        """Test is_initialized returns True after initialization."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'param1', 'initial': 1.0}
            ],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)
        self.assertTrue(engine.is_initialized)

    def test_dispose(self):
        """Test dispose cleans up resources."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)
        self.assertTrue(engine.is_initialized)

        engine.dispose()
        self.assertFalse(engine.is_initialized)


class TestConfigurationValidation(unittest.TestCase):
    """Test configuration validation."""

    def test_valid_config(self):
        """Test initialization with valid config."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'premium_rate', 'initial': 1.0, 'lower': 0.5, 'upper': 2.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'}
        }
        engine.initialize(config)
        self.assertTrue(engine.is_initialized)

    def test_missing_parameters(self):
        """Test initialization fails if parameters missing."""
        engine = SolverEngine()
        config = {
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("Missing required config fields", str(ctx.exception))
        self.assertIn("parameters", str(ctx.exception))

    def test_missing_objective(self):
        """Test initialization fails if objective missing."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}]
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("Missing required config fields", str(ctx.exception))
        self.assertIn("objective", str(ctx.exception))

    def test_empty_parameters_list(self):
        """Test initialization fails if parameters list is empty."""
        engine = SolverEngine()
        config = {
            'parameters': [],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("must be a non-empty list", str(ctx.exception))

    def test_invalid_parameter_structure(self):
        """Test initialization fails if parameter structure is invalid."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'param1'}  # missing 'initial'
            ],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("missing 'name' or 'initial'", str(ctx.exception))

    def test_invalid_objective_structure(self):
        """Test initialization fails if objective structure is invalid."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {}  # missing 'metric'
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("must be a dict with 'metric' field", str(ctx.exception))

    def test_custom_timeout(self):
        """Test custom timeout configuration."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'},
            'timeout_seconds': 60
        }
        engine.initialize(config)
        self.assertEqual(engine._timeout_seconds, 60)

    def test_invalid_timeout_negative(self):
        """Test invalid timeout (negative) raises error."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'},
            'timeout_seconds': -10
        }
        with self.assertRaises(ConfigurationError) as ctx:
            engine.initialize(config)
        self.assertIn("timeout_seconds must be between 1 and 3600", str(ctx.exception))

    def test_invalid_timeout_too_large(self):
        """Test invalid timeout (too large) raises error."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'},
            'timeout_seconds': 5000
        }
        with self.assertRaises(ConfigurationError) as ctx:
            engine.initialize(config)
        self.assertIn("timeout_seconds must be between 1 and 3600", str(ctx.exception))


class TestOptimizeMethod(unittest.TestCase):
    """Test optimize() method and callback interface."""

    def test_optimize_requires_initialization(self):
        """Test optimize() fails if engine not initialized."""
        engine = SolverEngine()

        def dummy_callback(params):
            return ValuationResult(mean_npv=100.0)

        with self.assertRaises(ExecutionError) as ctx:
            engine.optimize(dummy_callback)
        self.assertIn("not initialized", str(ctx.exception))

    def test_optimize_calls_projection_callback(self):
        """Test optimize() calls projection callback."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'premium_rate', 'initial': 1.0}
            ],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)

        callback_invoked = {'count': 0, 'params': None}

        def projection_callback(params: Dict[str, float]) -> ValuationResult:
            callback_invoked['count'] += 1
            callback_invoked['params'] = params
            return ValuationResult(mean_npv=1000.0 * params.get('premium_rate', 1.0))

        result = engine.optimize(projection_callback)

        # Verify callback was invoked
        self.assertGreater(callback_invoked['count'], 0)
        self.assertIsNotNone(callback_invoked['params'])
        self.assertIn('premium_rate', callback_invoked['params'])

        # Verify result structure
        self.assertIsInstance(result, OptimizationResult)
        self.assertIn('premium_rate', result.final_parameters)
        self.assertIsInstance(result.iterations, int)
        self.assertGreater(result.iterations, 0)
        self.assertIsInstance(result.converged, bool)

    def test_optimize_with_custom_initial_parameters(self):
        """Test optimize() with custom initial parameters."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'param1', 'initial': 1.0},
                {'name': 'param2', 'initial': 2.0}
            ],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)

        received_params = {}

        def projection_callback(params: Dict[str, float]) -> ValuationResult:
            received_params.update(params)
            return ValuationResult(mean_npv=100.0)

        custom_initial = {'param1': 5.0, 'param2': 10.0}
        result = engine.optimize(projection_callback, initial_parameters=custom_initial)

        # Verify custom initial parameters were used
        self.assertEqual(received_params['param1'], 5.0)
        self.assertEqual(received_params['param2'], 10.0)

    def test_optimize_returns_optimization_result(self):
        """Test optimize() returns OptimizationResult with required fields."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)

        def projection_callback(params):
            return ValuationResult(mean_npv=500.0, std_dev=50.0, cte_95=400.0)

        result = engine.optimize(projection_callback)

        # Verify all required fields present
        self.assertIsInstance(result.final_parameters, dict)
        self.assertIsInstance(result.objective_value, float)
        self.assertIsInstance(result.iterations, int)
        self.assertIsInstance(result.converged, bool)
        self.assertIsInstance(result.constraint_violations, dict)
        self.assertIsInstance(result.execution_time_seconds, float)
        self.assertIsInstance(result.partial_result, bool)

        # Verify execution time is populated
        self.assertGreater(result.execution_time_seconds, 0.0)

    def test_optimize_extracts_objective_correctly(self):
        """Test objective value is extracted from ValuationResult."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)

        def projection_callback(params):
            return ValuationResult(mean_npv=1234.5, std_dev=100.0)

        result = engine.optimize(projection_callback)
        self.assertEqual(result.objective_value, 1234.5)

    def test_optimize_handles_projection_callback_exception(self):
        """Test optimize() handles projection callback exceptions."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)

        def failing_callback(params):
            raise ValueError("Projection failed!")

        with self.assertRaises(ExecutionError) as ctx:
            engine.optimize(failing_callback)
        self.assertIn("Projection callback failed", str(ctx.exception))


class TestTimeoutProtection(unittest.TestCase):
    """Test timeout protection (5 minute default)."""

    def test_timeout_default_value(self):
        """Test default timeout is 300 seconds (5 minutes)."""
        engine = SolverEngine()
        self.assertEqual(engine._timeout_seconds, 300)

    def test_timeout_protection_with_short_timeout(self):
        """Test timeout protection triggers for slow callbacks."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'},
            'timeout_seconds': 1  # 1 second timeout
        }
        engine.initialize(config)

        def slow_callback(params):
            time.sleep(2)  # Sleep longer than timeout
            return ValuationResult(mean_npv=100.0)

        with self.assertRaises(TimeoutError) as ctx:
            engine.optimize(slow_callback)
        self.assertIn("exceeded timeout", str(ctx.exception))


class TestCalibrationTargetResolution(unittest.TestCase):
    """Test calibration target resolution from Assumptions Manager (US-002)."""

    def test_inline_targets_valid(self):
        """Test initialization with inline calibration targets."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'premium_rate', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'},
            'calibration_targets': {
                'objective_function': 'maximize_return',
                'objective_metric': 'mean_npv',
                'constraints': [
                    {'name': 'solvency', 'operator': '>=', 'value': 0.95}
                ]
            }
        }
        engine.initialize(config)
        self.assertTrue(engine.is_initialized)
        self.assertIsNotNone(engine._calibration_targets)
        self.assertEqual(engine._calibration_targets.objective_function, 'maximize_return')
        self.assertEqual(engine._calibration_targets.objective_metric, 'mean_npv')
        self.assertEqual(len(engine._calibration_targets.constraints), 1)

    def test_inline_targets_invalid_objective_function(self):
        """Test validation catches invalid objective_function."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'},
            'calibration_targets': {
                'objective_function': 'invalid_objective',
                'objective_metric': 'mean_npv'
            }
        }
        with self.assertRaises(ConfigurationError) as ctx:
            engine.initialize(config)
        self.assertIn("Invalid objective_function", str(ctx.exception))

    def test_inline_targets_invalid_objective_metric(self):
        """Test validation catches invalid objective_metric."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'},
            'calibration_targets': {
                'objective_function': 'maximize',
                'objective_metric': 'invalid_metric'
            }
        }
        with self.assertRaises(ConfigurationError) as ctx:
            engine.initialize(config)
        self.assertIn("Invalid objective_metric", str(ctx.exception))

    def test_inline_targets_with_multiple_constraints(self):
        """Test inline targets with multiple constraints."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'},
            'calibration_targets': {
                'objective_function': 'maximize',
                'objective_metric': 'mean_npv',
                'constraints': [
                    {'name': 'solvency', 'operator': '>=', 'value': 0.95},
                    {'name': 'cost', 'operator': '<=', 'value': 100.0}
                ]
            }
        }
        engine.initialize(config)
        self.assertEqual(len(engine._calibration_targets.constraints), 2)

    def test_constraint_validation_missing_field(self):
        """Test constraint validation catches missing required fields."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'},
            'calibration_targets': {
                'objective_function': 'maximize',
                'objective_metric': 'mean_npv',
                'constraints': [
                    {'name': 'solvency', 'operator': '>='}  # Missing 'value'
                ]
            }
        }
        with self.assertRaises(ConfigurationError) as ctx:
            engine.initialize(config)
        self.assertIn("missing required fields", str(ctx.exception))

    def test_constraint_validation_invalid_operator(self):
        """Test constraint validation catches invalid operators."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'},
            'calibration_targets': {
                'objective_function': 'maximize',
                'objective_metric': 'mean_npv',
                'constraints': [
                    {'name': 'solvency', 'operator': '!=', 'value': 0.95}  # Invalid operator
                ]
            }
        }
        with self.assertRaises(ConfigurationError) as ctx:
            engine.initialize(config)
        self.assertIn("invalid operator", str(ctx.exception))

    def test_constraint_validation_non_numeric_value(self):
        """Test constraint validation catches non-numeric values."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'},
            'calibration_targets': {
                'objective_function': 'maximize',
                'objective_metric': 'mean_npv',
                'constraints': [
                    {'name': 'solvency', 'operator': '>=', 'value': 'not_a_number'}
                ]
            }
        }
        with self.assertRaises(ConfigurationError) as ctx:
            engine.initialize(config)
        self.assertIn("not numeric", str(ctx.exception))

    def test_conflicting_constraints_detection(self):
        """Test detection of conflicting constraints (lower > upper)."""
        from src.solver_engine import CalibrationTargets

        targets = CalibrationTargets(
            objective_function='maximize',
            objective_metric='mean_npv',
            constraints=[
                {'name': 'return', 'operator': '>=', 'value': 10.0},
                {'name': 'return', 'operator': '<=', 'value': 5.0}  # Conflict!
            ]
        )

        warnings = targets.check_conflicting_constraints()
        self.assertEqual(len(warnings), 1)
        self.assertIn("infeasible", warnings[0])
        self.assertIn("return", warnings[0])

    def test_missing_calibration_targets_config(self):
        """Test that calibration_targets field is optional."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'}
            # No calibration_targets - should still work
        }
        engine.initialize(config)
        self.assertTrue(engine.is_initialized)
        self.assertIsNone(engine._calibration_targets)

    def test_am_reference_invalid_format(self):
        """Test AM reference validation catches invalid format."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'},
            'calibration_targets': {
                'am_reference': 'invalid_format_no_colon'
            }
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        # Will fail with either "not available" or "Invalid AM reference format"
        error_msg = str(ctx.exception)
        self.assertTrue(
            "not available" in error_msg or "Invalid AM reference format" in error_msg,
            f"Expected error about AM client or format, got: {error_msg}"
        )

    def test_am_reference_missing_credentials(self):
        """Test AM reference requires credentials."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'},
            'calibration_targets': {
                'am_reference': 'calibration-targets:v1.0'
            }
        }
        # No credentials provided
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        # Will fail with either "not available" or "credentials required"
        error_msg = str(ctx.exception)
        self.assertTrue(
            "not available" in error_msg or "credentials required" in error_msg,
            f"Expected error about AM client or credentials, got: {error_msg}"
        )


if __name__ == '__main__':
    unittest.main()
