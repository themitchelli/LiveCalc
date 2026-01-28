"""
LiveCalc Python Solver Engine.

Pluggable solver engine for parameter optimization in actuarial projections.
"""

from .calc_engine_interface import (
    ICalcEngine,
    EngineInfo,
    SolverError,
    InitializationError,
    ConfigurationError,
    ExecutionError,
    TimeoutError,
    ConvergenceError
)

from .solver_engine import (
    SolverEngine,
    OptimizationResult,
    ValuationResult,
    ProjectionCallback
)

from .result_exporter import ResultExporter

__version__ = "1.0.0"

__all__ = [
    "ICalcEngine",
    "EngineInfo",
    "SolverError",
    "InitializationError",
    "ConfigurationError",
    "ExecutionError",
    "TimeoutError",
    "ConvergenceError",
    "SolverEngine",
    "OptimizationResult",
    "ValuationResult",
    "ProjectionCallback",
    "ResultExporter",
]
