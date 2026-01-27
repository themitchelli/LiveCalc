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
from typing import Dict, Any, Optional
import numpy as np
import logging
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
        if self.esg_model not in ('vasicek', 'cir'):
            raise ConfigurationError(f"Invalid esg_model: {self.esg_model}. Must be 'vasicek' or 'cir'.")

        if not (3 <= self.outer_paths <= 10):
            raise ConfigurationError(f"Invalid outer_paths: {self.outer_paths}. Must be 3-10.")

        if not (100 <= self.inner_paths_per_outer <= 10000):
            raise ConfigurationError(f"Invalid inner_paths_per_outer: {self.inner_paths_per_outer}. Must be 100-10000.")

        if not (1 <= self.projection_years <= 100):
            raise ConfigurationError(f"Invalid projection_years: {self.projection_years}. Must be 1-100.")


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

        try:
            # Resolve yield curve parameters
            # Note: assumptions_client.resolve() returns the raw data from AM
            # For structured assumptions, this would be a nested dict/array
            params = self._assumptions_client.resolve(
                'yield-curve-parameters',
                self._config.assumptions_version
            )

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
                    f"Unexpected yield curve parameter format: {type(params)}"
                )

            # Validate all required fields are present
            self._validate_yield_curve_parameters(parsed_params)

            # Store parsed parameters
            self._yield_curve_params = parsed_params

            # Log version resolution (handles 'latest' → actual version mapping)
            resolved_version = parsed_params.get('resolved_version', self._config.assumptions_version)
            if self._config.assumptions_version == 'latest':
                logger.info(f"Resolved yield-curve-parameters:latest → {resolved_version}")
            else:
                logger.info(f"Resolved yield-curve-parameters:{resolved_version}")

        except Exception as e:
            raise InitializationError(f"Failed to resolve yield curve assumptions: {str(e)}")

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
        # Check required fields exist
        required_fields = ['initial_yield_curve', 'volatility_matrix', 'drift_rates', 'mean_reversion']
        missing_fields = [f for f in required_fields if f not in params or params[f] is None]

        if missing_fields:
            raise InitializationError(
                f"Missing required yield curve parameters: {', '.join(missing_fields)}"
            )

        # Validate dimensions
        initial_curve = params['initial_yield_curve']
        vol_matrix = params['volatility_matrix']
        drift = params['drift_rates']

        if len(initial_curve) == 0:
            raise InitializationError("initial_yield_curve is empty")

        num_tenors = len(initial_curve)

        # Volatility matrix should be square and match tenor count
        if vol_matrix.ndim != 2:
            raise InitializationError(f"volatility_matrix must be 2D, got {vol_matrix.ndim}D")

        if vol_matrix.shape != (num_tenors, num_tenors):
            raise InitializationError(
                f"volatility_matrix shape {vol_matrix.shape} doesn't match "
                f"initial_yield_curve length {num_tenors}"
            )

        # Drift rates should match tenor count
        if len(drift) != num_tenors:
            raise InitializationError(
                f"drift_rates length {len(drift)} doesn't match "
                f"initial_yield_curve length {num_tenors}"
            )

        # Mean reversion should be a scalar
        if not isinstance(params['mean_reversion'], (int, float)):
            raise InitializationError(
                f"mean_reversion must be numeric, got {type(params['mean_reversion'])}"
            )

        logger.debug(f"Validated yield curve parameters: {num_tenors} tenors")

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
            output_buffer: Pre-allocated numpy array for scenarios
                          Shape: (num_scenarios, projection_years, 1)
                          Dtype: np.float64

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
            # Calculate total scenarios
            total_scenarios = self._config.outer_paths * self._config.inner_paths_per_outer

            # Validate output buffer shape
            expected_shape = (total_scenarios, self._config.projection_years)
            if output_buffer.shape != expected_shape:
                raise ExecutionError(
                    f"Output buffer shape mismatch. Expected {expected_shape}, got {output_buffer.shape}"
                )

            # Generate scenarios
            # For US-001, we'll implement a simple placeholder that writes scenarios
            # US-003 and US-004 will implement actual outer/inner path generation
            self._generate_scenarios(output_buffer)

            execution_time_ms = (time.time() - start_time) * 1000

            return {
                'execution_time_ms': execution_time_ms,
                'scenarios_generated': total_scenarios,
                'warnings': []
            }

        except Exception as e:
            raise ExecutionError(f"Failed to generate scenarios: {str(e)}")

    def _generate_scenarios(self, output_buffer: np.ndarray) -> None:
        """
        Generate all scenarios and write to output buffer.

        Uses outer paths (deterministic skeleton) as the base for each scenario group.
        Inner paths (stochastic) will be implemented in US-004.

        For US-003, we replicate each outer path multiple times (one for each inner path).
        US-004 will add stochastic variation to create true inner paths.

        Args:
            output_buffer: Numpy array to write scenarios to
                          Shape: (num_scenarios, projection_years)
        """
        if self._outer_paths is None:
            raise ExecutionError("Outer paths not generated. Call initialize() first.")

        total_scenarios = self._config.outer_paths * self._config.inner_paths_per_outer

        scenario_idx = 0
        for outer_idx in range(self._config.outer_paths):
            # Get the outer path (deterministic skeleton)
            outer_path = self._outer_paths[outer_idx, :]

            # For US-003, we replicate the outer path for all inner paths
            # US-004 will add stochastic variation here
            for inner_idx in range(self._config.inner_paths_per_outer):
                # Currently: just copy outer path (deterministic)
                # US-004 will add: inner_path = generate_inner_path(outer_path, outer_idx, inner_idx)
                output_buffer[scenario_idx, :] = outer_path
                scenario_idx += 1

        logger.debug(f"Generated {total_scenarios} scenarios × {self._config.projection_years} years "
                    f"(using {self._config.outer_paths} outer paths)")

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
