#!/usr/bin/env python3
"""
Convert Parquet policy file to CSV for compatibility with C++ engine.

The C++ engine has CSV reader support built-in, so converting to CSV
allows us to run the benchmark without requiring Apache Arrow C++.
"""

import argparse
import pyarrow.parquet as pq
import csv

def convert_parquet_to_csv(parquet_path: str, csv_path: str, limit: int = None):
    """
    Convert Parquet file to CSV.

    Args:
        parquet_path: Input Parquet file
        csv_path: Output CSV file
        limit: Optional row limit (for testing with smaller datasets)
    """
    print(f"Reading {parquet_path}...")
    table = pq.read_table(parquet_path)

    if limit:
        table = table.slice(0, limit)

    print(f"Converting {len(table)} rows to CSV...")

    # Convert to pandas for easy CSV writing
    df = table.to_pandas()

    # Write to CSV
    df.to_csv(csv_path, index=False)

    print(f"✓ Wrote {csv_path}")
    print(f"  Rows: {len(df):,}")
    print(f"  Size: {len(open(csv_path, 'rb').read()) / (1024*1024):.1f} MB")


def main():
    parser = argparse.ArgumentParser(
        description='Convert Parquet policy file to CSV'
    )
    parser.add_argument(
        '--input',
        type=str,
        default='policies_1m.parquet',
        help='Input Parquet file (default: policies_1m.parquet)'
    )
    parser.add_argument(
        '--output',
        type=str,
        default='policies_1m.csv',
        help='Output CSV file (default: policies_1m.csv)'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=None,
        help='Limit number of rows (for testing)'
    )

    args = parser.parse_args()

    convert_parquet_to_csv(args.input, args.output, args.limit)


if __name__ == '__main__':
    main()
