"""
LiveCalc UDF Example: Smoker Mortality Adjustment

This example demonstrates how to adjust mortality rates based on underwriting class.
Smokers receive a 50% increase in mortality, while non-smokers have standard mortality.
"""

def adjust_mortality(policy, year, lives, interest_rate):
    """
    Increase mortality for smokers by 50%.

    Underwriting classes (from Policy enum):
    - 0: Standard
    - 1: Smoker
    - 2: NonSmoker
    - 3: Preferred
    - 4: Substandard
    """
    underwriting_class = policy.get('underwriting_class', 0)

    if underwriting_class == 1:  # Smoker
        return 1.5  # 50% higher mortality
    elif underwriting_class == 3:  # Preferred
        return 0.85  # 15% lower mortality
    elif underwriting_class == 4:  # Substandard
        return 1.3  # 30% higher mortality

    # Standard and NonSmoker: no adjustment
    return 1.0


def adjust_lapse(policy, year, lives, interest_rate):
    """
    Smokers tend to lapse less (they know they need the coverage).
    """
    underwriting_class = policy.get('underwriting_class', 0)

    if underwriting_class == 1:  # Smoker
        return 0.9  # 10% lower lapse

    return 1.0
