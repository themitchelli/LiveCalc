# SKIP: US-002 AC-05 - Workers map local pointers to global SAB offsets

## Acceptance Criterion
> Workers map local pointers to global SAB offsets based on the map

## Why This Is Not Testable Via Shell Scripts

This acceptance criterion requires runtime worker execution:

1. **Web Worker context required** - Workers operate in a separate thread context that cannot be tested via shell scripts
2. **SharedArrayBuffer sharing** - Testing pointer mapping requires actual SAB transfer between main thread and workers
3. **Integration testing scope** - This is an integration test that requires the full engine runtime

## Existing Test Coverage

The following tests in `livecalc-engine/js/tests/` cover related functionality:
- `memory-manager.test.ts` - Tests offset calculation and mapping
- `worker-pool.test.ts` - Tests worker communication and SAB sharing

## Recommendation

This is tested through the Vitest unit test suite:
```bash
cd livecalc-engine/js && npm test
```
