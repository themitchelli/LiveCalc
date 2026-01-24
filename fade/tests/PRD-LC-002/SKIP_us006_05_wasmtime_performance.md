# SKIP: US-006 AC 5 - Performance within 20% of native C++ (Wasmtime)

## Acceptance Criterion
Performance within 20% of native C++ (Wasmtime is near-native)

## Reason for Skipping
This performance validation requires:
1. Building native C++ binary
2. Building WASM binary
3. Running Wasmtime with the WASM binary
4. Comparing execution times

This cannot be verified via a shell script without:
- Installed Wasmtime runtime
- Built binaries
- Actual execution and timing

## Manual Verification
Run performance comparison:
```bash
# Native
./build/livecalc-engine --config test.json

# Wasmtime
wasmtime run build-wasi/livecalc-wasi.wasm -- --config test.json
```
Compare execution times. Wasmtime should be within 20% of native.
