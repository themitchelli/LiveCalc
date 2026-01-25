"""
Job data models for cloud execution.
"""
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
import uuid


class JobStatus(str, Enum):
    """Job execution status."""
    QUEUED = "queued"
    INITIALIZING = "initializing"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobSubmitRequest(BaseModel):
    """Request body for job submission (non-file fields)."""
    tenantId: str = Field(..., description="Tenant ID from JWT")
    userId: str = Field(..., description="User ID from JWT")
    modelName: Optional[str] = Field(None, description="Optional model name")
    priority: int = Field(0, ge=0, le=10, description="Job priority (0=low, 10=high)")


class JobSubmitResponse(BaseModel):
    """Response from job submission."""
    jobId: str = Field(..., description="Unique job identifier")
    status: JobStatus = Field(..., description="Initial job status")
    websocketUrl: str = Field(..., description="WebSocket URL for progress/results")
    createdAt: datetime = Field(..., description="Job creation timestamp")
    estimatedStartTime: Optional[datetime] = Field(None, description="Estimated start time")


class JobProgressUpdate(BaseModel):
    """Progress update streamed over WebSocket."""
    jobId: str
    status: JobStatus
    progress: float = Field(..., ge=0.0, le=1.0, description="Progress 0.0-1.0")
    message: str = Field("", description="Human-readable progress message")
    timestamp: datetime


class JobResult(BaseModel):
    """Final job result."""
    jobId: str
    status: JobStatus
    resultData: Optional[Dict[str, Any]] = Field(None, description="Result data (NPV, statistics)")
    errorMessage: Optional[str] = Field(None, description="Error message if failed")
    executionTimeMs: Optional[int] = Field(None, description="Execution time in milliseconds")
    completedAt: datetime


class Job(BaseModel):
    """Internal job model stored in Redis."""
    jobId: str
    tenantId: str
    userId: str
    modelName: Optional[str]
    priority: int
    status: JobStatus
    packagePath: str  # Path to uploaded package in storage
    packageHash: str  # SHA-256 of package
    websocketUrl: str
    createdAt: datetime
    startedAt: Optional[datetime] = None
    completedAt: Optional[datetime] = None
    resultData: Optional[Dict[str, Any]] = None
    errorMessage: Optional[str] = None
    executionTimeMs: Optional[int] = None

    @classmethod
    def create(
        cls,
        tenant_id: str,
        user_id: str,
        package_path: str,
        package_hash: str,
        websocket_base_url: str,
        model_name: Optional[str] = None,
        priority: int = 0
    ) -> "Job":
        """Create a new job instance."""
        job_id = str(uuid.uuid4())
        return cls(
            jobId=job_id,
            tenantId=tenant_id,
            userId=user_id,
            modelName=model_name,
            priority=priority,
            status=JobStatus.QUEUED,
            packagePath=package_path,
            packageHash=package_hash,
            websocketUrl=f"{websocket_base_url}/jobs/{job_id}/stream",
            createdAt=datetime.utcnow()
        )
