"""
ICalcEngine interface for pluggable calculation engines.

This interface is language-agnostic and defines the contract that all
calculation engines (WASM, Python, etc.) must implement for orchestration.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from dataclasses import dataclass


@dataclass
class EngineInfo:
    """Metadata about a calculation engine."""
    name: str
    version: str
    engine_type: str  # 'solver', 'projection', 'esg', etc.


class ICalcEngine(ABC):
    """
    Interface for pluggable calculation engines.

    All engines (WASM, Python, etc.) must implement this interface
    to be orchestrated in the calculation DAG.
    """

    @abstractmethod
    def initialize(self, config: Dict[str, Any], credentials: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize the engine with configuration and credentials.

        Args:
            config: Engine-specific configuration (parameters, algorithm settings, etc.)
            credentials: Optional credentials for accessing external services (AM, databases, etc.)

        Raises:
            InitializationError: If initialization fails (invalid config, missing credentials, etc.)
        """
        pass

    @abstractmethod
    def get_info(self) -> EngineInfo:
        """
        Get metadata about this engine.

        Returns:
            EngineInfo with name, version, engine_type
        """
        pass

    @property
    @abstractmethod
    def is_initialized(self) -> bool:
        """
        Check if engine is initialized and ready to run.

        Returns:
            True if initialized, False otherwise
        """
        pass

    @abstractmethod
    def dispose(self) -> None:
        """
        Clean up resources (memory, temp files, connections, etc.).

        Called when engine is no longer needed.
        """
        pass


class SolverError(Exception):
    """Base exception for solver-related errors."""
    pass


class InitializationError(SolverError):
    """Raised when engine initialization fails."""
    pass


class ConfigurationError(SolverError):
    """Raised when configuration is invalid."""
    pass


class ExecutionError(SolverError):
    """Raised when optimization execution fails."""
    pass


class TimeoutError(SolverError):
    """Raised when optimization times out."""
    pass


class ConvergenceError(SolverError):
    """Raised when optimization fails to converge."""
    pass
