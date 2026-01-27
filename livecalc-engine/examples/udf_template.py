"""
LiveCalc Python UDF Template

This template demonstrates the signature and structure for Python User-Defined Functions (UDFs)
that can be called during actuarial projection calculations.

UDF Functions Available:
- adjust_mortality: Modify mortality rates based on policy attributes
- adjust_lapse: Modify lapse rates based on policy attributes
- on_year_start: Called at the beginning of each projection year (for custom logic)
- apply_shock: Apply stress testing shocks to multiple assumptions

Each function receives:
- policy: dict with policy attributes (policy_id, age, gender, sum_assured, premium, etc.)
- year: int, current policy year (1-based)
- lives: float, lives in-force at beginning of year
- interest_rate: float, current year's interest rate

Each function should return a float representing an adjustment multiplier (e.g., 1.0 = no change, 1.2 = 20% increase)
"""

def adjust_mortality(policy, year, lives, interest_rate):
    """
    Adjust mortality rates for a policy.

    Args:
        policy (dict): Policy attributes
        year (int): Current policy year (1-based)
        lives (float): Lives in-force at beginning of year
        interest_rate (float): Current year's interest rate

    Returns:
        float: Mortality multiplier (e.g., 1.0 = no change, 1.2 = 20% higher mortality)

    Example:
        # Increase mortality for smokers
        if policy.get('underwriting_class') == 1:  # Smoker
            return 1.5
        return 1.0
    """
    # Default: no adjustment
    return 1.0


def adjust_lapse(policy, year, lives, interest_rate):
    """
    Adjust lapse rates for a policy.

    Args:
        policy (dict): Policy attributes
        year (int): Current policy year (1-based)
        lives (float): Lives in-force at beginning of year
        interest_rate (float): Current year's interest rate

    Returns:
        float: Lapse multiplier (e.g., 1.0 = no change, 0.8 = 20% lower lapse)

    Example:
        # Higher lapse in early years
        if year <= 5:
            return 1.2
        return 1.0
    """
    # Default: no adjustment
    return 1.0


def on_year_start(policy, year, lives):
    """
    Called at the start of each policy year (before calculations).
    Can be used for custom logging, state tracking, or diagnostics.

    Args:
        policy (dict): Policy attributes
        year (int): Current policy year (1-based)
        lives (float): Lives in-force at beginning of year

    Returns:
        dict: Custom state values (optional, can be empty)
    """
    # Return empty state by default
    return {}


def apply_shock(policy, year):
    """
    Apply stress testing shocks to multiple assumptions simultaneously.

    Args:
        policy (dict): Policy attributes
        year (int): Current policy year (1-based)

    Returns:
        dict: Multipliers for different assumptions
            {
                'mortality': 1.1,  # 10% increase
                'lapse': 0.9,      # 10% decrease
                'expense': 1.05    # 5% increase
            }
    """
    # Default: no shocks
    return {
        'mortality': 1.0,
        'lapse': 1.0,
        'expense': 1.0
    }
