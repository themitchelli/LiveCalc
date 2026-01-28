#!/usr/bin/env python3
"""
LiveCalc Demo - Smoker Mortality Adjustment UDF

US-003: Python UDF that adjusts mortality rates for smokers during projection.

This demonstrates LiveCalc's extensibility: actuaries can write Python functions
that execute during the projection to customize calculations.

UDF Signature:
    adjust_mortality_for_smoker(policy, assumption, base_qx) -> adjusted_qx

Args:
    policy: Policy object with attributes (age, gender, smoker status, etc.)
    assumption: Current assumption context
    base_qx: Base mortality rate from mortality table

Returns:
    Adjusted mortality rate (float)

Business Logic:
    - If policy underwriting_class == 1 (Smoker): multiply base_qx by 1.2 (+20%)
    - Otherwise: return base_qx unchanged
"""

def adjust_mortality_for_smoker(policy, assumption, base_qx):
    """
    Adjust mortality rate based on smoker status.

    This is a simple example UDF that demonstrates how actuaries can
    inject custom Python logic into the C++ projection engine.

    Args:
        policy: Policy object with fields:
            - policy_id (int)
            - age (int)
            - gender (int): 0=Male, 1=Female
            - underwriting_class (int): 0=Standard, 1=Smoker, 2=NonSmoker, 3=Preferred
            - sum_assured (float)
            - premium (float)
            - term (int)
            - product_type (int)

        assumption: Assumption context (for future use)

        base_qx: Base mortality rate (float, 0.0-1.0)
            This comes from the mortality table lookup

    Returns:
        float: Adjusted mortality rate
    """
    # Check if policy is for a smoker
    # underwriting_class: 0=Standard, 1=Smoker, 2=NonSmoker, 3=Preferred, 4=Substandard
    is_smoker = (policy.underwriting_class == 1)

    if is_smoker:
        # Apply 20% loading for smokers
        smoker_multiplier = 1.2
        adjusted_qx = base_qx * smoker_multiplier

        # Cap at 1.0 (cannot exceed certainty of death)
        adjusted_qx = min(adjusted_qx, 1.0)

        return adjusted_qx
    else:
        # Non-smokers use base rate unchanged
        return base_qx


def adjust_mortality_for_smoker_with_logging(policy, assumption, base_qx):
    """
    Same as adjust_mortality_for_smoker but with debug logging.
    Useful for demonstrations and debugging.
    """
    is_smoker = (policy.underwriting_class == 1)

    if is_smoker:
        smoker_multiplier = 1.2
        adjusted_qx = min(base_qx * smoker_multiplier, 1.0)

        print(f"[UDF] Policy {policy.policy_id}: Smoker adjustment")
        print(f"      Age {policy.age}, Gender {policy.gender}")
        print(f"      Base qx: {base_qx:.6f} → Adjusted: {adjusted_qx:.6f} (×{smoker_multiplier})")

        return adjusted_qx
    else:
        return base_qx


# Alternative UDF: Age-based smoker adjustment
def adjust_mortality_smoker_age_dependent(policy, assumption, base_qx):
    """
    More sophisticated UDF: smoker loading varies by age.

    Younger smokers have higher relative risk increase.
    Older smokers have lower relative risk (base mortality already high).
    """
    is_smoker = (policy.underwriting_class == 1)

    if not is_smoker:
        return base_qx

    # Age-dependent smoker multiplier
    # Young (20-40): 1.5x
    # Middle (40-60): 1.3x
    # Older (60+): 1.1x
    if policy.age < 40:
        smoker_multiplier = 1.5
    elif policy.age < 60:
        smoker_multiplier = 1.3
    else:
        smoker_multiplier = 1.1

    adjusted_qx = min(base_qx * smoker_multiplier, 1.0)
    return adjusted_qx


# Export available UDFs
__all__ = [
    'adjust_mortality_for_smoker',
    'adjust_mortality_for_smoker_with_logging',
    'adjust_mortality_smoker_age_dependent',
]


if __name__ == '__main__':
    # Test the UDF with sample data
    print("Testing smoker mortality adjustment UDF")
    print("=" * 50)

    class MockPolicy:
        def __init__(self, policy_id, age, gender, underwriting_class):
            self.policy_id = policy_id
            self.age = age
            self.gender = gender
            self.underwriting_class = underwriting_class

    # Test cases
    test_cases = [
        (MockPolicy(1, 35, 0, 1), 0.001, "Young smoker"),  # Smoker
        (MockPolicy(2, 35, 0, 2), 0.001, "Young non-smoker"),  # Non-smoker
        (MockPolicy(3, 65, 1, 1), 0.05, "Older smoker"),  # Older smoker
        (MockPolicy(4, 65, 1, 0), 0.05, "Older standard"),  # Standard
    ]

    for policy, base_qx, description in test_cases:
        adjusted_qx = adjust_mortality_for_smoker(policy, None, base_qx)
        change_pct = ((adjusted_qx - base_qx) / base_qx * 100) if base_qx > 0 else 0

        print(f"\n{description}:")
        print(f"  Policy ID: {policy.policy_id}, Age: {policy.age}, Class: {policy.underwriting_class}")
        print(f"  Base qx: {base_qx:.6f}")
        print(f"  Adjusted qx: {adjusted_qx:.6f}")
        print(f"  Change: {change_pct:+.1f}%")

    print("\n" + "=" * 50)
    print("✓ UDF tests complete")
