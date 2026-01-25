"""
Job submission and management API routes.
"""
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status
from typing import Annotated
import logging

from models.job import (
    JobSubmitRequest,
    JobSubmitResponse,
    JobStatus,
    Job
)
from services.auth import get_current_user
from services.storage import StorageService
from services.job_queue import JobQueue

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/jobs", tags=["jobs"])


@router.post("/submit", response_model=JobSubmitResponse, status_code=status.HTTP_201_CREATED)
async def submit_job(
    package: Annotated[UploadFile, File(description="Model package (.zip)")],
    model_name: Annotated[str | None, Form()] = None,
    priority: Annotated[int, Form(ge=0, le=10)] = 0,
    user: dict = Depends(get_current_user),
    storage: StorageService = Depends(),
    queue: JobQueue = Depends()
):
    """
    Submit a job for cloud execution.

    This endpoint:
    1. Validates the uploaded package
    2. Stores it in tenant-isolated storage
    3. Computes SHA-256 hash for integrity
    4. Enqueues the job for worker pickup
    5. Returns job ID and WebSocket URL

    Authentication: Requires valid JWT from Assumptions Manager.
    The job is scoped to the tenant specified in the token.

    Args:
        package: Model package .zip file
        model_name: Optional model name for identification
        priority: Job priority (0=low, 10=high)
        user: Current user from JWT (injected by dependency)
        storage: Storage service (injected)
        queue: Job queue service (injected)

    Returns:
        JobSubmitResponse with jobId and websocketUrl
    """
    tenant_id = user["tenant_id"]
    user_id = user["user_id"]

    # Validate package file
    if not package.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Package filename is required"
        )

    if not package.filename.endswith(".zip"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Package must be a .zip file"
        )

    # Validate file size (100MB limit)
    MAX_PACKAGE_SIZE = 100 * 1024 * 1024  # 100MB
    content = await package.read()
    if len(content) > MAX_PACKAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Package size exceeds {MAX_PACKAGE_SIZE / (1024*1024)}MB limit"
        )

    # Create job instance
    from main import config  # Import config from main

    # Generate temporary job ID for storage
    import uuid
    temp_job_id = str(uuid.uuid4())

    # Store package
    try:
        # Create file-like object from bytes
        import io
        file_obj = io.BytesIO(content)

        package_path, package_hash = await storage.store_package(
            tenant_id,
            temp_job_id,
            file_obj
        )
    except Exception as e:
        logger.error(f"Failed to store package: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store package"
        )

    # Create job
    job = Job.create(
        tenant_id=tenant_id,
        user_id=user_id,
        package_path=package_path,
        package_hash=package_hash,
        websocket_base_url=config.websocket_base_url,
        model_name=model_name,
        priority=priority
    )

    # Enqueue job
    success = await queue.enqueue_job(job)
    if not success:
        # Clean up stored package
        await storage.delete_package(tenant_id, job.jobId)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to enqueue job"
        )

    logger.info(
        f"Job {job.jobId} submitted by user {user_id} (tenant: {tenant_id}), "
        f"package hash: {package_hash[:12]}..."
    )

    return JobSubmitResponse(
        jobId=job.jobId,
        status=job.status,
        websocketUrl=job.websocketUrl,
        createdAt=job.createdAt,
        estimatedStartTime=None  # TODO: Calculate based on queue depth
    )


@router.get("/{job_id}", response_model=Job)
async def get_job_status(
    job_id: str,
    user: dict = Depends(get_current_user),
    queue: JobQueue = Depends()
):
    """
    Get job status and details.

    Args:
        job_id: Job identifier
        user: Current user from JWT
        queue: Job queue service

    Returns:
        Job details
    """
    job = await queue.get_job(job_id)

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found"
        )

    # Verify tenant access
    if job.tenantId != user["tenant_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this job"
        )

    return job


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_job(
    job_id: str,
    user: dict = Depends(get_current_user),
    queue: JobQueue = Depends(),
    storage: StorageService = Depends()
):
    """
    Cancel a job.

    Args:
        job_id: Job identifier
        user: Current user from JWT
        queue: Job queue service
        storage: Storage service
    """
    job = await queue.get_job(job_id)

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found"
        )

    # Verify tenant access
    if job.tenantId != user["tenant_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this job"
        )

    # Can only cancel queued or initializing jobs
    if job.status not in [JobStatus.QUEUED, JobStatus.INITIALIZING]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel job in status: {job.status}"
        )

    # Update status
    await queue.update_job_status(
        job_id,
        JobStatus.CANCELLED,
        completedAt=datetime.utcnow()
    )

    # Clean up package
    await storage.delete_package(job.tenantId, job.jobId)

    logger.info(f"Job {job_id} cancelled by user {user['user_id']}")
