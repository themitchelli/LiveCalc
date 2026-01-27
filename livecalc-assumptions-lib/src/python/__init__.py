"""
LiveCalc Assumptions Client Library

Python client for resolving assumptions from Assumptions Manager.
"""

from .assumptions_client import (
    AssumptionsClient,
    AssumptionsError,
    PolicyAttrs,
    PolicyAttrValue,
    CacheStats,
)

__all__ = [
    'AssumptionsClient',
    'AssumptionsError',
    'PolicyAttrs',
    'PolicyAttrValue',
    'CacheStats',
]

__version__ = '0.1.0'
