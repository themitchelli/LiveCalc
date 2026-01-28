#!/usr/bin/env python3
"""
Generate economic scenarios for LiveCalc demo using Python ESG Engine.

Generates 1,000 scenarios (10 outer paths × 100 inner paths each)
using the ESG engine from PRD-LC-007.
"""

import argparse
import sys
import os
import json
from datetime import datetime
import numpy as np

# Add ESG engine to path
# Need to add the parent directory for the ESG engine's own imports to work
esg_src_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../livecalc-engines/python-esg/src'))
esg_parent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../livecalc-engines/python-esg'))
sys.path.insert(0, esg_src_path)
sys.path.insert(0, esg_parent_path)

try:
    from src.esg_engine import PythonESGEngine
except ImportError as e:
    print(f"Error: Could not import ESG engine: {e}", file=sys.stderr)
    print("Make sure PRD-LC-007 is complete.", file=sys.stderr)
    sys.exit(1)


def generate_scenarios(
    outer_paths: int = 10,
    inner_paths: int = 100,
    projection_years: int = 50,
    seed: int = 42,
    output_file: str = 'scenarios_1k.npy'
):
    """
    Generate economic scenarios using ESG engine.

    Args:
        outer_paths: Number of outer scenario paths (default: 10)
        inner_paths: Number of inner paths per outer path (default: 100)
        projection_years: Number of years to project (default: 50)
        seed: Random seed for reproducibility (default: 42)
        output_file: Output file path (default: scenarios_1k.npy)
    """
    total_scenarios = outer_paths * inner_paths

    print(f"Generating {total_scenarios} scenarios ({outer_paths} outer × {inner_paths} inner)...")
    print(f"Projection years: {projection_years}")
    print(f"Random seed: {seed}")

    # Create ESG engine
    engine = PythonESGEngine()

    # ESG configuration
    config = {
        'esg_model': 'vasicek',
        'outer_paths': outer_paths,
        'inner_paths_per_outer': inner_paths,
        'seed': seed,
        'projection_years': projection_years,
        'assumptions_version': 'latest',  # Will use fallback defaults since no AM connection
    }

    # No AM credentials for demo data generation
    credentials = None

    print("Initializing ESG engine...")
    start_time = datetime.now()

    try:
        engine.initialize(config, credentials)
    except Exception as e:
        print(f"Error initializing ESG engine: {e}", file=sys.stderr)
        sys.exit(1)

    init_time = (datetime.now() - start_time).total_seconds()
    print(f"Initialized in {init_time:.2f}s")

    # Calculate buffer size for structured format
    # Each scenario row: scenario_id (u4) + year (u4) + rate (f4)
    total_rows = total_scenarios * projection_years

    print(f"Allocating buffer for {total_rows:,} rows...")

    # Create output buffer with structured dtype as expected by ESG engine
    dt = np.dtype([('scenario_id', '<u4'), ('year', '<u4'), ('rate', '<f4')])
    output_buffer = np.zeros(total_rows, dtype=dt)

    print("Generating scenarios...")
    start_time = datetime.now()

    try:
        result = engine.runChunk(None, output_buffer)  # No input for ESG
    except Exception as e:
        print(f"Error generating scenarios: {e}", file=sys.stderr)
        sys.exit(1)

    generation_time = (datetime.now() - start_time).total_seconds()
    print(f"Generated scenarios in {generation_time:.2f}s")

    # Output buffer is already structured, no need to parse
    scenarios_structured = output_buffer

    # Validate results
    unique_scenarios = np.unique(scenarios_structured['scenario_id'])
    unique_years = np.unique(scenarios_structured['year'])

    print(f"\n=== Scenario Generation Summary ===")
    print(f"Total scenarios: {len(unique_scenarios):,}")
    print(f"Projection years: {len(unique_years)} (range: {unique_years.min()}-{unique_years.max()})")
    print(f"Total rows: {len(scenarios_structured):,}")
    print(f"\nInterest rates:")
    print(f"  Mean: {scenarios_structured['rate'].mean():.4f} ({scenarios_structured['rate'].mean() * 100:.2f}%)")
    print(f"  Std dev: {scenarios_structured['rate'].std():.4f}")
    print(f"  Range: {scenarios_structured['rate'].min():.4f} - {scenarios_structured['rate'].max():.4f}")
    print("=" * 50)

    # Save to file
    print(f"\nSaving to {output_file}...")
    start_time = datetime.now()

    np.save(output_file, scenarios_structured)

    write_time = (datetime.now() - start_time).total_seconds()

    # Get file size
    file_size_mb = os.path.getsize(output_file) / (1024 * 1024)
    print(f"Wrote {output_file} ({file_size_mb:.1f} MB) in {write_time:.2f}s")

    # Save metadata
    metadata_file = output_file.replace('.npy', '_metadata.json')
    metadata = {
        'outer_paths': outer_paths,
        'inner_paths_per_outer': inner_paths,
        'total_scenarios': total_scenarios,
        'projection_years': projection_years,
        'seed': seed,
        'esg_model': 'vasicek',
        'generated_at': datetime.now().isoformat(),
        'total_rows': len(scenarios_structured),
        'mean_rate': float(scenarios_structured['rate'].mean()),
        'std_dev_rate': float(scenarios_structured['rate'].std()),
        'min_rate': float(scenarios_structured['rate'].min()),
        'max_rate': float(scenarios_structured['rate'].max()),
    }

    with open(metadata_file, 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"Saved metadata to {metadata_file}")

    # Cleanup
    engine.dispose()

    print(f"\nTotal time: {init_time + generation_time + write_time:.2f}s")
    print("\n✓ Demo scenario data ready!")


def main():
    parser = argparse.ArgumentParser(
        description='Generate economic scenarios for LiveCalc demo',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate 1K scenarios (default: 10 outer × 100 inner)
  python generate_scenarios.py

  # Generate custom configuration
  python generate_scenarios.py --outer-paths 5 --inner-paths 200 --projection-years 40

  # Specify output file and seed
  python generate_scenarios.py --output my_scenarios.npy --seed 123
        """
    )
    parser.add_argument(
        '--outer-paths',
        type=int,
        default=10,
        help='Number of outer scenario paths (default: 10)'
    )
    parser.add_argument(
        '--inner-paths',
        type=int,
        default=100,
        help='Number of inner paths per outer path (default: 100)'
    )
    parser.add_argument(
        '--projection-years',
        type=int,
        default=50,
        help='Number of years to project (default: 50)'
    )
    parser.add_argument(
        '--seed',
        type=int,
        default=42,
        help='Random seed for reproducibility (default: 42)'
    )
    parser.add_argument(
        '--output',
        type=str,
        default='scenarios_1k.npy',
        help='Output file path (default: scenarios_1k.npy)'
    )

    args = parser.parse_args()

    # Validate inputs
    if args.outer_paths < 3 or args.outer_paths > 10:
        print("Error: outer-paths must be 3-10", file=sys.stderr)
        sys.exit(1)

    if args.inner_paths < 100 or args.inner_paths > 10000:
        print("Error: inner-paths must be 100-10000", file=sys.stderr)
        sys.exit(1)

    if args.projection_years < 1 or args.projection_years > 100:
        print("Error: projection-years must be 1-100", file=sys.stderr)
        sys.exit(1)

    # Generate scenarios
    generate_scenarios(
        outer_paths=args.outer_paths,
        inner_paths=args.inner_paths,
        projection_years=args.projection_years,
        seed=args.seed,
        output_file=args.output
    )


if __name__ == '__main__':
    main()
