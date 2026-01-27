"""
Python ESG (Economic Scenario Generator) Engine

This module implements a pluggable Economic Scenario Generator that produces
interest rate scenarios for nested stochastic valuation. The ESG generates
scenarios independently and writes them to a SharedArrayBuffer for zero-copy
handoff to the projection engine.

Features:
- Resolves yield curve assumptions from Assumptions Manager
- Generates outer paths (deterministic skeleton scenarios)
- Generates inner paths on-the-fly (Monte Carlo stochastic scenarios)
- Outputs scenarios to SharedArrayBuffer
- Implements ICalcEngine interface for orchestrator integration
"""

import sys
import os
from typing import Dict, Any, Optional, List
import numpy as np
import logging
import time
from dataclasses import dataclass

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'livecalc-assumptions-lib', 'src', 'python'))

try:
    from assumptions_client import AssumptionsClient
    HAS_ASSUMPTIONS_CLIENT = True
except ImportError:
    HAS_ASSUMPTIONS_CLIENT = False
    logging.warning("assumptions_client not found. Assumption resolution disabled.")

from .calc_engine_interface import (
    ICalcEngine,
    EngineInfo,
    InitializationError,
    ConfigurationError,
    ExecutionError
)


logger = logging.getLogger(__name__)

# Configure logging format to include timestamp and context
def configure_logging(level=logging.INFO):
    """
    Configure logging with timestamp and context.

    Args:
        level: Logging level (default: INFO)
    """
    formatter = logging.Formatter(
        fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # Get or create handler
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    logger.setLevel(level)

# Auto-configure on module load
configure_logging()


@dataclass
class ESGConfig:
    """
    Configuration for ESG engine.

    Attributes:
        esg_model: Model type ('vasicek', 'cir')
        outer_paths: Number of outer (skeleton) paths (3-10)
        inner_paths_per_outer: Number of inner paths per outer path (100-10000)
        seed: Random seed for reproducibility
        projection_years: Number of years to project (1-100)
        assumptions_version: Version of yield curve assumptions (e.g., 'v2.1', 'latest')
    """
    esg_model: str
    outer_paths: int
    inner_paths_per_outer: int
    seed: int
    projection_years: int
    assumptions_version: str = 'latest'

    def validate(self) -> None:
        """
        Validate configuration parameters.

        Raises:
            ConfigurationError: If any parameter is invalid
        """
        errors = []

        if self.esg_model not in ('vasicek', 'cir'):
            errors.append(
                f"esg_model: '{self.esg_model}' is invalid. "
                f"Expected: 'vasicek' or 'cir'. "
                f"The ESG model determines the stochastic process used for scenario generation."
            )

        if not (3 <= self.outer_paths <= 10):
            errors.append(
                f"outer_paths: {self.outer_paths} is out of range. "
                f"Expected: 3-10. "
                f"Outer paths represent different market scenarios (e.g., base, stress, optimistic)."
            )

        if not (100 <= self.inner_paths_per_outer <= 10000):
            errors.append(
                f"inner_paths_per_outer: {self.inner_paths_per_outer} is out of range. "
                f"Expected: 100-10000. "
                f"This controls the number of Monte Carlo paths per outer scenario."
            )

        if not (1 <= self.projection_years <= 100):
            errors.append(
                f"projection_years: {self.projection_years} is out of range. "
                f"Expected: 1-100. "
                f"This determines the time horizon for scenario projections."
            )

        if errors:
            error_msg = "Configuration validation failed:\n" + "\n".join(f"  - {e}" for e in errors)
            raise ConfigurationError(error_msg)


class PythonESGEngine(ICalcEngine):
    """
    Python-based Economic Scenario Generator implementing ICalcEngine interface.

    This engine generates interest rate scenarios using yield curve assumptions
    resolved from Assumptions Manager. It produces outer paths (deterministic
    skeleton) and inner paths (stochastic Monte Carlo) for nested valuation.

    Usage:
        engine = PythonESGEngine()
        engine.initialize(config_dict, credentials)
        result = engine.runChunk(None, output_buffer)
        engine.dispose()
    """

    def __init__(self):
        """Initialize uninitialized engine."""
        self._initialized = False
        self._config: Optional[ESGConfig] = None
        self._assumptions_client: Optional[Any] = None
        self._yield_curve_params: Optional[Dict[str, Any]] = None
        self._outer_paths: Optional[np.ndarray] = None  # Stored outer paths (deterministic)

    def initialize(self, config: Dict[str, Any], credentials: Optional[Dict[str, str]] = None) -> None:
        """
        Initialize ESG engine with configuration and AM credentials.

        Args:
            config: ESG configuration dict with keys:
                - esg_model (str): 'vasicek' or 'cir'
                - outer_paths (int): 3-10
                - inner_paths_per_outer (int): 100-10000
                - seed (int): Random seed
                - projection_years (int): 1-100
                - assumptions_version (str): 'v2.1', 'latest', etc.
            credentials: Assumptions Manager credentials:
                - am_url (str): AM base URL
                - am_token (str): JWT token
                - cache_dir (str): Cache directory path

        Raises:
            InitializationError: If initialization fails
            ConfigurationError: If config is invalid
        """
        try:
            # Parse and validate configuration
            self._config = ESGConfig(
                esg_model=config.get('esg_model', 'vasicek'),
                outer_paths=config.get('outer_paths', 3),
                inner_paths_per_outer=config.get('inner_paths_per_outer', 1000),
                seed=config.get('seed', 42),
                projection_years=config.get('projection_years', 50),
                assumptions_version=config.get('assumptions_version', 'latest')
            )
            self._config.validate()

            # Initialize Assumptions Manager client if credentials provided
            if credentials and HAS_ASSUMPTIONS_CLIENT:
                am_url = credentials.get('am_url')
                am_token = credentials.get('am_token')
                cache_dir = credentials.get('cache_dir')

                if am_url and am_token:
                    self._assumptions_client = AssumptionsClient(am_url, am_token, cache_dir)
                    logger.info(f"Initialized Assumptions Manager client: {am_url}")

                    # Resolve yield curve parameters
                    self._resolve_yield_curve_assumptions()
                else:
                    logger.warning("AM credentials incomplete. Assumption resolution disabled.")
            else:
                logger.warning("No AM credentials provided or assumptions_client not available.")

            # Generate outer paths (deterministic skeleton)
            self._generate_outer_paths()

            self._initialized = True
            logger.info(f"ESG engine initialized: model={self._config.esg_model}, "
                       f"outer_paths={self._config.outer_paths}, "
                       f"inner_paths_per_outer={self._config.inner_paths_per_outer}")

        except ConfigurationError:
            raise
        except Exception as e:
            raise InitializationError(f"Failed to initialize ESG engine: {str(e)}")

    def _resolve_yield_curve_assumptions(self) -> None:
        """
        Resolve yield curve parameters from Assumptions Manager.

        Expected structure from AM:
        - initial_yield_curve: vector of rates by tenor (e.g., 20 tenors for 1Y-20Y)
        - volatility_matrix: square matrix of volatilities (NxN for N tenors)
        - drift_rates: vector of drift parameters by tenor
        - mean_reversion: scalar mean reversion parameter

        Raises:
            InitializationError: If resolution fails or required fields missing
        """
        if not self._assumptions_client:
            logger.warning("No assumptions client available for yield curve resolution")
            return

        assumption_name = 'yield-curve-parameters'
        assumption_version = self._config.assumptions_version

        try:
            logger.info(f"Resolving assumption: {assumption_name}:{assumption_version}")

            # Resolve yield curve parameters
            # Note: assumptions_client.resolve() returns the raw data from AM
            # For structured assumptions, this would be a nested dict/array
            params = self._assumptions_client.resolve(assumption_name, assumption_version)

            # Parse the assumption structure
            # Real AM would return structured data; for now we handle both
            # raw arrays and structured dicts
            if isinstance(params, dict):
                # Structured format from AM
                parsed_params = self._parse_yield_curve_structure(params)
            elif isinstance(params, (list, np.ndarray)):
                # Legacy flat array format - convert to structure
                parsed_params = self._parse_flat_yield_curve(params)
            else:
                raise InitializationError(
                    f"Failed to resolve assumption '{assumption_name}:{assumption_version}': "
                    f"Unexpected data format received from Assumptions Manager. "
                    f"Expected: dict or array, got: {type(params).__name__}. "
                    f"Check assumption table structure in Assumptions Manager."
                )

            # Validate all required fields are present
            self._validate_yield_curve_parameters(parsed_params)

            # Store parsed parameters
            self._yield_curve_params = parsed_params

            # Log version resolution (handles 'latest' → actual version mapping)
            resolved_version = parsed_params.get('resolved_version', assumption_version)
            if assumption_version == 'latest':
                logger.info(f"Resolved {assumption_name}:latest → {resolved_version}")
            else:
                logger.info(f"Resolved {assumption_name}:{resolved_version}")

        except InitializationError:
            raise
        except Exception as e:
            error_msg = (
                f"Failed to resolve assumption '{assumption_name}:{assumption_version}' from Assumptions Manager. "
                f"Error: {str(e)}. "
                f"Verify that: (1) the assumption table exists, "
                f"(2) the version is correct, "
                f"(3) AM credentials are valid."
            )
            logger.error(error_msg)
            raise InitializationError(error_msg) from e

    def _parse_yield_curve_structure(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse structured yield curve parameters from AM.

        Args:
            params: Dict from AM with yield curve structure

        Returns:
            Parsed dict with required fields as numpy arrays

        Raises:
            InitializationError: If parsing fails
        """
        try:
            parsed = {
                'initial_yield_curve': np.array(params.get('initial_yield_curve', [])),
                'volatility_matrix': np.array(params.get('volatility_matrix', [])),
                'drift_rates': np.array(params.get('drift_rates', [])),
                'mean_reversion': float(params.get('mean_reversion', 0.0)),
                'resolved_version': params.get('version', self._config.assumptions_version),
                'tenors': params.get('tenors', list(range(1, 21)))  # Default 1-20 years
            }
            return parsed
        except (ValueError, TypeError) as e:
            raise InitializationError(f"Failed to parse yield curve structure: {str(e)}")

    def _parse_flat_yield_curve(self, params: Any) -> Dict[str, Any]:
        """
        Parse legacy flat array format into structured parameters.

        This is a fallback for simple assumption tables that return flat arrays.
        Assumes: [initial_rates..., volatility_values..., drift_values..., mean_reversion]

        Args:
            params: Flat array of parameters

        Returns:
            Parsed dict with required fields

        Raises:
            InitializationError: If array is wrong size
        """
        params_array = np.array(params).flatten()

        # For a 20-tenor curve:
        # - 20 initial rates
        # - 400 volatility values (20x20 matrix)
        # - 20 drift rates
        # - 1 mean reversion
        # Total: 441 values

        if len(params_array) == 441:
            # Standard 20-tenor format
            num_tenors = 20
            initial_curve = params_array[:num_tenors]
            vol_start = num_tenors
            vol_end = vol_start + (num_tenors * num_tenors)
            volatility_matrix = params_array[vol_start:vol_end].reshape((num_tenors, num_tenors))
            drift_start = vol_end
            drift_end = drift_start + num_tenors
            drift_rates = params_array[drift_start:drift_end]
            mean_reversion = params_array[drift_end]

            return {
                'initial_yield_curve': initial_curve,
                'volatility_matrix': volatility_matrix,
                'drift_rates': drift_rates,
                'mean_reversion': mean_reversion,
                'resolved_version': self._config.assumptions_version,
                'tenors': list(range(1, num_tenors + 1))
            }
        else:
            raise InitializationError(
                f"Unexpected flat array size: {len(params_array)}. Expected 441 for 20-tenor curve."
            )

    def _validate_yield_curve_parameters(self, params: Dict[str, Any]) -> None:
        """
        Validate that all required yield curve fields are present and valid.

        Args:
            params: Parsed yield curve parameters

        Raises:
            InitializationError: If validation fails
        """
        errors = []

        # Check required fields exist
        required_fields = ['initial_yield_curve', 'volatility_matrix', 'drift_rates', 'mean_reversion']
        missing_fields = [f for f in required_fields if f not in params or params[f] is None]

        if missing_fields:
            errors.append(
                f"Missing required yield curve parameters: {', '.join(missing_fields)}. "
                f"These parameters are required for stochastic scenario generation."
            )

        # Validate dimensions
        initial_curve = params.get('initial_yield_curve')
        vol_matrix = params.get('volatility_matrix')
        drift = params.get('drift_rates')
        mean_reversion = params.get('mean_reversion')

        if initial_curve is not None:
            if len(initial_curve) == 0:
                errors.append("initial_yield_curve is empty. At least one tenor is required.")

            num_tenors = len(initial_curve)

            # Volatility matrix validation
            if vol_matrix is not None:
                if vol_matrix.ndim != 2:
                    errors.append(
                        f"volatility_matrix must be 2-dimensional, got {vol_matrix.ndim}D. "
                        f"Expected shape: ({num_tenors}, {num_tenors})."
                    )
                elif vol_matrix.shape != (num_tenors, num_tenors):
                    errors.append(
                        f"volatility_matrix shape {vol_matrix.shape} doesn't match "
                        f"initial_yield_curve length {num_tenors}. "
                        f"The volatility matrix must be square with dimensions matching the number of tenors."
                    )

                # Check for negative volatilities (math error)
                if np.any(vol_matrix < 0):
                    negative_count = np.sum(vol_matrix < 0)
                    min_vol = np.min(vol_matrix)
                    errors.append(
                        f"volatility_matrix contains {negative_count} negative value(s). "
                        f"Minimum value: {min_vol:.6f}. "
                        f"Volatilities must be non-negative as they represent standard deviations."
                    )

            # Drift rates validation
            if drift is not None and len(drift) != num_tenors:
                errors.append(
                    f"drift_rates length {len(drift)} doesn't match "
                    f"initial_yield_curve length {num_tenors}. "
                    f"Each tenor must have a corresponding drift rate."
                )

        # Mean reversion validation
        if mean_reversion is not None:
            if not isinstance(mean_reversion, (int, float)):
                errors.append(
                    f"mean_reversion must be numeric, got {type(mean_reversion).__name__}. "
                    f"This parameter controls the speed of reversion to long-term rates."
                )
            elif mean_reversion < 0:
                errors.append(
                    f"mean_reversion is negative: {mean_reversion:.6f}. "
                    f"Negative mean reversion leads to unstable scenarios. "
                    f"Typical values are 0.01 to 1.0."
                )
            elif mean_reversion > 10.0:
                # Warning, not error
                logger.warning(
                    f"mean_reversion is very high: {mean_reversion:.2f}. "
                    f"This may cause overly rapid convergence. "
                    f"Typical values are 0.01 to 1.0."
                )

        if errors:
            error_msg = (
                "Yield curve parameter validation failed:\n" +
                "\n".join(f"  - {e}" for e in errors) +
                "\nCheck the assumption table structure in Assumptions Manager."
            )
            raise InitializationError(error_msg)

        num_tenors = len(initial_curve) if initial_curve is not None else 0
        logger.debug(f"Validated yield curve parameters: {num_tenors} tenors")
        logger.info(f"Yield curve parameters validated successfully: {num_tenors} tenors, "
                   f"mean_reversion={mean_reversion:.4f}")

    def _generate_outer_paths(self) -> None:
        """
        Generate outer paths (deterministic skeleton scenarios).

        Outer paths represent pre-defined market scenarios:
        - Base case: initial yield curve remains flat
        - Stress scenarios: parallel shifts up/down
        - Non-parallel shifts: steepening/flattening

        The outer paths are stored in self._outer_paths as a matrix:
        Shape: (outer_paths, projection_years)

        Each row is an outer path, each column is a year.
        Values are interest rates (e.g., 0.03 for 3%).

        Raises:
            InitializationError: If outer path generation fails
        """
        try:
            # Initialize outer paths array
            outer_paths = np.zeros((self._config.outer_paths, self._config.projection_years))

            # If we have yield curve parameters from AM, use them
            # Otherwise, use simple defaults
            if self._yield_curve_params and len(self._yield_curve_params['initial_yield_curve']) > 0:
                initial_curve = self._yield_curve_params['initial_yield_curve']
                # Use the first rate (1-year) as base rate
                base_rate = float(initial_curve[0])
                drift_rate = float(self._yield_curve_params['drift_rates'][0])
            else:
                # Default: 3% base rate, 0% drift
                base_rate = 0.03
                drift_rate = 0.0
                logger.warning("No yield curve parameters available. Using defaults for outer paths.")

            # Define outer path scenarios based on market conditions
            # The exact scenarios depend on the number of outer paths requested
            num_outer = self._config.outer_paths

            if num_outer >= 1:
                # Outer path 0: Base case - rates stay constant
                outer_paths[0, :] = base_rate

            if num_outer >= 2:
                # Outer path 1: Rates increase by 1% per year (stress up)
                for year in range(self._config.projection_years):
                    outer_paths[1, year] = base_rate + (year * 0.01)

            if num_outer >= 3:
                # Outer path 2: Rates decrease by 0.5% per year (stress down)
                for year in range(self._config.projection_years):
                    outer_paths[2, year] = max(0.001, base_rate - (year * 0.005))  # Floor at 0.1%

            if num_outer >= 4:
                # Outer path 3: Mean reversion to long-term rate
                long_term_rate = base_rate + 0.01  # Assume LT rate is 1% higher
                mean_reversion_speed = 0.1
                current_rate = base_rate
                for year in range(self._config.projection_years):
                    current_rate = current_rate + mean_reversion_speed * (long_term_rate - current_rate)
                    outer_paths[3, year] = current_rate

            if num_outer >= 5:
                # Outer path 4: V-shaped recovery (down then up)
                midpoint = self._config.projection_years // 2
                for year in range(self._config.projection_years):
                    if year < midpoint:
                        outer_paths[4, year] = base_rate - (year * 0.005)
                    else:
                        outer_paths[4, year] = base_rate - (midpoint * 0.005) + ((year - midpoint) * 0.01)

            if num_outer >= 6:
                # Outer path 5: Inverted yield curve recovery
                for year in range(self._config.projection_years):
                    outer_paths[5, year] = base_rate - 0.01 + (year * 0.002)

            if num_outer >= 7:
                # Outer path 6: Gradual drift using AM drift parameter
                current_rate = base_rate
                for year in range(self._config.projection_years):
                    current_rate = current_rate + drift_rate
                    outer_paths[6, year] = max(0.001, current_rate)

            if num_outer >= 8:
                # Outer path 7: High inflation scenario (rapid rise)
                for year in range(self._config.projection_years):
                    outer_paths[7, year] = base_rate + (year * 0.02)

            if num_outer >= 9:
                # Outer path 8: Deflation scenario (gradual decline to zero)
                for year in range(self._config.projection_years):
                    outer_paths[8, year] = max(0.001, base_rate - (year * 0.003))

            if num_outer >= 10:
                # Outer path 9: Volatile scenario (sine wave around base)
                for year in range(self._config.projection_years):
                    outer_paths[9, year] = base_rate + 0.02 * np.sin(year * 0.5)

            # Store outer paths
            self._outer_paths = outer_paths

            logger.info(f"Generated {self._config.outer_paths} outer paths × {self._config.projection_years} years")
            logger.debug(f"Outer path 0 (base case) rates: {outer_paths[0, :5]}... (first 5 years)")

        except Exception as e:
            raise InitializationError(f"Failed to generate outer paths: {str(e)}")

    def get_info(self) -> EngineInfo:
        """
        Get ESG engine metadata.

        Returns:
            EngineInfo: Engine information
        """
        return EngineInfo(
            name="Python ESG Engine",
            version="1.0.0",
            engine_type="esg",
            supports_assumptions_manager=HAS_ASSUMPTIONS_CLIENT
        )

    def runChunk(
        self,
        input_buffer: Optional[np.ndarray],
        output_buffer: np.ndarray
    ) -> Dict[str, Any]:
        """
        Generate economic scenarios and write to output buffer.

        Args:
            input_buffer: None (ESG has no input dependencies)
            output_buffer: Pre-allocated structured numpy array for scenarios
                          Dtype: [('scenario_id', 'u4'), ('year', 'u4'), ('rate', 'f4')]
                          Shape: (num_scenarios * projection_years,)

                          Format: Each row is [scenario_id, year, interest_rate]
                          - scenario_id: uint32 (outer_id * 1000 + inner_id)
                          - year: uint32 (1 to projection_years)
                          - rate: float32 (per-annum rate, e.g., 0.03 for 3%)

        Returns:
            Dict with:
                - execution_time_ms: Execution time
                - scenarios_generated: Number of scenarios written
                - warnings: List of warnings (if any)

        Raises:
            ExecutionError: If generation fails
        """
        if not self._initialized:
            raise ExecutionError("Engine not initialized. Call initialize() first.")

        import time
        start_time = time.time()

        try:
            # Calculate total scenarios and rows
            total_scenarios = self._config.outer_paths * self._config.inner_paths_per_outer
            total_rows = total_scenarios * self._config.projection_years

            # Validate output buffer
            if not isinstance(output_buffer, np.ndarray):
                raise ExecutionError("Output buffer must be a numpy array")

            # Check if buffer has the correct dtype (structured array)
            if output_buffer.dtype.names is None:
                # Legacy format: 2D array (num_scenarios, projection_years)
                # This is for backwards compatibility with tests
                expected_shape = (total_scenarios, self._config.projection_years)
                if output_buffer.shape != expected_shape:
                    raise ExecutionError(
                        f"Output buffer shape mismatch. Expected {expected_shape}, got {output_buffer.shape}"
                    )
                self._generate_scenarios_legacy(output_buffer)
            else:
                # Structured array format (US-005)
                expected_dtype_names = ('scenario_id', 'year', 'rate')
                if output_buffer.dtype.names != expected_dtype_names:
                    raise ExecutionError(
                        f"Output buffer dtype mismatch. Expected fields {expected_dtype_names}, "
                        f"got {output_buffer.dtype.names}"
                    )

                expected_shape = (total_rows,)
                if output_buffer.shape != expected_shape:
                    raise ExecutionError(
                        f"Output buffer shape mismatch. Expected {expected_shape}, got {output_buffer.shape}"
                    )

                self._generate_scenarios_structured(output_buffer)

            execution_time_ms = (time.time() - start_time) * 1000

            return {
                'execution_time_ms': execution_time_ms,
                'scenarios_generated': total_scenarios,
                'warnings': []
            }

        except Exception as e:
            raise ExecutionError(f"Failed to generate scenarios: {str(e)}")

    def _generate_scenarios_structured(self, output_buffer: np.ndarray) -> None:
        """
        Generate all scenarios and write to structured output buffer (US-005 format).

        Output format: [scenario_id, year, interest_rate]
        - scenario_id: outer_id * 1000 + inner_id
        - year: 1 to projection_years
        - rate: per-annum interest rate (e.g., 0.03 for 3%)

        Uses outer paths (deterministic skeleton) as the base for each scenario group.
        Inner paths add stochastic variation using Vasicek or CIR models.

        Args:
            output_buffer: Structured numpy array
                          Dtype: [('scenario_id', 'u4'), ('year', 'u4'), ('rate', 'f4')]
                          Shape: (num_scenarios * projection_years,)
        """
        if self._outer_paths is None:
            raise ExecutionError("Outer paths not generated. Call initialize() first.")

        total_scenarios = self._config.outer_paths * self._config.inner_paths_per_outer
        row_idx = 0
        slow_paths = 0
        total_generation_time_ms = 0.0

        for outer_idx in range(self._config.outer_paths):
            # Get the outer path (deterministic skeleton)
            outer_path = self._outer_paths[outer_idx, :]

            # Generate inner paths with stochastic variation
            for inner_idx in range(self._config.inner_paths_per_outer):
                # Calculate scenario_id: outer_id * 1000 + inner_id
                scenario_id = outer_idx * 1000 + inner_idx

                # Generate inner path based on outer path with timing
                path_start = time.time()
                inner_path = self._generate_inner_path(outer_path, outer_idx, inner_idx)
                path_time_ms = (time.time() - path_start) * 1000
                total_generation_time_ms += path_time_ms

                # Monitor performance: warn if inner path generation exceeds 10ms
                if path_time_ms > 10.0:
                    slow_paths += 1
                    logger.warning(
                        f"Slow inner path generation detected: {path_time_ms:.2f}ms "
                        f"(scenario_id={scenario_id}, outer={outer_idx}, inner={inner_idx}). "
                        f"Target: <10ms per path. This may indicate performance issues."
                    )

                # Write each (scenario_id, year, rate) tuple to output
                for year_idx in range(self._config.projection_years):
                    output_buffer[row_idx]['scenario_id'] = scenario_id
                    output_buffer[row_idx]['year'] = year_idx + 1  # Years are 1-indexed
                    output_buffer[row_idx]['rate'] = inner_path[year_idx]
                    row_idx += 1

        avg_generation_time_ms = total_generation_time_ms / total_scenarios if total_scenarios > 0 else 0
        logger.info(
            f"Generated {total_scenarios} scenarios in {total_generation_time_ms:.2f}ms total "
            f"(avg {avg_generation_time_ms:.3f}ms per path). "
            f"Slow paths (>10ms): {slow_paths}"
        )
        logger.debug(f"Generated {total_scenarios} scenarios × {self._config.projection_years} years "
                    f"in structured format (US-005): {row_idx} total rows written "
                    f"(using {self._config.outer_paths} outer paths with stochastic inner paths)")

    def _generate_scenarios_legacy(self, output_buffer: np.ndarray) -> None:
        """
        Generate all scenarios and write to legacy 2D output buffer (for backwards compatibility).

        Uses outer paths (deterministic skeleton) as the base for each scenario group.
        Inner paths add stochastic variation using Vasicek or CIR models.

        Args:
            output_buffer: Numpy array to write scenarios to
                          Shape: (num_scenarios, projection_years)
        """
        if self._outer_paths is None:
            raise ExecutionError("Outer paths not generated. Call initialize() first.")

        total_scenarios = self._config.outer_paths * self._config.inner_paths_per_outer
        slow_paths = 0
        total_generation_time_ms = 0.0

        scenario_idx = 0
        for outer_idx in range(self._config.outer_paths):
            # Get the outer path (deterministic skeleton)
            outer_path = self._outer_paths[outer_idx, :]

            # Generate inner paths with stochastic variation
            for inner_idx in range(self._config.inner_paths_per_outer):
                # Generate inner path based on outer path with timing
                path_start = time.time()
                inner_path = self._generate_inner_path(outer_path, outer_idx, inner_idx)
                path_time_ms = (time.time() - path_start) * 1000
                total_generation_time_ms += path_time_ms

                # Monitor performance: warn if inner path generation exceeds 10ms
                if path_time_ms > 10.0:
                    slow_paths += 1
                    logger.warning(
                        f"Slow inner path generation detected: {path_time_ms:.2f}ms "
                        f"(scenario {scenario_idx}, outer={outer_idx}, inner={inner_idx}). "
                        f"Target: <10ms per path. This may indicate performance issues."
                    )

                output_buffer[scenario_idx, :] = inner_path
                scenario_idx += 1

        avg_generation_time_ms = total_generation_time_ms / total_scenarios if total_scenarios > 0 else 0
        logger.info(
            f"Generated {total_scenarios} scenarios in {total_generation_time_ms:.2f}ms total "
            f"(avg {avg_generation_time_ms:.3f}ms per path). "
            f"Slow paths (>10ms): {slow_paths}"
        )
        logger.debug(f"Generated {total_scenarios} scenarios × {self._config.projection_years} years "
                    f"(using {self._config.outer_paths} outer paths with stochastic inner paths)")

    def _generate_inner_path(
        self,
        outer_path: np.ndarray,
        outer_idx: int,
        inner_idx: int
    ) -> np.ndarray:
        """
        Generate a single inner path with stochastic variation around the outer path.

        Uses Vasicek model: dr = a*(b - r)*dt + sigma*dW
        where:
        - a: mean reversion speed
        - b: long-term rate (from outer path)
        - sigma: volatility
        - dW: Wiener process increment

        The seed is deterministic based on: hash(outer_id, inner_id, global_seed)
        This ensures reproducibility while maintaining independence.

        Args:
            outer_path: The deterministic outer path (skeleton)
            outer_idx: Index of the outer path (0-9)
            inner_idx: Index of the inner path within this outer path (0-9999)

        Returns:
            Inner path as numpy array of interest rates (same shape as outer_path)
        """
        # Deterministic seed for reproducibility
        # Combine outer_idx, inner_idx, and global seed to create unique but reproducible seed
        seed_value = hash((outer_idx, inner_idx, self._config.seed)) % (2**31)
        rng = np.random.RandomState(seed_value)

        # Get model parameters
        if self._yield_curve_params:
            # Use parameters from Assumptions Manager
            mean_reversion = self._yield_curve_params.get('mean_reversion', 0.1)
            # Use first volatility value as base volatility
            vol_matrix = self._yield_curve_params['volatility_matrix']
            base_volatility = float(vol_matrix[0, 0]) if vol_matrix.size > 0 else 0.01
        else:
            # Default parameters
            mean_reversion = 0.1  # Speed of mean reversion
            base_volatility = 0.01  # 1% volatility

        # Initialize inner path
        projection_years = len(outer_path)
        inner_path = np.zeros(projection_years)

        # Start at the outer path's initial rate
        current_rate = outer_path[0]
        inner_path[0] = current_rate

        # Generate stochastic path year-by-year
        dt = 1.0  # Annual time step

        for year in range(1, projection_years):
            # Long-term rate is the outer path value at this point (the skeleton)
            long_term_rate = outer_path[year]

            # Vasicek model discretization
            # dr = a*(b - r)*dt + sigma*sqrt(dt)*Z
            # where Z ~ N(0, 1)
            drift_term = mean_reversion * (long_term_rate - current_rate) * dt
            diffusion_term = base_volatility * np.sqrt(dt) * rng.normal(0, 1)

            # Update rate
            current_rate = current_rate + drift_term + diffusion_term

            # Apply floor to prevent negative rates
            current_rate = max(0.001, current_rate)  # 0.1% floor

            inner_path[year] = current_rate

        return inner_path

    def dispose(self) -> None:
        """
        Clean up resources and free memory.
        """
        self._initialized = False
        self._config = None
        self._assumptions_client = None
        self._yield_curve_params = None
        self._outer_paths = None
        logger.info("ESG engine disposed")

    @property
    def is_initialized(self) -> bool:
        """Check if the engine is initialized."""
        return self._initialized
