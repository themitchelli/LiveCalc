# LiveCalc Platform Management

Platform orchestration features implementing the DR = BAU (Disaster Recovery = Business As Usual) pattern.

## Overview

The LiveCalc Platform Management system provides:

- **Transient Namespace Lifecycle**: Automatic namespace creation per bucket and cleanup after 24h inactivity
- **Diagnostic Extraction**: Pod logs and memory sentinel violations archived to Azure Blob before reaping
- **MTTC Verification**: Resume deleted namespace runs from hashed model bundles in < 2 minutes
- **Zero Idle Cost**: Namespaces evaporate automatically, ensuring no orphaned resources

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Kubernetes Cluster                       │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │ LiveCalc API     │    │ Cleanup Worker   │              │
│  │ (Platform Router)│    │ (CronJob)        │              │
│  └────────┬─────────┘    └────────┬─────────┘              │
│           │                       │                         │
│           │  Creates/Finalizes    │  Finds & Reaps          │
│           ↓                       ↓                         │
│  ┌──────────────────────────────────────────┐              │
│  │   Transient Namespaces                   │              │
│  │   (livecalc-bucket-{id})                 │              │
│  │                                           │              │
│  │   ┌─────────┐  ┌─────────┐  ┌─────────┐ │              │
│  │   │ Worker  │  │ Worker  │  │ Worker  │ │              │
│  │   │ Pod 1   │  │ Pod 2   │  │ Pod N   │ │              │
│  │   └─────────┘  └─────────┘  └─────────┘ │              │
│  └──────────────────────────────────────────┘              │
│                       │                                     │
└───────────────────────┼─────────────────────────────────────┘
                        │
                        ↓ Diagnostic Extraction
                ┌───────────────────┐
                │  Azure Blob       │
                │  Storage          │
                │  - Pod Logs       │
                │  - Sentinel Logs  │
                └───────────────────┘
```

## Namespace Lifecycle

### 1. Creation

Namespaces are automatically created when a new job is submitted:

```python
POST /v1/platform/namespaces?bucket_id=test-123
Authorization: Bearer {jwt_token}
```

Response:
```json
{
  "namespace": "livecalc-bucket-test-123",
  "bucket_id": "test-123",
  "created_at": "2026-01-25T01:00:00Z"
}
```

Namespace is labeled:
- `app: livecalc`
- `bucket-id: {bucket_id}`
- `managed-by: livecalc-platform`
- `lifecycle: transient`

Namespace is annotated:
- `created-at: {timestamp}`
- `last-activity: {timestamp}`
- `status: active`

### 2. Activity Tracking

Worker pods update namespace activity via:

```python
await namespace_manager.update_namespace_activity(namespace)
```

This updates the `last-activity` annotation, resetting the inactivity timer.

### 3. Finalization

When all jobs in a bucket complete, mark namespace as finalized:

```python
POST /v1/platform/namespaces/{namespace}/finalize
```

This sets `status: finalized`, making it immediately eligible for reaping.

### 4. Reaping

The cleanup worker (CronJob running every 5 minutes) finds namespaces eligible for cleanup:

**Eligibility Criteria:**
- `status: finalized`, OR
- Inactive for > 24 hours (configurable)

**Reaping Process:**
1. Extract diagnostics (pod logs, sentinel violations)
2. Upload to Azure Blob: `diagnostics/{bucket_id}/{timestamp}/`
3. Delete namespace (cascades to pods and PVCs)
4. Wait for full deletion (up to 60 seconds)
5. Verify no orphaned PVCs remain

**Manual Reaping:**
```python
POST /v1/platform/namespaces/{namespace}/reap?bucket_id={bucket_id}
```

Response:
```json
{
  "success": true,
  "namespace": "livecalc-bucket-test-123",
  "diagnostics": {
    "logs_archived": true,
    "sentinel_violations_indexed": true,
    "blob_paths": [
      "test-123/20260125-010000/logs/worker-pod-1.log",
      "test-123/20260125-010000/logs/worker-pod-2.log",
      "test-123/20260125-010000/sentinel-violations.json"
    ]
  },
  "message": "Namespace livecalc-bucket-test-123 successfully reaped"
}
```

## Diagnostic Extraction

Before reaping, the system extracts:

### 1. Pod Logs

All pod logs archived to:
```
diagnostics/{bucket_id}/{timestamp}/logs/{pod_name}.log
```

### 2. Sentinel Violations

Memory integrity violations extracted from pod annotations:
```
diagnostics/{bucket_id}/{timestamp}/sentinel-violations.json
```

Format:
```json
[
  {
    "pod": "worker-pod-1",
    "violations": "offset:1234,expected:0xABCD,actual:0x1234",
    "timestamp": "2026-01-25T01:00:00Z"
  }
]
```

Workers annotate pods with sentinel violations:
```yaml
metadata:
  annotations:
    memory-sentinel-violations: "offset:1234,expected:0xABCD,actual:0x1234"
```

### 3. Storage Structure

```
diagnostics/
  ├── {bucket_id}/
  │   ├── {timestamp}/
  │   │   ├── logs/
  │   │   │   ├── worker-pod-1.log
  │   │   │   ├── worker-pod-2.log
  │   │   │   └── worker-pod-N.log
  │   │   └── sentinel-violations.json
```

Retention: 30 days (standard) / 7 years (regulatory locked)

## MTTC Verification

Mean Time to Re-compute (MTTC) verification ensures deleted namespace runs can be resumed from hashed model bundles.

**Target:** < 2 minutes to resume with identical result hashes

```python
POST /v1/platform/mttc/verify
Content-Type: application/json

{
  "bucket_id": "test-123",
  "model_bundle_hash": "abc123def456..."
}
```

Response:
```json
{
  "success": true,
  "original_result_hash": "xyz789...",
  "resumed_result_hash": "xyz789...",
  "match": true,
  "duration_seconds": 87.5,
  "message": "MTTC verification passed: 87.50s"
}
```

**Process:**
1. Create new namespace for resumed run
2. Load model bundle from blob storage by hash
3. Verify bundle hash matches
4. Initialize pipeline
5. Execute pipeline with same config
6. Compare result hashes
7. Measure total duration
8. Clean up verification namespace

## Cleanup Worker Configuration

### Environment Variables

```bash
AZURE_BLOB_CONNECTION_STRING=<connection_string>
DIAGNOSTIC_CONTAINER_NAME=diagnostics
INACTIVITY_THRESHOLD_HOURS=24
LOG_LEVEL=INFO
```

### Kubernetes CronJob

Deployed via:
```bash
kubectl apply -f k8s/jobs/cleanup-worker.yaml
```

Schedule: Every 5 minutes (`*/5 * * * *`)

### RBAC Permissions

The cleanup worker requires:
- **Namespace**: get, list, watch, create, update, patch, delete
- **Pods**: get, list, watch (for log extraction)
- **PVCs**: get, list, watch, delete (for orphan detection)
- **Events**: get, list, watch (for auditing)

Configured via ClusterRole `livecalc-namespace-manager`

## Monitoring

### Namespace Status

List all managed namespaces:
```python
GET /v1/platform/namespaces
```

Get specific namespace:
```python
GET /v1/platform/namespaces/{namespace}
```

Response:
```json
{
  "namespace": "livecalc-bucket-test-123",
  "bucket_id": "test-123",
  "created_at": "2026-01-25T00:00:00Z",
  "last_activity": "2026-01-25T01:30:00Z",
  "status": "active",
  "pod_count": 3,
  "pvc_count": 0
}
```

### Cleanup Worker Logs

View cleanup worker logs:
```bash
kubectl logs -n livecalc-platform -l component=cleanup-worker --tail=100
```

Sample output:
```
2026-01-25 01:00:00 - INFO - Starting cleanup worker
2026-01-25 01:00:01 - INFO - Found 2 namespaces eligible for cleanup
2026-01-25 01:00:02 - INFO - Reaping namespace livecalc-bucket-old-123
2026-01-25 01:00:05 - INFO - Archived logs for pod worker-1
2026-01-25 01:00:06 - INFO - Indexed 0 sentinel violations
2026-01-25 01:00:10 - INFO - Deleted namespace livecalc-bucket-old-123
2026-01-25 01:00:11 - INFO - Successfully reaped namespace livecalc-bucket-old-123
2026-01-25 01:00:12 - INFO - Cleanup worker finished: 2 successful, 0 failed
```

## API Reference

### Platform Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/platform/namespaces` | POST | Create namespace for bucket |
| `/v1/platform/namespaces` | GET | List all managed namespaces |
| `/v1/platform/namespaces/{namespace}` | GET | Get namespace info |
| `/v1/platform/namespaces/{namespace}/finalize` | POST | Mark namespace as finalized |
| `/v1/platform/namespaces/{namespace}/reap` | POST | Manually reap namespace |
| `/v1/platform/mttc/verify` | POST | Verify MTTC resumption |

All endpoints require JWT authentication via `Authorization: Bearer {token}`

## Security

### Authentication

All platform endpoints require JWT token from Assumptions Manager.

Token must include:
- `tenant_id` claim for tenant isolation
- `user_id` claim for audit logging
- Valid signature verified against JWKS

### Authorization

Platform operations are scoped to tenant:
- Users can only manage namespaces in their tenant
- Diagnostic blobs are tenant-isolated
- RBAC enforced at Kubernetes level

### Audit Trail

All platform operations logged:
- Namespace creation/deletion
- Diagnostic extraction
- Manual reaping
- MTTC verifications

Logs include:
- User ID
- Tenant ID
- Namespace
- Bucket ID
- Timestamp
- Operation result

## Troubleshooting

### Orphaned PVCs

If reaping fails due to orphaned PVCs:

```bash
# List orphaned PVCs
kubectl get pvc --all-namespaces | grep livecalc-bucket-

# Manual cleanup
kubectl delete pvc -n livecalc-bucket-{id} --all
```

### Failed Diagnostic Extraction

If diagnostic extraction fails, logs are unavailable but namespace still reaped.

Check cleanup worker logs for errors:
```bash
kubectl logs -n livecalc-platform -l component=cleanup-worker | grep ERROR
```

### MTTC Verification Timeout

If MTTC verification exceeds 2 minutes:

1. Check model bundle availability in blob storage
2. Verify pipeline initialization time
3. Check resource limits on verification pods
4. Review namespace creation latency

## Performance

### Reaping Performance

- **Diagnostic Extraction**: ~5-10 seconds for typical workload (3-5 pods)
- **Namespace Deletion**: ~10-30 seconds (Kubernetes finalizer wait)
- **Total Reaping Time**: ~15-40 seconds per namespace

### Cleanup Worker Impact

- **CPU**: ~100m request, 500m limit
- **Memory**: ~256Mi request, 512Mi limit
- **Network**: Minimal (only during log upload)
- **Blob Storage**: ~1-10MB per namespace reaping

### MTTC Target

- **Target**: < 2 minutes
- **Typical**: 60-90 seconds (namespace creation + pipeline init + short run)
- **Components**:
  - Namespace creation: ~5-10s
  - Bundle fetch: ~5-10s
  - Pipeline init: ~20-30s
  - Execution: ~30-40s (depends on model)

## Future Enhancements

- [ ] Scale-to-Zero KEDA integration (US-PLAT-02)
- [ ] Statistical Anomaly Engine (US-PLAT-03)
- [ ] Debugging-as-a-Service (DaaS) (US-PLAT-04)
- [ ] Warm-Pool optimization for high-intensity windows
- [ ] Configurable retention policies per tenant
- [ ] Automatic MTTC testing on each reaping
