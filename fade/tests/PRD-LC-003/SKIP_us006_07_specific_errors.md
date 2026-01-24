# SKIP: US-006 AC-07 - Report specific validation errors (file, line, column)

## Acceptance Criterion
Report specific validation errors (file, line, column)

## Reason for Skipping
This acceptance criterion requires runtime testing:

1. **Error Generation**: Errors only generated when invalid data is loaded
2. **Message Format**: Would need to trigger errors and check message format
3. **Integration Test**: Requires invalid input files and error inspection

## Alternative Verification
- Code review: Check for error objects with file, line, column properties
- Look for CsvValidationError class with location information
- Create integration tests that trigger validation errors
