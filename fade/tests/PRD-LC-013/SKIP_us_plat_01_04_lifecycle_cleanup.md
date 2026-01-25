# SKIP: US-PLAT-01 AC 04 - Lifecycle Cleanup Verification

## Acceptance Criteria
"Lifecycle cleanup: Verify namespace is removed from 'kubectl get ns' and no orphaned PVCs remain."

## Reason for Skipping
This acceptance criterion requires direct Kubernetes cluster access to verify:
1. Namespace is removed via `kubectl get ns`
2. No orphaned PVCs remain via `kubectl get pvc`

Shell-based tests cannot reliably:
- Access a running Kubernetes cluster
- Execute kubectl commands in a CI/CD environment
- Verify cluster-level resource cleanup

## Verification Method
This should be tested via:
- Integration tests running inside the cluster (`tests/integration/test_mttc_resumption.py`)
- Manual verification during deployment
- Kubernetes admission controllers or operators that validate cleanup

## Related Test
The existing integration test `test_reap_namespace_with_diagnostics` in `tests/integration/test_mttc_resumption.py` covers this scenario with mock Kubernetes client.
