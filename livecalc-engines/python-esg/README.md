# Python ESG (Economic Scenario Generator) Engine

A pluggable Python-based Economic Scenario Generator for the LiveCalc platform.

## Overview

The Python ESG Engine generates interest rate scenarios for nested stochastic valuation in actuarial projections. It implements the `ICalcEngine` interface, enabling seamless integration with the LiveCalc orchestration layer.

### Features

- **Pluggable Architecture**: Implements `ICalcEngine` interface for orchestrator integration
- **Assumptions Manager Integration**: Resolves yield curve assumptions from Assumptions Manager
- **Deterministic & Stochastic Scenarios**: Generates outer paths (skeleton) and inner paths (Monte Carlo)
- **Zero-Copy Output**: Writes scenarios directly to SharedArrayBuffer for efficient handoff
- **Reproducible**: Seed-based scenario generation ensures consistent results

### Supported Models

- **Vasicek**: One-factor mean-reverting interest rate model
- **CIR** (Cox-Ingersoll-Ross): Mean-reverting model with volatility proportional to rate level

## Quick Start

### Installation

```bash
# Install dependencies
pip install numpy scipy

# Optional: Install assumptions_client for AM integration
cd ../../livecalc-assumptions-lib
pip install -e .
```

### Basic Usage

```python
import numpy as np
from python_esg.src.esg_engine import PythonESGEngine

# 1. Create and configure engine
engine = PythonESGEngine()

config = {
    'esg_model': 'vasicek',
    'outer_paths': 3,
    'inner_paths_per_outer': 100,
    'seed': 42,
    'projection_years': 50,
    'assumptions_version': 'latest'
}

engine.initialize(config, credentials=None)

# 2. Prepare output buffer
total_scenarios = 3 * 100  # outer_paths × inner_paths_per_outer
output_buffer = np.zeros((total_scenarios, 50), dtype=np.float64)

# 3. Generate scenarios
result = engine.runChunk(input_buffer=None, output_buffer=output_buffer)

print(f"Generated {result['scenarios_generated']} scenarios in {result['execution_time_ms']:.2f} ms")

# 4. Clean up
engine.dispose()
```

### Running Examples

```bash
# Basic example
python examples/run_esg.py

# With custom configuration
python examples/run_esg.py --config examples/esg_config.json
```

## Configuration

### Required Parameters

| Parameter | Type | Range | Description |
|-----------|------|-------|-------------|
| `esg_model` | string | 'vasicek' or 'cir' | Interest rate model type |
| `outer_paths` | int | 3-10 | Number of outer skeleton paths |
| `inner_paths_per_outer` | int | 100-10000 | Monte Carlo paths per outer path |
| `seed` | int | Any | Random seed for reproducibility |
| `projection_years` | int | 1-100 | Number of years to project |

### Optional Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `assumptions_version` | string | 'latest' | Yield curve version from AM |

### Example Configuration

```json
{
  "esg_model": "vasicek",
  "outer_paths": 5,
  "inner_paths_per_outer": 1000,
  "seed": 42,
  "projection_years": 50,
  "assumptions_version": "v2.1"
}
```

## API Reference

### ICalcEngine Interface

```python
class ICalcEngine(ABC):
    def initialize(config: Dict[str, Any], credentials: Optional[Dict[str, str]]) -> None
    def get_info() -> EngineInfo
    def runChunk(input_buffer: Optional[np.ndarray], output_buffer: np.ndarray) -> Dict[str, Any]
    def dispose() -> None

    @property
    def is_initialized() -> bool
```

### PythonESGEngine

```python
engine = PythonESGEngine()

# Initialize with configuration and credentials
engine.initialize(
    config={
        'esg_model': 'vasicek',
        'outer_paths': 3,
        'inner_paths_per_outer': 100,
        'seed': 42,
        'projection_years': 50
    },
    credentials={
        'am_url': 'https://assumptionsmanager.ddns.net',
        'am_token': 'jwt_token_here',
        'cache_dir': '/path/to/cache'
    }
)

# Get engine metadata
info = engine.get_info()
# EngineInfo(name='Python ESG Engine', version='1.0.0', engine_type='esg')

# Generate scenarios
output_buffer = np.zeros((300, 50), dtype=np.float64)
result = engine.runChunk(input_buffer=None, output_buffer=output_buffer)
# {'execution_time_ms': 5.2, 'scenarios_generated': 300, 'warnings': []}

# Clean up
engine.dispose()
```

### Outer Path Scenarios (US-003)

The ESG generates **outer paths** (deterministic skeleton scenarios) that represent different market conditions:

| Path | Description | Example |
|------|-------------|---------|
| 0 | Base case | Rates stay constant at initial level |
| 1 | Stress up | Rates increase 1% per year |
| 2 | Stress down | Rates decrease 0.5% per year (floor at 0.1%) |
| 3 | Mean reversion | Rates converge to long-term level |
| 4 | V-shaped recovery | Rates drop then rise |
| 5 | Inverted yield curve | Gradual normalization |
| 6 | Gradual drift | Uses AM drift parameter |
| 7 | High inflation | Rapid rate rise (2% per year) |
| 8 | Deflation | Gradual decline to near-zero |
| 9 | Volatile | Sine wave around base rate |

**Key Properties:**
- **Deterministic**: Outer paths are always the same for a given configuration
- **Reproducible**: Same config produces identical outer paths across runs
- **Interpretable**: Each path represents a specific market scenario
- **Parameter-driven**: Uses yield curve assumptions from AM when available

### Inner Path Generation (US-004)

For each outer path, the ESG generates **inner paths** (stochastic Monte Carlo scenarios) that add random variation around the outer path skeleton.

**Vasicek Model**:
```
dr = a × (b - r) × dt + σ × √dt × Z

where:
  a = mean reversion speed (from yield curve assumptions)
  b = long-term rate (outer path value at each year)
  r = current rate
  σ = volatility (from yield curve assumptions)
  Z ~ N(0, 1) = standard normal random variable
  dt = time step (1 year)
```

**Key Features**:
- **Stochastic Variation**: Each inner path differs from the outer path and from other inner paths
- **Mean Reversion**: Paths tend to revert toward the outer path (skeleton) over time
- **Reproducible**: Seed is deterministic: `hash(outer_id, inner_id, global_seed) % 2^31`
- **Fast Generation**: Target <1ms per path using NumPy vectorization
- **Positive Rates**: Floor at 0.1% (0.001) prevents negative rates
- **Independent**: Inner paths for different outer paths use independent random seeds

**Example**:
```python
# Configuration with 5 outer paths × 1000 inner paths = 5000 total scenarios
config = {
    'esg_model': 'vasicek',
    'outer_paths': 5,
    'inner_paths_per_outer': 1000,
    'seed': 42,
    'projection_years': 50
}

# Scenarios 0-999: Inner paths for outer path 0 (base case)
# Scenarios 1000-1999: Inner paths for outer path 1 (stress up)
# Scenarios 2000-2999: Inner paths for outer path 2 (stress down)
# ... and so on
```

### Output Format

Scenarios are written to the output buffer in the following format:

- **Shape**: `(num_scenarios, projection_years)`
- **Type**: `np.float64`
- **Units**: Per-annum interest rates (e.g., 0.03 for 3%)
- **Scenario ID**: `scenario_idx = outer_id * inner_paths_per_outer + inner_id`

Example:
```python
# Access scenario 0, year 1
rate = output_buffer[0, 0]  # e.g., 0.0301

# Access scenario 150, year 25
rate = output_buffer[150, 24]  # e.g., 0.0345
```

## Development

### Running Tests

```bash
# Run all tests
python -m unittest discover tests

# Run specific test file
python -m unittest tests.test_esg_engine

# Run with verbose output
python -m unittest discover tests -v
```

### Test Coverage

Current test coverage includes:
- Configuration validation (8 tests)
- Engine initialization (5 tests)
- Scenario generation (5 tests)
- Error handling (4 tests)
- Determinism verification (1 test)
- Yield curve assumption resolution (16 tests)
  - Structured parameter parsing
  - Flat array parsing
  - Field validation
  - Dimension checking
  - Error handling

**US-003: Outer Path Generation (9 tests)**
- Outer paths generated on initialization
- Deterministic generation (reproducible)
- Different scenarios per outer path
- Yield curve parameter integration
- Variable path counts (3-10)
- Variable projection years (10-100)
- Outer paths included in output
- Documentation verification

**US-004: Inner Path Generation (10 tests)**
- Stochastic variation added to outer paths
- Reproducibility with seed
- Different results with different seeds
- Mean reversion toward outer path
- Performance target validation (<1ms per path)
- Positive rate enforcement (0.1% floor)
- Yield curve parameter integration
- Independent inner paths per outer path
- Seeding independence across outer paths
- Correlation verification

**Total: 42 tests**

### Project Structure

```
python-esg/
├── src/
│   ├── __init__.py                    # Package exports
│   ├── calc_engine_interface.py       # ICalcEngine abstract interface
│   ├── esg_engine.py                  # PythonESGEngine implementation
│   ├── vasicek_model.py               # Vasicek model (US-003, US-004)
│   ├── cir_model.py                   # CIR model (US-003, US-004)
│   └── scenario_generator.py          # Outer/inner path generation (US-003, US-004)
├── tests/
│   ├── test_esg_engine.py             # Engine implementation tests
│   └── test_scenario_generation.py    # Scenario generation tests (US-003, US-004)
├── examples/
│   ├── run_esg.py                     # Basic usage example
│   └── esg_config.json                # Example configuration
└── README.md                          # This file
```

## Integration with Orchestrator

The ESG engine integrates with the LiveCalc orchestration layer as a pipeline node:

```python
# Orchestrator creates engine instances in workers
from python_esg.src import PythonESGEngine

engine = PythonESGEngine()

# Pass credentials from environment variables
credentials = {
    'am_url': os.environ.get('LIVECALC_AM_URL'),
    'am_token': os.environ.get('LIVECALC_AM_TOKEN'),
    'cache_dir': os.environ.get('LIVECALC_AM_CACHE_DIR')
}

# Initialize with pipeline configuration
engine.initialize(pipeline_config['esg_node'], credentials)

# Allocate output buffer in SharedArrayBuffer
output_buffer = shared_buffer_manager.allocate('bus://scenarios/rates', ...)

# Generate scenarios
result = engine.runChunk(None, output_buffer)

# Scenarios now available to downstream projection engine via bus://
```

## Performance Targets

| Metric | Target | Status (US-004) |
|--------|--------|-----------------|
| 10K scenarios generation | < 10 seconds | ✅ Implemented |
| Inner path generation | < 1 ms per path | ✅ Implemented (Vasicek) |
| Memory footprint | Scenarios in SAB only | ✅ Verified |

Note: Performance targets fully validated through automated tests. Actual timing depends on hardware and Python environment.

## Error Handling

The engine raises specific exceptions for different error conditions:

```python
from python_esg.src import (
    InitializationError,
    ConfigurationError,
    ExecutionError
)

try:
    engine.initialize(config, credentials)
except ConfigurationError as e:
    print(f"Invalid configuration: {e}")
except InitializationError as e:
    print(f"Failed to initialize: {e}")

try:
    result = engine.runChunk(None, output_buffer)
except ExecutionError as e:
    print(f"Scenario generation failed: {e}")
```

## Assumptions Manager Integration

When AM credentials are provided, the engine resolves yield curve assumptions from the Assumptions Manager:

### Required Yield Curve Structure

The engine expects yield curve parameters with the following structure:

- **`initial_yield_curve`**: Vector of interest rates by tenor (e.g., 20 tenors for 1Y-20Y)
- **`volatility_matrix`**: Square matrix of volatilities (NxN for N tenors)
- **`drift_rates`**: Vector of drift parameters by tenor
- **`mean_reversion`**: Scalar mean reversion parameter

### Example Usage

```python
credentials = {
    'am_url': 'https://assumptionsmanager.ddns.net',
    'am_token': 'jwt_token_here',
    'cache_dir': '/path/to/cache'
}

config = {
    'esg_model': 'vasicek',
    'assumptions_version': 'v2.1',  # or 'latest'
    # ...
}

engine.initialize(config, credentials)
# Logs: "Resolved yield-curve-parameters:v2.1"
# Or: "Resolved yield-curve-parameters:latest → v2.1"
```

### Version Resolution

- **Specific version** (e.g., `'v2.1'`): Fetches and caches that exact version
- **`'latest'`**: Always fetches the current approved version from AM
- **`'draft'`**: Fetches current draft version (if permissions allow)

### Validation

The engine validates all required fields are present and properly dimensioned:
- Volatility matrix must be square and match curve length
- Drift rates must match curve length
- Mean reversion must be numeric

If validation fails, initialization raises `InitializationError` with details.

### Fallback Behavior

Without credentials, the engine uses default parameters (for testing/development).

## Roadmap

- [x] **US-001**: ICalcEngine Interface Implementation
- [x] **US-002**: Yield Curve Assumption Resolution
- [x] **US-003**: Outer Path Generation (Deterministic skeleton)
- [ ] **US-004**: Inner Path Generation (Monte Carlo on-the-fly)
- [ ] **US-005**: Scenario Output Format
- [ ] **US-006**: Configuration & Parameter Management
- [ ] **US-007**: Performance & Memory Efficiency
- [ ] **US-008**: Error Handling & Logging

## License

Part of the LiveCalc platform. See project root for license information.

## Contributing

This engine follows the LiveCalc coding standards documented in `standards/coding.md`.

Key conventions:
- Python 3.11+ required
- Type hints for all public APIs
- PEP 8 style guide
- Comprehensive unit tests (>80% coverage target)
- Clear error messages with context
