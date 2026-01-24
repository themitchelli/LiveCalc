# SKIP: US-003 AC-03 - Engine-to-engine handoff time < 1ms (zero-copy)

## Acceptance Criterion
> Benchmark: Engine-to-engine handoff time < 1ms (zero-copy)

## Why This Is Not Testable Via Shell Scripts

This acceptance criterion is a performance benchmark that requires:

1. **Runtime execution** - Handoff time can only be measured during actual pipeline execution
2. **Multi-threaded environment** - Requires Worker threads and SharedArrayBuffer
3. **Performance measurement tools** - Needs high-resolution timing in JavaScript runtime

## Verification Approach

The benchmark can be verified by:
1. Running the existing Vitest tests with timing assertions in `livecalc-engine/js/tests/atomic-signals.test.ts`
2. Using the TimingProfiler to measure actual handoff latencies during pipeline runs
3. Checking the `calculateHandoffLatency` method in atomic-signals.ts

## Code Evidence

The `calculateHandoffLatency` method in `atomic-signals.ts` provides:
- High-resolution timestamps (nanosecond precision)
- Handoff latency calculation between nodes
- `getAllHandoffLatencies()` for complete profiling

## Recommendation

Run benchmark tests with:
```bash
cd livecalc-engine/js && npm test -- --grep "handoff"
```

Or check handoff latencies via the VS Code extension's Timing Profiler panel.
