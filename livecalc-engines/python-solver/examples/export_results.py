#!/usr/bin/env python3
"""
Example demonstrating result export functionality (US-007).

Shows how to:
- Export optimization results to JSON
- Export iteration history to Parquet
- Generate human-readable summaries
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.solver_engine import SolverEngine, ValuationResult
from typing import Dict


def main():
    """Run optimization and demonstrate export options."""

    print("=== LiveCalc Solver Result Export Example ===\n")

    # 1. Create and configure solver
    engine = SolverEngine()
    config = {
        'parameters': [
            {
                'name': 'premium_rate',
                'lower': 0.8,
                'upper': 1.5,
                'initial': 1.0
            },
            {
                'name': 'reserve_factor',
                'lower': 0.5,
                'upper': 1.2,
                'initial': 0.9
            }
        ],
        'objective': {
            'metric': 'mean_npv',
            'direction': 'maximize'
        },
        'constraints': [
            {
                'name': 'std_dev',
                'operator': '<=',
                'value': 200.0
            },
            {
                'name': 'cte_95',
                'operator': '>=',
                'value': 800.0
            }
        ],
        'algorithm': 'slsqp',
        'max_iterations': 15,
        'timeout_seconds': 60
    }

    print("Initializing solver with configuration:")
    print(f"  Parameters: {len(config['parameters'])}")
    print(f"  Constraints: {len(config['constraints'])}")
    print(f"  Algorithm: {config['algorithm']}")
    print()

    engine.initialize(config)

    # 2. Define projection callback
    def projection_callback(params: Dict[str, float]) -> ValuationResult:
        """Mock projection that depends on parameters."""
        premium = params['premium_rate']
        reserve = params['reserve_factor']

        # Simulate complex objective
        mean_npv = 1000.0 * premium + 500.0 * reserve + 200.0 * (1 - abs(premium - 1.1))
        std_dev = 100.0 + 50.0 * abs(premium - 1.0)
        cte_95 = mean_npv * 0.9 - std_dev * 0.5

        return ValuationResult(
            mean_npv=mean_npv,
            std_dev=std_dev,
            cte_95=cte_95
        )

    # 3. Run optimization
    print("Running optimization...")
    result = engine.optimize(projection_callback)

    print(f"Optimization completed in {result.execution_time_seconds:.2f}s")
    print(f"Converged: {result.converged}")
    print(f"Iterations: {result.iterations}")
    print()

    # 4. Export to JSON (basic)
    print("=== JSON Export (Basic) ===")
    json_basic = result.to_json(pretty=True)
    print(json_basic)
    print()

    # 5. Export to JSON (with iteration history)
    print("=== JSON Export (With Iteration History) ===")
    history = engine.get_iteration_history()
    json_with_history = result.to_json(
        include_history=True,
        iteration_history=history,
        pretty=True
    )

    # Save to file
    output_dir = Path(__file__).parent / "output"
    output_dir.mkdir(exist_ok=True)

    json_file = output_dir / "optimization_result.json"
    result.to_json_file(
        str(json_file),
        include_history=True,
        iteration_history=history
    )
    print(f"Saved full JSON to: {json_file}")
    print(f"  Includes {len(history)} iterations")
    print()

    # 6. Export iteration history to Parquet
    try:
        import pandas as pd

        print("=== Parquet Export (Iteration History) ===")
        parquet_file = output_dir / "iteration_history.parquet"

        run_metadata = {
            'timestamp': '2026-01-28T00:00:00',
            'algorithm': config['algorithm'],
            'num_parameters': len(config['parameters']),
            'converged': result.converged
        }

        engine.export_iteration_history(
            str(parquet_file),
            run_metadata=run_metadata
        )

        print(f"Saved iteration history to: {parquet_file}")

        # Show sample data
        df = pd.read_parquet(parquet_file)
        print(f"\nIteration history shape: {df.shape}")
        print("\nFirst 5 iterations:")
        print(df.head().to_string())
        print()

    except ImportError:
        print("Parquet export skipped (pandas not available)")
        print()

    # 7. Generate human-readable summary
    print("=== Human-Readable Summary ===")
    summary = result.to_summary()
    print(summary)
    print()

    # 8. Show final parameters
    print("=== Final Optimized Parameters ===")
    for name, value in result.final_parameters.items():
        print(f"  {name}: {value:.4f}")
    print()

    print(f"All exports saved to: {output_dir}/")


if __name__ == '__main__':
    main()
