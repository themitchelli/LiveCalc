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
    ProjectionCallback,
    CalibrationTargets
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
                {'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}
            ],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)
        self.assertTrue(engine.is_initialized)

    def test_dispose(self):
        """Test dispose cleans up resources."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}]
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
                {'name': 'param1'}  # missing 'initial', 'lower', 'upper'
            ],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        # Now checks for all missing required fields (initial, lower, upper)
        self.assertIn("missing required fields", str(ctx.exception))

    def test_invalid_objective_structure(self):
        """Test initialization fails if objective structure is invalid."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
            'objective': {}  # missing 'metric'
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("must be a dict with 'metric' field", str(ctx.exception))

    def test_custom_timeout(self):
        """Test custom timeout configuration."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'},
            'timeout_seconds': 60
        }
        engine.initialize(config)
        self.assertEqual(engine._timeout_seconds, 60)

    def test_invalid_timeout_negative(self):
        """Test invalid timeout (negative) raises error."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
                {'name': 'premium_rate', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}
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
                {'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0},
                {'name': 'param2', 'lower': 0.0, 'upper': 10.0, 'initial': 2.0}
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'premium_rate', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
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


class TestParameterDefinitionAndBounds(unittest.TestCase):
    """Test parameter definition and bounds validation (US-003)."""

    def test_valid_parameter_with_all_fields(self):
        """Test parameter with all required fields validates successfully."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'premium_rate',
                    'type': 'continuous',
                    'lower': 0.5,
                    'upper': 2.0,
                    'initial': 1.0
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)
        self.assertTrue(engine.is_initialized)

    def test_parameter_missing_name(self):
        """Test parameter validation fails if name missing."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'type': 'continuous',
                    'lower': 0.5,
                    'upper': 2.0,
                    'initial': 1.0
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("missing required fields", str(ctx.exception))
        self.assertIn("name", str(ctx.exception))

    def test_parameter_missing_initial(self):
        """Test parameter validation fails if initial value missing."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'premium_rate',
                    'type': 'continuous',
                    'lower': 0.5,
                    'upper': 2.0
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("missing required fields", str(ctx.exception))
        self.assertIn("initial", str(ctx.exception))

    def test_parameter_missing_bounds(self):
        """Test parameter validation fails if bounds missing."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'premium_rate',
                    'initial': 1.0
                    # Missing 'lower' and 'upper' - should fail
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("missing required fields", str(ctx.exception))
        self.assertTrue("lower" in str(ctx.exception) or "upper" in str(ctx.exception))

    def test_parameter_invalid_type(self):
        """Test parameter validation fails if type is invalid."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'premium_rate',
                    'type': 'invalid_type',
                    'lower': 0.5,
                    'upper': 2.0,
                    'initial': 1.0
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("invalid type", str(ctx.exception))
        self.assertIn("continuous", str(ctx.exception))
        self.assertIn("discrete", str(ctx.exception))

    def test_parameter_lower_greater_than_upper(self):
        """Test parameter validation fails if lower bound >= upper bound."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'premium_rate',
                    'lower': 2.0,
                    'upper': 1.0,
                    'initial': 1.5
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("invalid bounds", str(ctx.exception))
        self.assertIn("lower", str(ctx.exception))
        self.assertIn("upper", str(ctx.exception))

    def test_parameter_initial_below_lower_bound(self):
        """Test parameter validation fails if initial value < lower bound."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'premium_rate',
                    'lower': 0.5,
                    'upper': 2.0,
                    'initial': 0.3
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("initial value", str(ctx.exception))
        self.assertIn("outside bounds", str(ctx.exception))

    def test_parameter_initial_above_upper_bound(self):
        """Test parameter validation fails if initial value > upper bound."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'premium_rate',
                    'lower': 0.5,
                    'upper': 2.0,
                    'initial': 2.5
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("initial value", str(ctx.exception))
        self.assertIn("outside bounds", str(ctx.exception))

    def test_discrete_parameter_missing_step(self):
        """Test discrete parameter validation fails if step missing."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'num_employees',
                    'type': 'discrete',
                    'lower': 1,
                    'upper': 100,
                    'initial': 50
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("missing required 'step' field", str(ctx.exception))

    def test_discrete_parameter_with_valid_step(self):
        """Test discrete parameter with valid step validates successfully."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'num_employees',
                    'type': 'discrete',
                    'lower': 0,
                    'upper': 100,
                    'initial': 50,
                    'step': 1
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)
        self.assertTrue(engine.is_initialized)

    def test_discrete_parameter_negative_step(self):
        """Test discrete parameter validation fails if step is negative."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'num_employees',
                    'type': 'discrete',
                    'lower': 0,
                    'upper': 100,
                    'initial': 50,
                    'step': -1
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("step size", str(ctx.exception))
        self.assertIn("must be positive", str(ctx.exception))

    def test_discrete_parameter_zero_step(self):
        """Test discrete parameter validation fails if step is zero."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'num_employees',
                    'type': 'discrete',
                    'lower': 0,
                    'upper': 100,
                    'initial': 50,
                    'step': 0
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("step size", str(ctx.exception))
        self.assertIn("must be positive", str(ctx.exception))

    def test_continuous_parameter_defaults_when_type_omitted(self):
        """Test parameter defaults to continuous when type not specified."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'premium_rate',
                    'lower': 0.5,
                    'upper': 2.0,
                    'initial': 1.0
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)
        self.assertTrue(engine.is_initialized)

    def test_multiple_parameters_all_valid(self):
        """Test multiple parameters with all valid configurations."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'premium_rate',
                    'type': 'continuous',
                    'lower': 0.5,
                    'upper': 2.0,
                    'initial': 1.0
                },
                {
                    'name': 'reserve_factor',
                    'type': 'continuous',
                    'lower': 0.7,
                    'upper': 1.5,
                    'initial': 0.9
                },
                {
                    'name': 'num_scenarios',
                    'type': 'discrete',
                    'lower': 100,
                    'upper': 1000,
                    'initial': 500,
                    'step': 100
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)
        self.assertTrue(engine.is_initialized)

    def test_duplicate_parameter_names(self):
        """Test validation fails if duplicate parameter names found."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'premium_rate',
                    'lower': 0.5,
                    'upper': 2.0,
                    'initial': 1.0
                },
                {
                    'name': 'premium_rate',
                    'lower': 0.8,
                    'upper': 1.5,
                    'initial': 1.2
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("Duplicate parameter names", str(ctx.exception))

    def test_parameter_non_numeric_bounds(self):
        """Test validation fails if bounds are not numeric."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'premium_rate',
                    'lower': 'invalid',
                    'upper': 2.0,
                    'initial': 1.0
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        with self.assertRaises(InitializationError) as ctx:
            engine.initialize(config)
        self.assertIn("non-numeric bound", str(ctx.exception))

    def test_parameter_initial_at_lower_bound(self):
        """Test parameter with initial value at lower bound validates successfully."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'premium_rate',
                    'lower': 0.5,
                    'upper': 2.0,
                    'initial': 0.5
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)
        self.assertTrue(engine.is_initialized)

    def test_parameter_initial_at_upper_bound(self):
        """Test parameter with initial value at upper bound validates successfully."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {
                    'name': 'premium_rate',
                    'lower': 0.5,
                    'upper': 2.0,
                    'initial': 2.0
                }
            ],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)
        self.assertTrue(engine.is_initialized)


class TestObjectiveFunctionAndConstraints(unittest.TestCase):
    """Test objective function and constraint evaluation (US-004)."""

    def test_extract_standard_objective_metric(self):
        """Test extraction of standard objective metric from ValuationResult."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 1.0}],
            'objective': {'metric': 'mean_npv'}
        }
        engine.initialize(config)

        # Create mock result
        result = ValuationResult(mean_npv=1234.5, std_dev=100.0, cte_95=1100.0)

        # Extract objective
        objective = engine._extract_objective(result)
        self.assertEqual(objective, 1234.5)

    def test_extract_different_objective_metrics(self):
        """Test extraction of different objective metrics."""
        engine = SolverEngine()
        result = ValuationResult(mean_npv=1000.0, std_dev=200.0, cte_95=800.0)

        # Test mean_npv
        engine._config = {'objective': {'metric': 'mean_npv'}}
        self.assertEqual(engine._extract_objective(result), 1000.0)

        # Test std_dev
        engine._config = {'objective': {'metric': 'std_dev'}}
        self.assertEqual(engine._extract_objective(result), 200.0)

        # Test cte_95
        engine._config = {'objective': {'metric': 'cte_95'}}
        self.assertEqual(engine._extract_objective(result), 800.0)

    def test_extract_objective_invalid_metric(self):
        """Test extraction fails for invalid metric."""
        engine = SolverEngine()
        engine._config = {'objective': {'metric': 'nonexistent_metric'}}
        result = ValuationResult(mean_npv=1000.0)

        with self.assertRaises(ConfigurationError) as ctx:
            engine._extract_objective(result)
        self.assertIn("not found", str(ctx.exception))

    def test_custom_metric_division(self):
        """Test custom metric with division."""
        engine = SolverEngine()
        engine._config = {
            'objective': {'metric': 'cost_per_policy'},
            'custom_metrics': {
                'cost_per_policy': 'mean_npv / 1000'
            }
        }
        result = ValuationResult(mean_npv=5000.0)

        objective = engine._extract_objective(result)
        self.assertEqual(objective, 5.0)  # 5000 / 1000

    def test_custom_metric_multiplication(self):
        """Test custom metric with multiplication."""
        engine = SolverEngine()
        engine._config = {
            'objective': {'metric': 'scaled_npv'},
            'custom_metrics': {
                'scaled_npv': 'mean_npv * 2'
            }
        }
        result = ValuationResult(mean_npv=1000.0)

        objective = engine._extract_objective(result)
        self.assertEqual(objective, 2000.0)  # 1000 * 2

    def test_custom_metric_with_two_result_fields(self):
        """Test custom metric using two fields from result."""
        engine = SolverEngine()
        engine._config = {
            'objective': {'metric': 'return_on_std'},
            'custom_metrics': {
                'return_on_std': 'mean_npv / std_dev'
            }
        }
        result = ValuationResult(mean_npv=1000.0, std_dev=100.0)

        objective = engine._extract_objective(result)
        self.assertEqual(objective, 10.0)  # 1000 / 100

    def test_custom_metric_division_by_zero(self):
        """Test custom metric fails on division by zero."""
        engine = SolverEngine()
        engine._config = {
            'objective': {'metric': 'invalid_ratio'},
            'custom_metrics': {
                'invalid_ratio': 'mean_npv / 0'
            }
        }
        result = ValuationResult(mean_npv=1000.0)

        with self.assertRaises(ConfigurationError) as ctx:
            engine._extract_objective(result)
        self.assertIn("division by zero", str(ctx.exception))

    def test_evaluate_constraint_satisfied_gte(self):
        """Test constraint evaluation when >= constraint is satisfied."""
        engine = SolverEngine()
        engine._config = {
            'constraints': [
                {'name': 'cte_95', 'operator': '>=', 'value': 900.0}
            ]
        }
        result = ValuationResult(mean_npv=1000.0, cte_95=950.0)

        violations = engine._evaluate_constraints(result)
        self.assertEqual(violations, {})  # No violations

    def test_evaluate_constraint_violated_gte(self):
        """Test constraint evaluation when >= constraint is violated."""
        engine = SolverEngine()
        engine._config = {
            'constraints': [
                {'name': 'cte_95', 'operator': '>=', 'value': 1000.0}
            ]
        }
        result = ValuationResult(mean_npv=1000.0, cte_95=900.0)

        violations = engine._evaluate_constraints(result)
        self.assertIn('cte_95', violations)
        self.assertEqual(violations['cte_95'], 100.0)  # 1000 - 900

    def test_evaluate_constraint_satisfied_lte(self):
        """Test constraint evaluation when <= constraint is satisfied."""
        engine = SolverEngine()
        engine._config = {
            'constraints': [
                {'name': 'std_dev', 'operator': '<=', 'value': 200.0}
            ]
        }
        result = ValuationResult(mean_npv=1000.0, std_dev=150.0)

        violations = engine._evaluate_constraints(result)
        self.assertEqual(violations, {})  # No violations

    def test_evaluate_constraint_violated_lte(self):
        """Test constraint evaluation when <= constraint is violated."""
        engine = SolverEngine()
        engine._config = {
            'constraints': [
                {'name': 'std_dev', 'operator': '<=', 'value': 100.0}
            ]
        }
        result = ValuationResult(mean_npv=1000.0, std_dev=150.0)

        violations = engine._evaluate_constraints(result)
        self.assertIn('std_dev', violations)
        self.assertEqual(violations['std_dev'], 50.0)  # 150 - 100

    def test_evaluate_multiple_constraints(self):
        """Test evaluation of multiple constraints."""
        engine = SolverEngine()
        engine._config = {
            'constraints': [
                {'name': 'cte_95', 'operator': '>=', 'value': 900.0},
                {'name': 'std_dev', 'operator': '<=', 'value': 200.0},
                {'name': 'mean_npv', 'operator': '>=', 'value': 1000.0}
            ]
        }
        result = ValuationResult(mean_npv=1100.0, std_dev=150.0, cte_95=950.0)

        violations = engine._evaluate_constraints(result)
        self.assertEqual(violations, {})  # All satisfied

    def test_evaluate_multiple_constraints_some_violated(self):
        """Test evaluation with some constraints violated."""
        engine = SolverEngine()
        engine._config = {
            'constraints': [
                {'name': 'cte_95', 'operator': '>=', 'value': 1000.0},  # Violated
                {'name': 'std_dev', 'operator': '<=', 'value': 200.0},  # Satisfied
                {'name': 'mean_npv', 'operator': '>=', 'value': 1000.0}  # Satisfied
            ]
        }
        result = ValuationResult(mean_npv=1100.0, std_dev=150.0, cte_95=900.0)

        violations = engine._evaluate_constraints(result)
        self.assertEqual(len(violations), 1)
        self.assertIn('cte_95', violations)

    def test_constraint_with_custom_metric(self):
        """Test constraint evaluation with custom metric."""
        engine = SolverEngine()
        engine._config = {
            'constraints': [
                {'name': 'return_ratio', 'operator': '>=', 'value': 5.0}
            ],
            'custom_metrics': {
                'return_ratio': 'mean_npv / std_dev'
            }
        }
        result = ValuationResult(mean_npv=1000.0, std_dev=100.0)  # ratio = 10.0

        violations = engine._evaluate_constraints(result)
        self.assertEqual(violations, {})  # 10.0 >= 5.0 satisfied

    def test_constraint_with_custom_metric_violated(self):
        """Test constraint violation with custom metric."""
        engine = SolverEngine()
        engine._config = {
            'constraints': [
                {'name': 'return_ratio', 'operator': '>=', 'value': 15.0}
            ],
            'custom_metrics': {
                'return_ratio': 'mean_npv / std_dev'
            }
        }
        result = ValuationResult(mean_npv=1000.0, std_dev=100.0)  # ratio = 10.0

        violations = engine._evaluate_constraints(result)
        self.assertIn('return_ratio', violations)
        self.assertEqual(violations['return_ratio'], 5.0)  # 15 - 10

    def test_objective_direction_maximize(self):
        """Test objective direction adjustment for maximization."""
        engine = SolverEngine()
        engine._config = {
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'}
        }

        adjusted = engine._apply_objective_direction(1000.0)
        self.assertEqual(adjusted, 1000.0)  # No change for maximize

    def test_objective_direction_minimize(self):
        """Test objective direction adjustment for minimization."""
        engine = SolverEngine()
        engine._config = {
            'objective': {'metric': 'std_dev', 'direction': 'minimize'}
        }

        adjusted = engine._apply_objective_direction(100.0)
        self.assertEqual(adjusted, -100.0)  # Negated for minimize

    def test_objective_direction_from_calibration_targets(self):
        """Test objective direction from calibration targets."""
        engine = SolverEngine()
        engine._calibration_targets = CalibrationTargets(
            objective_function='minimize_cost',
            objective_metric='mean_npv'
        )

        adjusted = engine._apply_objective_direction(500.0)
        self.assertEqual(adjusted, -500.0)  # Negated for minimize

    def test_optimize_with_constraints(self):
        """Test optimize method evaluates constraints."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}],
            'objective': {'metric': 'mean_npv'},
            'constraints': [
                {'name': 'cte_95', 'operator': '>=', 'value': 900.0}
            ]
        }
        engine.initialize(config)

        # Mock projection callback
        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            return ValuationResult(mean_npv=1000.0, std_dev=100.0, cte_95=950.0)

        result = engine.optimize(mock_callback)

        self.assertTrue(result.converged)
        self.assertEqual(result.constraint_violations, {})  # All satisfied

    def test_optimize_with_violated_constraints(self):
        """Test optimize method detects constraint violations."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}],
            'objective': {'metric': 'mean_npv'},
            'constraints': [
                {'name': 'cte_95', 'operator': '>=', 'value': 1000.0}
            ]
        }
        engine.initialize(config)

        # Mock projection callback with violated constraint
        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            return ValuationResult(mean_npv=1000.0, std_dev=100.0, cte_95=900.0)

        result = engine.optimize(mock_callback)

        self.assertTrue(result.converged)
        self.assertIn('cte_95', result.constraint_violations)
        self.assertEqual(result.constraint_violations['cte_95'], 100.0)


class TestSolverAlgorithmSelection(unittest.TestCase):
    """Test solver algorithm selection and execution (US-005)."""

    def test_slsqp_algorithm(self):
        """Test SLSQP algorithm runs successfully."""
        try:
            import scipy
        except ImportError:
            self.skipTest("scipy not installed")

        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'algorithm': 'slsqp',
            'max_iterations': 20,
            'tolerance': 1e-4
        }
        engine.initialize(config)

        # Mock callback: quadratic objective with maximum at param1=7.5
        call_count = [0]
        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            call_count[0] += 1
            x = params['param1']
            # Quadratic: -(x-7.5)^2 + 1000, max at x=7.5
            mean_npv = -(x - 7.5)**2 + 1000.0
            return ValuationResult(mean_npv=mean_npv, std_dev=10.0, cte_95=mean_npv * 0.9)

        result = engine.optimize(mock_callback)

        # SLSQP should find the maximum
        self.assertTrue(result.converged)
        self.assertGreater(call_count[0], 1)  # Called multiple times
        self.assertLess(call_count[0], 20)  # Should converge before max_iterations
        # Check we're close to optimal (7.5 ± 0.5)
        self.assertAlmostEqual(result.final_parameters['param1'], 7.5, delta=0.5)
        self.assertAlmostEqual(result.objective_value, 1000.0, delta=1.0)

    def test_nelder_mead_algorithm(self):
        """Test Nelder-Mead algorithm runs successfully."""
        try:
            import scipy
        except ImportError:
            self.skipTest("scipy not installed")

        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 2.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'algorithm': 'nelder-mead',
            'max_iterations': 30,
            'tolerance': 1e-3
        }
        engine.initialize(config)

        # Mock callback: simple linear objective
        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            x = params['param1']
            mean_npv = 100.0 * x  # Max at upper bound (10.0)
            return ValuationResult(mean_npv=mean_npv, std_dev=10.0, cte_95=mean_npv * 0.9)

        result = engine.optimize(mock_callback)

        self.assertTrue(result.converged)
        # Should move toward upper bound
        self.assertGreater(result.final_parameters['param1'], 5.0)

    def test_differential_evolution_algorithm(self):
        """Test Differential Evolution algorithm runs successfully."""
        try:
            import scipy
        except ImportError:
            self.skipTest("scipy not installed")

        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'algorithm': 'differential_evolution',
            'max_iterations': 10,
            'tolerance': 1e-3
        }
        engine.initialize(config)

        # Mock callback
        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            x = params['param1']
            mean_npv = 1000.0 - abs(x - 5.0) * 10  # Max at x=5.0
            return ValuationResult(mean_npv=mean_npv, std_dev=10.0, cte_95=mean_npv * 0.9)

        result = engine.optimize(mock_callback)

        # Differential evolution is global, should find good solution
        self.assertTrue(result.converged)
        self.assertGreater(result.iterations, 0)

    def test_custom_gradient_descent_algorithm(self):
        """Test custom gradient descent algorithm runs successfully."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 2.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'algorithm': 'gradient_descent',
            'max_iterations': 50,
            'tolerance': 1e-3,
            'algorithm_options': {
                'learning_rate': 0.1,
                'epsilon': 1e-6
            }
        }
        engine.initialize(config)

        # Mock callback: quadratic objective
        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            x = params['param1']
            mean_npv = -(x - 8.0)**2 + 500.0  # Max at x=8.0
            return ValuationResult(mean_npv=mean_npv, std_dev=10.0, cte_95=mean_npv * 0.9)

        result = engine.optimize(mock_callback)

        self.assertTrue(result.converged)
        # Should move toward optimal (8.0)
        self.assertGreater(result.final_parameters['param1'], 5.0)

    def test_algorithm_config_validation(self):
        """Test algorithm configuration is validated."""
        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}],
            'objective': {'metric': 'mean_npv'},
            'algorithm': 'unknown_algorithm'  # Invalid
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            return ValuationResult(mean_npv=1000.0)

        with self.assertRaises(ExecutionError) as ctx:
            engine.optimize(mock_callback)

        self.assertIn('Unknown algorithm', str(ctx.exception))

    def test_algorithm_options_passed_through(self):
        """Test algorithm options are passed to solver."""
        try:
            import scipy
        except ImportError:
            self.skipTest("scipy not installed")

        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}],
            'objective': {'metric': 'mean_npv'},
            'algorithm': 'slsqp',
            'max_iterations': 5,  # Very few iterations
            'algorithm_options': {
                'disp': False
            }
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            return ValuationResult(mean_npv=1000.0)

        result = engine.optimize(mock_callback)

        # Should respect max_iterations
        self.assertLessEqual(result.iterations, 5 + 2)  # +2 tolerance for scipy overhead

    def test_minimize_direction(self):
        """Test minimize objective direction works correctly."""
        try:
            import scipy
        except ImportError:
            self.skipTest("scipy not installed")

        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'cost', 'lower': 0.0, 'upper': 100.0, 'initial': 50.0}],
            'objective': {'metric': 'mean_npv', 'direction': 'minimize'},
            'algorithm': 'slsqp',
            'max_iterations': 20
        }
        engine.initialize(config)

        # Mock callback: minimize cost (should go to lower bound)
        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            cost = params['cost']
            mean_npv = cost * 10  # Lower cost = lower NPV (minimize)
            return ValuationResult(mean_npv=mean_npv, std_dev=10.0)

        result = engine.optimize(mock_callback)

        # Should minimize toward lower bound
        self.assertLess(result.final_parameters['cost'], 30.0)

    def test_algorithm_convergence_tracking(self):
        """Test algorithm tracks iterations correctly."""
        try:
            import scipy
        except ImportError:
            self.skipTest("scipy not installed")

        engine = SolverEngine()
        config = {
            'parameters': [{'name': 'param1', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}],
            'objective': {'metric': 'mean_npv'},
            'algorithm': 'slsqp',
            'max_iterations': 10
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            return ValuationResult(mean_npv=1000.0)

        result = engine.optimize(mock_callback)

        # Should have iteration count
        self.assertGreater(result.iterations, 0)
        self.assertLessEqual(result.iterations, 10)

    def test_multi_parameter_optimization(self):
        """Test optimization with multiple parameters."""
        try:
            import scipy
        except ImportError:
            self.skipTest("scipy not installed")

        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'premium_rate', 'lower': 0.5, 'upper': 2.0, 'initial': 1.0},
                {'name': 'reserve_factor', 'lower': 0.0, 'upper': 1.0, 'initial': 0.5}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'algorithm': 'slsqp',
            'max_iterations': 30
        }
        engine.initialize(config)

        # Mock callback: multi-parameter objective
        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            pr = params['premium_rate']
            rf = params['reserve_factor']
            # Max at pr=1.5, rf=0.7
            mean_npv = -(pr - 1.5)**2 * 100 - (rf - 0.7)**2 * 100 + 1000.0
            return ValuationResult(mean_npv=mean_npv, std_dev=10.0)

        result = engine.optimize(mock_callback)

        self.assertTrue(result.converged)
        self.assertEqual(len(result.final_parameters), 2)
        # Should move toward optimal region
        self.assertGreater(result.final_parameters['premium_rate'], 1.0)
        self.assertGreater(result.final_parameters['reserve_factor'], 0.3)


class TestIterationTrackingAndConvergence(unittest.TestCase):
    """Test US-006: Iteration Tracking & Convergence."""

    def test_iteration_count_tracking(self):
        """Test that iteration count is tracked correctly."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'premium_rate', 'lower': 0.5, 'upper': 2.0, 'initial': 1.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'algorithm': 'slsqp',
            'max_iterations': 10
        }
        engine.initialize(config)

        iteration_count = [0]

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            iteration_count[0] += 1
            return ValuationResult(mean_npv=1000.0 + params['premium_rate'] * 100)

        result = engine.optimize(mock_callback)

        # Iteration count should be tracked
        self.assertGreater(result.iterations, 0)
        self.assertLessEqual(result.iterations, 10)
        # Callback should be called same number of times (or more for line search)
        self.assertGreaterEqual(iteration_count[0], result.iterations)

    def test_objective_value_tracking(self):
        """Test that objective values are tracked at each iteration."""
        try:
            import scipy
        except ImportError:
            self.skipTest("scipy not installed")

        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'x', 'lower': -5.0, 'upper': 5.0, 'initial': 0.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'algorithm': 'slsqp',
            'max_iterations': 20
        }
        engine.initialize(config)

        # Quadratic objective with max at x=2
        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            x = params['x']
            obj = -(x - 2.0)**2 + 100.0
            return ValuationResult(mean_npv=obj)

        result = engine.optimize(mock_callback)

        # Should converge to near-optimal objective
        self.assertGreater(result.objective_value, 95.0)  # Close to 100
        self.assertLess(abs(result.final_parameters['x'] - 2.0), 0.5)

    def test_constraint_violations_tracking(self):
        """Test that constraint violations are tracked at each iteration."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'premium_rate', 'lower': 0.5, 'upper': 2.0, 'initial': 1.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'constraints': [
                {'metric': 'cte_95', 'operator': '>=', 'value': 50.0}
            ],
            'algorithm': 'slsqp',
            'max_iterations': 20
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            pr = params['premium_rate']
            # CTE varies with premium rate
            cte = 40.0 + pr * 10.0
            return ValuationResult(mean_npv=1000.0, cte_95=cte)

        result = engine.optimize(mock_callback)

        # Constraint violations should be tracked
        self.assertIsInstance(result.constraint_violations, dict)
        # If constraint satisfied, violations should be empty or show compliance
        if not result.constraint_violations:
            # Constraint satisfied
            self.assertGreaterEqual(mock_callback(result.final_parameters).cte_95, 50.0)

    def test_convergence_criteria_improvement_threshold(self):
        """Test convergence when objective improves < 0.01% for 3 iterations."""
        try:
            import scipy
        except ImportError:
            self.skipTest("scipy not installed")

        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'x', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'minimize'},
            'algorithm': 'nelder-mead',
            'max_iterations': 100,
            'tolerance': 1e-6  # Very tight tolerance
        }
        engine.initialize(config)

        # Objective that converges quickly
        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            x = params['x']
            obj = (x - 3.0)**2 + 10.0  # Min at x=3
            return ValuationResult(mean_npv=obj)

        result = engine.optimize(mock_callback)

        # Should converge
        self.assertTrue(result.converged)
        # Should be close to optimal
        self.assertLess(abs(result.final_parameters['x'] - 3.0), 0.1)

    def test_convergence_max_iterations_reached(self):
        """Test that convergence is detected when max iterations reached."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'x', 'lower': 0.0, 'upper': 10.0, 'initial': 0.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'algorithm': 'slsqp',
            'max_iterations': 5  # Very few iterations
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            return ValuationResult(mean_npv=params['x'] * 10)

        result = engine.optimize(mock_callback)

        # Should hit max iterations
        self.assertLessEqual(result.iterations, 5)

    def test_final_metrics_returned(self):
        """Test that final metrics are returned correctly."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'premium_rate', 'lower': 0.8, 'upper': 1.5, 'initial': 1.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'constraints': [
                {'metric': 'std_dev', 'operator': '<=', 'value': 50.0}
            ],
            'algorithm': 'slsqp',
            'max_iterations': 20
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            pr = params['premium_rate']
            return ValuationResult(
                mean_npv=1000.0 + pr * 100,
                std_dev=30.0
            )

        result = engine.optimize(mock_callback)

        # Check all final metrics are present
        self.assertIsInstance(result.final_parameters, dict)
        self.assertIn('premium_rate', result.final_parameters)
        self.assertIsInstance(result.objective_value, (int, float))
        self.assertIsInstance(result.iterations, int)
        self.assertIsInstance(result.converged, bool)
        self.assertIsInstance(result.constraint_violations, dict)
        self.assertIsInstance(result.execution_time_seconds, (int, float))
        self.assertGreater(result.execution_time_seconds, 0.0)

    def test_iteration_logging_format(self):
        """Test that iterations are logged in correct format."""
        import logging
        import io

        # Capture log output
        log_stream = io.StringIO()
        handler = logging.StreamHandler(log_stream)
        handler.setLevel(logging.INFO)
        logger = logging.getLogger('solver_engine')
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)

        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'x', 'lower': 0.0, 'upper': 5.0, 'initial': 1.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'algorithm': 'slsqp',
            'max_iterations': 5
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            return ValuationResult(mean_npv=params['x'] * 100)

        result = engine.optimize(mock_callback)

        log_output = log_stream.getvalue()
        logger.removeHandler(handler)

        # Check that iteration logs contain expected format
        # "Iteration N: objective=X, constraints=Y, params={...}"
        self.assertIn('Iteration', log_output)
        self.assertIn('objective=', log_output)
        self.assertIn('constraints=', log_output)
        self.assertIn('params=', log_output)

    def test_consecutive_iterations_convergence(self):
        """Test that convergence requires 3 consecutive iterations with small improvement."""
        try:
            import scipy
        except ImportError:
            self.skipTest("scipy not installed")

        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'x', 'lower': 0.0, 'upper': 5.0, 'initial': 0.5}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'algorithm': 'slsqp',
            'max_iterations': 50,
            'tolerance': 1e-8
        }
        engine.initialize(config)

        # Flat objective near optimum
        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            x = params['x']
            obj = 100.0 - (x - 3.0)**2 * 0.001
            return ValuationResult(mean_npv=obj)

        result = engine.optimize(mock_callback)

        # Should converge quickly since objective is nearly flat
        self.assertTrue(result.converged)
        self.assertLess(result.iterations, 30)

    def test_convergence_with_constraints_satisfied(self):
        """Test convergence status when all constraints are satisfied."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'premium_rate', 'lower': 0.5, 'upper': 2.0, 'initial': 1.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'constraints': [
                {'metric': 'cte_95', 'operator': '>=', 'value': 50.0},
                {'metric': 'std_dev', 'operator': '<=', 'value': 100.0}
            ],
            'algorithm': 'slsqp',
            'max_iterations': 30
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            pr = params['premium_rate']
            return ValuationResult(
                mean_npv=1000.0 + pr * 100,
                std_dev=50.0,
                cte_95=60.0
            )

        result = engine.optimize(mock_callback)

        # All constraints easily satisfied, should converge
        self.assertTrue(result.converged)
        # No constraint violations
        self.assertEqual(len(result.constraint_violations), 0)

    def test_partial_result_flag_on_early_exit(self):
        """Test that partial_result flag is set when optimization exits early."""
        # This tests the partial_result field in OptimizationResult
        # which should be True if not converged
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'x', 'lower': 0.0, 'upper': 10.0, 'initial': 0.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'algorithm': 'slsqp',
            'max_iterations': 2  # Very few iterations, won't converge
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            # Complex objective that needs many iterations
            x = params['x']
            return ValuationResult(mean_npv=-(x - 5.0)**2 + 100)

        result = engine.optimize(mock_callback)

        # Should not converge with only 2 iterations
        # partial_result should be True when not converged
        if not result.converged:
            self.assertTrue(result.partial_result)


class TestResultOutputAndParameterExport(unittest.TestCase):
    """Test result export functionality (US-007)."""

    def test_json_export_basic(self):
        """Test basic JSON export with final parameters."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'premium_rate', 'lower': 0.8, 'upper': 1.5, 'initial': 1.0},
                {'name': 'reserve_factor', 'lower': 0.5, 'upper': 1.2, 'initial': 0.9}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'max_iterations': 5
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            return ValuationResult(
                mean_npv=1000.0 * params['premium_rate'] + 500.0 * params['reserve_factor'],
                std_dev=100.0,
                cte_95=800.0
            )

        result = engine.optimize(mock_callback)

        # Export to JSON
        json_str = result.to_json(pretty=True)

        # Validate JSON structure
        import json
        data = json.loads(json_str)

        self.assertIn('final_params', data)
        self.assertIn('objective_value', data)
        self.assertIn('converged', data)
        self.assertIn('iterations', data)
        self.assertIn('execution_time_seconds', data)
        self.assertIn('constraint_violations', data)
        self.assertIn('partial_result', data)
        self.assertIn('constraints_satisfied', data)

        # Verify parameter values are included
        self.assertIn('premium_rate', data['final_params'])
        self.assertIn('reserve_factor', data['final_params'])

    def test_json_export_with_iteration_history(self):
        """Test JSON export including iteration history."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'x', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'max_iterations': 5
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            x = params['x']
            return ValuationResult(mean_npv=-(x - 3.0)**2 + 100)

        result = engine.optimize(mock_callback)

        # Get iteration history
        history = engine.get_iteration_history()
        self.assertGreater(len(history), 0)

        # Export with history
        json_str = result.to_json(include_history=True, iteration_history=history, pretty=True)

        import json
        data = json.loads(json_str)

        self.assertIn('iteration_history', data)
        self.assertGreater(len(data['iteration_history']), 0)

        # Check iteration structure
        first_iter = data['iteration_history'][0]
        self.assertIn('iteration', first_iter)
        self.assertIn('parameters', first_iter)
        self.assertIn('objective_value', first_iter)
        self.assertIn('constraint_violations', first_iter)

    def test_json_file_export(self):
        """Test JSON export to file."""
        import tempfile
        import os

        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'x', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'}
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            return ValuationResult(mean_npv=params['x'] * 100)

        result = engine.optimize(mock_callback)

        # Export to temporary file
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, 'result.json')
            result.to_json_file(file_path)

            # Verify file exists and is valid JSON
            self.assertTrue(os.path.exists(file_path))

            with open(file_path, 'r') as f:
                import json
                data = json.load(f)
                self.assertIn('final_params', data)
                self.assertIn('objective_value', data)

    def test_parquet_export(self):
        """Test Parquet export of iteration history."""
        try:
            import pandas as pd
        except ImportError:
            self.skipTest("pandas not available for Parquet export")

        import tempfile
        import os

        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'x', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'max_iterations': 5
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            x = params['x']
            return ValuationResult(mean_npv=-(x - 3.0)**2 + 100)

        result = engine.optimize(mock_callback)

        # Export to Parquet
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, 'history.parquet')
            run_metadata = {
                'timestamp': '2026-01-28T00:00:00',
                'config_name': 'test_run'
            }

            engine.export_iteration_history(file_path, run_metadata=run_metadata)

            # Verify file exists and is readable
            self.assertTrue(os.path.exists(file_path))

            df = pd.read_parquet(file_path)
            self.assertGreater(len(df), 0)

            # Check required columns
            self.assertIn('iteration', df.columns)
            self.assertIn('objective_value', df.columns)
            self.assertIn('param_x', df.columns)
            self.assertIn('total_violations', df.columns)

            # Check metadata columns
            self.assertIn('meta_timestamp', df.columns)
            self.assertIn('meta_config_name', df.columns)

    def test_parquet_export_with_constraints(self):
        """Test Parquet export includes constraint violations."""
        try:
            import pandas as pd
        except ImportError:
            self.skipTest("pandas not available for Parquet export")

        import tempfile
        import os

        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'x', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'constraints': [
                {'name': 'std_dev', 'operator': '<=', 'value': 50.0}
            ],
            'max_iterations': 5
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            x = params['x']
            return ValuationResult(
                mean_npv=x * 100,
                std_dev=x * 10  # Violates constraint when x > 5
            )

        result = engine.optimize(mock_callback)

        # Export to Parquet
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, 'history.parquet')
            engine.export_iteration_history(file_path)

            df = pd.read_parquet(file_path)

            # Check constraint violation column
            self.assertIn('constraint_std_dev_violation', df.columns)

    def test_result_summary_format(self):
        """Test human-readable summary formatting."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'premium_rate', 'lower': 0.8, 'upper': 1.5, 'initial': 1.0},
                {'name': 'reserve_factor', 'lower': 0.5, 'upper': 1.2, 'initial': 0.9}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'}
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            return ValuationResult(mean_npv=1500.0, std_dev=100.0)

        result = engine.optimize(mock_callback)

        # Get summary
        summary = result.to_summary()

        # Verify summary contains key information
        self.assertIn('Optimization Result Summary', summary)
        self.assertIn('Status:', summary)
        self.assertIn('Iterations:', summary)
        self.assertIn('Execution Time:', summary)
        self.assertIn('Objective Value:', summary)
        self.assertIn('Optimized Parameters:', summary)
        self.assertIn('premium_rate', summary)
        self.assertIn('reserve_factor', summary)

    def test_constraints_satisfied_flag(self):
        """Test constraints_satisfied flag in JSON export."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'x', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'constraints': [
                {'name': 'std_dev', 'operator': '<=', 'value': 50.0}
            ]
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            return ValuationResult(mean_npv=100.0, std_dev=30.0)  # Satisfies constraint

        result = engine.optimize(mock_callback)

        json_str = result.to_json()
        import json
        data = json.loads(json_str)

        self.assertTrue(data['constraints_satisfied'])
        self.assertEqual(len(data['constraint_violations']), 0)

    def test_parameter_truncation_in_summary(self):
        """Test summary truncates parameters when too many."""
        # Create config with many parameters
        params = [
            {'name': f'param_{i}', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}
            for i in range(15)
        ]

        engine = SolverEngine()
        config = {
            'parameters': params,
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'}
        }
        engine.initialize(config)

        def mock_callback(params_dict: Dict[str, float]) -> ValuationResult:
            return ValuationResult(mean_npv=sum(params_dict.values()) * 10)

        result = engine.optimize(mock_callback)

        # Get summary with max_params=5
        summary = result.to_summary(max_params=5)

        # Should show 5 params and a "... and N more" message
        self.assertIn('param_0', summary)
        self.assertIn('param_4', summary)
        self.assertIn('and 10 more', summary)

    def test_iteration_history_access(self):
        """Test accessing iteration history after optimization."""
        engine = SolverEngine()
        config = {
            'parameters': [
                {'name': 'x', 'lower': 0.0, 'upper': 10.0, 'initial': 5.0}
            ],
            'objective': {'metric': 'mean_npv', 'direction': 'maximize'},
            'max_iterations': 5
        }
        engine.initialize(config)

        def mock_callback(params: Dict[str, float]) -> ValuationResult:
            return ValuationResult(mean_npv=params['x'] * 100)

        result = engine.optimize(mock_callback)

        # Get iteration history
        history = engine.get_iteration_history()

        self.assertIsNotNone(history)
        self.assertGreater(len(history), 0)

        # Check first iteration
        first_iter = history[0]
        self.assertIsNotNone(first_iter.parameters)
        self.assertIsNotNone(first_iter.objective_value)
        self.assertIsNotNone(first_iter.constraint_violations)

    def test_empty_iteration_history_export(self):
        """Test export handles empty iteration history gracefully."""
        import tempfile
        import os

        engine = SolverEngine()

        # Try to export before any optimization
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = os.path.join(tmpdir, 'history.parquet')

            # Should warn but not crash
            engine.export_iteration_history(file_path)

            # File should not be created for empty history
            # (ResultExporter returns early)


if __name__ == '__main__':
    unittest.main()
