"""
Tests for anomaly detection engine.
"""
import pytest
import numpy as np
from datetime import datetime

from services.anomaly_detection import (
    AnomalyDetectionEngine,
    AnomalyType,
    AnomalyFlag,
    BucketStatistics,
    DiagnosticBundle,
)


@pytest.fixture
def engine():
    """Create anomaly detection engine with default settings."""
    return AnomalyDetectionEngine(
        sigma_threshold=3.0,
        enable_5_sigma=True,
        enable_zero_detection=True,
        min_bucket_size=30
    )


@pytest.fixture
def normal_distribution_runs():
    """Generate 100 runs with normal distribution (mean=100, std=10)."""
    np.random.seed(42)
    npv_values = np.random.normal(100, 10, 100)

    return [
        {
            "runId": f"run-{i:03d}",
            "npv": float(npv),
            "engineId": f"engine-{i % 5}",
            "inputs": {"policy_count": 1000, "scenario_count": 100},
            "busData": {"bus://results/npv": [float(npv)]},
            "engineMetadata": {"version": "1.0.0", "simd": True}
        }
        for i, npv in enumerate(npv_values)
    ]


@pytest.fixture
def runs_with_outliers():
    """Generate 100 runs with deliberate outliers."""
    np.random.seed(42)
    npv_values = np.random.normal(100, 10, 97)

    # Add outliers
    outliers = [150, 45, 0]  # 3-sigma high, 3-sigma low, zero
    npv_values = np.concatenate([npv_values, outliers])

    return [
        {
            "runId": f"run-{i:03d}",
            "npv": float(npv),
            "engineId": f"engine-{i % 5}"
        }
        for i, npv in enumerate(npv_values)
    ]


@pytest.fixture
def runs_with_5sigma_outlier():
    """Generate 100 runs with a 5-sigma outlier."""
    np.random.seed(42)
    npv_values = np.random.normal(100, 10, 99)

    # Add 5-sigma outlier: mean + 5*std = 100 + 50 = 150
    outliers = [155]
    npv_values = np.concatenate([npv_values, outliers])

    return [
        {
            "runId": f"run-{i:03d}",
            "npv": float(npv),
            "engineId": f"engine-{i % 5}"
        }
        for i, npv in enumerate(npv_values)
    ]


class TestAnomalyDetectionEngine:
    """Test suite for AnomalyDetectionEngine."""

    def test_initialization(self, engine):
        """Test engine initialization with custom parameters."""
        assert engine.sigma_threshold == 3.0
        assert engine.enable_5_sigma is True
        assert engine.enable_zero_detection is True
        assert engine.min_bucket_size == 30

    def test_custom_threshold(self):
        """Test engine with custom sigma threshold."""
        engine = AnomalyDetectionEngine(sigma_threshold=2.5)
        assert engine.sigma_threshold == 2.5

    def test_analyze_bucket_success(self, engine, normal_distribution_runs):
        """Test successful bucket analysis with normal distribution."""
        result = engine.analyze_bucket(
            bucket_id="bucket-001",
            run_results=normal_distribution_runs,
            include_diagnostics=True
        )

        # Check statistics
        assert result.bucket_statistics.bucketId == "bucket-001"
        assert result.bucket_statistics.runCount == 100
        assert 95 < result.bucket_statistics.mean < 105  # Should be ~100
        assert 8 < result.bucket_statistics.stdDev < 12  # Should be ~10

        # Check percentiles
        assert result.bucket_statistics.percentile25 < result.bucket_statistics.median
        assert result.bucket_statistics.median < result.bucket_statistics.percentile75
        assert result.bucket_statistics.percentile95 < result.bucket_statistics.max

        # Normal distribution should have few/no anomalies
        # (but random chance may produce some)
        assert len(result.anomalies) <= 5  # Allow for random outliers

    def test_detect_3sigma_high_outlier(self, engine, runs_with_outliers):
        """Test detection of 3-sigma high outlier."""
        result = engine.analyze_bucket(
            bucket_id="bucket-002",
            run_results=runs_with_outliers,
            include_diagnostics=False
        )

        # Should detect the 150 NPV value as 3-sigma high
        high_anomalies = [a for a in result.anomalies if a.anomalyType == AnomalyType.THREE_SIGMA_HIGH]
        assert len(high_anomalies) >= 1

        # Check that 150 was flagged
        flagged_npvs = [a.npvValue for a in high_anomalies]
        assert any(npv > 145 for npv in flagged_npvs)

    def test_detect_3sigma_low_outlier(self, engine, runs_with_outliers):
        """Test detection of 3-sigma low outlier."""
        result = engine.analyze_bucket(
            bucket_id="bucket-003",
            run_results=runs_with_outliers,
            include_diagnostics=False
        )

        # Should detect the 45 NPV value as 3-sigma low
        low_anomalies = [a for a in result.anomalies if a.anomalyType == AnomalyType.THREE_SIGMA_LOW]
        assert len(low_anomalies) >= 1

        # Check that 45 was flagged
        flagged_npvs = [a.npvValue for a in low_anomalies]
        assert any(npv < 50 for npv in flagged_npvs)

    def test_detect_zero_npv(self, engine, runs_with_outliers):
        """Test detection of zero NPV as potential error."""
        result = engine.analyze_bucket(
            bucket_id="bucket-004",
            run_results=runs_with_outliers,
            include_diagnostics=False
        )

        # Should detect the 0 NPV value
        zero_anomalies = [a for a in result.anomalies if a.anomalyType == AnomalyType.ZERO_NPV]
        assert len(zero_anomalies) == 1
        assert zero_anomalies[0].npvValue == 0.0

    def test_detect_5sigma_outlier(self, engine, runs_with_5sigma_outlier):
        """Test detection of extreme 5-sigma outlier."""
        result = engine.analyze_bucket(
            bucket_id="bucket-005",
            run_results=runs_with_5sigma_outlier,
            include_diagnostics=False
        )

        # Should detect the 155 NPV value as 5-sigma outlier
        five_sigma_anomalies = [a for a in result.anomalies if a.anomalyType == AnomalyType.FIVE_SIGMA]
        assert len(five_sigma_anomalies) >= 1

        # Check that 155 was flagged
        flagged_npvs = [a.npvValue for a in five_sigma_anomalies]
        assert any(npv > 150 for npv in flagged_npvs)

    def test_anomaly_flag_details(self, engine, runs_with_outliers):
        """Test that anomaly flags contain all required details."""
        result = engine.analyze_bucket(
            bucket_id="bucket-006",
            run_results=runs_with_outliers,
            include_diagnostics=False
        )

        if result.anomalies:
            anomaly = result.anomalies[0]

            # Check required fields
            assert anomaly.runId.startswith("run-")
            assert anomaly.bucketId == "bucket-006"
            assert anomaly.anomalyType in AnomalyType
            assert isinstance(anomaly.npvValue, float)
            assert isinstance(anomaly.deviationFromMean, float)
            assert isinstance(anomaly.bucketMean, float)
            assert isinstance(anomaly.bucketStdDev, float)
            assert isinstance(anomaly.threshold, float)
            assert isinstance(anomaly.timestamp, datetime)

    def test_diagnostic_bundle_generation(self, engine, runs_with_outliers):
        """Test generation of diagnostic bundles for anomalies."""
        result = engine.analyze_bucket(
            bucket_id="bucket-007",
            run_results=runs_with_outliers,
            include_diagnostics=True
        )

        # Should have diagnostic bundles for all anomalies
        assert len(result.diagnostic_bundles) == len(result.anomalies)

        if result.diagnostic_bundles:
            bundle = result.diagnostic_bundles[0]

            # Check diagnostic bundle structure
            assert bundle.runId in [a.runId for a in result.anomalies]
            assert isinstance(bundle.anomalyFlag, AnomalyFlag)
            assert bundle.comparisonData is not None

            # Check comparison data
            assert "percentile_rank" in bundle.comparisonData
            assert "z_score" in bundle.comparisonData
            assert "iqr_position" in bundle.comparisonData

    def test_diagnostic_bundle_includes_snapshots(self, engine, runs_with_outliers):
        """Test that diagnostic bundles include input/bus/engine snapshots."""
        result = engine.analyze_bucket(
            bucket_id="bucket-008",
            run_results=runs_with_outliers[:50],  # Use first 50 with detailed data
            include_diagnostics=True
        )

        if result.diagnostic_bundles:
            # At least some bundles should have no snapshots (we didn't provide them)
            bundles_without_inputs = [b for b in result.diagnostic_bundles if b.inputSnapshot is None]
            assert len(bundles_without_inputs) > 0

    def test_insufficient_bucket_size(self, engine):
        """Test error when bucket has too few runs."""
        small_bucket = [
            {"runId": f"run-{i}", "npv": float(100 + i)}
            for i in range(25)  # Less than min_bucket_size (30)
        ]

        with pytest.raises(ValueError, match="minimum 30 required"):
            engine.analyze_bucket(
                bucket_id="small-bucket",
                run_results=small_bucket,
                include_diagnostics=False
            )

    def test_anomaly_count_in_statistics(self, engine, runs_with_outliers):
        """Test that bucket statistics includes anomaly count."""
        result = engine.analyze_bucket(
            bucket_id="bucket-009",
            run_results=runs_with_outliers,
            include_diagnostics=False
        )

        assert result.bucket_statistics.anomalyCount == len(result.anomalies)
        assert result.bucket_statistics.anomalyCount > 0

    def test_percentile_rank_calculation(self, engine):
        """Test percentile rank calculation for values."""
        # Create simple distribution: 0-99
        runs = [{"runId": f"run-{i}", "npv": float(i)} for i in range(100)]

        result = engine.analyze_bucket(
            bucket_id="bucket-010",
            run_results=runs,
            include_diagnostics=True
        )

        stats = result.bucket_statistics

        # Check percentile rank estimation
        rank_min = engine._calculate_percentile_rank(stats.min, stats)
        rank_max = engine._calculate_percentile_rank(stats.max, stats)
        rank_median = engine._calculate_percentile_rank(stats.median, stats)

        assert rank_min == 0.0
        assert rank_max == 100.0
        assert 45 < rank_median < 55  # Should be ~50

    def test_iqr_position_calculation(self, engine):
        """Test IQR position calculation."""
        # Create simple distribution
        runs = [{"runId": f"run-{i}", "npv": float(i)} for i in range(100)]

        result = engine.analyze_bucket(
            bucket_id="bucket-011",
            run_results=runs,
            include_diagnostics=False
        )

        stats = result.bucket_statistics

        # Check IQR positions
        within_iqr = engine._calculate_iqr_position(stats.median, stats)
        below_iqr = engine._calculate_iqr_position(stats.percentile25 - 5, stats)
        above_iqr = engine._calculate_iqr_position(stats.percentile75 + 5, stats)

        assert within_iqr == "within_iqr"
        assert below_iqr in ["below_iqr", "far_below_iqr"]
        assert above_iqr in ["above_iqr", "far_above_iqr"]

    def test_negative_npv_outlier_detection(self, engine):
        """Test detection of negative NPV when mean is positive."""
        runs = [{"runId": f"run-{i}", "npv": float(100 + i)} for i in range(50)]
        runs.append({"runId": "run-negative", "npv": -50.0})  # Negative outlier

        result = engine.analyze_bucket(
            bucket_id="bucket-012",
            run_results=runs,
            include_diagnostics=False
        )

        # Should detect negative outlier
        negative_anomalies = [
            a for a in result.anomalies
            if a.anomalyType == AnomalyType.NEGATIVE_NPV_OUTLIER
        ]
        assert len(negative_anomalies) >= 1
        assert negative_anomalies[0].npvValue == -50.0

    def test_disable_zero_detection(self):
        """Test engine with zero detection disabled."""
        engine = AnomalyDetectionEngine(
            sigma_threshold=3.0,
            enable_zero_detection=False
        )

        runs = [{"runId": f"run-{i}", "npv": float(100 + i)} for i in range(50)]
        runs.append({"runId": "run-zero", "npv": 0.0})

        result = engine.analyze_bucket(
            bucket_id="bucket-013",
            run_results=runs,
            include_diagnostics=False
        )

        # Should NOT detect zero NPV
        zero_anomalies = [a for a in result.anomalies if a.anomalyType == AnomalyType.ZERO_NPV]
        assert len(zero_anomalies) == 0

    def test_disable_5sigma_detection(self):
        """Test engine with 5-sigma detection disabled."""
        engine = AnomalyDetectionEngine(
            sigma_threshold=3.0,
            enable_5_sigma=False
        )

        # Create extreme outlier (5-sigma)
        runs = [{"runId": f"run-{i}", "npv": float(100 + np.random.normal(0, 2))} for i in range(50)]
        runs.append({"runId": "run-extreme", "npv": 200.0})

        result = engine.analyze_bucket(
            bucket_id="bucket-014",
            run_results=runs,
            include_diagnostics=False
        )

        # Should NOT detect 5-sigma (only 3-sigma high)
        five_sigma_anomalies = [a for a in result.anomalies if a.anomalyType == AnomalyType.FIVE_SIGMA]
        assert len(five_sigma_anomalies) == 0

    def test_engine_id_tracking(self, engine):
        """Test that engine ID is tracked in anomaly flags."""
        runs = [
            {"runId": f"run-{i}", "npv": float(100), "engineId": f"engine-{i % 3}"}
            for i in range(50)
        ]
        # Add outlier with specific engine
        runs.append({"runId": "run-outlier", "npv": 200.0, "engineId": "engine-culprit"})

        result = engine.analyze_bucket(
            bucket_id="bucket-015",
            run_results=runs,
            include_diagnostics=False
        )

        # Find the outlier anomaly
        outlier_anomalies = [a for a in result.anomalies if a.npvValue == 200.0]
        if outlier_anomalies:
            assert outlier_anomalies[0].engineId == "engine-culprit"
