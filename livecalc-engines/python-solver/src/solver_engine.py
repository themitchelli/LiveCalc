"""
Python Solver Engine for Parameter Optimization.

Implements ICalcEngine interface for iterative optimization of actuarial parameters
(premium rates, reserve factors, dividend percentages) to meet business objectives.
"""

import time
import signal
from typing import Any, Callable, Dict, List, Optional
from dataclasses import dataclass, field
import logging
import sys
import os
import numpy as np

from .calc_engine_interface import (
    ICalcEngine,
    EngineInfo,
    InitializationError,
    ConfigurationError,
    ExecutionError,
    TimeoutError,
    ConvergenceError
)

from .solver_algorithms import (
    AlgorithmConfig,
    OptimizerCallback,
    select_and_run_algorithm
)

# Import AssumptionsClient if available
try:
    # Add assumptions library to path
    assumptions_lib_path = os.path.join(
        os.path.dirname(__file__),
        '../../../../livecalc-assumptions-lib/src/python'
    )
    if os.path.exists(assumptions_lib_path):
        sys.path.insert(0, assumptions_lib_path)

    from assumptions_client import AssumptionsClient, AssumptionsError
    ASSUMPTIONS_CLIENT_AVAILABLE = True
except ImportError:
    ASSUMPTIONS_CLIENT_AVAILABLE = False
    AssumptionsClient = None
    AssumptionsError = Exception


logger = logging.getLogger(__name__)


@dataclass
class OptimizationResult:
    """Result of optimization with final parameters and convergence metrics."""
    final_parameters: Dict[str, float]
    objective_value: float
    iterations: int
    converged: bool
    constraint_violations: Dict[str, float] = field(default_factory=dict)
    execution_time_seconds: float = 0.0
    partial_result: bool = False  # True if timeout or early exit


@dataclass
class ValuationResult:
    """Mock valuation result structure (matches projection engine output)."""
    mean_npv: float
    std_dev: float = 0.0
    cte_95: float = 0.0
    percentiles: Dict[str, float] = field(default_factory=dict)


@dataclass
class CalibrationTargets:
    """Calibration targets resolved from Assumptions Manager."""
    objective_function: str  # e.g., 'maximize_return', 'minimize_cost', 'hit_target'
    objective_metric: str    # e.g., 'mean_npv', 'cte_95', 'std_dev'
    constraints: List[Dict[str, Any]] = field(default_factory=list)
    version: str = 'unknown'

    def validate(self) -> None:
        """
        Validate calibration targets structure.

        Raises:
            ConfigurationError: If targets are invalid
        """
        # Validate objective function
        valid_objectives = ['maximize_return', 'minimize_cost', 'hit_target', 'maximize', 'minimize']
        if self.objective_function not in valid_objectives:
            raise ConfigurationError(
                f"Invalid objective_function '{self.objective_function}'. "
                f"Expected one of: {valid_objectives}"
            )

        # Validate objective metric
        valid_metrics = ['mean_npv', 'std_dev', 'cte_95', 'return', 'cost', 'solvency']
        if self.objective_metric not in valid_metrics:
            raise ConfigurationError(
                f"Invalid objective_metric '{self.objective_metric}'. "
                f"Expected one of: {valid_metrics}"
            )

        # Validate constraints structure
        for i, constraint in enumerate(self.constraints):
            if not isinstance(constraint, dict):
                raise ConfigurationError(f"Constraint {i} must be a dict, got: {type(constraint)}")

            required_fields = ['name', 'operator', 'value']
            missing = [f for f in required_fields if f not in constraint]
            if missing:
                raise ConfigurationError(
                    f"Constraint {i} missing required fields: {missing}. "
                    f"Expected: {required_fields}"
                )

            # Validate operator
            valid_operators = ['>=', '<=', '>', '<', '==']
            if constraint['operator'] not in valid_operators:
                raise ConfigurationError(
                    f"Constraint {i} has invalid operator '{constraint['operator']}'. "
                    f"Expected one of: {valid_operators}"
                )

            # Validate value is numeric
            try:
                float(constraint['value'])
            except (ValueError, TypeError):
                raise ConfigurationError(
                    f"Constraint {i} value '{constraint['value']}' is not numeric"
                )

    def check_conflicting_constraints(self) -> List[str]:
        """
        Check for potentially conflicting constraints.

        Returns:
            List of warning messages about potential conflicts
        """
        warnings = []

        # Group constraints by name
        by_name: Dict[str, List[Dict[str, Any]]] = {}
        for constraint in self.constraints:
            name = constraint['name']
            if name not in by_name:
                by_name[name] = []
            by_name[name].append(constraint)

        # Check for conflicting bounds on same metric
        for name, constraints_list in by_name.items():
            if len(constraints_list) < 2:
                continue

            # Extract bounds
            lower_bounds = []
            upper_bounds = []
            for c in constraints_list:
                op = c['operator']
                val = float(c['value'])
                if op in ['>=', '>']:
                    lower_bounds.append(val)
                elif op in ['<=', '<']:
                    upper_bounds.append(val)

            # Check if lower > upper (impossible to satisfy)
            if lower_bounds and upper_bounds:
                max_lower = max(lower_bounds)
                min_upper = min(upper_bounds)
                if max_lower > min_upper:
                    warnings.append(
                        f"Constraint '{name}' may be infeasible: "
                        f"requires >= {max_lower} and <= {min_upper}"
                    )

        return warnings


# Type alias for projection callback
ProjectionCallback = Callable[[Dict[str, float]], ValuationResult]


class TimeoutException(Exception):
    """Internal exception for timeout handling."""
    pass


def timeout_handler(signum, frame):
    """Signal handler for timeout."""
    raise TimeoutException("Optimization timed out")


class SolverEngine(ICalcEngine):
    """
    Python Solver Engine implementing ICalcEngine interface.

    Optimizes actuarial parameters iteratively by calling the projection engine
    and adjusting parameters based on results.
    """

    def __init__(self):
        """Initialize solver engine."""
        self._initialized = False
        self._config: Optional[Dict[str, Any]] = None
        self._credentials: Optional[Dict[str, Any]] = None
        self._timeout_seconds = 300  # 5 minutes default
        self._calibration_targets: Optional[CalibrationTargets] = None
        self._assumptions_client: Optional[AssumptionsClient] = None

    def initialize(self, config: Dict[str, Any], credentials: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize solver with configuration.

        Args:
            config: Solver configuration including:
                - parameters: list of parameters to optimize
                - objective: objective function definition
                - constraints: list of constraints
                - algorithm: solver algorithm to use
                - timeout_seconds: optional timeout (default 300)
            credentials: Optional AM credentials

        Raises:
            InitializationError: If config is invalid
        """
        logger.info("Initializing SolverEngine")

        # Validate required config fields
        required_fields = ['parameters', 'objective']
        missing_fields = [f for f in required_fields if f not in config]
        if missing_fields:
            raise InitializationError(f"Missing required config fields: {missing_fields}")

        # Validate parameters structure
        if not isinstance(config['parameters'], list) or len(config['parameters']) == 0:
            raise InitializationError("Config 'parameters' must be a non-empty list")

        # Comprehensive parameter validation (US-003)
        self._validate_parameters(config['parameters'])

        # Validate objective structure
        if not isinstance(config['objective'], dict) or 'metric' not in config['objective']:
            raise InitializationError("Config 'objective' must be a dict with 'metric' field")

        # Store config
        self._config = config
        self._credentials = credentials

        # Set timeout if specified
        if 'timeout_seconds' in config:
            self._timeout_seconds = int(config['timeout_seconds'])
            if self._timeout_seconds <= 0 or self._timeout_seconds > 3600:
                raise ConfigurationError(f"timeout_seconds must be between 1 and 3600, got: {self._timeout_seconds}")

        # Resolve calibration targets if specified
        if 'calibration_targets' in config:
            self._resolve_calibration_targets(config['calibration_targets'], credentials)

        self._initialized = True
        logger.info(f"SolverEngine initialized with {len(config['parameters'])} parameters, timeout={self._timeout_seconds}s")

    def get_info(self) -> EngineInfo:
        """Get engine metadata."""
        return EngineInfo(
            name="PythonSolverEngine",
            version="1.0.0",
            engine_type="solver"
        )

    @property
    def is_initialized(self) -> bool:
        """Check if engine is initialized."""
        return self._initialized

    def optimize(
        self,
        projection_callback: ProjectionCallback,
        initial_parameters: Optional[Dict[str, float]] = None
    ) -> OptimizationResult:
        """
        Run optimization using projection callback.

        Args:
            projection_callback: Function that takes parameter dict and returns ValuationResult
            initial_parameters: Optional override for initial parameter values

        Returns:
            OptimizationResult with final parameters and metrics

        Raises:
            ExecutionError: If optimization fails
            TimeoutError: If optimization exceeds timeout
            ConvergenceError: If optimization diverges
        """
        if not self._initialized:
            raise ExecutionError("Engine not initialized. Call initialize() first.")

        logger.info("Starting optimization")
        start_time = time.time()

        # Get initial parameters
        if initial_parameters is None:
            initial_parameters = {
                p['name']: p['initial']
                for p in self._config['parameters']
            }

        # Set up timeout
        old_handler = signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(self._timeout_seconds)

        try:
            # Run optimization with timeout protection
            result = self._run_optimization_loop(projection_callback, initial_parameters)

            # Cancel timeout
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)

            # Calculate execution time
            result.execution_time_seconds = time.time() - start_time

            logger.info(f"Optimization completed: converged={result.converged}, iterations={result.iterations}, time={result.execution_time_seconds:.2f}s")

            return result

        except TimeoutException:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)

            # Return best result found so far with partial flag
            elapsed = time.time() - start_time
            logger.warning(f"Optimization timed out after {elapsed:.2f}s")

            raise TimeoutError(f"Optimization exceeded timeout of {self._timeout_seconds}s")

        except Exception as e:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)
            logger.error(f"Optimization failed: {e}")
            raise ExecutionError(f"Optimization failed: {e}") from e

    def _run_optimization_loop(
        self,
        projection_callback: ProjectionCallback,
        initial_parameters: Dict[str, float]
    ) -> OptimizationResult:
        """
        Internal optimization loop using configured algorithm.

        US-005: Supports multiple solver algorithms (SLSQP, Nelder-Mead,
        differential_evolution, custom gradient descent).

        Args:
            projection_callback: Projection function
            initial_parameters: Starting parameters

        Returns:
            OptimizationResult

        Raises:
            ConfigurationError: If algorithm config invalid
            ConvergenceError: If optimization diverges
        """
        # Get algorithm configuration from config
        algorithm_name = self._config.get('algorithm', 'slsqp')
        max_iterations = self._config.get('max_iterations', 20)
        tolerance = self._config.get('tolerance', 1e-4)
        algorithm_options = self._config.get('algorithm_options', {})

        algorithm_config = AlgorithmConfig(
            algorithm=algorithm_name,
            max_iterations=max_iterations,
            tolerance=tolerance,
            options=algorithm_options
        )

        # Extract parameter metadata
        parameter_names = [p['name'] for p in self._config['parameters']]
        bounds = [(p['lower'], p['upper']) for p in self._config['parameters']]

        # Convert initial parameters to numpy array
        initial_array = np.array([initial_parameters[name] for name in parameter_names])

        # Determine objective direction
        direction = self._config['objective'].get('direction', 'maximize')

        # Create optimizer callback wrapper
        callback = OptimizerCallback(
            parameter_names=parameter_names,
            projection_callback=projection_callback,
            objective_extractor=self._extract_objective,
            constraint_evaluator=self._evaluate_constraints,
            direction=direction
        )

        # Run selected algorithm
        try:
            logger.info(f"Running {algorithm_name} algorithm with {len(parameter_names)} parameters")
            scipy_result = select_and_run_algorithm(
                algorithm_config,
                parameter_names,
                initial_array,
                bounds,
                callback
            )

            # Convert result back to our format
            final_params = {
                name: float(val)
                for name, val in zip(parameter_names, scipy_result.x)
            }

            # Get final objective from last iteration in history
            if callback.iteration_history:
                last_iteration = callback.iteration_history[-1]
                final_objective = last_iteration.objective_value
                final_violations = last_iteration.constraint_violations
            else:
                # Fallback if no history (shouldn't happen)
                final_objective = scipy_result.fun if direction == 'minimize' else -scipy_result.fun
                final_violations = {}

            # Check convergence
            converged = scipy_result.success

            return OptimizationResult(
                final_parameters=final_params,
                objective_value=final_objective,
                iterations=scipy_result.nit,
                converged=converged,
                constraint_violations=final_violations,
                execution_time_seconds=0.0,  # Will be set by caller
                partial_result=not converged
            )

        except TimeoutException:
            # Re-raise timeout exception so it's caught by outer handler
            raise
        except Exception as e:
            logger.error(f"Optimization failed: {e}")
            raise ExecutionError(f"Optimization failed: {e}") from e

    def _extract_objective(self, result: ValuationResult) -> float:
        """
        Extract objective value from valuation result.

        Supports both standard metrics and custom computed metrics.

        Args:
            result: ValuationResult from projection

        Returns:
            Objective value based on config

        Raises:
            ConfigurationError: If objective metric not found
        """
        metric = self._config['objective']['metric']

        # Check if it's a custom metric with computation
        if 'custom_metrics' in self._config and metric in self._config['custom_metrics']:
            return self._compute_custom_metric(metric, result)

        # Standard metric extraction
        if hasattr(result, metric):
            return getattr(result, metric)
        else:
            raise ConfigurationError(f"Objective metric '{metric}' not found in ValuationResult")

    def _compute_custom_metric(self, metric_name: str, result: ValuationResult) -> float:
        """
        Compute custom metric from valuation result.

        Supports expressions like:
        - 'cost_per_policy = total_cost / num_policies'
        - 'return_on_investment = mean_npv / initial_investment'

        Args:
            metric_name: Name of custom metric
            result: ValuationResult from projection

        Returns:
            Computed metric value

        Raises:
            ConfigurationError: If custom metric cannot be computed
        """
        custom_metrics = self._config['custom_metrics']
        metric_def = custom_metrics[metric_name]

        if not isinstance(metric_def, str):
            raise ConfigurationError(
                f"Custom metric '{metric_name}' must be a string expression, got: {type(metric_def)}"
            )

        # Parse expression (simple format: "numerator / denominator")
        if '/' in metric_def:
            parts = metric_def.split('/')
            if len(parts) != 2:
                raise ConfigurationError(
                    f"Custom metric '{metric_name}' expression must have format 'a / b', got: {metric_def}"
                )

            numerator_name = parts[0].strip()
            denominator_name = parts[1].strip()

            # Extract values
            numerator = self._extract_value_from_result(numerator_name, result)
            denominator = self._extract_value_from_result(denominator_name, result)

            if denominator == 0:
                raise ConfigurationError(
                    f"Custom metric '{metric_name}' division by zero: {denominator_name} = 0"
                )

            return numerator / denominator

        elif '*' in metric_def:
            parts = metric_def.split('*')
            if len(parts) != 2:
                raise ConfigurationError(
                    f"Custom metric '{metric_name}' expression must have format 'a * b', got: {metric_def}"
                )

            left_name = parts[0].strip()
            right_name = parts[1].strip()

            left = self._extract_value_from_result(left_name, result)
            right = self._extract_value_from_result(right_name, result)

            return left * right

        else:
            # Single value (just an alias)
            return self._extract_value_from_result(metric_def.strip(), result)

    def _extract_value_from_result(self, value_name: str, result: ValuationResult) -> float:
        """
        Extract a value from valuation result by name.

        Args:
            value_name: Name of value (can be attribute or literal number)
            result: ValuationResult from projection

        Returns:
            Extracted value

        Raises:
            ConfigurationError: If value not found
        """
        # Try to parse as literal number first
        try:
            return float(value_name)
        except ValueError:
            pass

        # Check if it's an attribute of result
        if hasattr(result, value_name):
            return float(getattr(result, value_name))

        # Check percentiles dict
        if hasattr(result, 'percentiles') and value_name in result.percentiles:
            return float(result.percentiles[value_name])

        raise ConfigurationError(
            f"Value '{value_name}' not found in ValuationResult. "
            f"Available: {[attr for attr in dir(result) if not attr.startswith('_')]}"
        )

    def _evaluate_constraints(self, result: ValuationResult) -> Dict[str, float]:
        """
        Evaluate all constraints against valuation result.

        Args:
            result: ValuationResult from projection

        Returns:
            Dictionary of constraint violations (empty if all satisfied)
            Format: {constraint_name: violation_amount}
            Positive violation = constraint violated by that amount
            Zero or negative = constraint satisfied

        Raises:
            ConfigurationError: If constraint metric not found
        """
        violations = {}

        # Get constraints from config or calibration targets
        constraints = []
        if 'constraints' in self._config:
            constraints = self._config['constraints']
        elif self._calibration_targets and self._calibration_targets.constraints:
            constraints = self._calibration_targets.constraints

        for constraint in constraints:
            name = constraint['name']
            operator = constraint['operator']
            target_value = float(constraint['value'])

            # Extract actual value from result
            try:
                # Check if it's a custom metric
                if 'custom_metrics' in self._config and name in self._config['custom_metrics']:
                    actual_value = self._compute_custom_metric(name, result)
                else:
                    actual_value = self._extract_value_from_result(name, result)
            except ConfigurationError as e:
                raise ConfigurationError(
                    f"Cannot evaluate constraint '{name}': {e}"
                ) from e

            # Evaluate constraint
            violation = self._check_constraint(actual_value, operator, target_value, name)
            if violation > 0:
                violations[name] = violation

        return violations

    def _check_constraint(
        self,
        actual: float,
        operator: str,
        target: float,
        name: str
    ) -> float:
        """
        Check if constraint is satisfied.

        Args:
            actual: Actual value from result
            operator: Comparison operator (>=, <=, >, <, ==)
            target: Target value from constraint
            name: Constraint name for logging

        Returns:
            Violation amount (0 or negative if satisfied, positive if violated)
        """
        if operator == '>=':
            # Violation if actual < target
            return max(0, target - actual)
        elif operator == '>':
            # Violation if actual <= target
            return max(0, target - actual + 1e-9)
        elif operator == '<=':
            # Violation if actual > target
            return max(0, actual - target)
        elif operator == '<':
            # Violation if actual >= target
            return max(0, actual - target + 1e-9)
        elif operator == '==':
            # Violation is absolute difference
            diff = abs(actual - target)
            # Consider satisfied if within 0.1% tolerance
            tolerance = abs(target * 0.001) if target != 0 else 1e-9
            return max(0, diff - tolerance)
        else:
            raise ConfigurationError(
                f"Unknown constraint operator '{operator}' for constraint '{name}'"
            )

    def _apply_objective_direction(self, objective_value: float) -> float:
        """
        Apply objective function direction (maximize vs minimize).

        For minimization, returns negative of objective so that
        optimization algorithms can always maximize.

        Args:
            objective_value: Raw objective value

        Returns:
            Adjusted objective value based on direction
        """
        # Check calibration targets first
        if self._calibration_targets:
            direction = self._calibration_targets.objective_function
            if 'minimize' in direction.lower():
                return -objective_value
            else:
                return objective_value

        # Check config objective direction
        if 'objective' in self._config and 'direction' in self._config['objective']:
            direction = self._config['objective']['direction'].lower()
            if direction == 'minimize':
                return -objective_value

        # Default: maximize
        return objective_value

    def _validate_parameters(self, parameters: List[Dict[str, Any]]) -> None:
        """
        Validate parameter definitions comprehensively (US-003).

        Validates:
        - Required fields (name, initial, lower, upper)
        - Parameter types (continuous/discrete)
        - Bounds validity (lower < upper)
        - Initial value within bounds
        - Step size for discrete parameters

        Args:
            parameters: List of parameter definitions

        Raises:
            InitializationError: If any parameter is invalid
        """
        for i, param in enumerate(parameters):
            # Check if parameter is a dict
            if not isinstance(param, dict):
                raise InitializationError(f"Parameter {i} must be a dict, got: {type(param)}")

            # Check required fields
            required_fields = ['name', 'initial', 'lower', 'upper']
            missing_fields = [f for f in required_fields if f not in param]
            if missing_fields:
                raise InitializationError(
                    f"Parameter {i} ('{param.get('name', 'unknown')}') missing required fields: {missing_fields}. "
                    f"Required: {required_fields}"
                )

            param_name = param['name']

            # Validate parameter type (continuous or discrete)
            param_type = param.get('type', 'continuous')  # default to continuous
            valid_types = ['continuous', 'discrete']
            if param_type not in valid_types:
                raise InitializationError(
                    f"Parameter '{param_name}' has invalid type '{param_type}'. "
                    f"Expected one of: {valid_types}"
                )

            # Validate bounds are numeric
            try:
                lower = float(param['lower'])
                upper = float(param['upper'])
                initial = float(param['initial'])
            except (ValueError, TypeError) as e:
                raise InitializationError(
                    f"Parameter '{param_name}' has non-numeric bound: {e}"
                )

            # Validate lower < upper
            if lower >= upper:
                raise InitializationError(
                    f"Parameter '{param_name}' has invalid bounds: lower ({lower}) must be < upper ({upper})"
                )

            # Validate initial value is within bounds
            if initial < lower or initial > upper:
                raise InitializationError(
                    f"Parameter '{param_name}' initial value ({initial}) is outside bounds [{lower}, {upper}]"
                )

            # Validate step size for discrete parameters
            if param_type == 'discrete':
                if 'step' not in param:
                    raise InitializationError(
                        f"Discrete parameter '{param_name}' missing required 'step' field"
                    )

                try:
                    step = float(param['step'])
                except (ValueError, TypeError) as e:
                    raise InitializationError(
                        f"Parameter '{param_name}' has non-numeric step: {e}"
                    )

                if step <= 0:
                    raise InitializationError(
                        f"Parameter '{param_name}' step size ({step}) must be positive"
                    )

                # Validate that the range is divisible by step (warn if not exact)
                range_size = upper - lower
                num_steps = range_size / step
                if abs(num_steps - round(num_steps)) > 1e-6:
                    logger.warning(
                        f"Parameter '{param_name}': range ({lower} to {upper}) is not evenly divisible by step ({step}). "
                        f"This may cause unexpected behavior."
                    )

        # Check for duplicate parameter names
        param_names = [p['name'] for p in parameters]
        duplicates = [name for name in param_names if param_names.count(name) > 1]
        if duplicates:
            raise InitializationError(
                f"Duplicate parameter names found: {set(duplicates)}"
            )

    def _resolve_calibration_targets(
        self,
        targets_config: Dict[str, Any],
        credentials: Optional[Dict[str, Any]]
    ) -> None:
        """
        Resolve calibration targets from Assumptions Manager.

        Args:
            targets_config: Configuration with AM reference or inline targets
            credentials: Optional AM credentials

        Raises:
            InitializationError: If targets cannot be resolved
            ConfigurationError: If targets are invalid
        """
        # Check if AM reference is provided first
        has_am_reference = 'am_reference' in targets_config

        # If AM reference provided but client not available, fail early
        if has_am_reference and not ASSUMPTIONS_CLIENT_AVAILABLE:
            am_ref = targets_config['am_reference']
            raise InitializationError(
                f"AM reference '{am_ref}' specified but AssumptionsClient not available. "
                "Either install assumptions_client or use inline targets."
            )

        # If no AM reference, use inline targets
        if not has_am_reference:
            # Use inline targets
            if 'objective_function' in targets_config and 'objective_metric' in targets_config:
                targets = CalibrationTargets(
                    objective_function=targets_config['objective_function'],
                    objective_metric=targets_config['objective_metric'],
                    constraints=targets_config.get('constraints', []),
                    version='inline'
                )
                targets.validate()
                self._calibration_targets = targets
                logger.info(f"Using inline calibration targets: {targets.objective_function} {targets.objective_metric}")
                return
            else:
                raise InitializationError(
                    "calibration_targets must have either 'am_reference' or inline target specification "
                    "(objective_function, objective_metric)"
                )

        # Extract AM reference (format: "table-name:version")
        am_ref = targets_config['am_reference']
        if ':' not in am_ref:
            raise InitializationError(
                f"Invalid AM reference format '{am_ref}'. Expected 'table-name:version' "
                f"(e.g., 'calibration-targets:v1.0')"
            )

        table_name, version = am_ref.split(':', 1)

        # Check credentials
        if not credentials or 'am_url' not in credentials or 'jwt_token' not in credentials:
            raise InitializationError(
                "Assumptions Manager credentials required for AM reference. "
                "Provide credentials with 'am_url' and 'jwt_token'."
            )

        # Initialize AM client
        try:
            self._assumptions_client = AssumptionsClient(
                am_url=credentials['am_url'],
                jwt_token=credentials['jwt_token'],
                cache_dir=credentials.get('cache_dir')
            )
            logger.info(f"Initialized AssumptionsClient for {credentials['am_url']}")
        except Exception as e:
            raise InitializationError(f"Failed to initialize AssumptionsClient: {e}") from e

        # Resolve calibration targets from AM
        try:
            logger.info(f"Resolving calibration targets from AM: {am_ref}")

            # Fetch target data from AM
            # Expected format: dict with objective_function, objective_metric, constraints
            target_data_raw = self._assumptions_client.resolve(table_name, version)

            # Convert numpy array to dict if needed
            if hasattr(target_data_raw, 'tolist'):
                # If it's a structured array, convert to dict
                target_data = target_data_raw.item() if target_data_raw.ndim == 0 else target_data_raw.tolist()
            else:
                target_data = target_data_raw

            # If target_data is a list, assume it's JSON-encoded dict as first element
            if isinstance(target_data, list) and len(target_data) > 0:
                import json
                if isinstance(target_data[0], str):
                    target_data = json.loads(target_data[0])
                else:
                    target_data = target_data[0]

            # Parse target data
            if not isinstance(target_data, dict):
                raise ConfigurationError(
                    f"Expected calibration targets to be a dict, got: {type(target_data)}"
                )

            # Extract fields
            if 'objective_function' not in target_data:
                raise ConfigurationError(
                    f"Calibration targets missing 'objective_function' field. "
                    f"Available fields: {list(target_data.keys())}"
                )

            if 'objective_metric' not in target_data:
                raise ConfigurationError(
                    f"Calibration targets missing 'objective_metric' field. "
                    f"Available fields: {list(target_data.keys())}"
                )

            # Create CalibrationTargets object
            targets = CalibrationTargets(
                objective_function=target_data['objective_function'],
                objective_metric=target_data['objective_metric'],
                constraints=target_data.get('constraints', []),
                version=version
            )

            # Validate targets
            targets.validate()

            # Check for conflicting constraints
            warnings = targets.check_conflicting_constraints()
            if warnings:
                for warning in warnings:
                    logger.warning(warning)

            self._calibration_targets = targets

            logger.info(
                f"Resolved calibration-targets:{version}, optimizing for: "
                f"{targets.objective_function} {targets.objective_metric} "
                f"with {len(targets.constraints)} constraint(s)"
            )

            # Log constraints
            for constraint in targets.constraints:
                logger.info(
                    f"  Constraint: {constraint['name']} {constraint['operator']} {constraint['value']}"
                )

        except AssumptionsError as e:
            raise InitializationError(
                f"Failed to resolve calibration targets '{am_ref}' from AM: {e}. "
                f"Check that the table exists and you have access."
            ) from e
        except Exception as e:
            raise InitializationError(
                f"Error resolving calibration targets '{am_ref}': {e}"
            ) from e

    def dispose(self) -> None:
        """Clean up resources."""
        logger.info("Disposing SolverEngine")
        self._initialized = False
        self._config = None
        self._credentials = None
        self._calibration_targets = None
        self._assumptions_client = None
