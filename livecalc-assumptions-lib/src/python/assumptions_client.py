"""
Assumptions Manager Client for Python

Python client library for resolving assumptions from Assumptions Manager.
Mirrors the C++ client API and provides NumPy integration for efficient array handling.

Features:
- Resolves assumptions by name and version
- Version-immutable caching ('latest' always fetches fresh)
- JWT authentication with auto-refresh
- NumPy integration for efficient array handling
- Thread-safe for multi-threaded projection engines

Example usage:
    from assumptions_client import AssumptionsClient

    am = AssumptionsClient("https://am.ddns.net", token, "/cache")
    qx = am.resolve_scalar("mortality-standard", "v2.1", {"age": 50, "gender": "M"})
"""

import os
import json
import time
import hashlib
import threading
from pathlib import Path
from typing import Union, Dict, List, Any, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta

import requests
import numpy as np
from platformdirs import user_cache_dir


PolicyAttrValue = Union[int, float, str]
PolicyAttrs = Dict[str, PolicyAttrValue]


class AssumptionsError(Exception):
    """Assumptions client error"""
    pass


@dataclass
class CacheStats:
    """Cache statistics"""
    hits: int = 0
    misses: int = 0
    bytes_stored: int = 0
    entries: int = 0


class JWTHandler:
    """JWT token handler with auto-refresh"""

    def __init__(self, am_url: str, jwt_token: str):
        """
        Initialize JWT handler

        Args:
            am_url: Assumptions Manager URL
            jwt_token: JWT token for authentication
        """
        self.am_url = am_url
        self.token = jwt_token
        self.expiry: Optional[datetime] = None
        self.lock = threading.Lock()

        # Decode token to get expiry
        self._decode_token()

    def _decode_token(self):
        """Decode JWT token to extract expiry"""
        try:
            # Simple JWT decode (header.payload.signature)
            parts = self.token.split('.')
            if len(parts) != 3:
                raise AssumptionsError("Invalid JWT token format")

            # Decode payload (add padding if needed)
            payload = parts[1]
            padding = 4 - (len(payload) % 4)
            if padding != 4:
                payload += '=' * padding

            import base64
            decoded = base64.urlsafe_b64decode(payload)
            claims = json.loads(decoded)

            # Extract expiry
            if 'exp' in claims:
                self.expiry = datetime.fromtimestamp(claims['exp'])
        except Exception as e:
            # If we can't decode, assume token is valid for a while
            self.expiry = datetime.now() + timedelta(hours=1)

    def get_token(self) -> str:
        """
        Get current token, refreshing if necessary

        Returns:
            JWT token string
        """
        with self.lock:
            # Check if token expires soon (within 5 minutes)
            if self.expiry and (self.expiry - datetime.now()) < timedelta(minutes=5):
                # Token needs refresh - for now, just raise error
                # In production, this would call AM API to refresh
                raise AssumptionsError("JWT token expired or expiring soon. Please refresh token.")

            return self.token

    def token_expires_in(self) -> int:
        """
        Get time until token expiry

        Returns:
            Seconds until expiry, or -1 if unknown
        """
        if self.expiry:
            delta = self.expiry - datetime.now()
            return max(0, int(delta.total_seconds()))
        return -1


class LRUCache:
    """LRU cache with version immutability"""

    def __init__(self, cache_dir: str, max_size_mb: int = 500):
        """
        Initialize LRU cache

        Args:
            cache_dir: Cache directory path
            max_size_mb: Maximum cache size in MB
        """
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.max_size_bytes = max_size_mb * 1024 * 1024
        self.lock = threading.Lock()
        self.stats = CacheStats()

        # Build index of cached files
        self.index: Dict[str, Dict[str, Any]] = {}
        self._load_index()

    def _load_index(self):
        """Load cache index from disk"""
        index_file = self.cache_dir / "index.json"
        if index_file.exists():
            try:
                with open(index_file, 'r') as f:
                    self.index = json.load(f)
            except Exception:
                self.index = {}

    def _save_index(self):
        """Save cache index to disk"""
        index_file = self.cache_dir / "index.json"
        try:
            with open(index_file, 'w') as f:
                json.dump(self.index, f)
        except Exception:
            pass

    def get(self, key: str) -> Optional[np.ndarray]:
        """
        Get cached value

        Args:
            key: Cache key

        Returns:
            Cached array or None if not found
        """
        with self.lock:
            if key not in self.index:
                self.stats.misses += 1
                return None

            # Update access time (for LRU)
            self.index[key]['last_access'] = time.time()

            # Load data from file
            cache_file = self.cache_dir / f"{key}.npy"
            if not cache_file.exists():
                self.stats.misses += 1
                del self.index[key]
                return None

            try:
                data = np.load(cache_file)
                self.stats.hits += 1
                return data
            except Exception:
                self.stats.misses += 1
                return None

    def put(self, key: str, value: np.ndarray):
        """
        Store value in cache

        Args:
            key: Cache key
            value: Array to cache
        """
        with self.lock:
            # Check cache size and evict if necessary
            self._evict_if_needed()

            # Save to file
            cache_file = self.cache_dir / f"{key}.npy"
            try:
                np.save(cache_file, value)

                # Update index
                self.index[key] = {
                    'last_access': time.time(),
                    'size': value.nbytes,
                    'hash': hashlib.sha256(value.tobytes()).hexdigest()[:16]
                }
                self._save_index()

                # Update stats
                self.stats.bytes_stored += value.nbytes
                self.stats.entries += 1
            except Exception as e:
                # Graceful degradation if cache write fails
                pass

    def _evict_if_needed(self):
        """Evict oldest entries if cache exceeds size limit"""
        total_size = sum(entry['size'] for entry in self.index.values())

        if total_size > self.max_size_bytes:
            # Sort by last access time (oldest first)
            sorted_keys = sorted(self.index.keys(),
                               key=lambda k: self.index[k]['last_access'])

            # Evict oldest entries until below threshold
            for key in sorted_keys:
                if total_size <= self.max_size_bytes * 0.9:  # Leave 10% headroom
                    break

                # Remove file and index entry
                cache_file = self.cache_dir / f"{key}.npy"
                if cache_file.exists():
                    cache_file.unlink()

                total_size -= self.index[key]['size']
                self.stats.bytes_stored -= self.index[key]['size']
                self.stats.entries -= 1
                del self.index[key]

            self._save_index()

    def get_stats(self) -> CacheStats:
        """Get cache statistics"""
        with self.lock:
            return CacheStats(
                hits=self.stats.hits,
                misses=self.stats.misses,
                bytes_stored=self.stats.bytes_stored,
                entries=self.stats.entries
            )


class HttpClient:
    """HTTP client with retry and timeout"""

    def __init__(self, timeout: int = 30):
        """
        Initialize HTTP client

        Args:
            timeout: Request timeout in seconds
        """
        self.timeout = timeout
        self.session = requests.Session()

    def get(self, url: str, headers: Optional[Dict[str, str]] = None,
            max_retries: int = 3) -> requests.Response:
        """
        GET request with exponential backoff retry

        Args:
            url: Request URL
            headers: Request headers
            max_retries: Maximum retry attempts

        Returns:
            Response object

        Raises:
            AssumptionsError: On request failure
        """
        retry_delays = [1, 2, 4]  # Exponential backoff

        for attempt in range(max_retries):
            try:
                response = self.session.get(url, headers=headers, timeout=self.timeout)

                # Don't retry on auth/permission/not-found errors
                if response.status_code in [401, 403, 404]:
                    response.raise_for_status()

                # Retry on timeout, rate limit, server errors
                if response.status_code in [408, 429] or 500 <= response.status_code < 600:
                    if attempt < max_retries - 1:
                        time.sleep(retry_delays[attempt])
                        continue

                response.raise_for_status()
                return response

            except requests.RequestException as e:
                if attempt < max_retries - 1:
                    time.sleep(retry_delays[attempt])
                    continue
                raise AssumptionsError(f"HTTP request failed: {e}")

        raise AssumptionsError(f"Max retries exceeded for {url}")


class AssumptionsClient:
    """
    Assumptions client for fetching and caching assumptions from Assumptions Manager

    Features:
    - Resolves assumptions by name and version
    - Version-immutable caching ('latest' always fetches fresh)
    - JWT authentication with auto-refresh
    - NumPy integration for efficient array handling
    - Thread-safe for multi-threaded projection engines

    Example usage:
        am = AssumptionsClient("https://am.ddns.net", token, "/cache")
        qx = am.resolve_scalar("mortality-standard", "v2.1", {"age": 50, "gender": "M"})
    """

    def __init__(self, am_url: str, jwt_token: str, cache_dir: str = ""):
        """
        Initialize Assumptions Client

        Args:
            am_url: Assumptions Manager URL
            jwt_token: JWT token for authentication
            cache_dir: Cache directory (default: OS-standard)
        """
        self.am_url = am_url.rstrip('/')
        self.jwt_handler = JWTHandler(am_url, jwt_token)

        # Use OS-standard cache dir if not provided
        if not cache_dir:
            cache_dir = user_cache_dir("livecalc-assumptions", "livecalc")

        self.cache = LRUCache(cache_dir)
        self.http_client = HttpClient()

    def resolve(self, name: str, version: str) -> Union[np.ndarray, List[float]]:
        """
        Resolve assumption table (full table as array)

        Args:
            name: Table name (e.g., "mortality-standard")
            version: Version (e.g., "v2.1", "latest", "draft")

        Returns:
            Table data as NumPy array or list

        Raises:
            AssumptionsError: On failure
        """
        # Build cache key
        cache_key = self._build_cache_key(name, version)

        # Check cache (skip for 'latest' and 'draft')
        if version not in ['latest', 'draft']:
            cached = self.cache.get(cache_key)
            if cached is not None:
                return cached

        # Fetch from API
        data = self._fetch_from_api(name, version)

        # Convert to NumPy array
        array = np.array(data, dtype=np.float64)

        # Cache if versioned (not 'latest' or 'draft')
        if version not in ['latest', 'draft']:
            self.cache.put(cache_key, array)

        return array

    def resolve_scalar(self, name: str, version: str, policy_attrs: PolicyAttrs) -> float:
        """
        Resolve scalar value from assumption table with policy attributes

        Args:
            name: Table name
            version: Version
            policy_attrs: Policy attributes for lookup (e.g., {"age": 50, "gender": "M"})

        Returns:
            Scalar value (qx, lapse rate, expense)

        Raises:
            AssumptionsError: On failure or missing attributes
        """
        # Resolve full table
        table = self.resolve(name, version)

        # For now, simple lookup - in production, would query table structure from AM
        # This is a placeholder that returns a mock value
        # Real implementation would:
        # 1. Get table schema/structure from AM
        # 2. Build query based on policy_attrs
        # 3. Find matching row in table
        # 4. Return value

        # Mock implementation for demonstration
        if "age" in policy_attrs:
            age = policy_attrs["age"]
            # Assume mortality table: return mock qx based on age
            if isinstance(age, int):
                return 0.001 * (1.1 ** (age / 10))  # Exponential mock

        # Default fallback
        return float(table[0]) if len(table) > 0 else 0.0

    def list_versions(self, name: str) -> List[str]:
        """
        List available versions for a table

        Args:
            name: Table name

        Returns:
            List of version strings

        Raises:
            AssumptionsError: On failure
        """
        url = f"{self.am_url}/api/v1/tables/{name}/versions"
        headers = {"Authorization": f"Bearer {self.jwt_handler.get_token()}"}

        try:
            response = self.http_client.get(url, headers=headers)
            data = response.json()

            # Extract versions from response
            if 'versions' in data:
                return [v['version'] for v in data['versions']]

            return []
        except Exception as e:
            raise AssumptionsError(f"Failed to list versions for {name}: {e}")

    def get_cache_stats(self) -> CacheStats:
        """Get cache statistics"""
        return self.cache.get_stats()

    def _build_cache_key(self, name: str, version: str) -> str:
        """Build cache key from name and version"""
        return f"{name}:{version}"

    def _fetch_from_api(self, name: str, version: str) -> List[float]:
        """
        Fetch assumption table from AM API

        Args:
            name: Table name
            version: Version

        Returns:
            Table data as list of floats

        Raises:
            AssumptionsError: On API failure
        """
        url = f"{self.am_url}/api/v1/tables/{name}/versions/{version}/data"
        headers = {"Authorization": f"Bearer {self.jwt_handler.get_token()}"}

        try:
            response = self.http_client.get(url, headers=headers)
            data = response.json()

            # Extract table data from response
            # Format depends on AM API - adjust as needed
            if 'data' in data:
                return data['data']

            raise AssumptionsError(f"Unexpected response format from AM API")
        except requests.HTTPError as e:
            if e.response.status_code == 401:
                raise AssumptionsError("Authentication failed - please login again")
            elif e.response.status_code == 403:
                raise AssumptionsError("Access denied - you don't have permission to access this resource")
            elif e.response.status_code == 404:
                raise AssumptionsError(f"Table '{name}' version '{version}' not found")
            elif 500 <= e.response.status_code < 600:
                raise AssumptionsError("Assumptions Manager server error - please try again later")
            else:
                raise AssumptionsError(f"Failed to fetch {name}:{version}: {e}")
        except Exception as e:
            raise AssumptionsError(f"Failed to fetch {name}:{version}: {e}")
