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

    # 3. Prepare structured output buffer (US-005 format)
    total_scenarios = config['outer_paths'] * config['inner_paths_per_outer']
    projection_years = config['projection_years']
    total_rows = total_scenarios * projection_years

    print(f"\n3. Preparing structured output buffer (US-005 format)...")
    print(f"   Total scenarios: {total_scenarios}")
    print(f"   Projection years: {projection_years}")
    print(f"   Total rows: {total_rows} ({total_scenarios} × {projection_years})")
    print(f"   Memory: {total_rows * 12 / 1024:.1f} KB")

    # Create structured array: [scenario_id, year, rate]
    dtype = np.dtype([('scenario_id', 'u4'), ('year', 'u4'), ('rate', 'f4')])
    output_buffer = np.zeros(total_rows, dtype=dtype)

    # 4. Run scenario generation
    print("\n4. Generating scenarios...")
    result = engine.runChunk(input_buffer=None, output_buffer=output_buffer)

    print(f"   Scenarios generated: {result['scenarios_generated']}")
    print(f"   Execution time: {result['execution_time_ms']:.2f} ms")
    print(f"   Warnings: {len(result['warnings'])}")

    # 5. Display sample results
    print("\n5. Sample scenario data (structured format):")
    print(f"   Row 0: scenario_id={output_buffer[0]['scenario_id']}, "
          f"year={output_buffer[0]['year']}, rate={output_buffer[0]['rate']:.4f}")
    print(f"   Row 1: scenario_id={output_buffer[1]['scenario_id']}, "
          f"year={output_buffer[1]['year']}, rate={output_buffer[1]['rate']:.4f}")
    print(f"   Row 2: scenario_id={output_buffer[2]['scenario_id']}, "
          f"year={output_buffer[2]['year']}, rate={output_buffer[2]['rate']:.4f}")

    # 6. Query specific scenarios
    print("\n6. Querying specific data:")

    # Get all data for scenario 0 (outer=0, inner=0)
    scenario_0 = output_buffer[output_buffer['scenario_id'] == 0]
    print(f"   Scenario 0 has {len(scenario_0)} years")
    print(f"   Scenario 0, Year 1: {scenario_0[0]['rate']:.4f}")
    print(f"   Scenario 0, Year 50: {scenario_0[49]['rate']:.4f}")

    # Get all data for scenario 1005 (outer=1, inner=5)
    scenario_1005 = output_buffer[output_buffer['scenario_id'] == 1005]
    print(f"   Scenario 1005 has {len(scenario_1005)} years")
    print(f"   Scenario 1005, Year 1: {scenario_1005[0]['rate']:.4f}")

    # Get year 25 across all scenarios
    year_25_data = output_buffer[output_buffer['year'] == 25]
    print(f"   Year 25 has {len(year_25_data)} scenarios")
    print(f"   Year 25 mean rate: {np.mean(year_25_data['rate']):.4f}")

    # 7. Compute statistics
    print("\n7. Scenario statistics:")
    all_rates = output_buffer['rate']
    print(f"   Min rate: {np.min(all_rates):.4f}")
    print(f"   Max rate: {np.max(all_rates):.4f}")
    print(f"   Mean rate: {np.mean(all_rates):.4f}")
    print(f"   Std dev: {np.std(all_rates):.4f}")

    # 8. Example: Legacy 2D format (backwards compatibility)
    print("\n8. Legacy format example (backwards compatibility):")
    output_buffer_legacy = np.zeros((total_scenarios, projection_years), dtype=np.float64)
    result_legacy = engine.runChunk(input_buffer=None, output_buffer=output_buffer_legacy)
    print(f"   Generated {result_legacy['scenarios_generated']} scenarios")
    print(f"   Scenario 0, Year 1: {output_buffer_legacy[0, 0]:.4f}")
    print(f"   Scenario 100, Year 25: {output_buffer_legacy[100, 24]:.4f}")

    # 9. Clean up
    print("\n9. Disposing engine...")
    engine.dispose()
    print(f"   Disposed: {not engine.is_initialized}")

    print("\n=== Example Complete ===")


if __name__ == '__main__':
    main()
