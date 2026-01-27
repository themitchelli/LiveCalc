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

        Raises:
            InitializationError: If resolution fails
        """
        if not self._assumptions_client:
            logger.warning("No assumptions client available for yield curve resolution")
            return

        try:
            # Resolve yield curve parameters
            # Expected structure: initial_yield_curve (vector by tenor),
            # volatility_matrix, drift_rates, mean_reversion
            params = self._assumptions_client.resolve(
                'yield-curve-parameters',
                self._config.assumptions_version
            )

            # For now, store as dict placeholder
            # Real implementation would parse structured data
            self._yield_curve_params = {
                'data': params,
                'version': self._config.assumptions_version
            }

            logger.info(f"Resolved yield-curve-parameters:{self._config.assumptions_version}")

        except Exception as e:
            raise InitializationError(f"Failed to resolve yield curve assumptions: {str(e)}")

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
        Generate scenarios and write to output buffer.

        For US-001, this is a simple placeholder. US-003 and US-004 will implement
        the full outer/inner path generation logic.

        Args:
            output_buffer: Numpy array to write scenarios to
        """
        # Placeholder: Generate simple deterministic scenarios for testing
        np.random.seed(self._config.seed)

        total_scenarios = self._config.outer_paths * self._config.inner_paths_per_outer

        for scenario_idx in range(total_scenarios):
            # Simple deterministic pattern: base rate + small variation
            base_rate = 0.03  # 3% base rate
            variation = (scenario_idx % 10) * 0.001  # Small variation

            for year in range(self._config.projection_years):
                rate = base_rate + variation + (year * 0.0001)  # Slight drift
                output_buffer[scenario_idx, year] = rate

        logger.debug(f"Generated {total_scenarios} scenarios × {self._config.projection_years} years")

    def dispose(self) -> None:
        """
        Clean up resources and free memory.
        """
        self._initialized = False
        self._config = None
        self._assumptions_client = None
        self._yield_curve_params = None
        logger.info("ESG engine disposed")

    @property
    def is_initialized(self) -> bool:
        """Check if the engine is initialized."""
        return self._initialized
