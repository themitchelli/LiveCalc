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

from .calc_engine_interface import (
    ICalcEngine,
    EngineInfo,
    InitializationError,
    ConfigurationError,
    ExecutionError,
    TimeoutError,
    ConvergenceError
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

        for param in config['parameters']:
            if not isinstance(param, dict):
                raise InitializationError(f"Parameter must be a dict, got: {type(param)}")
            if 'name' not in param or 'initial' not in param:
                raise InitializationError(f"Parameter missing 'name' or 'initial': {param}")

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
        Internal optimization loop (placeholder for US-001).

        This is a simple implementation for US-001. More sophisticated algorithms
        will be implemented in US-005.

        Args:
            projection_callback: Projection function
            initial_parameters: Starting parameters

        Returns:
            OptimizationResult
        """
        # For US-001, we just run a simple iteration to demonstrate the callback interface
        # US-005 will implement actual solver algorithms (SLSQP, differential_evolution, etc.)

        current_params = initial_parameters.copy()
        iterations = 0
        max_iterations = 10  # Simple placeholder

        # Run projection with initial parameters
        try:
            result = projection_callback(current_params)
            objective_value = self._extract_objective(result)

            logger.info(f"Iteration {iterations}: objective={objective_value}, params={current_params}")

            # For US-001, we just demonstrate the interface works
            # Return result without actually optimizing
            return OptimizationResult(
                final_parameters=current_params,
                objective_value=objective_value,
                iterations=iterations + 1,
                converged=True,
                constraint_violations={},
                execution_time_seconds=0.0,
                partial_result=False
            )

        except TimeoutException:
            # Re-raise timeout exception so it's caught by outer handler
            raise
        except Exception as e:
            logger.error(f"Projection callback failed at iteration {iterations}: {e}")
            raise ExecutionError(f"Projection callback failed: {e}") from e

    def _extract_objective(self, result: ValuationResult) -> float:
        """
        Extract objective value from valuation result.

        Args:
            result: ValuationResult from projection

        Returns:
            Objective value based on config

        Raises:
            ConfigurationError: If objective metric not found
        """
        metric = self._config['objective']['metric']

        if hasattr(result, metric):
            return getattr(result, metric)
        else:
            raise ConfigurationError(f"Objective metric '{metric}' not found in ValuationResult")

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
