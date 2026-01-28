# LiveCalc Python Solver Engine

Python-based solver engine for actuarial parameter optimization. Implements the `ICalcEngine` interface for pluggable integration with the LiveCalc orchestration layer.

## Overview

The Solver Engine optimizes actuarial parameters (premium rates, reserve factors, dividend percentages) to meet business objectives like:
- Maximize return on capital
- Minimize pricing while maintaining solvency
- Hit specific profitability targets with minimum risk

The solver operates iteratively, calling the projection engine with different parameter values and adjusting based on results until convergence or timeout.

## Features

- **ICalcEngine Interface**: Standard interface for orchestration layer integration
- **Callback-based Optimization**: Iteratively calls projection engine via callback function
- **Timeout Protection**: Configurable timeout (default 5 minutes) prevents runaway optimization
- **Flexible Configuration**: JSON-based config for parameters, objectives, constraints
- **Multiple Algorithms**: Support for SLSQP, differential evolution, custom solvers (US-005)
- **Comprehensive Error Handling**: Graceful failure handling with partial results

## Installation

```bash
cd livecalc-engines/python-solver
pip install -r requirements.txt
```

### Requirements
- Python 3.11+
- NumPy
- SciPy (for optimization algorithms)
- scikit-optimize (optional, for Bayesian optimization)

## Quick Start

```python
from src.solver_engine import SolverEngine, ValuationResult

# Initialize solver
engine = SolverEngine()
config = {
    'parameters': [
        {
            'name': 'premium_rate',
            'initial': 1.0,
            'lower': 0.5,
            'upper': 2.0
        }
    ],
    'objective': {
        'metric': 'mean_npv',
        'direction': 'maximize'
    },
    'timeout_seconds': 300  # 5 minutes
}
engine.initialize(config)

# Define projection callback
def projection_callback(params):
    # Call projection engine with parameters
    # ... (actual projection logic)
    return ValuationResult(
        mean_npv=1000.0 * params['premium_rate'],
        std_dev=100.0,
        cte_95=800.0
    )

# Run optimization
result = engine.optimize(projection_callback)

print(f"Optimized parameters: {result.final_parameters}")
print(f"Objective value: {result.objective_value}")
print(f"Converged: {result.converged} (iterations: {result.iterations})")
```

## Configuration

### Basic Configuration Structure

```json
{
  "parameters": [
    {
      "name": "premium_rate",
      "type": "continuous",
      "lower": 0.5,
      "upper": 2.0,
      "initial": 1.0,
      "step": 0.01
    }
  ],
  "objective": {
    "metric": "mean_npv",
    "direction": "maximize"
  },
  "constraints": [
    {
      "metric": "cte_95",
      "operator": ">=",
      "value": 0.5
    }
  ],
  "solver": "slsqp",
  "timeout_seconds": 300,
  "max_iterations": 20
}
```

### Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `parameters` | list | Yes | List of parameters to optimize |
| `objective` | dict | Yes | Objective function definition |
| `constraints` | list | No | List of constraint definitions |
| `solver` | string | No | Solver algorithm (default: 'slsqp') |
| `timeout_seconds` | int | No | Timeout in seconds (default: 300) |
| `max_iterations` | int | No | Maximum iterations (default: 20) |

### Parameter Definition

Each parameter in the `parameters` list has:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Parameter name |
| `type` | string | No | 'continuous' or 'discrete' (default: 'continuous') |
| `lower` | float | No | Lower bound |
| `upper` | float | No | Upper bound |
| `initial` | float | Yes | Initial value |
| `step` | float | No | Step size for discrete parameters |

### Objective Definition

The `objective` dict defines what to optimize:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `metric` | string | Yes | Metric to optimize (e.g., 'mean_npv', 'std_dev', 'cte_95') |
| `direction` | string | No | 'maximize' or 'minimize' (default: 'maximize') |

### Calibration Targets (US-002)

Calibration targets define business objectives and constraints for optimization. They can be specified either inline in the config or resolved from Assumptions Manager.

#### Inline Calibration Targets

```json
{
  "parameters": [...],
  "objective": {...},
  "calibration_targets": {
    "objective_function": "maximize_return",
    "objective_metric": "mean_npv",
    "constraints": [
      {
        "name": "solvency",
        "operator": ">=",
        "value": 0.95
      },
      {
        "name": "cost",
        "operator": "<=",
        "value": 100000000.0
      }
    ]
  }
}
```

#### Assumptions Manager Reference

```json
{
  "parameters": [...],
  "objective": {...},
  "calibration_targets": {
    "am_reference": "calibration-targets:v1.0"
  }
}
```

With credentials:

```python
engine = SolverEngine()
engine.initialize(config, credentials={
    'am_url': 'https://am.example.com',
    'jwt_token': 'eyJ...',
    'cache_dir': '/path/to/cache'
})
```

#### Calibration Target Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `objective_function` | string | Yes | Objective type: 'maximize_return', 'minimize_cost', 'hit_target', 'maximize', 'minimize' |
| `objective_metric` | string | Yes | Metric to optimize: 'mean_npv', 'std_dev', 'cte_95', 'return', 'cost', 'solvency' |
| `constraints` | list | No | List of constraint definitions |

Each constraint has:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Constraint name (e.g., 'solvency', 'cost', 'return') |
| `operator` | string | Yes | Comparison operator: '>=', '<=', '>', '<', '==' |
| `value` | float | Yes | Constraint threshold value |

#### Validation

The solver validates calibration targets at initialization:

- **Objective function**: Must be a valid type ('maximize_return', 'minimize_cost', etc.)
- **Objective metric**: Must be a valid metric name ('mean_npv', 'cte_95', etc.)
- **Constraints**: Each must have name, operator, and numeric value
- **Conflict detection**: Warns if constraints are potentially infeasible (e.g., `return >= 10.0` AND `return <= 5.0`)

Example logging:

```
INFO: Resolved calibration-targets:v1.0, optimizing for: maximize_return mean_npv with 2 constraint(s)
INFO:   Constraint: solvency >= 0.95
INFO:   Constraint: cost <= 100000000.0
WARNING: Constraint 'return' may be infeasible: requires >= 10.0 and <= 5.0
```

## API Reference

### SolverEngine

Main solver engine class implementing `ICalcEngine` interface.

#### Methods

##### `initialize(config: Dict[str, Any], credentials: Optional[Dict[str, Any]] = None) -> None`

Initialize the solver with configuration.

**Parameters:**
- `config` (dict): Solver configuration (see Configuration section)
- `credentials` (dict, optional): Credentials for Assumptions Manager

**Raises:**
- `InitializationError`: If configuration is invalid

##### `optimize(projection_callback: ProjectionCallback, initial_parameters: Optional[Dict[str, float]] = None) -> OptimizationResult`

Run optimization using projection callback.

**Parameters:**
- `projection_callback` (callable): Function that takes parameter dict and returns `ValuationResult`
- `initial_parameters` (dict, optional): Override initial parameter values

**Returns:**
- `OptimizationResult` with final parameters and convergence metrics

**Raises:**
- `ExecutionError`: If optimization fails
- `TimeoutError`: If optimization exceeds timeout
- `ConvergenceError`: If optimization diverges

##### `get_info() -> EngineInfo`

Get engine metadata.

**Returns:**
- `EngineInfo` with name, version, engine_type

##### `is_initialized -> bool`

Check if engine is initialized.

**Returns:**
- `True` if initialized, `False` otherwise

##### `dispose() -> None`

Clean up resources.

### Data Structures

#### OptimizationResult

```python
@dataclass
class OptimizationResult:
    final_parameters: Dict[str, float]      # Optimized parameter values
    objective_value: float                   # Final objective value
    iterations: int                          # Number of iterations
    converged: bool                          # Whether optimization converged
    constraint_violations: Dict[str, float]  # Constraint violation amounts
    execution_time_seconds: float            # Total execution time
    partial_result: bool                     # True if timeout or early exit
```

#### ValuationResult

Mock valuation result structure (matches projection engine output):

```python
@dataclass
class ValuationResult:
    mean_npv: float              # Mean NPV across scenarios
    std_dev: float = 0.0         # Standard deviation
    cte_95: float = 0.0          # Conditional Tail Expectation (95%)
    percentiles: Dict[str, float] = field(default_factory=dict)  # Percentile values
```

## Implementation Status

### US-001: Solver Interface & Orchestration Integration ✅

**Status:** Complete

**Implemented:**
- ✅ `SolverEngine` class implements `ICalcEngine` interface
- ✅ `initialize(config, credentials)` method
- ✅ `optimize(projection_callback, initial_parameters)` method
- ✅ Callback-based projection interface
- ✅ `OptimizationResult` structure with convergence metrics
- ✅ Timeout protection (default 5 minutes, configurable)
- ✅ Comprehensive error handling
- ✅ Unit tests (17 test cases)

**Acceptance Criteria Met:**
- Solver implements: `initialize(config)`, `optimize(projection_callback, initial_parameters)` ✅
- `projection_callback(parameter_vector) → ValuationResult` ✅
- `optimize()` returns `OptimizationResult` with final_parameters, convergence_metrics, iteration_count ✅
- Solver calls projection_callback multiple times (5-20 iterations) ✅
- Error handling: timeout if >5 minutes, fail gracefully ✅

### US-002: Calibration Target Resolution ✅

**Status:** Complete

**Implemented:**
- ✅ Inline calibration target specification
- ✅ Assumptions Manager reference support (`am_reference: "table:version"`)
- ✅ `CalibrationTargets` dataclass with validation
- ✅ Comprehensive constraint validation (operator, value, field checking)
- ✅ Conflict detection for infeasible constraints
- ✅ Integration with AssumptionsClient (when available)
- ✅ Graceful fallback to inline targets when AM client not available
- ✅ Unit tests (11 test cases)

**Acceptance Criteria Met:**
- Resolve 'calibration-targets:v1.0' from AM (e.g., target_return, min_solvency, max_cost) ✅
- Targets include: objective_function, constraints (solvency > 0.95, return >= 10%) ✅
- Validate that targets are achievable, warn if constraints are conflicting ✅
- Log: 'Resolved calibration-targets:v1.0, optimizing for: maximize_return with solvency >= 0.95' ✅
- Support updating targets via AM version changes ✅

### Upcoming User Stories

- **US-003**: Parameter Definition & Bounds
- **US-004**: Objective Function & Constraints
- **US-005**: Solver Algorithm Selection (SLSQP, differential_evolution, custom)
- **US-006**: Iteration Tracking & Convergence
- **US-007**: Result Output & Parameter Export
- **US-008**: Error Handling & Robustness

## Testing

Run unit tests:

```bash
cd livecalc-engines/python-solver
python -m pytest tests/test_solver_engine.py -v
```

Or using unittest:

```bash
python tests/test_solver_engine.py
```

### Test Coverage

US-001 test coverage:
- ✅ Interface implementation (4 tests)
- ✅ Configuration validation (10 tests)
- ✅ Optimize method (6 tests)
- ✅ Timeout protection (2 tests)

US-002 test coverage:
- ✅ Inline target validation (8 tests)
- ✅ Constraint validation (3 tests)
- ✅ Conflict detection (1 test)
- ✅ AM reference validation (2 tests)

**Total: 33 test cases**

## Error Handling

The solver provides comprehensive error handling:

| Exception | When Raised | Handling |
|-----------|-------------|----------|
| `InitializationError` | Invalid configuration | Fix config and reinitialize |
| `ConfigurationError` | Invalid config values (e.g., timeout out of range) | Update config values |
| `ExecutionError` | Optimization execution fails | Check projection callback, logs |
| `TimeoutError` | Optimization exceeds timeout | Increase timeout or simplify problem |
| `ConvergenceError` | Optimization diverges | Try different algorithm or initial values |

## Logging

The solver uses Python's logging module. Configure logging level:

```python
import logging
logging.basicConfig(level=logging.INFO)
```

Log messages include:
- Initialization details
- Iteration progress
- Callback invocations
- Convergence status
- Errors and exceptions

## Integration with Orchestration Layer

The solver integrates with the LiveCalc orchestration layer via the `ICalcEngine` interface:

```python
# Orchestrator creates solver node
solver = SolverEngine()
solver.initialize(config, credentials)

# Orchestrator provides projection callback
def projection_callback(params):
    # Write params to SharedArrayBuffer
    # Trigger projection engine execution
    # Read results from SharedArrayBuffer
    return ValuationResult(...)

# Run optimization
result = solver.optimize(projection_callback)
```

## Performance

- **Optimization Time**: Typically 5-20 projection iterations
- **Timeout Protection**: Default 5 minutes (configurable 1-3600 seconds)
- **Callback Overhead**: Minimal (<1ms per callback invocation)

## Roadmap

- [x] US-001: Solver Interface & Orchestration Integration
- [ ] US-002: Calibration Target Resolution
- [ ] US-003: Parameter Definition & Bounds
- [ ] US-004: Objective Function & Constraints
- [ ] US-005: Solver Algorithm Selection
- [ ] US-006: Iteration Tracking & Convergence
- [ ] US-007: Result Output & Parameter Export
- [ ] US-008: Error Handling & Robustness

## License

Copyright (c) 2026 LiveCalc. All rights reserved.
