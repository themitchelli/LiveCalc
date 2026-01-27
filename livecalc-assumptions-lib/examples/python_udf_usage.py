"""
Example Python UDF using Assumptions Client

This demonstrates how a Python user-defined function (UDF) can use the
Assumptions Client to resolve assumptions dynamically during projection.
"""

import sys
import os

# Add assumptions client to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

try:
    from python.assumptions_client import AssumptionsClient
    print("✓ Successfully imported AssumptionsClient")
except ImportError as e:
    print(f"✗ Failed to import: {e}")
    print("Note: Dependencies (requests, numpy, platformdirs) required for runtime execution")
    sys.exit(0)


def adjust_mortality(policy: dict, year: int, lives: float, interest_rate: float) -> float:
    """
    Example UDF: Adjust mortality based on policy characteristics

    Args:
        policy: Policy data (dict with age, gender, smoker, etc.)
        year: Current projection year
        lives: Current number of lives
        interest_rate: Current scenario interest rate

    Returns:
        Mortality adjustment factor (1.0 = no adjustment)
    """
    # Example: Increase mortality for smokers
    if policy.get("smoker", False):
        return 1.2  # 20% higher mortality
    return 1.0


def adjust_mortality_with_am(
    am_client: AssumptionsClient,
    policy: dict,
    year: int,
    lives: float,
    interest_rate: float
) -> float:
    """
    Advanced UDF: Use Assumptions Manager for dynamic mortality adjustment

    This demonstrates resolving assumptions from AM during projection.
    """
    try:
        # Resolve current mortality assumption
        age = policy.get("age", 0) + year - 1
        gender = policy.get("gender", "M")

        # Get baseline qx from AM
        qx = am_client.resolve_scalar(
            "mortality-standard",
            "latest",  # Always use latest for dynamic updates
            {"age": age, "gender": gender}
        )

        # Apply smoker adjustment
        if policy.get("smoker", False):
            qx *= 1.2

        # Return as adjustment factor
        # (In practice, would compare to policy's original qx)
        return 1.0

    except Exception as e:
        print(f"Warning: Failed to resolve assumption: {e}")
        return 1.0  # Graceful fallback


def main():
    """Demonstrate usage"""
    print("\n=== Python UDF Example ===\n")

    # Example policy
    policy = {
        "policy_id": 12345,
        "age": 50,
        "gender": "M",
        "smoker": True,
        "sum_assured": 100000,
    }

    # Simple UDF (no AM required)
    adjustment = adjust_mortality(policy, year=1, lives=1.0, interest_rate=0.05)
    print(f"Simple UDF adjustment for smoker: {adjustment}x")

    # Advanced UDF with AM (requires credentials)
    print("\nNote: Advanced UDF with AM requires:")
    print("  - AM_URL environment variable")
    print("  - JWT token from Assumptions Manager")
    print("  - Installed dependencies: requests, numpy, platformdirs")
    print("\nExample initialization:")
    print('  am = AssumptionsClient(os.getenv("AM_URL"), token, cache_dir)')
    print('  adjustment = adjust_mortality_with_am(am, policy, 1, 1.0, 0.05)')


if __name__ == '__main__':
    main()
