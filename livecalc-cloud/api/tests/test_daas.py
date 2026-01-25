"""
Tests for DaaS (Debugging-as-a-Service) functionality.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from fastapi.testclient import TestClient
import json

from ..main import app
from ..services.daas_proxy import DaaSProxy, DebugSession
from ..routers.platform import router


@pytest.fixture
def mock_daas_proxy():
    """Mock DaaS proxy."""
    proxy = Mock(spec=DaaSProxy)
    proxy.pause_run = AsyncMock(return_value=True)
    proxy.resume_run = AsyncMock(return_value=True)
    proxy.step_run = AsyncMock(return_value=True)
    proxy.inspect_memory = AsyncMock(return_value=b'\x00' * 1024)
    proxy.get_bus_resources = AsyncMock(return_value=[])
    return proxy


@pytest.fixture
def mock_auth_token():
    """Mock JWT token for testing."""
    return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJ0ZW5hbnRfaWQiOiJ0ZXN0LXRlbmFudCJ9.test"


def test_pause_run(mock_daas_proxy, mock_auth_token):
    """Test pause run endpoint."""
    client = TestClient(app)

    with patch('..routers.platform.get_daas_proxy', return_value=mock_daas_proxy):
        response = client.post(
            "/v1/platform/debug/test-run-123/pause",
            json={"node_id": "node-1"},
            headers={"Authorization": f"Bearer {mock_auth_token}"}
        )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "session_id" in data


def test_resume_run(mock_daas_proxy, mock_auth_token):
    """Test resume run endpoint."""
    client = TestClient(app)

    with patch('..routers.platform.get_daas_proxy', return_value=mock_daas_proxy):
        response = client.post(
            "/v1/platform/debug/test-run-123/resume",
            headers={"Authorization": f"Bearer {mock_auth_token}"}
        )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True


def test_step_run(mock_daas_proxy, mock_auth_token):
    """Test step run endpoint."""
    client = TestClient(app)

    with patch('..routers.platform.get_daas_proxy', return_value=mock_daas_proxy):
        response = client.post(
            "/v1/platform/debug/test-run-123/step",
            headers={"Authorization": f"Bearer {mock_auth_token}"}
        )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True


def test_inspect_memory(mock_daas_proxy, mock_auth_token):
    """Test memory inspection endpoint."""
    client = TestClient(app)

    with patch('..routers.platform.get_daas_proxy', return_value=mock_daas_proxy):
        response = client.post(
            "/v1/platform/debug/test-run-123/inspect",
            json={
                "bus_uri": "bus://results/npv",
                "offset": 0,
                "length": 1024
            },
            headers={"Authorization": f"Bearer {mock_auth_token}"}
        )

    assert response.status_code == 200
    assert response.headers["Content-Type"] == "application/octet-stream"
    assert response.headers["X-Bus-URI"] == "bus://results/npv"
    assert len(response.content) == 1024


def test_get_bus_resources(mock_daas_proxy, mock_auth_token):
    """Test get bus resources endpoint."""
    client = TestClient(app)

    mock_resources = [
        {
            "uri": "bus://results/npv",
            "name": "results/npv",
            "offset": 1024,
            "sizeBytes": 80000,
            "dataType": "float64",
            "elementCount": 10000
        }
    ]
    mock_daas_proxy.get_bus_resources = AsyncMock(return_value=mock_resources)

    with patch('..routers.platform.get_daas_proxy', return_value=mock_daas_proxy):
        response = client.get(
            "/v1/platform/debug/test-run-123/resources",
            headers={"Authorization": f"Bearer {mock_auth_token}"}
        )

    assert response.status_code == 200
    data = response.json()
    assert data["run_id"] == "test-run-123"
    assert len(data["resources"]) == 1
    assert data["resources"][0]["uri"] == "bus://results/npv"


@pytest.mark.asyncio
async def test_daas_proxy_pause():
    """Test DaaSProxy pause functionality."""
    proxy = DaaSProxy(redis_url="redis://localhost:6379")
    await proxy.initialize()

    # Mock WebSocket
    ws_mock = AsyncMock()
    proxy.websocket_connections = {"test-run": ws_mock}

    session_id = await proxy.create_session(
        run_id="test-run",
        user_id="test-user",
        tenant_id="test-tenant",
        memory_offset_map={}
    )

    success = await proxy.pause_run(session_id, "node-1")
    assert success is True

    # Verify WebSocket message sent
    ws_mock.send_json.assert_called_once()
    call_args = ws_mock.send_json.call_args[0][0]
    assert call_args["type"] == "debug:pause"
    assert call_args["sessionId"] == session_id
    assert call_args["nodeId"] == "node-1"

    await proxy.shutdown()


@pytest.mark.asyncio
async def test_daas_proxy_resume():
    """Test DaaSProxy resume functionality."""
    proxy = DaaSProxy(redis_url="redis://localhost:6379")
    await proxy.initialize()

    # Mock WebSocket
    ws_mock = AsyncMock()
    proxy.websocket_connections = {"test-run": ws_mock}

    session_id = await proxy.create_session(
        run_id="test-run",
        user_id="test-user",
        tenant_id="test-tenant",
        memory_offset_map={}
    )

    # Pause first
    await proxy.pause_run(session_id)

    # Then resume
    success = await proxy.resume_run(session_id)
    assert success is True

    # Verify WebSocket message sent
    assert ws_mock.send_json.call_count == 2  # pause + resume
    call_args = ws_mock.send_json.call_args[0][0]
    assert call_args["type"] == "debug:resume"
    assert call_args["sessionId"] == session_id

    await proxy.shutdown()


@pytest.mark.asyncio
async def test_daas_proxy_memory_inspection():
    """Test DaaSProxy memory inspection."""
    proxy = DaaSProxy(redis_url="redis://localhost:6379")
    await proxy.initialize()

    # Mock WebSocket
    ws_mock = AsyncMock()
    # Mock receive_bytes to return test data
    ws_mock.receive_bytes = AsyncMock(return_value=b'\x01\x02\x03\x04' * 256)
    proxy.websocket_connections = {"test-run": ws_mock}

    memory_offset_map = {
        "blocksByName": {
            "results/npv": {
                "offset": 1024,
                "sizeBytes": 80000,
                "dataType": "float64",
                "elementCount": 10000
            }
        }
    }

    session_id = await proxy.create_session(
        run_id="test-run",
        user_id="test-user",
        tenant_id="test-tenant",
        memory_offset_map=memory_offset_map
    )

    data = await proxy.inspect_memory(session_id, "bus://results/npv", 0, 1024)

    assert len(data) == 1024
    assert data == b'\x01\x02\x03\x04' * 256

    # Verify WebSocket request sent
    ws_mock.send_json.assert_called()
    call_args = ws_mock.send_json.call_args[0][0]
    assert call_args["type"] == "debug:inspect"
    assert call_args["busUri"] == "bus://results/npv"

    await proxy.shutdown()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
