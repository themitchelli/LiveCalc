"""
CalcEngine Interface for Python Engines

This module defines the abstract interface that all pluggable Python calculation engines
must implement to integrate with the LiveCalc orchestration layer.

Design Principles:
- Stateless: Each runChunk call should be independent
- Deterministic: Same inputs produce same outputs
- Thread-safe: Engine instances are not shared between threads
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from dataclasses import dataclass
import numpy as np


@dataclass
class EngineInfo:
    """
    Metadata about the engine implementation.

    Attributes:
        name: Human-readable engine name (e.g., "Python ESG")
        version: Semantic version string (e.g., "1.0.0")
        engine_type: Type of engine (e.g., "esg", "projection", "solver")
        supports_assumptions_manager: Whether engine can resolve assumptions from AM
    """
    name: str
    version: str
    engine_type: str
    supports_assumptions_manager: bool = True


class CalcEngineError(Exception):
    """Base exception for CalcEngine errors"""
    pass


class InitializationError(CalcEngineError):
    """Raised when engine initialization fails"""
    pass


class ConfigurationError(CalcEngineError):
    """Raised when configuration is invalid"""
    pass


class ExecutionError(CalcEngineError):
    """Raised when runChunk execution fails"""
    pass


class ICalcEngine(ABC):
    """
    Abstract interface for pluggable calculation engines.

    This interface enables the orchestrator to run different types of calculation
    engines (ESG, projection, solver) in a unified pipeline.

    Usage Example:
        engine = MyESGEngine()
        await engine.initialize(config, credentials)
        result = await engine.runChunk(input_buffer, output_buffer)
        engine.dispose()
    """

    @abstractmethod
    def initialize(self, config: Dict[str, Any], credentials: Optional[Dict[str, str]] = None) -> None:
        """
        Initialize the engine with configuration and credentials.

        Args:
            config: Engine-specific configuration (e.g., ESG model type, parameters)
            credentials: Optional Assumptions Manager credentials
                - 'am_url': Assumptions Manager base URL
                - 'am_token': JWT authentication token
                - 'cache_dir': Local cache directory path

        Raises:
            InitializationError: If initialization fails
            ConfigurationError: If config is invalid
        """
        pass

    @abstractmethod
    def get_info(self) -> EngineInfo:
        """
        Get engine metadata and capabilities.

        Returns:
            EngineInfo: Engine information
        """
        pass

    @abstractmethod
    def runChunk(
        self,
        input_buffer: Optional[np.ndarray],
        output_buffer: np.ndarray
    ) -> Dict[str, Any]:
        """
        Execute computation and write results to output buffer.

        Args:
            input_buffer: Input data (None for engines with no input dependencies like ESG)
            output_buffer: Pre-allocated numpy array for results.
                          For ESG: shape (num_scenarios, projection_years, 1)
                          Dtype: np.float64

        Returns:
            Dict with execution metadata:
                - 'execution_time_ms': Execution time in milliseconds
                - 'scenarios_generated': Number of scenarios generated
                - 'warnings': List of warning messages (if any)

        Raises:
            ExecutionError: If computation fails
        """
        pass

    @abstractmethod
    def dispose(self) -> None:
        """
        Clean up resources and free memory.

        After calling dispose(), the engine must be re-initialized before use.
        """
        pass

    @property
    @abstractmethod
    def is_initialized(self) -> bool:
        """Check if the engine is initialized and ready."""
        pass
