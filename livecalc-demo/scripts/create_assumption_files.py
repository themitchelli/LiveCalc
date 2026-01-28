#!/usr/bin/env python3
"""
Create realistic assumption files for LiveCalc demo.

Generates:
- Mortality table (UK-based rates)
- Lapse table (standard term life curve)
- Expenses (per-policy and % of premium)
"""

import csv
import json
import numpy as np
from pathlib import Path


def create_mortality_table(output_file: str):
    """
    Create mortality table with UK-based rates.
    qx increases with age, different for male/female.
    """
    print(f"Creating mortality table: {output_file}")

    with open(output_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['age', 'male', 'female'])

        for age in range(121):  # 0-120
            # Gompertz-Makeham formula approximation
            # qx = α + β * c^age (simplified)
            # Male mortality slightly higher than female

            if age < 18:
                # Low child mortality
                qx_male = 0.0005 + 0.00001 * age
                qx_female = 0.0004 + 0.000008 * age
            else:
                # Adult mortality increases exponentially with age
                base_rate_male = 0.0008
                base_rate_female = 0.0006
                growth_male = 1.09
                growth_female = 1.085

                qx_male = base_rate_male * (growth_male ** (age - 18))
                qx_female = base_rate_female * (growth_female ** (age - 18))

            # Cap at 1.0 (certainty of death)
            qx_male = min(qx_male, 1.0)
            qx_female = min(qx_female, 1.0)

            writer.writerow([age, f'{qx_male:.6f}', f'{qx_female:.6f}'])

    print(f"  Written {output_file}")


def create_lapse_table(output_file: str):
    """
    Create lapse table with realistic curve.
    High lapse in early years, decreasing over time (anti-selection effect).
    """
    print(f"Creating lapse table: {output_file}")

    with open(output_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['year', 'rate'])

        for year in range(1, 51):  # Years 1-50
            if year == 1:
                # High first-year lapse (buyer's remorse, mis-selling)
                lapse_rate = 0.15
            elif year <= 5:
                # Elevated lapse in early years
                lapse_rate = 0.10 - (year - 2) * 0.01
            else:
                # Lower, stable lapse in later years
                lapse_rate = 0.03 + 0.005 * np.exp(-(year - 5) / 10)

            # Ensure lapse rate is within [0, 1]
            lapse_rate = max(0.01, min(lapse_rate, 0.30))

            writer.writerow([year, f'{lapse_rate:.6f}'])

    print(f"  Written {output_file}")


def create_expenses_file(output_file: str):
    """
    Create expenses JSON with per-policy and % of premium expenses.
    """
    print(f"Creating expenses file: {output_file}")

    expenses = {
        "acquisition": 500.0,  # £500 per policy (one-time)
        "maintenance": 50.0,  # £50 per policy per year
        "percent_of_premium": 0.05,  # 5% of premium (commission, admin)
        "claim_expense": 200.0  # £200 per claim
    }

    with open(output_file, 'w') as f:
        json.dump(expenses, f, indent=2)

    print(f"  Written {output_file}")


def main():
    base_dir = Path(__file__).parent.parent / 'data' / 'assumptions'
    base_dir.mkdir(parents=True, exist_ok=True)

    print("Generating assumption files for demo...\n")

    # Create all assumption files
    create_mortality_table(str(base_dir / 'mortality_demo.csv'))
    create_lapse_table(str(base_dir / 'lapse_demo.csv'))
    create_expenses_file(str(base_dir / 'expenses_demo.json'))

    print("\n✓ Demo assumption files created!")
    print(f"Location: {base_dir}")


if __name__ == '__main__':
    main()
