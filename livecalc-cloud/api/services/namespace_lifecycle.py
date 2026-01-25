"""
Namespace Lifecycle Management for DR = BAU pattern.

Implements automatic namespace creation per bucket and cleanup after 24h inactivity.
Ensures diagnostic extraction before reaping.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from dataclasses import dataclass

from kubernetes import client, config
from kubernetes.client.rest import ApiException
from azure.storage.blob.aio import BlobServiceClient
from azure.core.exceptions import AzureError

logger = logging.getLogger(__name__)


@dataclass
class NamespaceMetadata:
    """Metadata for a bucket namespace."""
    namespace: str
    bucket_id: str
    created_at: datetime
    last_activity: datetime
    status: str  # 'active', 'finalized', 'reaping', 'reaped'
    pod_count: int
    pvc_count: int


@dataclass
class DiagnosticExtractionResult:
    """Result of diagnostic extraction before namespace reaping."""
    logs_archived: bool
    sentinel_violations_indexed: bool
    blob_paths: List[str]
    error_message: Optional[str] = None


class NamespaceLifecycleManager:
    """Manages Kubernetes namespace lifecycle for transient bucket execution."""

    def __init__(
        self,
        blob_connection_string: str,
        container_name: str = "diagnostics",
        inactivity_threshold_hours: int = 24,
        cleanup_check_interval_seconds: int = 300,
    ):
        """
        Initialize namespace lifecycle manager.

        Args:
            blob_connection_string: Azure Blob Storage connection string
            container_name: Container for diagnostic storage
            inactivity_threshold_hours: Hours of inactivity before reaping
            cleanup_check_interval_seconds: Interval for cleanup worker checks
        """
        self.blob_connection_string = blob_connection_string
        self.container_name = container_name
        self.inactivity_threshold = timedelta(hours=inactivity_threshold_hours)
        self.cleanup_interval = cleanup_check_interval_seconds

        # Initialize Kubernetes client (uses in-cluster config in production)
        try:
            config.load_incluster_config()
            logger.info("Loaded in-cluster Kubernetes config")
        except config.ConfigException:
            config.load_kube_config()
            logger.info("Loaded local Kubernetes config")

        self.core_v1 = client.CoreV1Api()
        self.apps_v1 = client.AppsV1Api()

    async def create_namespace_for_bucket(self, bucket_id: str) -> str:
        """
        Create a scoped Kubernetes namespace for a bucket.

        Args:
            bucket_id: Unique bucket identifier

        Returns:
            Namespace name

        Raises:
            ApiException: If namespace creation fails
        """
        namespace_name = f"livecalc-bucket-{bucket_id.lower()}"

        # Check if namespace already exists
        try:
            self.core_v1.read_namespace(name=namespace_name)
            logger.info(f"Namespace {namespace_name} already exists")
            return namespace_name
        except ApiException as e:
            if e.status != 404:
                raise

        # Create namespace with labels and annotations
        namespace = client.V1Namespace(
            metadata=client.V1ObjectMeta(
                name=namespace_name,
                labels={
                    "app": "livecalc",
                    "bucket-id": bucket_id,
                    "managed-by": "livecalc-platform",
                    "lifecycle": "transient",
                },
                annotations={
                    "created-at": datetime.utcnow().isoformat(),
                    "last-activity": datetime.utcnow().isoformat(),
                    "status": "active",
                },
            )
        )

        try:
            self.core_v1.create_namespace(body=namespace)
            logger.info(f"Created namespace {namespace_name} for bucket {bucket_id}")
            return namespace_name
        except ApiException as e:
            logger.error(f"Failed to create namespace {namespace_name}: {e}")
            raise

    async def get_namespace_metadata(self, namespace: str) -> Optional[NamespaceMetadata]:
        """
        Get metadata for a namespace.

        Args:
            namespace: Namespace name

        Returns:
            NamespaceMetadata or None if namespace not found
        """
        try:
            ns = self.core_v1.read_namespace(name=namespace)
        except ApiException as e:
            if e.status == 404:
                return None
            raise

        annotations = ns.metadata.annotations or {}
        labels = ns.metadata.labels or {}

        # Get pod count
        pods = self.core_v1.list_namespaced_pod(namespace=namespace)
        pod_count = len(pods.items)

        # Get PVC count
        pvcs = self.core_v1.list_namespaced_persistent_volume_claim(namespace=namespace)
        pvc_count = len(pvcs.items)

        return NamespaceMetadata(
            namespace=namespace,
            bucket_id=labels.get("bucket-id", "unknown"),
            created_at=datetime.fromisoformat(annotations.get("created-at", datetime.utcnow().isoformat())),
            last_activity=datetime.fromisoformat(annotations.get("last-activity", datetime.utcnow().isoformat())),
            status=annotations.get("status", "unknown"),
            pod_count=pod_count,
            pvc_count=pvc_count,
        )

    async def update_namespace_activity(self, namespace: str) -> None:
        """
        Update last activity timestamp for a namespace.

        Args:
            namespace: Namespace name
        """
        try:
            body = {
                "metadata": {
                    "annotations": {
                        "last-activity": datetime.utcnow().isoformat()
                    }
                }
            }
            self.core_v1.patch_namespace(name=namespace, body=body)
            logger.debug(f"Updated activity timestamp for namespace {namespace}")
        except ApiException as e:
            logger.error(f"Failed to update namespace activity: {e}")

    async def mark_namespace_finalized(self, namespace: str) -> None:
        """
        Mark a namespace as finalized (ready for reaping).

        Args:
            namespace: Namespace name
        """
        try:
            body = {
                "metadata": {
                    "annotations": {
                        "status": "finalized",
                        "finalized-at": datetime.utcnow().isoformat()
                    }
                }
            }
            self.core_v1.patch_namespace(name=namespace, body=body)
            logger.info(f"Marked namespace {namespace} as finalized")
        except ApiException as e:
            logger.error(f"Failed to mark namespace finalized: {e}")

    async def extract_diagnostics(self, namespace: str, bucket_id: str) -> DiagnosticExtractionResult:
        """
        Extract diagnostics (pod logs, sentinel violations) before reaping.

        Args:
            namespace: Namespace name
            bucket_id: Bucket identifier

        Returns:
            DiagnosticExtractionResult
        """
        blob_paths: List[str] = []
        logs_archived = False
        sentinel_violations_indexed = False

        try:
            # Create blob service client
            async with BlobServiceClient.from_connection_string(
                self.blob_connection_string
            ) as blob_service:
                container_client = blob_service.get_container_client(self.container_name)

                # Ensure container exists
                try:
                    await container_client.create_container()
                except AzureError:
                    pass  # Container already exists

                # Extract pod logs
                timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
                base_path = f"{bucket_id}/{timestamp}"

                pods = self.core_v1.list_namespaced_pod(namespace=namespace)
                for pod in pods.items:
                    pod_name = pod.metadata.name
                    try:
                        log = self.core_v1.read_namespaced_pod_log(
                            name=pod_name, namespace=namespace
                        )
                        blob_path = f"{base_path}/logs/{pod_name}.log"
                        blob_client = container_client.get_blob_client(blob_path)
                        await blob_client.upload_blob(log, overwrite=True)
                        blob_paths.append(blob_path)
                        logger.debug(f"Archived logs for pod {pod_name}")
                    except ApiException as e:
                        logger.warning(f"Failed to extract logs for pod {pod_name}: {e}")

                logs_archived = len(blob_paths) > 0

                # Extract sentinel violations from annotations
                # (Assumes workers annotate pods with sentinel violations)
                sentinel_violations = []
                for pod in pods.items:
                    annotations = pod.metadata.annotations or {}
                    violations = annotations.get("memory-sentinel-violations")
                    if violations:
                        sentinel_violations.append({
                            "pod": pod.metadata.name,
                            "violations": violations,
                            "timestamp": datetime.utcnow().isoformat(),
                        })

                if sentinel_violations:
                    violations_blob = f"{base_path}/sentinel-violations.json"
                    import json
                    violations_json = json.dumps(sentinel_violations, indent=2)
                    blob_client = container_client.get_blob_client(violations_blob)
                    await blob_client.upload_blob(violations_json, overwrite=True)
                    blob_paths.append(violations_blob)
                    sentinel_violations_indexed = True
                    logger.info(f"Indexed {len(sentinel_violations)} sentinel violations")
                else:
                    sentinel_violations_indexed = True  # No violations is success

            return DiagnosticExtractionResult(
                logs_archived=logs_archived,
                sentinel_violations_indexed=sentinel_violations_indexed,
                blob_paths=blob_paths,
            )

        except Exception as e:
            logger.error(f"Diagnostic extraction failed for namespace {namespace}: {e}")
            return DiagnosticExtractionResult(
                logs_archived=False,
                sentinel_violations_indexed=False,
                blob_paths=blob_paths,
                error_message=str(e),
            )

    async def reap_namespace(self, namespace: str, bucket_id: str) -> bool:
        """
        Reap a namespace: extract diagnostics, delete namespace, verify cleanup.

        Args:
            namespace: Namespace name
            bucket_id: Bucket identifier

        Returns:
            True if reaping successful
        """
        logger.info(f"Starting reaping process for namespace {namespace}")

        try:
            # Mark as reaping
            body = {"metadata": {"annotations": {"status": "reaping"}}}
            self.core_v1.patch_namespace(name=namespace, body=body)

            # Extract diagnostics
            diagnostic_result = await self.extract_diagnostics(namespace, bucket_id)
            if not diagnostic_result.logs_archived:
                logger.warning(f"Failed to archive all logs for namespace {namespace}")
            if not diagnostic_result.sentinel_violations_indexed:
                logger.warning(f"Failed to index sentinel violations for namespace {namespace}")

            # Delete namespace (cascades to pods and PVCs)
            self.core_v1.delete_namespace(name=namespace)
            logger.info(f"Deleted namespace {namespace}")

            # Wait for namespace to be fully deleted
            for _ in range(60):  # Wait up to 60 seconds
                try:
                    self.core_v1.read_namespace(name=namespace)
                    await asyncio.sleep(1)
                except ApiException as e:
                    if e.status == 404:
                        logger.info(f"Namespace {namespace} fully deleted")
                        break
            else:
                logger.warning(f"Namespace {namespace} deletion timeout")
                return False

            # Verify no orphaned PVCs (PVCs should be deleted with namespace)
            # Check cluster-wide for any PVCs with old namespace label
            all_pvcs = self.core_v1.list_persistent_volume_claim_for_all_namespaces(
                label_selector=f"bucket-id={bucket_id}"
            )
            orphaned_pvcs = [pvc for pvc in all_pvcs.items if pvc.metadata.namespace == namespace]
            if orphaned_pvcs:
                logger.error(f"Found {len(orphaned_pvcs)} orphaned PVCs for namespace {namespace}")
                return False

            logger.info(f"Successfully reaped namespace {namespace} with {len(diagnostic_result.blob_paths)} artifacts archived")
            return True

        except Exception as e:
            logger.error(f"Failed to reap namespace {namespace}: {e}")
            return False

    async def find_namespaces_for_cleanup(self) -> List[NamespaceMetadata]:
        """
        Find namespaces eligible for cleanup.

        Returns:
            List of NamespaceMetadata for namespaces to reap
        """
        eligible = []
        try:
            namespaces = self.core_v1.list_namespace(
                label_selector="lifecycle=transient,managed-by=livecalc-platform"
            )

            for ns in namespaces.items:
                metadata = await self.get_namespace_metadata(ns.metadata.name)
                if not metadata:
                    continue

                # Check if finalized
                if metadata.status == "finalized":
                    eligible.append(metadata)
                    continue

                # Check if inactive
                now = datetime.utcnow()
                inactive_duration = now - metadata.last_activity
                if inactive_duration > self.inactivity_threshold:
                    eligible.append(metadata)

        except ApiException as e:
            logger.error(f"Failed to list namespaces: {e}")

        return eligible

    async def run_cleanup_worker(self) -> None:
        """
        Run continuous cleanup worker (background task).

        This is the main cleanup loop that runs periodically.
        """
        logger.info("Starting namespace cleanup worker")
        while True:
            try:
                eligible = await self.find_namespaces_for_cleanup()
                logger.info(f"Found {len(eligible)} namespaces eligible for cleanup")

                for metadata in eligible:
                    success = await self.reap_namespace(metadata.namespace, metadata.bucket_id)
                    if success:
                        logger.info(f"Successfully reaped namespace {metadata.namespace}")
                    else:
                        logger.error(f"Failed to reap namespace {metadata.namespace}")

                await asyncio.sleep(self.cleanup_interval)

            except Exception as e:
                logger.error(f"Cleanup worker error: {e}")
                await asyncio.sleep(60)  # Brief pause on error


# Singleton instance
_manager_instance: Optional[NamespaceLifecycleManager] = None


def get_namespace_lifecycle_manager(
    blob_connection_string: str,
    container_name: str = "diagnostics",
    inactivity_threshold_hours: int = 24,
) -> NamespaceLifecycleManager:
    """Get or create singleton NamespaceLifecycleManager instance."""
    global _manager_instance
    if _manager_instance is None:
        _manager_instance = NamespaceLifecycleManager(
            blob_connection_string=blob_connection_string,
            container_name=container_name,
            inactivity_threshold_hours=inactivity_threshold_hours,
        )
    return _manager_instance
