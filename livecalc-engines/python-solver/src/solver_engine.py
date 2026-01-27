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

from .calc_engine_interface import (
    ICalcEngine,
    EngineInfo,
    InitializationError,
    ConfigurationError,
    ExecutionError,
    TimeoutError,
    ConvergenceError
)


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

    def dispose(self) -> None:
        """Clean up resources."""
        logger.info("Disposing SolverEngine")
        self._initialized = False
        self._config = None
        self._credentials = None
