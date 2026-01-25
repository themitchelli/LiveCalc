# SKIP: US-PLAT-02 AC 02 - Scaling Timing Verification

## Acceptance Criteria
"Pods scale from 0 to N (based on scenario count) and back to 0 within 60 seconds of completion."

## Reason for Skipping
This acceptance criterion requires:
1. A running Kubernetes cluster with KEDA installed
2. A Redis instance with job queue
3. Actual pod scaling behavior observation
4. Timing measurements of pod lifecycle events

Shell-based tests cannot:
- Interact with a live Kubernetes cluster
- Submit jobs to Redis and observe scaling
- Measure actual pod startup/shutdown times
- Verify 60-second timing constraints

## Verification Method
This should be tested via:
- Integration tests in a test Kubernetes environment (`tests/integration/test_keda_scaling.py`)
- Load testing with actual job submissions
- Prometheus/Grafana metrics during CI/CD pipelines
- KEDA metrics-server observations

## Related Tests
The existing integration test file `livecalc-cloud/tests/integration/test_keda_scaling.py` contains:
- `test_scale_to_zero_when_queue_empty`
- `test_scale_up_when_jobs_queued`
- `test_scale_down_after_completion`
- `test_ready_pods_within_60_seconds`
