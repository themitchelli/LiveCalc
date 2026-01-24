# LiveCalc Cloud Runtime

Cloud execution infrastructure for LiveCalc, providing containerized WASM/Python runtime with parity to local development environment.

## Overview

The LiveCalc cloud runtime enables actuaries to scale their models from desktop (1K scenarios) to cloud (1M+ scenarios) seamlessly. The cloud worker container mirrors the local development environment to ensure byte-identical results.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code Extension                       │
│  (Local Development)                                         │
│  ┌─────────────┐                                             │
│  │ Model       │  Package & Upload                           │
│  │ Assets      │───────────────┐                             │
│  └─────────────┘               │                             │
└────────────────────────────────┼─────────────────────────────┘
                                 │
                                 ↓
              ┌──────────────────────────────────────┐
              │       Cloud API (FastAPI)            │
              │  - Job submission                    │
              │  - Asset validation                  │
              │  - WebSocket streaming               │
              └──────────────────────────────────────┘
                                 │
                                 ↓
              ┌──────────────────────────────────────┐
              │    Kubernetes (AKS)                  │
              │  ┌────────────────────────────────┐  │
              │  │  Cloud Worker Pods             │  │
              │  │  - Emscripten + Pyodide        │  │
              │  │  - SIMD128 support             │  │
              │  │  - 16-byte alignment           │  │
              │  │  - SharedArrayBuffer + Atomics │  │
              │  └────────────────────────────────┘  │
              └──────────────────────────────────────┘
                                 │
                                 ↓
              ┌──────────────────────────────────────┐
              │     Results Stream (WebSocket)       │
              │  Binary chunks → Local Results Panel │
              └──────────────────────────────────────┘
```

## Components

### Cloud Worker (`worker/`)

Containerized Node.js runtime that executes WASM and Python calculation engines.

**Key Features:**
- Emscripten SDK for WASM compilation and execution
- Pyodide for Python runtime
- SIMD128 support for vector operations
- 16-byte memory alignment for SIMD compatibility
- SharedArrayBuffer and Atomics for zero-copy data sharing
- WebSocket streaming for real-time results

**Endpoints:**
- `GET /health` - Health check with memory/runtime info
- `GET /capabilities` - Runtime capabilities verification (SIMD, SAB, Atomics)
- `POST /execute` - Pipeline execution (placeholder, completed in US-BRIDGE-04)

### API (`api/`)

FastAPI service for job management and asset handling (to be implemented in US-BRIDGE-03).

### Kubernetes (`k8s/`)

Infrastructure manifests for deploying workers to AKS.

**Resource Limits:**
- Memory: 2Gi request, 4Gi limit
- CPU: 1000m request, 2000m limit
- Auto-scaling: 3-10 pods based on CPU (70%) and memory (80%) utilization

## Development

### Prerequisites

- Node.js 18+
- Docker
- Kubernetes (for deployment)

### Local Development

```bash
cd worker
npm install
npm run dev
```

The worker will start on `http://localhost:3000`.

### Build Docker Image

```bash
npm run docker:build
```

### Run Docker Container

```bash
npm run docker:run
```

This runs the container with:
- Port 3000 exposed
- 4GB memory limit
- 2 CPU limit

### Test Runtime Parity

```bash
cd worker
npx tsx src/parity-test.ts
```

This verifies:
- SIMD128 support
- 16-byte memory alignment
- SharedArrayBuffer availability
- Atomics support
- Result hash matching between local and cloud

## Deployment

### Deploy to Kubernetes

```bash
kubectl apply -f k8s/worker-deployment.yaml
```

This creates:
- Deployment with 3 replicas
- Service (ClusterIP) on port 80
- HorizontalPodAutoscaler (3-10 pods)

### Verify Deployment

```bash
# Check pods
kubectl get pods -n livecalc -l app=livecalc-worker

# Check service
kubectl get svc -n livecalc livecalc-worker

# Check HPA
kubectl get hpa -n livecalc livecalc-worker-hpa

# Test health endpoint
kubectl port-forward -n livecalc svc/livecalc-worker 3000:80
curl http://localhost:3000/health
```

## Runtime Parity Verification

The cloud worker is designed to produce **byte-identical** results to local execution. This is verified through:

1. **SIMD Support**: Same SIMD128 instructions available in both environments
2. **Memory Alignment**: 16-byte alignment enforced for SIMD compatibility
3. **SharedArrayBuffer**: Zero-copy data sharing available in both environments
4. **Deterministic Execution**: Same WASM binary, same inputs → same outputs
5. **Hash Verification**: SHA-256 hash of results must match between local and cloud

### Acceptance Criteria (US-BRIDGE-01)

- [x] Dockerfile builds a Debian-based image with Emscripten and Pyodide runtimes
- [x] Runtime supports WASM SIMD128 and 16-byte memory alignment
- [ ] Proof: A local 10K policy run yields the same result hash as the cloud container run (pending actual WASM integration in US-BRIDGE-04)
- [x] Resource limits are enforceable (CPU/RAM) via K8s manifest

## Performance Targets

Based on SPIKE-LC-007 benchmarks:

| Configuration | Local (8 workers) | Cloud (Expected) | Target |
|---------------|-------------------|------------------|--------|
| 10K × 1K      | 370ms             | <500ms           | <3s    |
| 100K × 1K     | 3.0s              | <5s              | <30s   |
| 1M × 1K       | 36s               | <60s             | <5min  |

Cloud overhead budget: <35% vs local (network, container initialization)

## Security

- Non-root user (UID 1000)
- No secrets in container image
- Assumption Manager JWT required for execution
- Audit logging for all tenant actions

## Monitoring

Health metrics exposed at `/health`:
- Memory usage (heap, RSS)
- Uptime
- Runtime capabilities
- Node.js version

TODO: Prometheus metrics endpoint (future PRD)

## Troubleshooting

### SIMD Not Available

Check `WASM_SIMD` environment variable:
```bash
kubectl set env deployment/livecalc-worker -n livecalc WASM_SIMD=1
```

### SharedArrayBuffer Not Available

Verify Node.js version >= 16:
```bash
kubectl exec -n livecalc deployment/livecalc-worker -- node --version
```

### Memory Limit Exceeded

Increase resource limits in `k8s/worker-deployment.yaml`:
```yaml
resources:
  limits:
    memory: "8Gi"  # Increase from 4Gi
```

## Next Steps

- **US-BRIDGE-02**: Model asset packaging utility
- **US-BRIDGE-03**: Local-to-cloud bridge API
- **US-BRIDGE-04**: Cloud pipeline reconstruction
- **US-BRIDGE-05**: Cloud result streaming

## References

- [PRD-LC-012: Cloud Runtime & Execution Bridge](../fade/prds/PRD-LC-012-cloud-runtime-execution-bridge.json)
- [PRD-LC-010: Modular Orchestration Layer](../fade/prds/PRD-LC-010-modular-orchestration.json)
- [Emscripten Documentation](https://emscripten.org/docs/)
- [Pyodide Documentation](https://pyodide.org/en/stable/)
