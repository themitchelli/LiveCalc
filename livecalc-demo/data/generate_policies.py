#!/usr/bin/env python3
"""
Generate realistic synthetic policy data for LiveCalc demo.

This script generates 1,000,000 policies with realistic attributes:
- Ages: 20-75 (bell curve centered at 40)
- Gender: ~50/50 split
- Smoker status: ~15% smokers (realistic rate)
- Products: Term Life (70%), Whole Life (20%), Endowment (10%)
- Sum assured: £100K - £1M based on age and product
- Premium: Calculated from sum assured, age, and product type
- Policy term: 10-40 years for term products

Output: Parquet file for efficient I/O in demo
"""

import argparse
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from datetime import datetime
import sys


def generate_policies(num_policies: int, seed: int = 42) -> pa.Table:
    """
    Generate synthetic but realistic policy data.

    Args:
        num_policies: Number of policies to generate
        seed: Random seed for reproducibility

    Returns:
        PyArrow table with policy data
    """
    rng = np.random.default_rng(seed)

    print(f"Generating {num_policies:,} policies with seed {seed}...")

    # Generate policy IDs (sequential)
    policy_ids = np.arange(1, num_policies + 1, dtype=np.uint64)

    # Ages: Bell curve centered at 40, range 20-75
    ages = np.clip(
        rng.normal(40, 12, num_policies).astype(np.uint8),
        20, 75
    )

    # Gender: ~50/50 split (0 = Male, 1 = Female, 2 = Other)
    # Simplified to binary for demo purposes
    genders = rng.choice([0, 1], size=num_policies, p=[0.5, 0.5]).astype(np.uint8)

    # Smoker status: ~15% smokers (stored in underwriting_class)
    # 0 = Standard, 1 = Smoker, 2 = NonSmoker, 3 = Preferred, 4 = Substandard
    smoker_prob = rng.random(num_policies)
    underwriting_class = np.where(
        smoker_prob < 0.15, 1,  # 15% Smoker
        np.where(smoker_prob < 0.85, 2,  # 70% NonSmoker (explicit)
                 np.where(smoker_prob < 0.95, 0,  # 10% Standard
                          3))  # 5% Preferred
    ).astype(np.uint8)

    # Product types: Term Life (70%), Whole Life (20%), Endowment (10%)
    # 0 = Term, 1 = Whole, 2 = Endowment, 3 = Universal
    product_types = rng.choice(
        [0, 1, 2],
        size=num_policies,
        p=[0.7, 0.2, 0.1]
    ).astype(np.uint8)

    # Sum assured: Based on age and product
    # Younger = higher coverage, older = lower
    # Range: £100K - £1M
    base_sum_assured = 500_000  # £500K average
    age_factor = (75 - ages) / (75 - 20)  # 1.0 for age 20, 0.0 for age 75
    product_multiplier = np.where(
        product_types == 0, 1.0,  # Term: standard
        np.where(product_types == 1, 1.5,  # Whole: higher
                 1.2)  # Endowment: moderate
    )
    sum_assured = (
        base_sum_assured *
        (0.2 + 1.6 * age_factor) *  # Range: 0.2x to 1.8x
        product_multiplier *
        rng.uniform(0.8, 1.2, num_policies)  # Add noise
    ).astype(np.float64)
    sum_assured = np.clip(sum_assured, 100_000, 1_000_000)

    # Policy term: 10-40 years for term, 99 for whole life
    terms = np.where(
        product_types == 0,
        rng.choice([10, 15, 20, 25, 30, 35, 40], size=num_policies),
        99  # Whole life and endowment = lifetime
    ).astype(np.uint32)

    # Premium: Calculate from sum assured, age, and product
    # Rough actuarial approximation: premium = sum_assured * annual_rate
    # Annual rate increases with age and smoker status
    base_rate = 0.001  # 0.1% base annual rate
    age_loading = 1.0 + ((ages - 20) / 55) * 3.0  # 1x at age 20, 4x at age 75
    smoker_loading = np.where(underwriting_class == 1, 1.5, 1.0)  # +50% for smokers
    product_loading = np.where(
        product_types == 0, 1.0,  # Term: standard
        np.where(product_types == 1, 2.5,  # Whole: much higher (savings component)
                 1.8)  # Endowment: higher (maturity benefit)
    )

    premium = (
        sum_assured *
        base_rate *
        age_loading *
        smoker_loading *
        product_loading *
        rng.uniform(0.9, 1.1, num_policies)  # Add noise
    ).astype(np.float64)

    # Create PyArrow schema
    schema = pa.schema([
        ('policy_id', pa.uint64()),
        ('age', pa.uint8()),
        ('gender', pa.uint8()),
        ('sum_assured', pa.float64()),
        ('premium', pa.float64()),
        ('term', pa.uint32()),
        ('product_type', pa.uint8()),
        ('underwriting_class', pa.uint8()),
    ])

    # Create table
    table = pa.table({
        'policy_id': policy_ids,
        'age': ages,
        'gender': genders,
        'sum_assured': sum_assured,
        'premium': premium,
        'term': terms,
        'product_type': product_types,
        'underwriting_class': underwriting_class,
    }, schema=schema)

    return table


def print_summary(table: pa.Table):
    """Print summary statistics of generated policies."""
    policies = table.to_pandas()

    print("\n=== Policy Generation Summary ===")
    print(f"Total policies: {len(policies):,}")
    print(f"\nAge distribution:")
    print(f"  Mean: {policies['age'].mean():.1f}")
    print(f"  Range: {policies['age'].min()}-{policies['age'].max()}")
    print(f"\nGender split:")
    print(f"  Male: {(policies['gender'] == 0).sum():,} ({(policies['gender'] == 0).sum() / len(policies) * 100:.1f}%)")
    print(f"  Female: {(policies['gender'] == 1).sum():,} ({(policies['gender'] == 1).sum() / len(policies) * 100:.1f}%)")
    print(f"\nUnderwriting class:")
    print(f"  Standard: {(policies['underwriting_class'] == 0).sum():,}")
    print(f"  Smoker: {(policies['underwriting_class'] == 1).sum():,} ({(policies['underwriting_class'] == 1).sum() / len(policies) * 100:.1f}%)")
    print(f"  NonSmoker: {(policies['underwriting_class'] == 2).sum():,}")
    print(f"  Preferred: {(policies['underwriting_class'] == 3).sum():,}")
    print(f"\nProduct types:")
    print(f"  Term Life: {(policies['product_type'] == 0).sum():,} ({(policies['product_type'] == 0).sum() / len(policies) * 100:.1f}%)")
    print(f"  Whole Life: {(policies['product_type'] == 1).sum():,} ({(policies['product_type'] == 1).sum() / len(policies) * 100:.1f}%)")
    print(f"  Endowment: {(policies['product_type'] == 2).sum():,} ({(policies['product_type'] == 2).sum() / len(policies) * 100:.1f}%)")
    print(f"\nSum assured:")
    print(f"  Mean: £{policies['sum_assured'].mean():,.0f}")
    print(f"  Range: £{policies['sum_assured'].min():,.0f} - £{policies['sum_assured'].max():,.0f}")
    print(f"\nPremium (annual):")
    print(f"  Mean: £{policies['premium'].mean():,.0f}")
    print(f"  Range: £{policies['premium'].min():,.0f} - £{policies['premium'].max():,.0f}")
    print(f"\nTerm:")
    print(f"  Mean (excl. whole life): {policies[policies['term'] < 99]['term'].mean():.1f} years")
    print("=" * 50)


def main():
    parser = argparse.ArgumentParser(
        description='Generate synthetic policy data for LiveCalc demo',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate 1M policies (default)
  python generate_policies.py

  # Generate custom number with specific seed
  python generate_policies.py --num-policies 100000 --seed 123

  # Specify output file
  python generate_policies.py --output my_policies.parquet
        """
    )
    parser.add_argument(
        '--num-policies',
        type=int,
        default=1_000_000,
        help='Number of policies to generate (default: 1,000,000)'
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
        default='policies_1m.parquet',
        help='Output file path (default: policies_1m.parquet)'
    )

    args = parser.parse_args()

    # Validate inputs
    if args.num_policies < 1:
        print("Error: num-policies must be at least 1", file=sys.stderr)
        sys.exit(1)

    # Generate policies
    start_time = datetime.now()
    table = generate_policies(args.num_policies, args.seed)
    generation_time = (datetime.now() - start_time).total_seconds()

    print(f"Generated {args.num_policies:,} policies in {generation_time:.2f}s")

    # Print summary
    print_summary(table)

    # Write to Parquet
    print(f"\nWriting to {args.output}...")
    start_time = datetime.now()
    pq.write_table(
        table,
        args.output,
        compression='snappy',  # Fast compression
        row_group_size=100_000,  # 100K rows per group
    )
    write_time = (datetime.now() - start_time).total_seconds()

    # Get file size
    import os
    file_size_mb = os.path.getsize(args.output) / (1024 * 1024)

    print(f"Wrote {args.output} ({file_size_mb:.1f} MB) in {write_time:.2f}s")
    print(f"Total time: {generation_time + write_time:.2f}s")
    print("\n✓ Demo policy data ready!")


if __name__ == '__main__':
    main()
