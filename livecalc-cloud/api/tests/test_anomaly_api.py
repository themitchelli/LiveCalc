"""
Integration tests for anomaly detection API endpoints.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock
import numpy as np

from main import app
from services.auth import UserInfo


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_user():
    """Mock authenticated user."""
    return UserInfo(
        user_id="test-user",
        tenant_id="test-tenant",
        email="test@example.com"
    )


@pytest.fixture
def mock_verify_token(monkeypatch, mock_user):
    """Mock token verification to bypass authentication."""
    async def _mock_verify():
        return mock_user

    # Replace the dependency
    from routers.platform import verify_token
    monkeypatch.setattr("routers.platform.verify_token", lambda: mock_user)


@pytest.fixture
def sample_bucket_data():
    """Generate sample bucket data with anomalies."""
    np.random.seed(42)

    # 95 normal runs + 5 outliers
    normal_runs = [
        {
            "runId": f"run-{i:03d}",
            "npv": float(np.random.normal(100000, 10000)),
            "engineId": f"engine-{i % 5}",
            "inputs": {"policy_count": 1000, "scenario_count": 100},
        }
        for i in range(95)
    ]

    outlier_runs = [
        {"runId": "run-095", "npv": 150000.0, "engineId": "engine-culprit-1"},  # 3-sigma high
        {"runId": "run-096", "npv": 45000.0, "engineId": "engine-culprit-2"},   # 3-sigma low
        {"runId": "run-097", "npv": 0.0, "engineId": "engine-culprit-3"},        # Zero NPV
        {"runId": "run-098", "npv": -10000.0, "engineId": "engine-culprit-4"},   # Negative NPV
        {"runId": "run-099", "npv": 180000.0, "engineId": "engine-culprit-5"},   # 5-sigma
    ]

    return {
        "bucket_id": "test-bucket-001",
        "run_results": normal_runs + outlier_runs,
        "include_diagnostics": True,
        "sigma_threshold": 3.0
    }


class TestAnomalyDetectionAPI:
    """Test suite for anomaly detection API endpoints."""

    def test_analyze_bucket_success(self, client, mock_verify_token, sample_bucket_data):
        """Test successful bucket analysis."""
        response = client.post(
            "/v1/platform/anomalies/analyze",
            json=sample_bucket_data
        )

        assert response.status_code == 200
        data = response.json()

        # Check response structure
        assert "bucket_statistics" in data
        assert "anomalies" in data
        assert "diagnostic_bundles" in data

        # Check bucket statistics
        stats = data["bucket_statistics"]
        assert stats["bucketId"] == "test-bucket-001"
        assert stats["runCount"] == 100
        assert 90000 < stats["mean"] < 110000  # Should be around 100K
        assert stats["anomalyCount"] > 0

        # Check anomalies detected
        anomalies = data["anomalies"]
        assert len(anomalies) >= 3  # At least some of our outliers should be flagged

        # Check diagnostic bundles
        bundles = data["diagnostic_bundles"]
        assert len(bundles) == len(anomalies)

    def test_analyze_bucket_with_3sigma_high_outlier(self, client, mock_verify_token, sample_bucket_data):
        """Test detection of 3-sigma high outlier."""
        response = client.post(
            "/v1/platform/anomalies/analyze",
            json=sample_bucket_data
        )

        assert response.status_code == 200
        anomalies = response.json()["anomalies"]

        # Should detect the 150000 NPV value
        high_anomalies = [a for a in anomalies if a["anomalyType"] == "3_sigma_high"]
        assert len(high_anomalies) >= 1

    def test_analyze_bucket_with_zero_npv(self, client, mock_verify_token, sample_bucket_data):
        """Test detection of zero NPV."""
        response = client.post(
            "/v1/platform/anomalies/analyze",
            json=sample_bucket_data
        )

        assert response.status_code == 200
        anomalies = response.json()["anomalies"]

        # Should detect the zero NPV
        zero_anomalies = [a for a in anomalies if a["anomalyType"] == "zero_npv"]
        assert len(zero_anomalies) >= 1
        assert zero_anomalies[0]["npvValue"] == 0.0

    def test_analyze_bucket_with_custom_threshold(self, client, mock_verify_token, sample_bucket_data):
        """Test bucket analysis with custom sigma threshold."""
        # Use 2.5 sigma instead of 3.0
        sample_bucket_data["sigma_threshold"] = 2.5

        response = client.post(
            "/v1/platform/anomalies/analyze",
            json=sample_bucket_data
        )

        assert response.status_code == 200
        data = response.json()

        # With lower threshold, should detect more anomalies
        assert len(data["anomalies"]) > 0

    def test_analyze_bucket_without_diagnostics(self, client, mock_verify_token, sample_bucket_data):
        """Test bucket analysis without diagnostic bundles."""
        sample_bucket_data["include_diagnostics"] = False

        response = client.post(
            "/v1/platform/anomalies/analyze",
            json=sample_bucket_data
        )

        assert response.status_code == 200
        data = response.json()

        # Should have anomalies but no diagnostic bundles
        assert len(data["anomalies"]) > 0
        assert len(data["diagnostic_bundles"]) == 0

    def test_analyze_bucket_missing_runid(self, client, mock_verify_token):
        """Test error when run results missing runId."""
        invalid_data = {
            "bucket_id": "test-bucket-002",
            "run_results": [
                {"npv": 100000.0},  # Missing runId
            ] * 50
        }

        response = client.post(
            "/v1/platform/anomalies/analyze",
            json=invalid_data
        )

        assert response.status_code == 400
        assert "runId" in response.json()["detail"]

    def test_analyze_bucket_missing_npv(self, client, mock_verify_token):
        """Test error when run results missing NPV."""
        invalid_data = {
            "bucket_id": "test-bucket-003",
            "run_results": [
                {"runId": f"run-{i}"}  # Missing npv
                for i in range(50)
            ]
        }

        response = client.post(
            "/v1/platform/anomalies/analyze",
            json=invalid_data
        )

        assert response.status_code == 400
        assert "npv" in response.json()["detail"]

    def test_analyze_bucket_insufficient_size(self, client, mock_verify_token):
        """Test error when bucket too small."""
        small_bucket = {
            "bucket_id": "test-bucket-004",
            "run_results": [
                {"runId": f"run-{i}", "npv": float(100000 + i)}
                for i in range(25)  # Less than minimum 30
            ]
        }

        response = client.post(
            "/v1/platform/anomalies/analyze",
            json=small_bucket
        )

        assert response.status_code == 400
        assert "minimum 30 required" in response.json()["detail"]

    def test_analyze_bucket_invalid_sigma_threshold(self, client, mock_verify_token, sample_bucket_data):
        """Test validation of sigma threshold parameter."""
        # Threshold too low (< 2.0)
        sample_bucket_data["sigma_threshold"] = 1.5

        response = client.post(
            "/v1/platform/anomalies/analyze",
            json=sample_bucket_data
        )

        assert response.status_code == 422  # Pydantic validation error

    def test_diagnostic_bundle_contains_comparison_data(self, client, mock_verify_token, sample_bucket_data):
        """Test that diagnostic bundles include comparison data."""
        response = client.post(
            "/v1/platform/anomalies/analyze",
            json=sample_bucket_data
        )

        assert response.status_code == 200
        bundles = response.json()["diagnostic_bundles"]

        if bundles:
            bundle = bundles[0]
            assert "comparisonData" in bundle
            assert "percentile_rank" in bundle["comparisonData"]
            assert "z_score" in bundle["comparisonData"]
            assert "iqr_position" in bundle["comparisonData"]

    def test_anomaly_flag_includes_engine_id(self, client, mock_verify_token, sample_bucket_data):
        """Test that anomaly flags include engine ID for culprit identification."""
        response = client.post(
            "/v1/platform/anomalies/analyze",
            json=sample_bucket_data
        )

        assert response.status_code == 200
        anomalies = response.json()["anomalies"]

        # Check that outliers have engine IDs
        for anomaly in anomalies:
            if anomaly["npvValue"] in [150000.0, 45000.0, 0.0, -10000.0, 180000.0]:
                assert "engineId" in anomaly
                assert anomaly["engineId"].startswith("engine-")

    def test_bucket_statistics_format(self, client, mock_verify_token, sample_bucket_data):
        """Test format of bucket statistics response."""
        response = client.post(
            "/v1/platform/anomalies/analyze",
            json=sample_bucket_data
        )

        assert response.status_code == 200
        stats = response.json()["bucket_statistics"]

        # Check required statistical fields
        required_fields = [
            "bucketId", "runCount", "mean", "stdDev", "min", "max",
            "median", "percentile25", "percentile75", "percentile95",
            "percentile99", "anomalyCount", "calculatedAt"
        ]

        for field in required_fields:
            assert field in stats, f"Missing field: {field}"

        # Check value ordering
        assert stats["min"] <= stats["percentile25"]
        assert stats["percentile25"] <= stats["median"]
        assert stats["median"] <= stats["percentile75"]
        assert stats["percentile75"] <= stats["percentile95"]
        assert stats["percentile95"] <= stats["percentile99"]
        assert stats["percentile99"] <= stats["max"]

    def test_get_diagnostic_bundle_not_implemented(self, client, mock_verify_token):
        """Test that diagnostic bundle retrieval endpoint returns not implemented."""
        response = client.get("/v1/platform/anomalies/diagnostic/run-001")

        assert response.status_code == 501
        assert "not yet implemented" in response.json()["detail"].lower()

    def test_large_bucket_performance(self, client, mock_verify_token):
        """Test anomaly detection on large bucket (1000 runs)."""
        np.random.seed(42)

        large_bucket = {
            "bucket_id": "test-bucket-large",
            "run_results": [
                {
                    "runId": f"run-{i:04d}",
                    "npv": float(np.random.normal(100000, 10000)),
                    "engineId": f"engine-{i % 10}"
                }
                for i in range(1000)
            ],
            "include_diagnostics": False  # Disable for performance
        }

        response = client.post(
            "/v1/platform/anomalies/analyze",
            json=large_bucket
        )

        assert response.status_code == 200
        data = response.json()

        # Should complete successfully
        assert data["bucket_statistics"]["runCount"] == 1000

        # Should detect some anomalies (3-sigma rule: ~0.3% expected)
        # With 1000 runs, expect 0-10 anomalies
        assert len(data["anomalies"]) <= 15

    def test_anomaly_type_enum_values(self, client, mock_verify_token, sample_bucket_data):
        """Test that anomaly types match expected enum values."""
        response = client.post(
            "/v1/platform/anomalies/analyze",
            json=sample_bucket_data
        )

        assert response.status_code == 200
        anomalies = response.json()["anomalies"]

        valid_types = [
            "3_sigma_high",
            "3_sigma_low",
            "5_sigma",
            "negative_npv_outlier",
            "zero_npv"
        ]

        for anomaly in anomalies:
            assert anomaly["anomalyType"] in valid_types
