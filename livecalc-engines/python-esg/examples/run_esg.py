"""
Example: Running the Python ESG Engine

This script demonstrates how to use the PythonESGEngine to generate
economic scenarios for actuarial projections.
"""

import sys
import os
import numpy as np

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from esg_engine import PythonESGEngine


def main():
    """Run ESG engine example"""

    print("=== Python ESG Engine Example ===\n")

    # 1. Create engine instance
    print("1. Creating ESG engine...")
    engine = PythonESGEngine()
    print(f"   Engine: {engine.get_info().name} v{engine.get_info().version}")

    # 2. Configure and initialize
    print("\n2. Initializing with configuration...")
    config = {
        'esg_model': 'vasicek',
        'outer_paths': 3,
        'inner_paths_per_outer': 100,
        'seed': 42,
        'projection_years': 50,
        'assumptions_version': 'latest'
    }

    # Note: credentials would be provided by orchestrator in real usage
    # For this example, we run without AM credentials
    engine.initialize(config, credentials=None)
    print(f"   Initialized: {engine.is_initialized}")

    # 3. Prepare output buffer
    total_scenarios = config['outer_paths'] * config['inner_paths_per_outer']
    projection_years = config['projection_years']

    print(f"\n3. Preparing output buffer...")
    print(f"   Total scenarios: {total_scenarios}")
    print(f"   Projection years: {projection_years}")
    print(f"   Buffer shape: ({total_scenarios}, {projection_years})")

    output_buffer = np.zeros((total_scenarios, projection_years), dtype=np.float64)

    # 4. Run scenario generation
    print("\n4. Generating scenarios...")
    result = engine.runChunk(input_buffer=None, output_buffer=output_buffer)

    print(f"   Scenarios generated: {result['scenarios_generated']}")
    print(f"   Execution time: {result['execution_time_ms']:.2f} ms")
    print(f"   Warnings: {len(result['warnings'])}")

    # 5. Display sample results
    print("\n5. Sample scenario values:")
    print(f"   Scenario 0, Year 1: {output_buffer[0, 0]:.4f}")
    print(f"   Scenario 0, Year 10: {output_buffer[0, 9]:.4f}")
    print(f"   Scenario 0, Year 50: {output_buffer[0, 49]:.4f}")

    print(f"\n   Scenario 100, Year 1: {output_buffer[100, 0]:.4f}")
    print(f"   Scenario 100, Year 10: {output_buffer[100, 9]:.4f}")
    print(f"   Scenario 100, Year 50: {output_buffer[100, 49]:.4f}")

    # 6. Compute statistics
    print("\n6. Scenario statistics:")
    print(f"   Min rate: {np.min(output_buffer):.4f}")
    print(f"   Max rate: {np.max(output_buffer):.4f}")
    print(f"   Mean rate: {np.mean(output_buffer):.4f}")
    print(f"   Std dev: {np.std(output_buffer):.4f}")

    # 7. Clean up
    print("\n7. Disposing engine...")
    engine.dispose()
    print(f"   Disposed: {not engine.is_initialized}")

    print("\n=== Example Complete ===")


if __name__ == '__main__':
    main()
