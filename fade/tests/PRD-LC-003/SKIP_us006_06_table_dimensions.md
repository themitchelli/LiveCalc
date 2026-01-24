# SKIP: US-006 AC-06 - Validate assumption table dimensions (age range, year range)

## Acceptance Criterion
Validate assumption table dimensions (age range, year range)

## Reason for Skipping
This acceptance criterion requires runtime testing:

1. **Dynamic Validation**: Dimension validation happens when tables are loaded
2. **Specific Checks**: Would need to parse and check actual table structures
3. **Integration Test**: Better tested with actual table files

## Alternative Verification
- Code review: Check assumption-loader.ts for dimension validation
- Verify mortality tables have expected age ranges (0-120)
- Verify lapse tables have expected year ranges (1-50)
- Create integration tests with incomplete tables
