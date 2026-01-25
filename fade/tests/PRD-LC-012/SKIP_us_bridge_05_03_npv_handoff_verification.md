# SKIP: Handoff verification - Total NPV matches between local and cloud runs

## User Story
US-BRIDGE-05: Cloud Result Streaming

## Acceptance Criterion
Handoff verification: 'Total NPV' matches between local and cloud runs.

## Why This Is Not Testable via Shell Script

This acceptance criterion requires:

1. **Full execution environment**: Both local and cloud WASM runtimes must be running
2. **Actual calculation**: Requires real NPV calculations with policy data
3. **End-to-end integration**: WebSocket streaming from cloud to local Results Panel
4. **Floating-point comparison**: NPV values need proper epsilon-based comparison
5. **Test data**: Requires consistent policy/assumption data between environments

This is an integration/acceptance test that requires:
- Running cloud worker container
- Running VS Code extension with Results Panel
- Shared test data between environments
- Comparison of calculated financial values

## Recommended Verification

Integration test in CI/CD pipeline or manual verification:

```bash
# 1. Run local calculation
LOCAL_NPV=$(node dist/run-local.js --policies 1000 --output npv)

# 2. Start cloud worker
docker run -p 3000:3000 livecalc-worker &

# 3. Submit same job to cloud
CLOUD_NPV=$(curl -X POST http://localhost:3000/execute \
  -d @test-payload.json | jq -r '.statistics.mean')

# 4. Compare with tolerance
python3 -c "
local = $LOCAL_NPV
cloud = $CLOUD_NPV
tolerance = 0.001  # 0.1% tolerance
diff = abs(local - cloud) / local
if diff < tolerance:
    print('PASS: NPV matches within tolerance')
else:
    print(f'FAIL: NPV mismatch - Local: {local}, Cloud: {cloud}, Diff: {diff*100}%')
"
```

## Alternative Verification

Code review to confirm:
1. Same WASM binaries are used in both environments
2. Same floating-point precision settings
3. Same random seed handling for stochastic scenarios
