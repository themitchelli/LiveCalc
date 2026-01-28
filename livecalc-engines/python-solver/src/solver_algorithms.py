"""
Solver algorithms for parameter optimization.

Provides multiple optimization algorithms:
- SLSQP: Sequential Least Squares Programming (gradient-based)
- Nelder-Mead: Simplex method (derivative-free)
- Differential Evolution: Global optimization (genetic-like)
- Custom Gradient Descent: Simple gradient-based optimizer
"""

import logging
from typing import Any, Callable, Dict, List, Optional, Tuple
from dataclasses import dataclass
import numpy as np

try:
    from scipy.optimize import minimize, differential_evolution, OptimizeResult
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False
    OptimizeResult = None

from .calc_engine_interface import ConfigurationError, ConvergenceError

logger = logging.getLogger(__name__)


@dataclass
class AlgorithmConfig:
    """Configuration for optimization algorithm."""
    algorithm: str  # 'slsqp', 'nelder-mead', 'differential_evolution', 'gradient_descent'
    max_iterations: int = 20
    tolerance: float = 1e-4
    options: Dict[str, Any] = None

    def __post_init__(self):
        if self.options is None:
            self.options = {}


@dataclass
class IterationResult:
    """Result from a single optimization iteration."""
    parameters: Dict[str, float]
    objective_value: float
    constraint_violations: Dict[str, float]
    iteration: int


class OptimizerCallback:
    """
    Callback wrapper for optimization algorithms.

    Translates between algorithm's parameter vector format and solver's dict format.
    Tracks iterations and constraint violations.

    US-008: Handles projection failures gracefully, tracks best result for partial returns.
    """

    def __init__(
        self,
        parameter_names: List[str],
        projection_callback: Callable[[Dict[str, float]], Any],
        objective_extractor: Callable[[Any], float],
        constraint_evaluator: Callable[[Any], Dict[str, float]],
        direction: str = 'maximize'
    ):
        """
        Initialize optimizer callback.

        Args:
            parameter_names: List of parameter names in order
            projection_callback: Projection function(params_dict) -> result
            objective_extractor: Function(result) -> objective_value
            constraint_evaluator: Function(result) -> constraint_violations_dict
            direction: 'maximize' or 'minimize'
        """
        self.parameter_names = parameter_names
        self.projection_callback = projection_callback
        self.objective_extractor = objective_extractor
        self.constraint_evaluator = constraint_evaluator
        self.direction = direction
        self.iteration_count = 0
        self.iteration_history: List[IterationResult] = []

        # US-008: Track best result for partial returns and failure recovery
        self.best_result: Optional[IterationResult] = None
        self.failed_iterations: int = 0
        self.consecutive_failures: int = 0
        self.max_consecutive_failures: int = 3  # Abort after 3 consecutive failures

    def __call__(self, x: np.ndarray) -> float:
        """
        Evaluate objective function at parameter vector x.

        US-008: Handles projection callback failures gracefully.
        Tracks best result for partial returns on timeout/failure.

        Args:
            x: Parameter vector (numpy array)

        Returns:
            Objective value (sign-adjusted for minimization)

        Raises:
            ConvergenceError: If too many consecutive failures occur
        """
        # Convert parameter vector to dict
        params = {name: float(val) for name, val in zip(self.parameter_names, x)}

        self.iteration_count += 1

        try:
            # Call projection with exception handling
            result = self.projection_callback(params)

            # Extract objective and constraints
            raw_objective = self.objective_extractor(result)
            constraint_violations = self.constraint_evaluator(result)

            # Record successful iteration
            iteration_result = IterationResult(
                parameters=params.copy(),
                objective_value=raw_objective,
                constraint_violations=constraint_violations.copy(),
                iteration=self.iteration_count
            )
            self.iteration_history.append(iteration_result)

            # Update best result (considering constraints)
            if self._is_better_result(iteration_result):
                self.best_result = iteration_result
                logger.debug(f"New best result: objective={raw_objective:.4f}")

            # Reset consecutive failure counter on success
            self.consecutive_failures = 0

            # Log iteration
            constraints_status = "satisfied" if not constraint_violations else f"{len(constraint_violations)} violated"
            logger.info(
                f"Iteration {self.iteration_count}: objective={raw_objective:.4f}, "
                f"constraints={constraints_status}, params={params}"
            )

            if constraint_violations:
                for name, violation in constraint_violations.items():
                    logger.warning(f"  Constraint '{name}' violated by {violation:.4f}")

            # For scipy.optimize.minimize, we need to minimize
            # If user wants to maximize, negate the objective
            if self.direction == 'maximize':
                return -raw_objective
            else:
                return raw_objective

        except Exception as e:
            # US-008: Handle projection callback failures
            self.failed_iterations += 1
            self.consecutive_failures += 1

            logger.error(
                f"Iteration {self.iteration_count}: Projection callback failed: {e}. "
                f"Parameters: {params}. "
                f"Consecutive failures: {self.consecutive_failures}/{self.max_consecutive_failures}"
            )

            # Check if too many consecutive failures
            if self.consecutive_failures >= self.max_consecutive_failures:
                logger.error(
                    f"Optimization aborted: {self.consecutive_failures} consecutive projection failures. "
                    f"Last parameters: {params}"
                )
                raise ConvergenceError(
                    f"Optimization failed: {self.consecutive_failures} consecutive projection callback failures. "
                    f"Last error: {e}"
                ) from e

            # Return a penalty value to guide optimizer away from this region
            # Use a large penalty (worse than any reasonable objective)
            penalty = 1e10 if self.direction == 'minimize' else -1e10

            logger.debug(f"Returning penalty value: {penalty}")
            return penalty

    def _is_better_result(self, new_result: IterationResult) -> bool:
        """
        Check if new result is better than current best.

        Args:
            new_result: New iteration result

        Returns:
            True if new result is better (considering constraints)
        """
        # If no best result yet, this is better
        if self.best_result is None:
            return True

        # Prefer feasible solutions over infeasible ones
        new_feasible = len(new_result.constraint_violations) == 0
        best_feasible = len(self.best_result.constraint_violations) == 0

        if new_feasible and not best_feasible:
            return True
        if not new_feasible and best_feasible:
            return False

        # Both feasible or both infeasible: compare objectives
        new_obj = new_result.objective_value
        best_obj = self.best_result.objective_value

        if self.direction == 'maximize':
            return new_obj > best_obj
        else:
            return new_obj < best_obj

    def check_divergence(self, window_size: int = 5, threshold: float = 0.1) -> bool:
        """
        US-008: Check if optimization is diverging (getting consistently worse).

        Args:
            window_size: Number of recent iterations to check
            threshold: Percentage worse threshold (e.g., 0.1 = 10% worse)

        Returns:
            True if divergence detected
        """
        if len(self.iteration_history) < window_size + 1:
            return False

        # Get recent objectives
        recent = self.iteration_history[-window_size:]
        baseline = self.iteration_history[-(window_size + 1)]

        # Check if all recent iterations are worse than baseline
        baseline_obj = baseline.objective_value

        # Skip if baseline is zero (avoid division by zero)
        if abs(baseline_obj) < 1e-10:
            return False

        worse_count = 0
        for iter_result in recent:
            obj = iter_result.objective_value
            relative_change = (obj - baseline_obj) / abs(baseline_obj)

            # Check if worse (accounting for direction)
            if self.direction == 'maximize':
                if relative_change < -threshold:
                    worse_count += 1
            else:  # minimize
                if relative_change > threshold:
                    worse_count += 1

        # Divergence if majority of recent iterations are significantly worse
        divergence = worse_count >= (window_size * 0.8)

        if divergence:
            logger.warning(
                f"Divergence detected: {worse_count}/{window_size} recent iterations "
                f"worse than baseline (objective={baseline_obj:.4f})"
            )

        return divergence


def run_slsqp_algorithm(
    config: AlgorithmConfig,
    parameter_names: List[str],
    initial_params: np.ndarray,
    bounds: List[Tuple[float, float]],
    callback: OptimizerCallback
) -> OptimizeResult:
    """
    Run SLSQP (Sequential Least Squares Programming) algorithm.

    Gradient-based optimization suitable for smooth objectives.
    Handles bounds and constraints efficiently.

    Args:
        config: Algorithm configuration
        parameter_names: List of parameter names
        initial_params: Starting parameter vector
        bounds: List of (lower, upper) bounds
        callback: OptimizerCallback instance

    Returns:
        OptimizeResult from scipy.optimize.minimize

    Raises:
        ConfigurationError: If scipy not available
    """
    if not SCIPY_AVAILABLE:
        raise ConfigurationError("scipy not available. Install with: pip install scipy")

    logger.info(f"Running SLSQP algorithm (max_iterations={config.max_iterations}, tolerance={config.tolerance})")

    # Build scipy options
    scipy_options = {
        'maxiter': config.max_iterations,
        'ftol': config.tolerance,
        'disp': False
    }
    scipy_options.update(config.options)

    # Run optimization
    result = minimize(
        callback,
        initial_params,
        method='SLSQP',
        bounds=bounds,
        options=scipy_options
    )

    logger.info(f"SLSQP completed: success={result.success}, message={result.message}, nit={result.nit}")

    return result


def run_nelder_mead_algorithm(
    config: AlgorithmConfig,
    parameter_names: List[str],
    initial_params: np.ndarray,
    bounds: List[Tuple[float, float]],
    callback: OptimizerCallback
) -> OptimizeResult:
    """
    Run Nelder-Mead (Simplex) algorithm.

    Derivative-free optimization. Good for noisy or discontinuous objectives.

    Args:
        config: Algorithm configuration
        parameter_names: List of parameter names
        initial_params: Starting parameter vector
        bounds: List of (lower, upper) bounds
        callback: OptimizerCallback instance

    Returns:
        OptimizeResult from scipy.optimize.minimize

    Raises:
        ConfigurationError: If scipy not available
    """
    if not SCIPY_AVAILABLE:
        raise ConfigurationError("scipy not available. Install with: pip install scipy")

    logger.info(f"Running Nelder-Mead algorithm (max_iterations={config.max_iterations}, tolerance={config.tolerance})")

    # Build scipy options
    scipy_options = {
        'maxiter': config.max_iterations,
        'xatol': config.tolerance,
        'fatol': config.tolerance,
        'disp': False
    }
    scipy_options.update(config.options)

    # Note: Nelder-Mead doesn't support bounds directly
    # We rely on the callback to handle out-of-bounds (penalty or error)
    result = minimize(
        callback,
        initial_params,
        method='Nelder-Mead',
        options=scipy_options
    )

    logger.info(f"Nelder-Mead completed: success={result.success}, message={result.message}, nit={result.nit}")

    return result


def run_differential_evolution_algorithm(
    config: AlgorithmConfig,
    parameter_names: List[str],
    initial_params: np.ndarray,
    bounds: List[Tuple[float, float]],
    callback: OptimizerCallback
) -> OptimizeResult:
    """
    Run Differential Evolution algorithm.

    Global optimization (genetic-like). Good for multimodal objectives.
    Does not use initial_params (explores entire bounds).

    Args:
        config: Algorithm configuration
        parameter_names: List of parameter names
        initial_params: Starting parameter vector (not used by differential_evolution)
        bounds: List of (lower, upper) bounds
        callback: OptimizerCallback instance

    Returns:
        OptimizeResult from scipy.optimize.differential_evolution

    Raises:
        ConfigurationError: If scipy not available
    """
    if not SCIPY_AVAILABLE:
        raise ConfigurationError("scipy not available. Install with: pip install scipy")

    logger.info(f"Running Differential Evolution algorithm (max_iterations={config.max_iterations}, tolerance={config.tolerance})")

    # Build scipy options
    scipy_options = {
        'maxiter': config.max_iterations,
        'tol': config.tolerance,
        'disp': False
    }
    scipy_options.update(config.options)

    # Run optimization
    result = differential_evolution(
        callback,
        bounds,
        **scipy_options
    )

    logger.info(f"Differential Evolution completed: success={result.success}, message={result.message}, nit={result.nit}")

    return result


def run_custom_gradient_descent(
    config: AlgorithmConfig,
    parameter_names: List[str],
    initial_params: np.ndarray,
    bounds: List[Tuple[float, float]],
    callback: OptimizerCallback
) -> OptimizeResult:
    """
    Run custom gradient descent algorithm.

    Simple finite-difference gradient descent with adaptive step size.
    Suitable for specialized problems where scipy algorithms don't work well.

    Args:
        config: Algorithm configuration
        parameter_names: List of parameter names
        initial_params: Starting parameter vector
        bounds: List of (lower, upper) bounds
        callback: OptimizerCallback instance

    Returns:
        OptimizeResult-like object with optimization results
    """
    logger.info(f"Running custom gradient descent (max_iterations={config.max_iterations}, tolerance={config.tolerance})")

    # Configuration
    learning_rate = config.options.get('learning_rate', 0.01)
    epsilon = config.options.get('epsilon', 1e-8)  # For finite differences
    decay_rate = config.options.get('decay_rate', 0.95)  # Learning rate decay

    # Initialize
    x = initial_params.copy()
    best_x = x.copy()
    best_f = callback(x)

    # Track convergence
    history = [best_f]
    no_improvement_count = 0

    for iteration in range(config.max_iterations):
        # Compute gradient via finite differences
        gradient = np.zeros_like(x)
        f_current = callback(x)

        for i in range(len(x)):
            # Forward difference
            x_perturbed = x.copy()
            x_perturbed[i] += epsilon
            f_perturbed = callback(x_perturbed)
            gradient[i] = (f_perturbed - f_current) / epsilon

        # Update parameters with gradient descent
        x_new = x - learning_rate * gradient

        # Apply bounds
        for i, (lower, upper) in enumerate(bounds):
            x_new[i] = np.clip(x_new[i], lower, upper)

        # Evaluate new parameters
        f_new = callback(x_new)

        # Update best
        if f_new < best_f:
            best_x = x_new.copy()
            best_f = f_new
            no_improvement_count = 0
        else:
            no_improvement_count += 1

        # Check convergence
        history.append(f_new)
        if len(history) >= 3:
            recent_improvement = abs(history[-3] - f_new) / (abs(history[-3]) + 1e-10)
            if recent_improvement < config.tolerance:
                logger.info(f"Custom gradient descent converged after {iteration + 1} iterations")
                break

        # Early stopping if no improvement
        if no_improvement_count >= 5:
            logger.info(f"Custom gradient descent stopped (no improvement for 5 iterations)")
            break

        # Update for next iteration
        x = x_new
        learning_rate *= decay_rate  # Decay learning rate

    # Create result object
    result = type('OptimizeResult', (), {})()
    result.x = best_x
    result.fun = best_f
    result.success = True
    result.message = f"Optimization completed after {len(history)} iterations"
    result.nit = len(history)

    logger.info(f"Custom gradient descent completed: iterations={result.nit}, final_objective={best_f:.4f}")

    return result


def select_and_run_algorithm(
    config: AlgorithmConfig,
    parameter_names: List[str],
    initial_params: np.ndarray,
    bounds: List[Tuple[float, float]],
    callback: OptimizerCallback
) -> OptimizeResult:
    """
    Select and run the appropriate optimization algorithm.

    Args:
        config: Algorithm configuration
        parameter_names: List of parameter names
        initial_params: Starting parameter vector
        bounds: List of (lower, upper) bounds
        callback: OptimizerCallback instance

    Returns:
        OptimizeResult from selected algorithm

    Raises:
        ConfigurationError: If algorithm not recognized
    """
    algorithm = config.algorithm.lower()

    if algorithm == 'slsqp':
        return run_slsqp_algorithm(config, parameter_names, initial_params, bounds, callback)
    elif algorithm in ['nelder-mead', 'nelder_mead']:
        return run_nelder_mead_algorithm(config, parameter_names, initial_params, bounds, callback)
    elif algorithm in ['differential_evolution', 'differential-evolution']:
        return run_differential_evolution_algorithm(config, parameter_names, initial_params, bounds, callback)
    elif algorithm in ['gradient_descent', 'gradient-descent', 'custom']:
        return run_custom_gradient_descent(config, parameter_names, initial_params, bounds, callback)
    else:
        raise ConfigurationError(
            f"Unknown algorithm '{algorithm}'. "
            f"Supported: slsqp, nelder-mead, differential_evolution, gradient_descent"
        )
