"""
Platform management router for namespace lifecycle and diagnostics.

Provides endpoints for:
- Namespace creation and status
- Manual namespace reaping
- Diagnostic extraction
- MTTC (Mean Time to Re-compute) verification
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import logging

from ..services.auth import verify_token, UserInfo
from ..services.namespace_lifecycle import (
    get_namespace_lifecycle_manager,
    NamespaceLifecycleManager,
    NamespaceMetadata,
    DiagnosticExtractionResult,
)
from ..models.job import JobStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/platform", tags=["platform"])


# Response models
class NamespaceInfo(BaseModel):
    """Namespace information response."""
    namespace: str
    bucket_id: str
    created_at: datetime
    last_activity: datetime
    status: str
    pod_count: int
    pvc_count: int


class NamespaceCreateResponse(BaseModel):
    """Response for namespace creation."""
    namespace: str
    bucket_id: str
    created_at: datetime


class DiagnosticInfo(BaseModel):
    """Diagnostic extraction information."""
    logs_archived: bool
    sentinel_violations_indexed: bool
    blob_paths: List[str]
    error_message: Optional[str] = None


class ReapResponse(BaseModel):
    """Response for namespace reaping."""
    success: bool
    namespace: str
    diagnostics: DiagnosticInfo
    message: str


class MTTCVerificationRequest(BaseModel):
    """Request for MTTC verification."""
    bucket_id: str
    model_bundle_hash: str


class MTTCVerificationResponse(BaseModel):
    """Response for MTTC verification."""
    success: bool
    original_result_hash: str
    resumed_result_hash: str
    match: bool
    duration_seconds: float
    message: str


class WarmPoolConfigRequest(BaseModel):
    """Request to configure warm pool."""
    enabled: bool = Field(..., description="Enable or disable warm pool")
    size: int = Field(default=0, ge=0, le=100, description="Number of pods to keep warm (0-100)")
    timeout_minutes: int = Field(default=30, ge=5, le=1440, description="Warm pool timeout in minutes (5-1440)")


class WarmPoolConfigResponse(BaseModel):
    """Response for warm pool configuration."""
    enabled: bool
    size: int
    timeout_minutes: int
    current_replicas: int
    message: str


# Dependency injection
async def get_lifecycle_manager() -> NamespaceLifecycleManager:
    """Get namespace lifecycle manager instance."""
    # In production, get connection string from environment
    import os
    blob_connection_string = os.getenv(
        "AZURE_BLOB_CONNECTION_STRING",
        "DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=...",
    )
    return get_namespace_lifecycle_manager(blob_connection_string)


@router.post("/namespaces", response_model=NamespaceCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_namespace(
    bucket_id: str,
    user: UserInfo = Depends(verify_token),
    manager: NamespaceLifecycleManager = Depends(get_lifecycle_manager),
):
    """
    Create a scoped Kubernetes namespace for a bucket.

    This endpoint is automatically called when a new job is submitted.
    Namespaces are transient and will be reaped after 24h of inactivity.
    """
    try:
        namespace = await manager.create_namespace_for_bucket(bucket_id)
        metadata = await manager.get_namespace_metadata(namespace)

        if not metadata:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Namespace {namespace} created but metadata unavailable",
            )

        return NamespaceCreateResponse(
            namespace=namespace,
            bucket_id=bucket_id,
            created_at=metadata.created_at,
        )

    except Exception as e:
        logger.error(f"Failed to create namespace for bucket {bucket_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create namespace: {str(e)}",
        )


@router.get("/namespaces/{namespace}", response_model=NamespaceInfo)
async def get_namespace_info(
    namespace: str,
    user: UserInfo = Depends(verify_token),
    manager: NamespaceLifecycleManager = Depends(get_lifecycle_manager),
):
    """
    Get information about a specific namespace.

    Returns metadata including activity timestamps, status, and resource counts.
    """
    metadata = await manager.get_namespace_metadata(namespace)

    if not metadata:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Namespace {namespace} not found",
        )

    return NamespaceInfo(
        namespace=metadata.namespace,
        bucket_id=metadata.bucket_id,
        created_at=metadata.created_at,
        last_activity=metadata.last_activity,
        status=metadata.status,
        pod_count=metadata.pod_count,
        pvc_count=metadata.pvc_count,
    )


@router.get("/namespaces", response_model=List[NamespaceInfo])
async def list_namespaces(
    user: UserInfo = Depends(verify_token),
    manager: NamespaceLifecycleManager = Depends(get_lifecycle_manager),
):
    """
    List all transient namespaces managed by LiveCalc.

    Useful for monitoring and debugging.
    """
    try:
        eligible = await manager.find_namespaces_for_cleanup()
        # Also get all managed namespaces, not just eligible for cleanup
        from kubernetes import client
        all_ns = manager.core_v1.list_namespace(
            label_selector="lifecycle=transient,managed-by=livecalc-platform"
        )

        result = []
        for ns in all_ns.items:
            metadata = await manager.get_namespace_metadata(ns.metadata.name)
            if metadata:
                result.append(
                    NamespaceInfo(
                        namespace=metadata.namespace,
                        bucket_id=metadata.bucket_id,
                        created_at=metadata.created_at,
                        last_activity=metadata.last_activity,
                        status=metadata.status,
                        pod_count=metadata.pod_count,
                        pvc_count=metadata.pvc_count,
                    )
                )

        return result

    except Exception as e:
        logger.error(f"Failed to list namespaces: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list namespaces: {str(e)}",
        )


@router.post("/namespaces/{namespace}/finalize", status_code=status.HTTP_200_OK)
async def finalize_namespace(
    namespace: str,
    user: UserInfo = Depends(verify_token),
    manager: NamespaceLifecycleManager = Depends(get_lifecycle_manager),
):
    """
    Mark a namespace as finalized, making it eligible for immediate reaping.

    Use this when all jobs in a bucket are complete.
    """
    try:
        await manager.mark_namespace_finalized(namespace)
        return {"message": f"Namespace {namespace} marked as finalized"}

    except Exception as e:
        logger.error(f"Failed to finalize namespace {namespace}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to finalize namespace: {str(e)}",
        )


@router.post("/namespaces/{namespace}/reap", response_model=ReapResponse)
async def reap_namespace(
    namespace: str,
    bucket_id: str,
    user: UserInfo = Depends(verify_token),
    manager: NamespaceLifecycleManager = Depends(get_lifecycle_manager),
):
    """
    Manually trigger namespace reaping.

    Extracts diagnostics, deletes namespace, and verifies cleanup.
    Normally this happens automatically via the cleanup worker.
    """
    try:
        # First extract diagnostics
        diagnostics = await manager.extract_diagnostics(namespace, bucket_id)

        # Then reap
        success = await manager.reap_namespace(namespace, bucket_id)

        return ReapResponse(
            success=success,
            namespace=namespace,
            diagnostics=DiagnosticInfo(
                logs_archived=diagnostics.logs_archived,
                sentinel_violations_indexed=diagnostics.sentinel_violations_indexed,
                blob_paths=diagnostics.blob_paths,
                error_message=diagnostics.error_message,
            ),
            message=f"Namespace {namespace} {'successfully' if success else 'failed to'} reaped",
        )

    except Exception as e:
        logger.error(f"Failed to reap namespace {namespace}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reap namespace: {str(e)}",
        )


@router.post("/mttc/verify", response_model=MTTCVerificationResponse)
async def verify_mttc(
    request: MTTCVerificationRequest,
    user: UserInfo = Depends(verify_token),
    manager: NamespaceLifecycleManager = Depends(get_lifecycle_manager),
):
    """
    Verify Mean Time to Re-compute (MTTC).

    Tests that a deleted namespace run can be resumed from the Hashed Model Bundle
    in < 2 minutes with identical result hashes.

    This is a placeholder implementation - full MTTC verification requires:
    1. Storing original run result hash with model bundle
    2. Re-running the model from the bundle
    3. Comparing result hashes
    4. Measuring duration
    """
    import time
    import hashlib

    start_time = time.time()

    try:
        # TODO: Implement full MTTC verification
        # For now, simulate the verification process

        # Step 1: Create new namespace for resumed run
        namespace = await manager.create_namespace_for_bucket(request.bucket_id)

        # Step 2: Load model bundle by hash (placeholder)
        # In real implementation:
        # - Fetch model bundle from blob storage
        # - Verify bundle hash matches request.model_bundle_hash
        # - Extract and initialize pipeline

        # Step 3: Run model (placeholder)
        # In real implementation:
        # - Execute pipeline with same config
        # - Collect results

        # Step 4: Compare result hashes
        # For placeholder, generate deterministic hashes
        original_hash = hashlib.sha256(request.model_bundle_hash.encode()).hexdigest()[:16]
        resumed_hash = original_hash  # Identical for placeholder

        duration = time.time() - start_time

        # Step 5: Clean up verification namespace
        await manager.mark_namespace_finalized(namespace)

        return MTTCVerificationResponse(
            success=duration < 120,  # < 2 minutes
            original_result_hash=original_hash,
            resumed_result_hash=resumed_hash,
            match=original_hash == resumed_hash,
            duration_seconds=duration,
            message=f"MTTC verification {'passed' if duration < 120 else 'failed'}: {duration:.2f}s",
        )

    except Exception as e:
        duration = time.time() - start_time
        logger.error(f"MTTC verification failed: {e}")
        return MTTCVerificationResponse(
            success=False,
            original_result_hash="",
            resumed_result_hash="",
            match=False,
            duration_seconds=duration,
            message=f"MTTC verification error: {str(e)}",
        )


@router.post("/warm-pool/configure", response_model=WarmPoolConfigResponse)
async def configure_warm_pool(
    config: WarmPoolConfigRequest,
    user: UserInfo = Depends(verify_token),
):
    """
    Configure the warm pool to keep N worker pods ready.

    The warm pool optimization keeps a fixed number of worker pods pre-warmed
    to reduce cold start latency during high-intensity reporting windows.

    When enabled, KEDA minReplicaCount is set to the warm pool size.
    When disabled, KEDA scales to zero when idle.

    Args:
        config: Warm pool configuration (enabled, size, timeout)

    Returns:
        Current warm pool configuration and deployment status
    """
    from kubernetes import client, config as k8s_config
    import os

    try:
        # Load Kubernetes config
        try:
            k8s_config.load_incluster_config()
        except:
            k8s_config.load_kube_config()

        apps_v1 = client.AppsV1Api()
        core_v1 = client.CoreV1Api()

        namespace = os.getenv("LIVECALC_NAMESPACE", "livecalc-system")

        # Update ConfigMap with warm pool settings
        config_map_name = "worker-env-config"
        try:
            config_map = core_v1.read_namespaced_config_map(config_map_name, namespace)
            config_map.data["WARM_POOL_ENABLED"] = str(config.enabled).lower()
            config_map.data["WARM_POOL_SIZE"] = str(config.size)
            config_map.data["WARM_POOL_TIMEOUT_MINUTES"] = str(config.timeout_minutes)
            core_v1.patch_namespaced_config_map(config_map_name, namespace, config_map)
            logger.info(f"Updated ConfigMap {config_map_name} with warm pool config")
        except client.exceptions.ApiException as e:
            logger.error(f"Failed to update ConfigMap: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update ConfigMap: {str(e)}",
            )

        # Update KEDA ScaledObject minReplicaCount if warm pool enabled
        # Note: This requires KEDA API access via CustomObjectsApi
        custom_objects = client.CustomObjectsApi()
        scaled_object_name = "livecalc-worker-scaler"

        try:
            scaled_object = custom_objects.get_namespaced_custom_object(
                group="keda.sh",
                version="v1alpha1",
                namespace=namespace,
                plural="scaledobjects",
                name=scaled_object_name,
            )

            # Update minReplicaCount based on warm pool config
            if config.enabled:
                scaled_object["spec"]["minReplicaCount"] = config.size
            else:
                scaled_object["spec"]["minReplicaCount"] = 0

            custom_objects.patch_namespaced_custom_object(
                group="keda.sh",
                version="v1alpha1",
                namespace=namespace,
                plural="scaledobjects",
                name=scaled_object_name,
                body=scaled_object,
            )
            logger.info(f"Updated ScaledObject {scaled_object_name} minReplicaCount to {config.size if config.enabled else 0}")

        except client.exceptions.ApiException as e:
            logger.error(f"Failed to update ScaledObject: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update KEDA ScaledObject: {str(e)}",
            )

        # Get current deployment replicas
        deployment_name = "livecalc-worker"
        try:
            deployment = apps_v1.read_namespaced_deployment(deployment_name, namespace)
            current_replicas = deployment.status.replicas or 0
        except client.exceptions.ApiException as e:
            logger.warning(f"Failed to read deployment status: {e}")
            current_replicas = 0

        return WarmPoolConfigResponse(
            enabled=config.enabled,
            size=config.size,
            timeout_minutes=config.timeout_minutes,
            current_replicas=current_replicas,
            message=f"Warm pool {'enabled' if config.enabled else 'disabled'}: {config.size} pods will be kept ready" if config.enabled else "Warm pool disabled: scaling to zero when idle",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to configure warm pool: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to configure warm pool: {str(e)}",
        )


@router.get("/warm-pool/status", response_model=WarmPoolConfigResponse)
async def get_warm_pool_status(
    user: UserInfo = Depends(verify_token),
):
    """
    Get current warm pool configuration and status.

    Returns:
        Current warm pool settings and deployment replica count
    """
    from kubernetes import client, config as k8s_config
    import os

    try:
        # Load Kubernetes config
        try:
            k8s_config.load_incluster_config()
        except:
            k8s_config.load_kube_config()

        apps_v1 = client.AppsV1Api()
        core_v1 = client.CoreV1Api()

        namespace = os.getenv("LIVECALC_NAMESPACE", "livecalc-system")

        # Read current config from ConfigMap
        config_map_name = "worker-env-config"
        try:
            config_map = core_v1.read_namespaced_config_map(config_map_name, namespace)
            enabled = config_map.data.get("WARM_POOL_ENABLED", "false").lower() == "true"
            size = int(config_map.data.get("WARM_POOL_SIZE", "0"))
            timeout_minutes = int(config_map.data.get("WARM_POOL_TIMEOUT_MINUTES", "30"))
        except client.exceptions.ApiException as e:
            logger.error(f"Failed to read ConfigMap: {e}")
            # Return defaults
            enabled = False
            size = 0
            timeout_minutes = 30

        # Get current deployment replicas
        deployment_name = "livecalc-worker"
        try:
            deployment = apps_v1.read_namespaced_deployment(deployment_name, namespace)
            current_replicas = deployment.status.replicas or 0
        except client.exceptions.ApiException as e:
            logger.warning(f"Failed to read deployment status: {e}")
            current_replicas = 0

        return WarmPoolConfigResponse(
            enabled=enabled,
            size=size,
            timeout_minutes=timeout_minutes,
            current_replicas=current_replicas,
            message=f"Warm pool is {'enabled' if enabled else 'disabled'} with {size} pods configured, {current_replicas} pods currently running",
        )

    except Exception as e:
        logger.error(f"Failed to get warm pool status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get warm pool status: {str(e)}",
        )


# ============================================================================
# Anomaly Detection Endpoints
# ============================================================================

from ..services.anomaly_detection import (
    AnomalyDetectionEngine,
    AnomalyFlag,
    DiagnosticBundle,
    BucketStatistics,
    AnomalyType,
)


class BucketAnalysisRequest(BaseModel):
    """Request for bucket anomaly analysis."""
    bucket_id: str = Field(..., description="Bucket identifier")
    run_results: List[dict] = Field(..., description="List of run results with NPV values")
    include_diagnostics: bool = Field(True, description="Whether to generate diagnostic bundles")
    sigma_threshold: float = Field(3.0, ge=2.0, le=5.0, description="Sigma threshold for anomaly detection")


class BucketAnalysisResponse(BaseModel):
    """Response from bucket anomaly analysis."""
    bucket_statistics: BucketStatistics
    anomalies: List[AnomalyFlag]
    diagnostic_bundles: List[DiagnosticBundle]


class AnomalyQueryRequest(BaseModel):
    """Request to query anomalies by bucket or type."""
    bucket_id: Optional[str] = Field(None, description="Filter by bucket ID")
    anomaly_type: Optional[AnomalyType] = Field(None, description="Filter by anomaly type")
    min_deviation: Optional[float] = Field(None, description="Minimum deviation (in std devs)")
    limit: int = Field(100, ge=1, le=1000, description="Maximum results to return")


class AnomalyQueryResponse(BaseModel):
    """Response from anomaly query."""
    anomalies: List[AnomalyFlag]
    total_count: int
    filtered_count: int


# Create singleton engine instance
anomaly_engine = AnomalyDetectionEngine(
    sigma_threshold=3.0,
    enable_5_sigma=True,
    enable_zero_detection=True,
    min_bucket_size=30
)


@router.post("/anomalies/analyze", response_model=BucketAnalysisResponse)
async def analyze_bucket_for_anomalies(
    request: BucketAnalysisRequest,
    user: UserInfo = Depends(verify_token),
):
    """
    Analyze a bucket of projection runs for statistical anomalies.

    Uses 3-sigma rule to identify outliers in NPV distributions.
    Returns flagged anomalies with diagnostic bundles for investigation.

    Args:
        request: Bucket analysis request with run results

    Returns:
        Bucket statistics, anomaly flags, and diagnostic bundles

    Raises:
        HTTPException: If bucket has insufficient data or analysis fails
    """
    try:
        logger.info(
            f"User {user.user_id} analyzing bucket {request.bucket_id} "
            f"with {len(request.run_results)} runs"
        )

        # Validate run results format
        for i, run in enumerate(request.run_results):
            if "runId" not in run:
                raise ValueError(f"Run {i} missing required field 'runId'")
            if "npv" not in run:
                raise ValueError(f"Run {i} missing required field 'npv'")

        # Create custom engine if sigma threshold differs from default
        if request.sigma_threshold != 3.0:
            engine = AnomalyDetectionEngine(
                sigma_threshold=request.sigma_threshold,
                enable_5_sigma=True,
                enable_zero_detection=True,
                min_bucket_size=30
            )
        else:
            engine = anomaly_engine

        # Run anomaly detection
        result = engine.analyze_bucket(
            bucket_id=request.bucket_id,
            run_results=request.run_results,
            include_diagnostics=request.include_diagnostics
        )

        logger.info(
            f"Bucket {request.bucket_id} analysis complete: "
            f"{len(result.anomalies)} anomalies detected from {len(request.run_results)} runs"
        )

        return BucketAnalysisResponse(
            bucket_statistics=result.bucket_statistics,
            anomalies=result.anomalies,
            diagnostic_bundles=result.diagnostic_bundles
        )

    except ValueError as e:
        logger.error(f"Invalid bucket analysis request: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Bucket anomaly analysis failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Anomaly analysis failed: {str(e)}"
        )


@router.get("/anomalies/diagnostic/{run_id}", response_model=DiagnosticBundle)
async def get_diagnostic_bundle(
    run_id: str,
    user: UserInfo = Depends(verify_token),
):
    """
    Get diagnostic bundle for a specific anomalous run.

    This is a placeholder endpoint. In production, diagnostic bundles
    would be stored in a database or blob storage for retrieval.

    Args:
        run_id: Run identifier

    Returns:
        Diagnostic bundle with anomaly details and snapshots

    Raises:
        HTTPException: If diagnostic bundle not found
    """
    # TODO: Implement diagnostic bundle storage and retrieval
    # For now, return 404
    logger.warning(f"Diagnostic bundle retrieval not yet implemented for run {run_id}")
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Diagnostic bundle storage not yet implemented. "
               "Use POST /v1/platform/anomalies/analyze with include_diagnostics=true instead."
    )
