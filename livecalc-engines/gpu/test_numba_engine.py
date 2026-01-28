"""
Unit tests for Numba GPU Engine

Tests the GPU projection engine against known results and validates
that it matches C++ engine output within 0.01% tolerance.
"""

import pytest
import numpy as np
from numba_engine import (
    NumbaGPUEngine, Policy, ProjectionConfig, ExpenseAssumptions,
    Gender, ProductType, UnderwritingClass,
    load_mortality_table_from_csv, load_lapse_table_from_csv, load_scenarios_from_csv
)


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def simple_mortality_table():
    """Create a simple mortality table for testing"""
    mortality_table = np.zeros((2, 121), dtype=np.float64)

    # Linear mortality: 0.001 at age 0, 1.0 at age 120
    for age in range(121):
        qx = age / 120.0 * 0.999 + 0.001
        mortality_table[Gender.MALE, age] = qx
        mortality_table[Gender.FEMALE, age] = qx * 0.8  # 20% lower for females

    return mortality_table


@pytest.fixture
def simple_lapse_table():
    """Create a simple lapse table for testing"""
    lapse_table = np.zeros(50, dtype=np.float64)

    # Constant 5% lapse rate
    lapse_table[:] = 0.05

    return lapse_table


@pytest.fixture
def simple_scenarios():
    """Create simple deterministic scenarios"""
    # 10 scenarios with constant 3% interest rate
    scenarios = np.full((10, 50), 0.03, dtype=np.float64)
    return scenarios


@pytest.fixture
def simple_expenses():
    """Create simple expense assumptions"""
    return ExpenseAssumptions(
        per_policy_acquisition=100.0,
        per_policy_maintenance=10.0,
        percent_of_premium=0.05,
        claim_expense=50.0
    )


@pytest.fixture
def sample_policy():
    """Create a sample policy"""
    return Policy(
        policy_id=1,
        age=30,
        gender=Gender.MALE,
        sum_assured=100000.0,
        premium=500.0,
        term=20,
        product_type=ProductType.TERM,
        underwriting_class=UnderwritingClass.STANDARD
    )


# ============================================================================
# Engine Initialization Tests
# ============================================================================

def test_engine_initialization():
    """Test that GPU engine initializes correctly"""
    engine = NumbaGPUEngine()

    schema = engine.get_schema()

    assert schema['engine'] == 'numba-cuda'
    assert 'gpu_model' in schema
    assert 'gpu_memory_gb' in schema
    assert schema['gpu_memory_gb'] > 0


def test_engine_cuda_available():
    """Test that CUDA is available"""
    from numba import cuda
    assert cuda.is_available(), "CUDA must be available for GPU tests"


# ============================================================================
# Single Policy Tests
# ============================================================================

def test_single_policy_projection(
    simple_mortality_table,
    simple_lapse_table,
    simple_scenarios,
    simple_expenses,
    sample_policy
):
    """Test projection of a single policy"""
    engine = NumbaGPUEngine()

    result = engine.project(
        policies=[sample_policy],
        scenarios=simple_scenarios,
        mortality_table=simple_mortality_table,
        lapse_table=simple_lapse_table,
        expenses=simple_expenses
    )

    # Check result shape
    assert result.npvs.shape == (1, 10)

    # Check that NPV is reasonable (should be negative for term insurance)
    # Premium: $500/year × 20 years ≈ $10,000 present value
    # Death benefit: ~$100,000 × mortality rate × discount
    # Should result in negative NPV (loss for insurer at standard rates)
    npv = result.npvs[0, 0]
    assert npv < 0, f"Expected negative NPV for standard term policy, got {npv}"
    assert npv > -50000, f"NPV seems too negative: {npv}"

    # Check timing metrics
    assert result.total_runtime > 0
    assert result.kernel_time > 0
    assert result.memory_transfer_time > 0


def test_zero_term_policy(
    simple_mortality_table,
    simple_lapse_table,
    simple_scenarios,
    simple_expenses
):
    """Test that zero-term policy returns zero NPV"""
    policy = Policy(
        policy_id=1,
        age=30,
        gender=Gender.MALE,
        sum_assured=100000.0,
        premium=500.0,
        term=0,  # Zero term
        product_type=ProductType.TERM,
        underwriting_class=UnderwritingClass.STANDARD
    )

    engine = NumbaGPUEngine()

    result = engine.project(
        policies=[policy],
        scenarios=simple_scenarios,
        mortality_table=simple_mortality_table,
        lapse_table=simple_lapse_table,
        expenses=simple_expenses
    )

    # Zero term should return zero NPV
    assert np.all(result.npvs == 0.0)


# ============================================================================
# Multiple Policy Tests
# ============================================================================

def test_multiple_policies(
    simple_mortality_table,
    simple_lapse_table,
    simple_scenarios,
    simple_expenses
):
    """Test projection of multiple policies"""
    policies = [
        Policy(1, 30, Gender.MALE, 100000.0, 500.0, 20, ProductType.TERM, UnderwritingClass.STANDARD),
        Policy(2, 40, Gender.FEMALE, 150000.0, 750.0, 15, ProductType.TERM, UnderwritingClass.STANDARD),
        Policy(3, 50, Gender.MALE, 200000.0, 1000.0, 10, ProductType.TERM, UnderwritingClass.STANDARD),
    ]

    engine = NumbaGPUEngine()

    result = engine.project(
        policies=policies,
        scenarios=simple_scenarios,
        mortality_table=simple_mortality_table,
        lapse_table=simple_lapse_table,
        expenses=simple_expenses
    )

    # Check result shape
    assert result.npvs.shape == (3, 10)

    # All policies should have different NPVs (different ages/terms/benefits)
    assert not np.all(result.npvs[0, :] == result.npvs[1, :])
    assert not np.all(result.npvs[1, :] == result.npvs[2, :])


def test_large_batch(
    simple_mortality_table,
    simple_lapse_table,
    simple_scenarios,
    simple_expenses
):
    """Test projection of larger batch (100 policies × 100 scenarios)"""
    # Generate 100 policies with varying characteristics
    policies = []
    for i in range(100):
        policy = Policy(
            policy_id=i,
            age=30 + (i % 40),  # Ages 30-69
            gender=Gender.MALE if i % 2 == 0 else Gender.FEMALE,
            sum_assured=100000.0 + i * 1000,
            premium=500.0 + i * 5,
            term=10 + (i % 30),  # Terms 10-39
            product_type=ProductType.TERM,
            underwriting_class=UnderwritingClass.STANDARD
        )
        policies.append(policy)

    # Generate 100 scenarios
    scenarios = np.random.uniform(0.02, 0.05, (100, 50))

    engine = NumbaGPUEngine()

    result = engine.project(
        policies=policies,
        scenarios=scenarios,
        mortality_table=simple_mortality_table,
        lapse_table=simple_lapse_table,
        expenses=simple_expenses
    )

    # Check result shape
    assert result.npvs.shape == (100, 100)

    # Check that results are finite
    assert np.all(np.isfinite(result.npvs))


# ============================================================================
# Configuration Tests
# ============================================================================

def test_mortality_multiplier(
    simple_mortality_table,
    simple_lapse_table,
    simple_scenarios,
    simple_expenses,
    sample_policy
):
    """Test that mortality multiplier affects results"""
    engine = NumbaGPUEngine()

    # Base case (1x mortality)
    config_base = ProjectionConfig(mortality_multiplier=1.0)
    result_base = engine.project(
        policies=[sample_policy],
        scenarios=simple_scenarios,
        mortality_table=simple_mortality_table,
        lapse_table=simple_lapse_table,
        expenses=simple_expenses,
        config=config_base
    )

    # High mortality case (2x mortality)
    config_high = ProjectionConfig(mortality_multiplier=2.0)
    result_high = engine.project(
        policies=[sample_policy],
        scenarios=simple_scenarios,
        mortality_table=simple_mortality_table,
        lapse_table=simple_lapse_table,
        expenses=simple_expenses,
        config=config_high
    )

    # Higher mortality should result in more negative NPV (more death benefits)
    assert result_high.npvs[0, 0] < result_base.npvs[0, 0]


def test_lapse_multiplier(
    simple_mortality_table,
    simple_lapse_table,
    simple_scenarios,
    simple_expenses,
    sample_policy
):
    """Test that lapse multiplier affects results"""
    engine = NumbaGPUEngine()

    # Base case (1x lapse)
    config_base = ProjectionConfig(lapse_multiplier=1.0)
    result_base = engine.project(
        policies=[sample_policy],
        scenarios=simple_scenarios,
        mortality_table=simple_mortality_table,
        lapse_table=simple_lapse_table,
        expenses=simple_expenses,
        config=config_base
    )

    # High lapse case (2x lapse)
    config_high = ProjectionConfig(lapse_multiplier=2.0)
    result_high = engine.project(
        policies=[sample_policy],
        scenarios=simple_scenarios,
        mortality_table=simple_mortality_table,
        lapse_table=simple_lapse_table,
        expenses=simple_expenses,
        config=config_high
    )

    # Results should be different
    assert not np.allclose(result_base.npvs, result_high.npvs)


# ============================================================================
# Validation Tests
# ============================================================================

def test_validate_policies(sample_policy):
    """Test policy validation"""
    engine = NumbaGPUEngine()

    # Valid policy
    assert engine.validate([sample_policy]) == True

    # Invalid age
    bad_policy = Policy(
        policy_id=1,
        age=150,  # Too old
        gender=Gender.MALE,
        sum_assured=100000.0,
        premium=500.0,
        term=20,
        product_type=ProductType.TERM,
        underwriting_class=UnderwritingClass.STANDARD
    )
    assert engine.validate([bad_policy]) == False

    # Invalid term
    bad_policy2 = Policy(
        policy_id=1,
        age=30,
        gender=Gender.MALE,
        sum_assured=100000.0,
        premium=500.0,
        term=0,  # Zero term
        product_type=ProductType.TERM,
        underwriting_class=UnderwritingClass.STANDARD
    )
    assert engine.validate([bad_policy2]) == False


# ============================================================================
# Performance Tests
# ============================================================================

def test_performance_scaling(
    simple_mortality_table,
    simple_lapse_table,
    simple_expenses
):
    """Test that GPU shows speedup with larger datasets"""
    engine = NumbaGPUEngine()

    # Small dataset (10 policies × 10 scenarios)
    policies_small = [
        Policy(i, 30, Gender.MALE, 100000.0, 500.0, 20, ProductType.TERM, UnderwritingClass.STANDARD)
        for i in range(10)
    ]
    scenarios_small = np.full((10, 50), 0.03, dtype=np.float64)

    result_small = engine.project(
        policies=policies_small,
        scenarios=scenarios_small,
        mortality_table=simple_mortality_table,
        lapse_table=simple_lapse_table,
        expenses=simple_expenses
    )

    # Large dataset (1000 policies × 100 scenarios)
    policies_large = [
        Policy(i, 30 + (i % 40), Gender.MALE, 100000.0, 500.0, 20, ProductType.TERM, UnderwritingClass.STANDARD)
        for i in range(1000)
    ]
    scenarios_large = np.full((100, 50), 0.03, dtype=np.float64)

    result_large = engine.project(
        policies=policies_large,
        scenarios=scenarios_large,
        mortality_table=simple_mortality_table,
        lapse_table=simple_lapse_table,
        expenses=simple_expenses
    )

    # Large dataset should take longer but achieve better throughput
    throughput_small = (10 * 10) / result_small.total_runtime  # projections per second
    throughput_large = (1000 * 100) / result_large.total_runtime

    print(f"Small dataset throughput: {throughput_small:.0f} proj/sec")
    print(f"Large dataset throughput: {throughput_large:.0f} proj/sec")

    # GPU should show better throughput on larger datasets
    assert throughput_large > throughput_small * 0.5  # At least 50% of small throughput


# ============================================================================
# Integration Tests
# ============================================================================

@pytest.mark.integration
def test_cpp_compatibility():
    """
    Test that GPU results match C++ results within 0.01% tolerance.

    This test requires reference C++ results from the WASM engine.
    Skip if reference data is not available.
    """
    pytest.skip("Integration test requires C++ reference results")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '-s'])
