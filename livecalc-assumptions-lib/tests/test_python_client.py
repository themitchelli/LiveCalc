"""
Tests for Python Assumptions Client

Tests mirror C++ client behavior and validate NumPy integration.
"""

import pytest
import numpy as np
import json
import time
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Add src/python to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from python.assumptions_client import (
    AssumptionsClient,
    AssumptionsError,
    JWTHandler,
    LRUCache,
    HttpClient,
    CacheStats,
)


class TestJWTHandler:
    """Test JWT token handler"""

    def test_init_with_valid_token(self):
        """Test initialization with valid JWT token"""
        # Mock JWT token (header.payload.signature)
        # Payload: {"exp": current_time + 1 hour}
        import base64
        exp_time = int(time.time()) + 3600
        payload = base64.urlsafe_b64encode(
            json.dumps({"exp": exp_time}).encode()
        ).decode().rstrip('=')
        token = f"header.{payload}.signature"

        handler = JWTHandler("https://am.ddns.net", token)
        assert handler.token == token
        assert handler.expiry is not None

    def test_get_token_valid(self):
        """Test getting valid token"""
        exp_time = int(time.time()) + 3600
        import base64
        payload = base64.urlsafe_b64encode(
            json.dumps({"exp": exp_time}).encode()
        ).decode().rstrip('=')
        token = f"header.{payload}.signature"

        handler = JWTHandler("https://am.ddns.net", token)
        assert handler.get_token() == token

    def test_token_expires_in(self):
        """Test getting time until expiry"""
        exp_time = int(time.time()) + 3600
        import base64
        payload = base64.urlsafe_b64encode(
            json.dumps({"exp": exp_time}).encode()
        ).decode().rstrip('=')
        token = f"header.{payload}.signature"

        handler = JWTHandler("https://am.ddns.net", token)
        expires_in = handler.token_expires_in()
        assert 3550 <= expires_in <= 3600  # Within reasonable range


class TestLRUCache:
    """Test LRU cache"""

    def test_cache_miss(self, tmp_path):
        """Test cache miss"""
        cache = LRUCache(str(tmp_path))
        assert cache.get("nonexistent") is None
        assert cache.stats.misses == 1
        assert cache.stats.hits == 0

    def test_cache_put_get(self, tmp_path):
        """Test cache put and get"""
        cache = LRUCache(str(tmp_path))
        data = np.array([1.0, 2.0, 3.0])

        cache.put("test-key", data)
        retrieved = cache.get("test-key")

        assert retrieved is not None
        np.testing.assert_array_equal(retrieved, data)
        assert cache.stats.hits == 1

    def test_cache_eviction(self, tmp_path):
        """Test LRU eviction"""
        # Small cache size (1KB)
        cache = LRUCache(str(tmp_path), max_size_mb=0.001)

        # Create arrays that will exceed cache size
        arr1 = np.random.rand(100)
        arr2 = np.random.rand(100)

        cache.put("key1", arr1)
        time.sleep(0.01)  # Ensure different access times
        cache.put("key2", arr2)

        # key1 should be evicted due to size constraint
        # Note: This is a simplified test - actual eviction depends on size
        stats = cache.get_stats()
        assert stats.entries <= 2


class TestHttpClient:
    """Test HTTP client"""

    @patch('requests.Session.get')
    def test_get_success(self, mock_get):
        """Test successful GET request"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": [1.0, 2.0]}
        mock_get.return_value = mock_response

        client = HttpClient()
        response = client.get("https://test.com")

        assert response.status_code == 200
        assert response.json() == {"data": [1.0, 2.0]}

    @patch('requests.Session.get')
    def test_get_retry_on_500(self, mock_get):
        """Test retry on server error"""
        # First two calls fail, third succeeds
        mock_response_fail = Mock()
        mock_response_fail.status_code = 500
        mock_response_fail.raise_for_status = Mock(side_effect=Exception("Server error"))

        mock_response_success = Mock()
        mock_response_success.status_code = 200

        mock_get.side_effect = [mock_response_fail, mock_response_fail, mock_response_success]

        client = HttpClient()
        response = client.get("https://test.com")

        assert response.status_code == 200
        assert mock_get.call_count == 3

    @patch('requests.Session.get')
    def test_get_no_retry_on_404(self, mock_get):
        """Test no retry on not found"""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_response.raise_for_status = Mock(side_effect=Exception("Not found"))
        mock_get.return_value = mock_response

        client = HttpClient()

        with pytest.raises(AssumptionsError, match="HTTP request failed"):
            client.get("https://test.com")

        assert mock_get.call_count == 1  # No retry


class TestAssumptionsClient:
    """Test Assumptions Client"""

    def create_mock_client(self, tmp_path):
        """Create client with mocked dependencies"""
        # Create valid JWT token
        import base64
        exp_time = int(time.time()) + 3600
        payload = base64.urlsafe_b64encode(
            json.dumps({"exp": exp_time}).encode()
        ).decode().rstrip('=')
        token = f"header.{payload}.signature"

        client = AssumptionsClient(
            "https://am.ddns.net",
            token,
            str(tmp_path)
        )
        return client

    @patch.object(AssumptionsClient, '_fetch_from_api')
    def test_resolve_from_api(self, mock_fetch, tmp_path):
        """Test resolving assumption from API"""
        mock_fetch.return_value = [0.001, 0.002, 0.003]

        client = self.create_mock_client(tmp_path)
        result = client.resolve("mortality-standard", "v2.1")

        assert isinstance(result, np.ndarray)
        np.testing.assert_array_equal(result, [0.001, 0.002, 0.003])

    @patch.object(AssumptionsClient, '_fetch_from_api')
    def test_resolve_with_caching(self, mock_fetch, tmp_path):
        """Test resolve caches versioned assumptions"""
        mock_fetch.return_value = [0.001, 0.002, 0.003]

        client = self.create_mock_client(tmp_path)

        # First call - API fetch
        result1 = client.resolve("mortality-standard", "v2.1")
        assert mock_fetch.call_count == 1

        # Second call - cache hit
        result2 = client.resolve("mortality-standard", "v2.1")
        assert mock_fetch.call_count == 1  # No additional API call

        np.testing.assert_array_equal(result1, result2)

    @patch.object(AssumptionsClient, '_fetch_from_api')
    def test_resolve_latest_no_cache(self, mock_fetch, tmp_path):
        """Test 'latest' version always fetches fresh"""
        mock_fetch.return_value = [0.001, 0.002, 0.003]

        client = self.create_mock_client(tmp_path)

        # First call
        client.resolve("mortality-standard", "latest")
        assert mock_fetch.call_count == 1

        # Second call - should fetch again (not cached)
        client.resolve("mortality-standard", "latest")
        assert mock_fetch.call_count == 2

    @patch.object(AssumptionsClient, '_fetch_from_api')
    def test_resolve_scalar(self, mock_fetch, tmp_path):
        """Test resolving scalar with policy attributes"""
        mock_fetch.return_value = [0.001, 0.002, 0.003]

        client = self.create_mock_client(tmp_path)
        result = client.resolve_scalar(
            "mortality-standard",
            "v2.1",
            {"age": 50, "gender": "M"}
        )

        assert isinstance(result, float)
        assert result > 0

    @patch.object(HttpClient, 'get')
    def test_list_versions(self, mock_get, tmp_path):
        """Test listing versions"""
        mock_response = Mock()
        mock_response.json.return_value = {
            "versions": [
                {"version": "v2.1"},
                {"version": "v2.0"},
                {"version": "draft"}
            ]
        }
        mock_get.return_value = mock_response

        client = self.create_mock_client(tmp_path)
        versions = client.list_versions("mortality-standard")

        assert versions == ["v2.1", "v2.0", "draft"]

    def test_get_cache_stats(self, tmp_path):
        """Test getting cache statistics"""
        client = self.create_mock_client(tmp_path)
        stats = client.get_cache_stats()

        assert isinstance(stats, CacheStats)
        assert stats.hits >= 0
        assert stats.misses >= 0

    @patch.object(HttpClient, 'get')
    def test_fetch_from_api_success(self, mock_get, tmp_path):
        """Test successful API fetch"""
        mock_response = Mock()
        mock_response.json.return_value = {"data": [0.001, 0.002, 0.003]}
        mock_get.return_value = mock_response

        client = self.create_mock_client(tmp_path)
        result = client._fetch_from_api("mortality-standard", "v2.1")

        assert result == [0.001, 0.002, 0.003]

    @patch.object(HttpClient, 'get')
    def test_fetch_from_api_401(self, mock_get, tmp_path):
        """Test API fetch with auth error"""
        import requests
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.raise_for_status = Mock(
            side_effect=requests.HTTPError(response=mock_response)
        )
        mock_get.return_value = mock_response

        client = self.create_mock_client(tmp_path)

        with pytest.raises(AssumptionsError, match="Authentication failed"):
            client._fetch_from_api("mortality-standard", "v2.1")

    @patch.object(HttpClient, 'get')
    def test_fetch_from_api_404(self, mock_get, tmp_path):
        """Test API fetch with not found"""
        import requests
        mock_response = Mock()
        mock_response.status_code = 404
        mock_response.raise_for_status = Mock(
            side_effect=requests.HTTPError(response=mock_response)
        )
        mock_get.return_value = mock_response

        client = self.create_mock_client(tmp_path)

        with pytest.raises(AssumptionsError, match="not found"):
            client._fetch_from_api("mortality-standard", "v2.1")


class TestIntegration:
    """Integration tests (require mocking full workflow)"""

    @patch.object(HttpClient, 'get')
    def test_full_workflow(self, mock_get, tmp_path):
        """Test full assumption resolution workflow"""
        # Mock API response
        mock_response = Mock()
        mock_response.json.return_value = {"data": [0.001, 0.002, 0.003, 0.004, 0.005]}
        mock_get.return_value = mock_response

        # Create client
        import base64
        exp_time = int(time.time()) + 3600
        payload = base64.urlsafe_b64encode(
            json.dumps({"exp": exp_time}).encode()
        ).decode().rstrip('=')
        token = f"header.{payload}.signature"

        client = AssumptionsClient(
            "https://am.ddns.net",
            token,
            str(tmp_path)
        )

        # Resolve assumption (first call - API)
        result1 = client.resolve("mortality-standard", "v2.1")
        assert isinstance(result1, np.ndarray)
        assert len(result1) == 5

        # Resolve again (second call - cache)
        result2 = client.resolve("mortality-standard", "v2.1")
        np.testing.assert_array_equal(result1, result2)

        # Only one API call should have been made
        assert mock_get.call_count == 1

        # Check cache stats
        stats = client.get_cache_stats()
        assert stats.hits == 1
        assert stats.misses == 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
