"""
Storage service for job packages.
"""
import hashlib
import os
from pathlib import Path
from typing import BinaryIO
import aiofiles
import logging

logger = logging.getLogger(__name__)


class StorageService:
    """Service for storing job packages."""

    def __init__(self, storage_root: str):
        """
        Initialize storage service.

        Args:
            storage_root: Root directory for package storage
        """
        self.storage_root = Path(storage_root)
        self.storage_root.mkdir(parents=True, exist_ok=True)

    def get_tenant_path(self, tenant_id: str) -> Path:
        """
        Get storage path for a tenant.

        Args:
            tenant_id: Tenant identifier

        Returns:
            Path to tenant storage directory
        """
        tenant_path = self.storage_root / tenant_id
        tenant_path.mkdir(parents=True, exist_ok=True)
        return tenant_path

    def get_job_package_path(self, tenant_id: str, job_id: str) -> Path:
        """
        Get storage path for a job package.

        Args:
            tenant_id: Tenant identifier
            job_id: Job identifier

        Returns:
            Path to job package file
        """
        return self.get_tenant_path(tenant_id) / f"{job_id}.zip"

    async def store_package(
        self,
        tenant_id: str,
        job_id: str,
        file_content: BinaryIO
    ) -> tuple[str, str]:
        """
        Store a job package and compute its hash.

        Args:
            tenant_id: Tenant identifier
            job_id: Job identifier
            file_content: Binary file content

        Returns:
            Tuple of (package_path, sha256_hash)
        """
        package_path = self.get_job_package_path(tenant_id, job_id)

        # Read file content and compute hash
        content = file_content.read()
        file_content.seek(0)  # Reset for potential re-reading

        sha256_hash = hashlib.sha256(content).hexdigest()

        # Write to storage
        async with aiofiles.open(package_path, "wb") as f:
            await f.write(content)

        logger.info(
            f"Stored package for job {job_id} (tenant: {tenant_id}), "
            f"size: {len(content)} bytes, hash: {sha256_hash[:12]}..."
        )

        return str(package_path), sha256_hash

    async def delete_package(self, tenant_id: str, job_id: str) -> bool:
        """
        Delete a job package.

        Args:
            tenant_id: Tenant identifier
            job_id: Job identifier

        Returns:
            True if deleted, False if not found
        """
        package_path = self.get_job_package_path(tenant_id, job_id)

        try:
            if package_path.exists():
                package_path.unlink()
                logger.info(f"Deleted package for job {job_id}")
                return True
            else:
                logger.warning(f"Package not found for job {job_id}")
                return False
        except Exception as e:
            logger.error(f"Failed to delete package for job {job_id}: {e}")
            return False

    def get_tenant_usage(self, tenant_id: str) -> dict:
        """
        Get storage usage statistics for a tenant.

        Args:
            tenant_id: Tenant identifier

        Returns:
            Dictionary with usage stats
        """
        tenant_path = self.get_tenant_path(tenant_id)

        total_size = 0
        file_count = 0

        for package_file in tenant_path.glob("*.zip"):
            total_size += package_file.stat().st_size
            file_count += 1

        return {
            "tenant_id": tenant_id,
            "file_count": file_count,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2)
        }
