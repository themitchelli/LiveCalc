"""
Example usage of LiveCalc GPU Engine

Demonstrates basic usage and compares GPU vs CPU performance (if CPU results available).
"""

import numpy as np
from numba_engine import (
    NumbaGPUEngine, Policy, ProjectionConfig, ExpenseAssumptions,
    Gender, ProductType, UnderwritingClass
)
import time


def create_sample_data(num_policies=1000, num_scenarios=100):
    """Create sample policies, scenarios, and assumptions for demonstration"""

    # Create policies with realistic characteristics
    policies = []
    np.random.seed(42)

    for i in range(num_policies):
        age = np.random.randint(25, 65)
        gender = Gender.MALE if np.random.random() < 0.5 else Gender.FEMALE
        sum_assured = np.random.uniform(50000, 500000)
        term = np.random.randint(10, 40)
        premium = sum_assured * 0.005 * (1 + (age - 30) * 0.01)  # Simple pricing

        policy = Policy(
            policy_id=i,
            age=age,
            gender=gender,
            sum_assured=sum_assured,
            premium=premium,
            term=term,
            product_type=ProductType.TERM,
            underwriting_class=UnderwritingClass.STANDARD
        )
        policies.append(policy)

    # Create mortality table (simple exponential)
    mortality_table = np.zeros((2, 121), dtype=np.float64)
    for age in range(121):
        # Exponential mortality: qx = 0.0001 * 1.1^age
        qx = 0.0001 * (1.1 ** age)
        qx = min(qx, 1.0)
        mortality_table[Gender.MALE, age] = qx
        mortality_table[Gender.FEMALE, age] = qx * 0.8  # Females 20% lower

    # Create lapse table (reducing over time)
    lapse_table = np.zeros(50, dtype=np.float64)
    for year in range(50):
        # Higher lapse in early years
        lapse_rate = 0.15 * np.exp(-year * 0.1)
        lapse_table[year] = min(lapse_rate, 0.15)

    # Create scenarios (stochastic interest rates)
    scenarios = np.zeros((num_scenarios, 50), dtype=np.float64)
    for s in range(num_scenarios):
        # GBM with mean 3%, vol 1%
        rate = 0.03
        for year in range(50):
            rate = rate * np.exp((0.00 - 0.5 * 0.01**2) + 0.01 * np.random.randn())
            rate = max(0.0, min(rate, 0.20))  # Cap at 0-20%
            scenarios[s, year] = rate

    # Create expense assumptions
    expenses = ExpenseAssumptions(
        per_policy_acquisition=100.0,
        per_policy_maintenance=10.0,
        percent_of_premium=0.05,
        claim_expense=50.0
    )

    return policies, scenarios, mortality_table, lapse_table, expenses


def main():
    """Main demonstration"""

    print("=" * 80)
    print("LiveCalc GPU Engine - Example Usage")
    print("=" * 80)

    # Initialize GPU engine
    print("\n1. Initializing GPU Engine...")
    engine = NumbaGPUEngine()
    schema = engine.get_schema()

    print(f"   GPU Model: {schema['gpu_model']}")
    print(f"   GPU Memory: {schema['gpu_memory_gb']:.2f} GB")
    print(f"   Compute Capability: {schema['compute_capability']}")

    # Create sample data
    print("\n2. Creating Sample Data...")
    num_policies = 10000
    num_scenarios = 1000

    print(f"   Policies: {num_policies:,}")
    print(f"   Scenarios: {num_scenarios:,}")
    print(f"   Total projections: {num_policies * num_scenarios:,}")

    policies, scenarios, mortality_table, lapse_table, expenses = create_sample_data(
        num_policies, num_scenarios
    )

    # Run projection
    print("\n3. Running GPU Projection...")
    result = engine.project(
        policies=policies,
        scenarios=scenarios,
        mortality_table=mortality_table,
        lapse_table=lapse_table,
        expenses=expenses
    )

    print(f"   Result shape: {result.npvs.shape}")
    print(f"   Total runtime: {result.total_runtime:.3f}s")
    print(f"   Kernel time: {result.kernel_time:.3f}s")
    print(f"   Memory transfer time: {result.memory_transfer_time:.3f}s")
    print(f"   Throughput: {(num_policies * num_scenarios) / result.total_runtime:,.0f} projections/sec")

    # Analyze results
    print("\n4. Analyzing Results...")
    mean_npv = np.mean(result.npvs)
    std_npv = np.std(result.npvs)
    min_npv = np.min(result.npvs)
    max_npv = np.max(result.npvs)

    print(f"   Mean NPV: ${mean_npv:,.2f}")
    print(f"   Std Dev NPV: ${std_npv:,.2f}")
    print(f"   Min NPV: ${min_npv:,.2f}")
    print(f"   Max NPV: ${max_npv:,.2f}")

    # Test with multipliers
    print("\n5. Testing Stress Scenarios...")

    # 2x mortality
    config_stress = ProjectionConfig(mortality_multiplier=2.0)
    result_stress = engine.project(
        policies=policies,
        scenarios=scenarios,
        mortality_table=mortality_table,
        lapse_table=lapse_table,
        expenses=expenses,
        config=config_stress
    )

    mean_npv_stress = np.mean(result_stress.npvs)
    print(f"   Mean NPV (2x mortality): ${mean_npv_stress:,.2f}")
    print(f"   Change: ${mean_npv_stress - mean_npv:,.2f} ({100 * (mean_npv_stress - mean_npv) / mean_npv:.1f}%)")

    # Validation
    print("\n6. Validation Checks...")

    # Check for finite values
    all_finite = np.all(np.isfinite(result.npvs))
    print(f"   All results finite: {all_finite}")

    # Check for reasonable range
    reasonable = np.all((result.npvs > -1e6) & (result.npvs < 1e6))
    print(f"   All results in reasonable range: {reasonable}")

    # Check that different scenarios give different results
    scenario_variance = np.var(result.npvs[0, :])  # Variance across scenarios for policy 0
    print(f"   Scenario variance (policy 0): ${scenario_variance:,.2f}")

    print("\n" + "=" * 80)
    print("Demonstration Complete!")
    print("=" * 80)

    # Summary
    print("\nKey Takeaways:")
    print(f"  • GPU achieved {(num_policies * num_scenarios) / result.total_runtime:,.0f} projections/sec")
    print(f"  • {result.kernel_time / result.total_runtime * 100:.1f}% of time spent in kernel computation")
    print(f"  • {result.memory_transfer_time / result.total_runtime * 100:.1f}% of time spent in memory transfers")
    print(f"  • Mean NPV: ${mean_npv:,.2f} (expect negative for term insurance)")
    print(f"  • 2x mortality stress reduced NPV by {100 * (mean_npv_stress - mean_npv) / mean_npv:.1f}%")


if __name__ == '__main__':
    main()
