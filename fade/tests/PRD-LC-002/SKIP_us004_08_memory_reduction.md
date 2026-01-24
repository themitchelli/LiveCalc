# SKIP: US-004 AC 8 - Memory usage reduced by ~Nx vs copying

## Acceptance Criterion
Memory usage reduced by ~Nx vs copying (where N = worker count)

## Reason for Skipping
This is a performance/memory characteristic that requires:
1. Running actual valuations with memory profiling
2. Comparing SAB mode vs non-SAB mode memory usage
3. Calculating the reduction factor

This cannot be verified via a shell script without:
- Node.js runtime with memory profiling
- Running both worker pool implementations
- Measuring heap usage

## Manual Verification
Run the benchmark suite with memory tracking:
```bash
cd livecalc-engine/benchmarks
npm run benchmark
```
Compare memory usage between SAB and non-SAB worker pools.
Expected: ~87.5% reduction with 8 workers (7/8 of duplication eliminated).
