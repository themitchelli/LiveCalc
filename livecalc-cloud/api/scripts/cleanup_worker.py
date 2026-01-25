"""
Cleanup worker script for Kubernetes CronJob.

Runs periodically to find and reap inactive namespaces.
"""

import asyncio
import logging
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.namespace_lifecycle import get_namespace_lifecycle_manager

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def main():
    """Main cleanup worker entry point."""
    logger.info("Starting cleanup worker")

    # Get configuration from environment
    blob_connection_string = os.getenv("AZURE_BLOB_CONNECTION_STRING")
    if not blob_connection_string:
        logger.error("AZURE_BLOB_CONNECTION_STRING environment variable not set")
        sys.exit(1)

    container_name = os.getenv("DIAGNOSTIC_CONTAINER_NAME", "diagnostics")
    inactivity_threshold_hours = int(os.getenv("INACTIVITY_THRESHOLD_HOURS", "24"))

    # Initialize manager
    manager = get_namespace_lifecycle_manager(
        blob_connection_string=blob_connection_string,
        container_name=container_name,
        inactivity_threshold_hours=inactivity_threshold_hours,
    )

    # Find and reap eligible namespaces
    try:
        eligible = await manager.find_namespaces_for_cleanup()
        logger.info(f"Found {len(eligible)} namespaces eligible for cleanup")

        success_count = 0
        failure_count = 0

        for metadata in eligible:
            logger.info(
                f"Reaping namespace {metadata.namespace} "
                f"(bucket: {metadata.bucket_id}, status: {metadata.status}, "
                f"last activity: {metadata.last_activity})"
            )

            success = await manager.reap_namespace(metadata.namespace, metadata.bucket_id)

            if success:
                success_count += 1
                logger.info(f"Successfully reaped namespace {metadata.namespace}")
            else:
                failure_count += 1
                logger.error(f"Failed to reap namespace {metadata.namespace}")

        logger.info(
            f"Cleanup worker finished: {success_count} successful, "
            f"{failure_count} failed out of {len(eligible)} total"
        )

        # Exit with error code if any failures
        if failure_count > 0:
            sys.exit(1)

    except Exception as e:
        logger.error(f"Cleanup worker error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
