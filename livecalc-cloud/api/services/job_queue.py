"""
Job queue management using Redis.
"""
import json
import logging
from datetime import datetime
from typing import Optional, List
import redis.asyncio as redis
from models.job import Job, JobStatus

logger = logging.getLogger(__name__)


class JobQueue:
    """Redis-backed job queue."""

    def __init__(self, redis_url: str):
        """
        Initialize job queue.

        Args:
            redis_url: Redis connection URL
        """
        self.redis_url = redis_url
        self.redis: Optional[redis.Redis] = None

    async def connect(self):
        """Connect to Redis."""
        self.redis = await redis.from_url(
            self.redis_url,
            encoding="utf-8",
            decode_responses=True
        )
        logger.info("Connected to Redis job queue")

    async def disconnect(self):
        """Disconnect from Redis."""
        if self.redis:
            await self.redis.close()
            logger.info("Disconnected from Redis")

    def _job_key(self, job_id: str) -> str:
        """Get Redis key for a job."""
        return f"job:{job_id}"

    def _tenant_jobs_key(self, tenant_id: str) -> str:
        """Get Redis key for tenant's job list."""
        return f"tenant:{tenant_id}:jobs"

    def _queue_key(self, status: JobStatus) -> str:
        """Get Redis key for a status queue."""
        return f"queue:{status.value}"

    async def enqueue_job(self, job: Job) -> bool:
        """
        Enqueue a new job.

        Args:
            job: Job instance

        Returns:
            True if successful
        """
        try:
            # Store job data
            await self.redis.set(
                self._job_key(job.jobId),
                job.model_dump_json(),
                ex=86400  # 24 hour TTL
            )

            # Add to tenant's job list
            await self.redis.sadd(
                self._tenant_jobs_key(job.tenantId),
                job.jobId
            )

            # Add to queue (sorted by priority and creation time)
            score = (10 - job.priority) * 1e10 + job.createdAt.timestamp()
            await self.redis.zadd(
                self._queue_key(JobStatus.QUEUED),
                {job.jobId: score}
            )

            logger.info(f"Enqueued job {job.jobId} for tenant {job.tenantId}")
            return True

        except Exception as e:
            logger.error(f"Failed to enqueue job {job.jobId}: {e}")
            return False

    async def get_job(self, job_id: str) -> Optional[Job]:
        """
        Get a job by ID.

        Args:
            job_id: Job identifier

        Returns:
            Job instance or None
        """
        try:
            job_json = await self.redis.get(self._job_key(job_id))
            if not job_json:
                return None
            return Job.model_validate_json(job_json)
        except Exception as e:
            logger.error(f"Failed to get job {job_id}: {e}")
            return None

    async def update_job_status(
        self,
        job_id: str,
        status: JobStatus,
        **updates
    ) -> bool:
        """
        Update job status and optional fields.

        Args:
            job_id: Job identifier
            status: New status
            **updates: Additional fields to update

        Returns:
            True if successful
        """
        try:
            job = await self.get_job(job_id)
            if not job:
                logger.warning(f"Job {job_id} not found for status update")
                return False

            # Update fields
            old_status = job.status
            job.status = status
            for key, value in updates.items():
                if hasattr(job, key):
                    setattr(job, key, value)

            # Save updated job
            await self.redis.set(
                self._job_key(job_id),
                job.model_dump_json(),
                ex=86400
            )

            # Move between queues if status changed
            if old_status != status:
                await self.redis.zrem(
                    self._queue_key(old_status),
                    job_id
                )
                score = (10 - job.priority) * 1e10 + job.createdAt.timestamp()
                await self.redis.zadd(
                    self._queue_key(status),
                    {job_id: score}
                )

            logger.info(f"Updated job {job_id} status: {old_status} → {status}")
            return True

        except Exception as e:
            logger.error(f"Failed to update job {job_id}: {e}")
            return False

    async def dequeue_next_job(self) -> Optional[Job]:
        """
        Dequeue the next job from the QUEUED queue.

        Returns:
            Job instance or None
        """
        try:
            # Get highest priority job (lowest score)
            result = await self.redis.zpopmin(self._queue_key(JobStatus.QUEUED))
            if not result:
                return None

            job_id, _ = result[0]
            job = await self.get_job(job_id)

            if job:
                # Move to INITIALIZING status
                await self.update_job_status(
                    job_id,
                    JobStatus.INITIALIZING,
                    startedAt=datetime.utcnow()
                )

            return job

        except Exception as e:
            logger.error(f"Failed to dequeue job: {e}")
            return None

    async def get_tenant_jobs(
        self,
        tenant_id: str,
        limit: int = 100
    ) -> List[Job]:
        """
        Get all jobs for a tenant.

        Args:
            tenant_id: Tenant identifier
            limit: Maximum number of jobs to return

        Returns:
            List of jobs
        """
        try:
            job_ids = await self.redis.smembers(
                self._tenant_jobs_key(tenant_id)
            )

            jobs = []
            for job_id in list(job_ids)[:limit]:
                job = await self.get_job(job_id)
                if job:
                    jobs.append(job)

            return jobs

        except Exception as e:
            logger.error(f"Failed to get tenant jobs: {e}")
            return []
