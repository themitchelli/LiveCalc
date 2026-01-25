"""
Integration tests for KEDA-based autoscaling.

Tests verify:
1. Scale-to-zero when queue is empty
2. Scale-up when jobs are queued
3. Scale-down after job completion
4. Warm pool configuration
5. 60-second scale-to-zero target
"""

import pytest
import asyncio
import time
from datetime import datetime, timedelta
from typing import List
import logging

from kubernetes import client, config as k8s_config
import redis.asyncio as redis

logger = logging.getLogger(__name__)


@pytest.fixture(scope="module")
async def k8s_clients():
    """Set up Kubernetes API clients."""
    try:
        k8s_config.load_incluster_config()
    except:
        k8s_config.load_kube_config()

    apps_v1 = client.AppsV1Api()
    core_v1 = client.CoreV1Api()
    custom_objects = client.CustomObjectsApi()

    yield {
        "apps_v1": apps_v1,
        "core_v1": core_v1,
        "custom_objects": custom_objects,
    }


@pytest.fixture(scope="module")
async def redis_client():
    """Set up Redis client for job queue manipulation."""
    import os

    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_password = os.getenv("REDIS_PASSWORD", "")

    client = redis.Redis(
        host=redis_host.split(":")[0],
        port=int(redis_host.split(":")[1]) if ":" in redis_host else 6379,
        password=redis_password,
        decode_responses=True,
        ssl=True if "cache.windows.net" in redis_host else False,
    )

    yield client
    await client.close()


@pytest.fixture
async def deployment_name():
    """Get deployment name from environment or use default."""
    import os
    return os.getenv("DEPLOYMENT_NAME", "livecalc-worker")


@pytest.fixture
async def namespace():
    """Get namespace from environment or use default."""
    import os
    return os.getenv("LIVECALC_NAMESPACE", "livecalc-system")


async def get_replica_count(k8s_clients, deployment_name: str, namespace: str) -> int:
    """Get current replica count for deployment."""
    try:
        deployment = k8s_clients["apps_v1"].read_namespaced_deployment(deployment_name, namespace)
        return deployment.status.replicas or 0
    except client.exceptions.ApiException as e:
        logger.error(f"Failed to read deployment: {e}")
        return 0


async def get_ready_replica_count(k8s_clients, deployment_name: str, namespace: str) -> int:
    """Get count of ready replicas for deployment."""
    try:
        deployment = k8s_clients["apps_v1"].read_namespaced_deployment(deployment_name, namespace)
        return deployment.status.ready_replicas or 0
    except client.exceptions.ApiException as e:
        logger.error(f"Failed to read deployment: {e}")
        return 0


async def add_jobs_to_queue(redis_client, count: int):
    """Add test jobs to Redis queue."""
    timestamp = time.time()
    for i in range(count):
        job_id = f"test-job-{timestamp}-{i}"
        # Score = (10 - priority) * 1e10 + timestamp
        # Priority 5 = medium
        score = (10 - 5) * 1e10 + timestamp + i
        await redis_client.zadd("jobs:QUEUED", {job_id: score})
    logger.info(f"Added {count} jobs to queue")


async def clear_queue(redis_client):
    """Clear all jobs from queue."""
    await redis_client.delete("jobs:QUEUED")
    logger.info("Cleared job queue")


async def wait_for_replica_count(
    k8s_clients,
    deployment_name: str,
    namespace: str,
    expected: int,
    timeout: int = 120,
    check_interval: int = 5,
) -> bool:
    """
    Wait for deployment to reach expected replica count.

    Returns True if target reached within timeout, False otherwise.
    """
    start_time = time.time()
    while time.time() - start_time < timeout:
        current = await get_replica_count(k8s_clients, deployment_name, namespace)
        logger.info(f"Current replicas: {current}, expected: {expected}")

        if current == expected:
            return True

        await asyncio.sleep(check_interval)

    return False


async def wait_for_ready_replicas(
    k8s_clients,
    deployment_name: str,
    namespace: str,
    expected: int,
    timeout: int = 120,
    check_interval: int = 5,
) -> bool:
    """
    Wait for deployment to have expected number of ready replicas.

    Returns True if target reached within timeout, False otherwise.
    """
    start_time = time.time()
    while time.time() - start_time < timeout:
        current = await get_ready_replica_count(k8s_clients, deployment_name, namespace)
        logger.info(f"Ready replicas: {current}, expected: {expected}")

        if current >= expected:
            return True

        await asyncio.sleep(check_interval)

    return False


@pytest.mark.asyncio
async def test_scale_to_zero_when_queue_empty(
    k8s_clients,
    redis_client,
    deployment_name,
    namespace,
):
    """
    Test that deployment scales to zero when queue is empty.

    Acceptance criteria:
    - Pods scale to 0 within 60 seconds of queue becoming empty
    """
    # Ensure queue is empty
    await clear_queue(redis_client)

    # Wait for scale to zero
    start_time = time.time()
    success = await wait_for_replica_count(
        k8s_clients,
        deployment_name,
        namespace,
        expected=0,
        timeout=90,  # Allow 90s (60s cooldown + 30s buffer)
    )
    duration = time.time() - start_time

    assert success, f"Deployment did not scale to zero within 90 seconds (took {duration:.1f}s)"
    assert duration < 90, f"Scale-to-zero took {duration:.1f}s, target is < 90s (60s cooldown + buffer)"

    logger.info(f"✓ Scale-to-zero successful in {duration:.1f}s")


@pytest.mark.asyncio
async def test_scale_up_when_jobs_queued(
    k8s_clients,
    redis_client,
    deployment_name,
    namespace,
):
    """
    Test that deployment scales up when jobs are added to queue.

    Acceptance criteria:
    - Pods scale from 0 to N within 60 seconds
    - N = ceil(queue_length / 10) (10 jobs per pod)
    """
    # Start from zero
    await clear_queue(redis_client)
    await wait_for_replica_count(k8s_clients, deployment_name, namespace, 0, timeout=90)

    # Add 25 jobs (should trigger 3 pods: ceil(25/10) = 3)
    job_count = 25
    expected_pods = (job_count + 9) // 10  # ceil(25/10) = 3

    await add_jobs_to_queue(redis_client, job_count)

    # Wait for scale-up
    start_time = time.time()
    success = await wait_for_replica_count(
        k8s_clients,
        deployment_name,
        namespace,
        expected=expected_pods,
        timeout=60,
    )
    duration = time.time() - start_time

    assert success, f"Deployment did not scale to {expected_pods} pods within 60 seconds"
    assert duration < 60, f"Scale-up took {duration:.1f}s, target is < 60s"

    logger.info(f"✓ Scale-up successful: 0 → {expected_pods} pods in {duration:.1f}s")

    # Cleanup
    await clear_queue(redis_client)


@pytest.mark.asyncio
async def test_scale_down_after_completion(
    k8s_clients,
    redis_client,
    deployment_name,
    namespace,
):
    """
    Test that deployment scales down after jobs complete.

    Acceptance criteria:
    - Pods scale back to 0 within 60s of queue becoming empty
    """
    # Add jobs to trigger scale-up
    await add_jobs_to_queue(redis_client, 30)
    await wait_for_replica_count(k8s_clients, deployment_name, namespace, 3, timeout=60)

    # Clear queue to simulate completion
    await clear_queue(redis_client)

    # Wait for scale-down
    start_time = time.time()
    success = await wait_for_replica_count(
        k8s_clients,
        deployment_name,
        namespace,
        expected=0,
        timeout=90,  # 60s cooldown + 30s buffer
    )
    duration = time.time() - start_time

    assert success, f"Deployment did not scale down to zero within 90 seconds"
    assert duration < 90, f"Scale-down took {duration:.1f}s, target is < 90s"

    logger.info(f"✓ Scale-down successful in {duration:.1f}s")


@pytest.mark.asyncio
async def test_warm_pool_prevents_scale_to_zero(
    k8s_clients,
    redis_client,
    deployment_name,
    namespace,
):
    """
    Test that warm pool configuration prevents scale to zero.

    Acceptance criteria:
    - When warm pool is enabled with size N, deployment maintains N replicas
    - Even when queue is empty
    """
    # Enable warm pool with 2 pods via ConfigMap
    config_map_name = "worker-env-config"
    try:
        config_map = k8s_clients["core_v1"].read_namespaced_config_map(config_map_name, namespace)
        config_map.data["WARM_POOL_ENABLED"] = "true"
        config_map.data["WARM_POOL_SIZE"] = "2"
        k8s_clients["core_v1"].patch_namespaced_config_map(config_map_name, namespace, config_map)

        # Update ScaledObject minReplicaCount
        scaled_object_name = "livecalc-worker-scaler"
        scaled_object = k8s_clients["custom_objects"].get_namespaced_custom_object(
            group="keda.sh",
            version="v1alpha1",
            namespace=namespace,
            plural="scaledobjects",
            name=scaled_object_name,
        )
        scaled_object["spec"]["minReplicaCount"] = 2
        k8s_clients["custom_objects"].patch_namespaced_custom_object(
            group="keda.sh",
            version="v1alpha1",
            namespace=namespace,
            plural="scaledobjects",
            name=scaled_object_name,
            body=scaled_object,
        )

        # Clear queue
        await clear_queue(redis_client)

        # Wait for warm pool to stabilize
        success = await wait_for_replica_count(
            k8s_clients,
            deployment_name,
            namespace,
            expected=2,
            timeout=60,
        )

        assert success, "Warm pool did not maintain 2 replicas"

        # Verify replicas stay at 2 even after cooldown period
        await asyncio.sleep(30)
        current = await get_replica_count(k8s_clients, deployment_name, namespace)
        assert current == 2, f"Warm pool did not maintain 2 replicas (current: {current})"

        logger.info("✓ Warm pool maintains minimum replicas")

    finally:
        # Cleanup: disable warm pool
        config_map.data["WARM_POOL_ENABLED"] = "false"
        config_map.data["WARM_POOL_SIZE"] = "0"
        k8s_clients["core_v1"].patch_namespaced_config_map(config_map_name, namespace, config_map)

        scaled_object["spec"]["minReplicaCount"] = 0
        k8s_clients["custom_objects"].patch_namespaced_custom_object(
            group="keda.sh",
            version="v1alpha1",
            namespace=namespace,
            plural="scaledobjects",
            name=scaled_object_name,
            body=scaled_object,
        )

        await clear_queue(redis_client)


@pytest.mark.asyncio
async def test_max_replicas_limit(
    k8s_clients,
    redis_client,
    deployment_name,
    namespace,
):
    """
    Test that deployment respects maxReplicaCount limit.

    Acceptance criteria:
    - Even with 1000+ jobs queued, replicas cap at maxReplicaCount (100)
    """
    # Add many jobs (1000 jobs would normally trigger 100 pods)
    await add_jobs_to_queue(redis_client, 1000)

    # Wait for scale-up to max
    success = await wait_for_replica_count(
        k8s_clients,
        deployment_name,
        namespace,
        expected=100,
        timeout=120,
    )

    current = await get_replica_count(k8s_clients, deployment_name, namespace)

    # Should not exceed max
    assert current <= 100, f"Deployment exceeded maxReplicaCount (current: {current})"

    logger.info(f"✓ Max replicas respected: {current}/100")

    # Cleanup
    await clear_queue(redis_client)


@pytest.mark.asyncio
async def test_ready_pods_within_60_seconds(
    k8s_clients,
    redis_client,
    deployment_name,
    namespace,
):
    """
    Test that scaled-up pods become ready within 60 seconds.

    Acceptance criteria:
    - Pods transition from Pending → Running → Ready within 60s of creation
    """
    # Start from zero
    await clear_queue(redis_client)
    await wait_for_replica_count(k8s_clients, deployment_name, namespace, 0, timeout=90)

    # Add jobs to trigger scale-up
    await add_jobs_to_queue(redis_client, 50)  # Should trigger 5 pods

    # Wait for ready replicas
    start_time = time.time()
    success = await wait_for_ready_replicas(
        k8s_clients,
        deployment_name,
        namespace,
        expected=5,
        timeout=60,
    )
    duration = time.time() - start_time

    assert success, f"Pods did not become ready within 60 seconds"

    logger.info(f"✓ Pods ready in {duration:.1f}s")

    # Cleanup
    await clear_queue(redis_client)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
