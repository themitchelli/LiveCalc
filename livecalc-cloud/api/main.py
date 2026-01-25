"""
LiveCalc Cloud API - Job submission and execution bridge.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings

from services.auth import AuthService
from services.storage import StorageService
from services.job_queue import JobQueue
from services.namespace_lifecycle import get_namespace_lifecycle_manager
from routers import jobs, platform

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application configuration."""

    # Assumptions Manager
    assumptions_manager_url: str = "http://localhost:9000"

    # Storage
    storage_root: str = "/data/packages"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # WebSocket
    websocket_base_url: str = "ws://localhost:8000"

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "vscode://"]

    # Azure Blob
    azure_blob_connection_string: str = ""

    # Namespace lifecycle
    diagnostic_container_name: str = "diagnostics"
    inactivity_threshold_hours: int = 24
    cleanup_enabled: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Global instances
config = Settings()
auth_service = AuthService(am_url=config.assumptions_manager_url)
storage_service = StorageService(storage_root=config.storage_root)
job_queue = JobQueue(redis_url=config.redis_url)

# Namespace lifecycle manager (initialized in lifespan if enabled)
namespace_manager = None
cleanup_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global namespace_manager, cleanup_task

    # Startup
    logger.info("Starting LiveCalc Cloud API")
    await job_queue.connect()
    logger.info("Connected to job queue")

    # Initialize namespace lifecycle manager if configured
    if config.cleanup_enabled and config.azure_blob_connection_string:
        logger.info("Initializing namespace lifecycle manager")
        namespace_manager = get_namespace_lifecycle_manager(
            blob_connection_string=config.azure_blob_connection_string,
            container_name=config.diagnostic_container_name,
            inactivity_threshold_hours=config.inactivity_threshold_hours,
        )

        # Start background cleanup worker
        import asyncio
        cleanup_task = asyncio.create_task(namespace_manager.run_cleanup_worker())
        logger.info("Started background cleanup worker")
    else:
        logger.info("Namespace cleanup disabled or Azure Blob not configured")

    yield

    # Shutdown
    logger.info("Shutting down LiveCalc Cloud API")

    # Cancel cleanup task if running
    if cleanup_task:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            logger.info("Cleanup worker task cancelled")

    await job_queue.disconnect()
    logger.info("Disconnected from job queue")


# Create FastAPI app
app = FastAPI(
    title="LiveCalc Cloud API",
    description="Job submission and execution bridge for LiveCalc cloud runtime",
    version="0.1.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Dependency providers
def get_storage() -> StorageService:
    """Get storage service instance."""
    return storage_service


def get_queue() -> JobQueue:
    """Get job queue instance."""
    return job_queue


# Override dependencies
app.dependency_overrides[StorageService] = get_storage
app.dependency_overrides[JobQueue] = get_queue


# Include routers
app.include_router(jobs.router)
app.include_router(platform.router)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "livecalc-cloud-api",
        "version": "0.1.0"
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "LiveCalc Cloud API",
        "version": "0.1.0",
        "docs": "/docs"
    }
