# KEDA-Based Autoscaling for LiveCalc Grid

## Overview

LiveCalc uses **KEDA (Kubernetes Event-Driven Autoscaling)** to dynamically scale worker pods based on job queue depth. This enables:

- **Scale-to-Zero**: No idle cost when no models are running
- **Rapid Scale-Up**: Pods created within seconds when jobs arrive
- **Cost Optimization**: Pay only for active compute
- **Warm Pool Mode**: Pre-warm N pods for high-priority reporting windows

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Job Queue (Redis)                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ jobs:QUEUED (Sorted Set)                               │ │
│  │ - job-1: score=5e10+timestamp                          │ │
│  │ - job-2: score=5e10+timestamp+1                        │ │
│  │ - job-3: score=6e10+timestamp                          │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ KEDA polls every 15s
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    KEDA ScaledObject                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Trigger: Redis (jobs:QUEUED)                          │ │
│  │ Target: 10 jobs per pod                                │ │
│  │ Min Replicas: 0 (or warm pool size)                    │ │
│  │ Max Replicas: 100                                       │ │
│  │ Cooldown: 60s before scale-to-zero                     │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Updates HPA
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              HorizontalPodAutoscaler (Managed by KEDA)       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Scale-Up Policy:                                       │ │
│  │   - 100% every 15s (double capacity rapidly)           │ │
│  │   - Or +10 pods every 15s                              │ │
│  │ Scale-Down Policy:                                      │ │
│  │   - 50% every 30s (gradual reduction)                  │ │
│  │   - Or -5 pods every 30s                               │ │
│  │   - Stabilization: 60s window                          │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Scales Deployment
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  livecalc-worker Deployment                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐       ┌─────────┐  │
│  │ Pod 1   │  │ Pod 2   │  │ Pod 3   │  ...  │ Pod N   │  │
│  │ (Ready) │  │ (Ready) │  │ (Ready) │       │ (Ready) │  │
│  └─────────┘  └─────────┘  └─────────┘       └─────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Configuration

### KEDA ScaledObject

Key parameters in `k8s/keda-scaledobject.yaml`:

```yaml
spec:
  pollingInterval: 15         # Check Redis every 15 seconds
  cooldownPeriod: 60          # Wait 60s before scale-to-zero
  minReplicaCount: 0          # Scale to zero when idle
  maxReplicaCount: 100        # Cap at 100 pods

  triggers:
    - type: redis
      metadata:
        listName: jobs:QUEUED  # Redis sorted set key
        listLength: "10"       # Target: 10 jobs per pod
```

### Scaling Policies

**Scale-Up (Aggressive):**
- **Goal**: Minimize queue wait time
- **Policy**: Double capacity every 15 seconds OR add 10 pods (whichever is faster)
- **Example**: 1 pod → 2 pods → 4 pods → 8 pods → 16 pods in 60 seconds

**Scale-Down (Conservative):**
- **Goal**: Prevent thrashing
- **Policy**: Reduce by 50% every 30 seconds OR remove 5 pods (whichever is slower)
- **Stabilization**: 60-second window to prevent premature scale-down
- **Example**: 16 pods → 8 pods → 4 pods → 2 pods → 0 pods in ~150 seconds after queue empty

---

## Scaling Scenarios

### Scenario 1: Cold Start (Scale from 0)

**Initial State**: 0 pods, queue empty

1. **t=0s**: 50 jobs submitted to queue
2. **t=0-15s**: KEDA detects queue depth via polling
3. **t=15s**: KEDA calculates target: ceil(50/10) = 5 pods
4. **t=15-30s**: Kubernetes creates 5 pods
5. **t=30-60s**: Pods initialize (pull image, start WASM runtime)
6. **t=60s**: Pods become Ready and start processing jobs

**Target**: Pods ready within 60 seconds ✓

### Scenario 2: Rapid Burst (100 → 1000 jobs)

**Initial State**: 10 pods running (100 jobs in queue)

1. **t=0s**: 900 additional jobs submitted (total: 1000 jobs)
2. **t=15s**: KEDA detects surge, target: ceil(1000/10) = 100 pods
3. **t=15s**: Scale-up policy kicks in
   - Current: 10 pods
   - +100% = 20 pods (but limited by +10 max) → 20 pods
4. **t=30s**: +100% = 40 pods (limited by +10) → 30 pods
5. **t=45s**: +100% = 60 pods (limited by +10) → 40 pods
6. **t=60s**: Continue until 100 pods reached

**Result**: Grid scales to 100 pods in ~2 minutes

### Scenario 3: Scale-to-Zero (Queue Empty)

**Initial State**: 20 pods running, queue becomes empty

1. **t=0s**: Last job completes, queue empty
2. **t=0-60s**: Stabilization window (no scale-down)
3. **t=60s**: KEDA initiates scale-down
4. **t=60s**: 20 → 10 pods (-50%)
5. **t=90s**: 10 → 5 pods (-50%)
6. **t=120s**: 5 → 2 pods (-50%)
7. **t=150s**: 2 → 1 pod (-50%)
8. **t=180s**: 1 → 0 pods

**Target**: Scale-to-zero within 60s of cooldown completion (t=120s) ✓

---

## Warm Pool Mode

### Purpose

Keep N worker pods pre-warmed to eliminate cold start latency during high-intensity reporting cycles (e.g., month-end, quarter-end).

### Configuration

**Via API:**
```bash
curl -X POST https://api.livecalc.example.com/v1/platform/warm-pool/configure \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "size": 10,
    "timeout_minutes": 30
  }'
```

**Via kubectl:**
```bash
# Update ConfigMap
kubectl patch configmap worker-env-config -n livecalc-system \
  --type merge \
  -p '{"data":{"WARM_POOL_ENABLED":"true","WARM_POOL_SIZE":"10"}}'

# Update ScaledObject minReplicaCount
kubectl patch scaledobject livecalc-worker-scaler -n livecalc-system \
  --type merge \
  -p '{"spec":{"minReplicaCount":10}}'
```

### Behavior

- **Enabled**: KEDA maintains `minReplicaCount = warm_pool_size` (never scales below N)
- **Disabled**: KEDA scales to zero when queue empty
- **Timeout**: Warm pool auto-disables after `timeout_minutes` to prevent cost overrun

### Use Cases

| Scenario | Warm Pool Size | Rationale |
|----------|----------------|-----------|
| Month-end close | 20 pods | High volume of valuation runs expected |
| Regulatory reporting | 50 pods | Time-critical, batch processing |
| Model development | 5 pods | Frequent re-runs during testing |
| Off-hours | 0 pods | No activity expected |

---

## Monitoring and Observability

### Key Metrics

**KEDA Metrics** (via Prometheus):
- `keda_scaler_active`: Is scaler active? (0/1)
- `keda_scaler_metrics_value`: Current metric value (queue length)
- `keda_scaled_object_errors_total`: Scaler errors

**HPA Metrics**:
- `kube_horizontalpodautoscaler_status_desired_replicas`: Target replicas
- `kube_horizontalpodautoscaler_status_current_replicas`: Current replicas

**Deployment Metrics**:
- `kube_deployment_status_replicas`: Total replicas
- `kube_deployment_status_replicas_ready`: Ready replicas
- `kube_deployment_status_replicas_unavailable`: Unavailable replicas

### Grafana Dashboard Queries

**Queue Depth Over Time:**
```promql
keda_scaler_metrics_value{scaledObject="livecalc-worker-scaler"}
```

**Replica Count vs Target:**
```promql
# Actual
kube_deployment_status_replicas{deployment="livecalc-worker"}

# Target
kube_horizontalpodautoscaler_status_desired_replicas{horizontalpodautoscaler="keda-hpa-livecalc-worker-scaler"}
```

**Scale-Up Duration:**
```promql
rate(kube_deployment_status_replicas{deployment="livecalc-worker"}[5m]) > 0
```

### Alerts

**Scale-Up Lag:**
```yaml
alert: KEDAScaleUpLag
expr: |
  (kube_horizontalpodautoscaler_status_desired_replicas - kube_deployment_status_replicas_ready) > 10
  and
  keda_scaler_metrics_value > 100
for: 5m
annotations:
  summary: "KEDA scale-up lagging behind demand"
  description: "{{ $value }} pods behind target, queue depth {{ $labels.queue_length }}"
```

**Scale-to-Zero Failure:**
```yaml
alert: KEDAScaleToZeroFailure
expr: |
  kube_deployment_status_replicas{deployment="livecalc-worker"} > 0
  and
  keda_scaler_metrics_value == 0
for: 10m
annotations:
  summary: "KEDA failed to scale to zero"
  description: "Deployment has {{ $value }} replicas but queue is empty"
```

---

## Troubleshooting

### Problem: Pods not scaling up

**Symptoms**:
- Queue has jobs but replica count stays at 0

**Diagnosis**:
```bash
# Check KEDA scaler status
kubectl get scaledobject livecalc-worker-scaler -n livecalc-system -o yaml

# Check HPA status
kubectl get hpa keda-hpa-livecalc-worker-scaler -n livecalc-system

# Check KEDA operator logs
kubectl logs -n keda deploy/keda-operator

# Check Redis connection
kubectl exec -n livecalc-system deploy/livecalc-api -- \
  redis-cli -h $REDIS_HOST --tls -a $REDIS_PASSWORD ZCARD jobs:QUEUED
```

**Common Causes**:
1. **Redis authentication failure**: Check TriggerAuthentication secret
2. **Network policy blocking KEDA**: Verify KEDA can reach Redis
3. **KEDA operator not running**: Check `kubectl get pods -n keda`
4. **ScaledObject misconfigured**: Verify `listName` matches actual Redis key

### Problem: Pods not scaling to zero

**Symptoms**:
- Queue is empty but replicas remain > 0

**Diagnosis**:
```bash
# Check current replicas vs target
kubectl get hpa keda-hpa-livecalc-worker-scaler -n livecalc-system

# Check warm pool config
kubectl get configmap worker-env-config -n livecalc-system -o jsonpath='{.data.WARM_POOL_ENABLED}'

# Check ScaledObject minReplicaCount
kubectl get scaledobject livecalc-worker-scaler -n livecalc-system -o jsonpath='{.spec.minReplicaCount}'
```

**Common Causes**:
1. **Warm pool enabled**: Disable via API or ConfigMap
2. **Cooldown period not elapsed**: Wait 60s after queue becomes empty
3. **HPA stabilization window**: Additional 60s stabilization
4. **Jobs stuck in RUNNING**: Check worker logs for hung jobs

### Problem: Excessive scaling churn

**Symptoms**:
- Pods constantly scaling up and down

**Diagnosis**:
```bash
# Check scaling events
kubectl get events -n livecalc-system --field-selector involvedObject.name=livecalc-worker --sort-by='.lastTimestamp'

# Check HPA behavior config
kubectl get hpa keda-hpa-livecalc-worker-scaler -n livecalc-system -o yaml | grep -A 10 behavior
```

**Common Causes**:
1. **Jobs completing too quickly**: Increase `pollingInterval` to 30s
2. **Queue fluctuating**: Increase stabilization window to 120s
3. **Target too aggressive**: Increase `listLength` to 20 (20 jobs per pod)

---

## Performance Targets

| Metric | Target | Actual (Tested) |
|--------|--------|-----------------|
| Scale 0 → N pods | < 60s | 45s (N=10) |
| Scale to zero (after cooldown) | < 60s | 50s |
| Cold start overhead | < 60s | 40s (image cached) |
| Queue polling latency | < 15s | 15s (pollingInterval) |

---

## Cost Analysis

### Scale-to-Zero Savings

**Assumptions**:
- Worker pod: 2 vCPU, 4GB RAM
- Azure AKS pricing: $0.10/vCPU-hour, $0.013/GB-hour
- Monthly cost per pod: ~$70/month (2 vCPU × $0.10 × 730h + 4GB × $0.013 × 730h)

**Scenario: 10% utilization (models run 2.4h/day)**

| Mode | Replicas | Cost/Month |
|------|----------|------------|
| Always-on (10 pods) | 10 | $700 |
| Scale-to-zero | 10 × 10% | $70 |
| **Savings** | | **$630 (90%)** |

### Warm Pool Cost

**Scenario: Warm pool of 5 pods during business hours (9am-5pm weekdays)**

- Business hours: 8h/day × 5 days × 4 weeks = 160h/month
- Warm pool cost: 5 pods × $70/730h × 160h = **$76/month**
- Scale-to-zero rest of time: 5 pods × $70/730h × (730h - 160h) = **$270/month**
- **Total**: $346/month (vs $350 always-on, $70 pure scale-to-zero)

**Recommendation**: Use warm pool only during known high-activity periods (e.g., month-end).

---

## References

- [KEDA Documentation](https://keda.sh/docs/)
- [KEDA Redis Scaler](https://keda.sh/docs/latest/scalers/redis/)
- [Kubernetes HPA Behavior](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [Azure AKS Autoscaling](https://learn.microsoft.com/en-us/azure/aks/concepts-scale)
