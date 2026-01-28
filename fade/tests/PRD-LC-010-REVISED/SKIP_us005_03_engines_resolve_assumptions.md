# SKIP: US-005 AC-03 - Engines independently resolve assumptions

## Acceptance Criterion
"Engines use credentials to independently resolve assumptions"

## Reason for Skipping
This acceptance criterion requires integration with a live Assumptions Manager:
1. Requires network access to AM server
2. Requires valid JWT tokens
3. Cannot be tested in isolation without mocking external service

## Manual Verification
To verify assumption resolution:
1. Configure valid AM credentials
2. Run a projection with assumption references
3. Verify assumptions are resolved from AM
4. Check logs for assumption resolution events

## Related Test
`test_us007_07_assumption_resolution_logging.sh` verifies the logging of assumption resolution
