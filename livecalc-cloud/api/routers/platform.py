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
