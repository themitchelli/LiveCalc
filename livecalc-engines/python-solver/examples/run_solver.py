"""
Example usage of the Python Solver Engine.

Demonstrates:
- Initializing the solver with configuration
- Defining a projection callback
- Running optimization
- Handling results
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.solver_engine import SolverEngine, ValuationResult


def main():
    """Run solver example."""
    print("=" * 60)
    print("LiveCalc Python Solver Engine - Example Usage")
    print("=" * 60)
    print()

    # Step 1: Create solver configuration
    print("Step 1: Creating solver configuration...")
    config = {
        'parameters': [
            {
                'name': 'premium_rate',
                'initial': 1.0,
                'lower': 0.5,
                'upper': 2.0,
                'type': 'continuous'
            },
            {
                'name': 'reserve_factor',
                'initial': 0.9,
                'lower': 0.7,
                'upper': 1.2,
                'type': 'continuous'
            }
        ],
        'objective': {
            'metric': 'mean_npv',
            'direction': 'maximize'
        },
        'constraints': [
            {
                'metric': 'cte_95',
                'operator': '>=',
                'value': 0.5
            }
        ],
        'solver': 'slsqp',
        'timeout_seconds': 300,
        'max_iterations': 20
    }
    print(f"  Parameters: {len(config['parameters'])}")
    print(f"  Objective: {config['objective']['metric']} ({config['objective']['direction']})")
    print(f"  Timeout: {config['timeout_seconds']}s")
    print()

    # Step 2: Initialize solver
    print("Step 2: Initializing solver...")
    engine = SolverEngine()
    engine.initialize(config)
    print(f"  Engine: {engine.get_info().name} v{engine.get_info().version}")
    print(f"  Status: {'Initialized' if engine.is_initialized else 'Not initialized'}")
    print()

    # Step 3: Define projection callback
    print("Step 3: Defining projection callback...")
    callback_invocations = {'count': 0}

    def projection_callback(params):
        """
        Mock projection callback that simulates projection engine.

        In real usage, this would:
        1. Write parameters to SharedArrayBuffer
        2. Trigger projection engine execution
        3. Read results from SharedArrayBuffer
        4. Return ValuationResult

        For this example, we use a simple formula:
        - NPV = 1000 * premium_rate * reserve_factor
        - Higher premium and higher reserve → higher NPV
        """
        callback_invocations['count'] += 1

        premium_rate = params['premium_rate']
        reserve_factor = params['reserve_factor']

        # Simple mock calculation
        mean_npv = 1000.0 * premium_rate * reserve_factor
        std_dev = 100.0 * premium_rate
        cte_95 = mean_npv * 0.8

        print(f"    Callback #{callback_invocations['count']}: premium={premium_rate:.3f}, reserve={reserve_factor:.3f} → NPV={mean_npv:.2f}")

        return ValuationResult(
            mean_npv=mean_npv,
            std_dev=std_dev,
            cte_95=cte_95
        )

    print("  Callback defined (mock projection)")
    print()

    # Step 4: Run optimization
    print("Step 4: Running optimization...")
    result = engine.optimize(projection_callback)
    print()

    # Step 5: Display results
    print("=" * 60)
    print("Optimization Results")
    print("=" * 60)
    print()
    print(f"Converged: {result.converged}")
    print(f"Iterations: {result.iterations}")
    print(f"Execution time: {result.execution_time_seconds:.3f}s")
    print(f"Partial result: {result.partial_result}")
    print()
    print("Final Parameters:")
    for param_name, param_value in result.final_parameters.items():
        print(f"  {param_name}: {param_value:.4f}")
    print()
    print(f"Objective Value: {result.objective_value:.2f}")
    print()
    if result.constraint_violations:
        print("Constraint Violations:")
        for constraint, violation in result.constraint_violations.items():
            print(f"  {constraint}: {violation:.4f}")
    else:
        print("No constraint violations")
    print()

    # Step 6: Clean up
    print("Step 6: Cleaning up...")
    engine.dispose()
    print(f"  Engine disposed: {not engine.is_initialized}")
    print()
    print("=" * 60)
    print("Example completed successfully!")
    print("=" * 60)


if __name__ == '__main__':
    main()
