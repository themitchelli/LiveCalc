"""
Python ESG (Economic Scenario Generator) Engine

This package provides a pluggable Python-based Economic Scenario Generator
for the LiveCalc platform.
"""

from .calc_engine_interface import (
    ICalcEngine,
    EngineInfo,
    CalcEngineError,
    InitializationError,
    ConfigurationError,
    ExecutionError
)
from .esg_engine import PythonESGEngine, ESGConfig

__all__ = [
    'ICalcEngine',
    'EngineInfo',
    'CalcEngineError',
    'InitializationError',
    'ConfigurationError',
    'ExecutionError',
    'PythonESGEngine',
    'ESGConfig'
]

__version__ = '1.0.0'
