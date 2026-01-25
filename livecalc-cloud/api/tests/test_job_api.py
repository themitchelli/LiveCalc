"""
Integration tests for job API endpoints.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
import io
import zipfile

from main import app, config, storage_service, job_queue
from models.job import JobStatus


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_jwt_token():
    """Mock JWT token."""
    return "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test"


@pytest.fixture
def mock_user():
    """Mock user claims."""
    return {
        "tenant_id": "test-tenant",
        "user_id": "test-user",
        "email": "test@example.com"
    }


@pytest.fixture
def sample_package():
    """Create a sample .zip package."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as zf:
        zf.writestr("livecalc.config.json", '{"model": "test.mga"}')
        zf.writestr("test.wasm", b"fake wasm binary")
    buffer.seek(0)
    return buffer


class TestJobSubmission:
    """Test job submission endpoint."""

    @patch("services.auth.AuthService.verify_token")
    @patch("services.job_queue.JobQueue.enqueue_job")
    async def test_submit_job_success(
        self,
        mock_enqueue,
        mock_verify_token,
        client,
        mock_jwt_token,
        mock_user,
        sample_package
    ):
        """Test successful job submission."""
        # Setup mocks
        mock_verify_token.return_value = mock_user
        mock_enqueue.return_value = True

        # Submit job
        response = client.post(
            "/v1/jobs/submit",
            headers={"Authorization": mock_jwt_token},
            files={"package": ("test.zip", sample_package, "application/zip")},
            data={"priority": 5, "model_name": "test-model"}
        )

        # Verify response
        assert response.status_code == 201
        data = response.json()
        assert "jobId" in data
        assert data["status"] == "queued"
        assert "websocketUrl" in data
        assert config.websocket_base_url in data["websocketUrl"]
        assert data["jobId"] in data["websocketUrl"]

    def test_submit_job_no_auth(self, client, sample_package):
        """Test job submission without authentication."""
        response = client.post(
            "/v1/jobs/submit",
            files={"package": ("test.zip", sample_package, "application/zip")}
        )

        assert response.status_code == 401

    @patch("services.auth.AuthService.verify_token")
    def test_submit_job_invalid_file_type(
        self,
        mock_verify_token,
        client,
        mock_jwt_token,
        mock_user
    ):
        """Test job submission with invalid file type."""
        mock_verify_token.return_value = mock_user

        response = client.post(
            "/v1/jobs/submit",
            headers={"Authorization": mock_jwt_token},
            files={"package": ("test.txt", io.BytesIO(b"not a zip"), "text/plain")}
        )

        assert response.status_code == 400
        assert "must be a .zip file" in response.json()["detail"]

    @patch("services.auth.AuthService.verify_token")
    def test_submit_job_file_too_large(
        self,
        mock_verify_token,
        client,
        mock_jwt_token,
        mock_user
    ):
        """Test job submission with oversized file."""
        mock_verify_token.return_value = mock_user

        # Create a file larger than 100MB
        large_file = io.BytesIO(b"x" * (101 * 1024 * 1024))

        response = client.post(
            "/v1/jobs/submit",
            headers={"Authorization": mock_jwt_token},
            files={"package": ("large.zip", large_file, "application/zip")}
        )

        assert response.status_code == 413


class TestJobStatus:
    """Test job status endpoint."""

    @patch("services.auth.AuthService.verify_token")
    @patch("services.job_queue.JobQueue.get_job")
    async def test_get_job_status(
        self,
        mock_get_job,
        mock_verify_token,
        client,
        mock_jwt_token,
        mock_user
    ):
        """Test getting job status."""
        from models.job import Job

        # Setup mocks
        mock_verify_token.return_value = mock_user
        mock_job = Job.create(
            tenant_id="test-tenant",
            user_id="test-user",
            package_path="/test/path.zip",
            package_hash="abc123",
            websocket_base_url="ws://test"
        )
        mock_get_job.return_value = mock_job

        # Get job status
        response = client.get(
            f"/v1/jobs/{mock_job.jobId}",
            headers={"Authorization": mock_jwt_token}
        )

        # Verify response
        assert response.status_code == 200
        data = response.json()
        assert data["jobId"] == mock_job.jobId
        assert data["status"] == "queued"

    @patch("services.auth.AuthService.verify_token")
    @patch("services.job_queue.JobQueue.get_job")
    async def test_get_job_not_found(
        self,
        mock_get_job,
        mock_verify_token,
        client,
        mock_jwt_token,
        mock_user
    ):
        """Test getting non-existent job."""
        mock_verify_token.return_value = mock_user
        mock_get_job.return_value = None

        response = client.get(
            "/v1/jobs/non-existent-id",
            headers={"Authorization": mock_jwt_token}
        )

        assert response.status_code == 404

    @patch("services.auth.AuthService.verify_token")
    @patch("services.job_queue.JobQueue.get_job")
    async def test_get_job_wrong_tenant(
        self,
        mock_get_job,
        mock_verify_token,
        client,
        mock_jwt_token,
        mock_user
    ):
        """Test accessing job from different tenant."""
        from models.job import Job

        mock_verify_token.return_value = mock_user
        mock_job = Job.create(
            tenant_id="other-tenant",  # Different tenant
            user_id="other-user",
            package_path="/test/path.zip",
            package_hash="abc123",
            websocket_base_url="ws://test"
        )
        mock_get_job.return_value = mock_job

        response = client.get(
            f"/v1/jobs/{mock_job.jobId}",
            headers={"Authorization": mock_jwt_token}
        )

        assert response.status_code == 403


class TestJobCancellation:
    """Test job cancellation endpoint."""

    @patch("services.auth.AuthService.verify_token")
    @patch("services.job_queue.JobQueue.get_job")
    @patch("services.job_queue.JobQueue.update_job_status")
    @patch("services.storage.StorageService.delete_package")
    async def test_cancel_job_success(
        self,
        mock_delete_package,
        mock_update_status,
        mock_get_job,
        mock_verify_token,
        client,
        mock_jwt_token,
        mock_user
    ):
        """Test successful job cancellation."""
        from models.job import Job

        # Setup mocks
        mock_verify_token.return_value = mock_user
        mock_job = Job.create(
            tenant_id="test-tenant",
            user_id="test-user",
            package_path="/test/path.zip",
            package_hash="abc123",
            websocket_base_url="ws://test"
        )
        mock_get_job.return_value = mock_job
        mock_update_status.return_value = True
        mock_delete_package.return_value = True

        # Cancel job
        response = client.delete(
            f"/v1/jobs/{mock_job.jobId}",
            headers={"Authorization": mock_jwt_token}
        )

        # Verify response
        assert response.status_code == 204
        mock_update_status.assert_called_once()
        mock_delete_package.assert_called_once()

    @patch("services.auth.AuthService.verify_token")
    @patch("services.job_queue.JobQueue.get_job")
    async def test_cancel_job_running(
        self,
        mock_get_job,
        mock_verify_token,
        client,
        mock_jwt_token,
        mock_user
    ):
        """Test cancelling a running job."""
        from models.job import Job

        mock_verify_token.return_value = mock_user
        mock_job = Job.create(
            tenant_id="test-tenant",
            user_id="test-user",
            package_path="/test/path.zip",
            package_hash="abc123",
            websocket_base_url="ws://test"
        )
        mock_job.status = JobStatus.RUNNING  # Running jobs can't be cancelled
        mock_get_job.return_value = mock_job

        response = client.delete(
            f"/v1/jobs/{mock_job.jobId}",
            headers={"Authorization": mock_jwt_token}
        )

        assert response.status_code == 409


def test_health_endpoint(client):
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "service" in data


def test_root_endpoint(client):
    """Test root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "service" in data
    assert "docs" in data
