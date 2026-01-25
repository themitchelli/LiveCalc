# SKIP: Proof - Local 10K policy run yields same result hash as cloud container run

## User Story
US-BRIDGE-01: Cloud Worker Container (Parity Runtime)

## Acceptance Criterion
Proof: A local 10K policy run yields the same result hash as the cloud container run.

## Why This Is Not Testable via Shell Script

This acceptance criterion requires:

1. **Running container infrastructure**: Requires Docker/Kubernetes to run the cloud worker
2. **Full end-to-end execution**: Requires actual WASM pipeline execution with real policy data
3. **Local development environment**: Requires local Emscripten runtime setup
4. **Data dependencies**: Requires 10,000 policy records and assumption data
5. **Hash comparison**: Results depend on floating-point calculations which may have minor environmental differences

This is an integration test that would need to be run in a CI/CD environment with:
- Docker build and run capabilities
- Pre-configured test data (10K policies)
- Both local and containerized execution environments

## Recommended Verification

Manual verification or automated integration test in CI/CD pipeline:
```bash
# Build and run cloud worker container
docker build -f livecalc-cloud/Dockerfile.worker -t livecalc-worker .
docker run -p 3000:3000 livecalc-worker

# Run local calculation and get hash
LOCAL_HASH=$(./run-local-calc.sh --policies 10000 --output-hash)

# Run cloud calculation and get hash
CLOUD_HASH=$(curl -X POST http://localhost:3000/execute -d @test-payload.json | jq -r '.assetsHash')

# Compare
if [[ "$LOCAL_HASH" == "$CLOUD_HASH" ]]; then
    echo "PASS: Parity verified"
fi
```
