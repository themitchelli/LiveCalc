"""
Statistical Anomaly Detection Engine for LiveCalc.

Detects 3-sigma outliers in actuarial projection results and provides
diagnostic bundles for investigation.
"""
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum
import numpy as np
from pydantic import BaseModel, Field


logger = logging.getLogger(__name__)


class AnomalyType(str, Enum):
    """Type of anomaly detected."""
    THREE_SIGMA_HIGH = "3_sigma_high"  # NPV > mean + 3*std
    THREE_SIGMA_LOW = "3_sigma_low"    # NPV < mean - 3*std
    FIVE_SIGMA = "5_sigma"             # NPV > mean + 5*std (extreme)
    NEGATIVE_NPV_OUTLIER = "negative_npv_outlier"  # Negative when mean is positive
    ZERO_NPV = "zero_npv"              # NPV is exactly zero (potential error)


class AnomalyFlag(BaseModel):
    """Individual anomaly flag for a projection run."""
    runId: str = Field(..., description="Unique run identifier")
    bucketId: str = Field(..., description="Bucket containing this run")
    anomalyType: AnomalyType = Field(..., description="Type of anomaly detected")
    npvValue: float = Field(..., description="NPV value that triggered the flag")
    deviationFromMean: float = Field(..., description="How far from mean (in std devs)")
    bucketMean: float = Field(..., description="Bucket mean NPV")
    bucketStdDev: float = Field(..., description="Bucket standard deviation")
    threshold: float = Field(..., description="Threshold value for this anomaly type")
    engineId: Optional[str] = Field(None, description="Engine instance that calculated this result")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="When flagged")


class DiagnosticBundle(BaseModel):
    """Diagnostic information for an anomaly."""
    runId: str = Field(..., description="Run identifier")
    anomalyFlag: AnomalyFlag = Field(..., description="Anomaly flag details")
    inputSnapshot: Optional[Dict[str, Any]] = Field(None, description="Model inputs")
    intermediateBusData: Optional[Dict[str, List[float]]] = Field(
        None,
        description="Snapshots of bus:// resources"
    )
    engineMetadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Engine version, config, runtime info"
    )
    comparisonData: Optional[Dict[str, Any]] = Field(
        None,
        description="Statistical comparison to bucket peers"
    )


class BucketStatistics(BaseModel):
    """Statistical summary for a bucket of runs."""
    bucketId: str = Field(..., description="Bucket identifier")
    runCount: int = Field(..., description="Number of runs in bucket")
    mean: float = Field(..., description="Mean NPV across all runs")
    stdDev: float = Field(..., description="Standard deviation")
    min: float = Field(..., description="Minimum NPV")
    max: float = Field(..., description="Maximum NPV")
    median: float = Field(..., description="Median NPV")
    percentile25: float = Field(..., description="25th percentile")
    percentile75: float = Field(..., description="75th percentile")
    percentile95: float = Field(..., description="95th percentile")
    percentile99: float = Field(..., description="99th percentile")
    anomalyCount: int = Field(0, description="Number of anomalies detected")
    calculatedAt: datetime = Field(default_factory=datetime.utcnow)


@dataclass
class AnomalyDetectionResult:
    """Result of anomaly detection analysis."""
    bucket_statistics: BucketStatistics
    anomalies: List[AnomalyFlag]
    diagnostic_bundles: List[DiagnosticBundle]


class AnomalyDetectionEngine:
    """
    Statistical anomaly detection engine using 3-sigma rule.

    Analyzes buckets of actuarial projection runs to identify outliers
    and generate diagnostic bundles for investigation.
    """

    def __init__(
        self,
        sigma_threshold: float = 3.0,
        enable_5_sigma: bool = True,
        enable_zero_detection: bool = True,
        min_bucket_size: int = 30
    ):
        """
        Initialize anomaly detection engine.

        Args:
            sigma_threshold: Number of standard deviations for anomaly threshold (default: 3.0)
            enable_5_sigma: Flag extreme outliers at 5-sigma as well (default: True)
            enable_zero_detection: Flag zero NPV as potential errors (default: True)
            min_bucket_size: Minimum runs required for statistical validity (default: 30)
        """
        self.sigma_threshold = sigma_threshold
        self.enable_5_sigma = enable_5_sigma
        self.enable_zero_detection = enable_zero_detection
        self.min_bucket_size = min_bucket_size
        logger.info(
            f"Initialized AnomalyDetectionEngine: sigma={sigma_threshold}, "
            f"min_bucket_size={min_bucket_size}"
        )

    def analyze_bucket(
        self,
        bucket_id: str,
        run_results: List[Dict[str, Any]],
        include_diagnostics: bool = True
    ) -> AnomalyDetectionResult:
        """
        Analyze a bucket of runs for statistical anomalies.

        Args:
            bucket_id: Unique bucket identifier
            run_results: List of run result dictionaries with keys:
                - runId (str): Unique run identifier
                - npv (float): Net Present Value
                - engineId (str, optional): Engine instance ID
                - inputs (dict, optional): Model inputs for diagnostics
                - busData (dict, optional): Intermediate bus data
                - engineMetadata (dict, optional): Engine version/config
            include_diagnostics: Whether to generate diagnostic bundles (default: True)

        Returns:
            AnomalyDetectionResult with statistics, flags, and diagnostic bundles

        Raises:
            ValueError: If bucket has insufficient data for statistical analysis
        """
        if len(run_results) < self.min_bucket_size:
            raise ValueError(
                f"Bucket {bucket_id} has {len(run_results)} runs, "
                f"minimum {self.min_bucket_size} required for statistical validity"
            )

        logger.info(f"Analyzing bucket {bucket_id} with {len(run_results)} runs")

        # Extract NPV values
        npv_values = np.array([r["npv"] for r in run_results])

        # Calculate statistics
        stats = self._calculate_statistics(bucket_id, npv_values)
        logger.info(
            f"Bucket {bucket_id} statistics: mean={stats.mean:.2f}, "
            f"std={stats.stdDev:.2f}, min={stats.min:.2f}, max={stats.max:.2f}"
        )

        # Detect anomalies
        anomalies = self._detect_anomalies(
            bucket_id=bucket_id,
            run_results=run_results,
            npv_values=npv_values,
            mean=stats.mean,
            std_dev=stats.stdDev
        )

        # Update anomaly count in stats
        stats.anomalyCount = len(anomalies)

        # Generate diagnostic bundles if requested
        diagnostic_bundles = []
        if include_diagnostics and anomalies:
            diagnostic_bundles = self._generate_diagnostic_bundles(
                run_results=run_results,
                anomalies=anomalies,
                bucket_stats=stats
            )

        logger.info(
            f"Bucket {bucket_id} analysis complete: {len(anomalies)} anomalies detected"
        )

        return AnomalyDetectionResult(
            bucket_statistics=stats,
            anomalies=anomalies,
            diagnostic_bundles=diagnostic_bundles
        )

    def _calculate_statistics(
        self,
        bucket_id: str,
        npv_values: np.ndarray
    ) -> BucketStatistics:
        """Calculate statistical summary for bucket."""
        return BucketStatistics(
            bucketId=bucket_id,
            runCount=len(npv_values),
            mean=float(np.mean(npv_values)),
            stdDev=float(np.std(npv_values, ddof=1)),  # Sample std dev
            min=float(np.min(npv_values)),
            max=float(np.max(npv_values)),
            median=float(np.median(npv_values)),
            percentile25=float(np.percentile(npv_values, 25)),
            percentile75=float(np.percentile(npv_values, 75)),
            percentile95=float(np.percentile(npv_values, 95)),
            percentile99=float(np.percentile(npv_values, 99))
        )

    def _detect_anomalies(
        self,
        bucket_id: str,
        run_results: List[Dict[str, Any]],
        npv_values: np.ndarray,
        mean: float,
        std_dev: float
    ) -> List[AnomalyFlag]:
        """Detect statistical anomalies in run results."""
        anomalies = []

        # Calculate thresholds
        upper_3sigma = mean + (self.sigma_threshold * std_dev)
        lower_3sigma = mean - (self.sigma_threshold * std_dev)
        upper_5sigma = mean + (5.0 * std_dev) if self.enable_5_sigma else None

        for i, npv in enumerate(npv_values):
            run_result = run_results[i]
            run_id = run_result["runId"]
            engine_id = run_result.get("engineId")

            # Calculate deviation in standard deviations
            deviation = (npv - mean) / std_dev if std_dev > 0 else 0

            # Check for anomalies (multiple checks in order of severity)

            # 5-sigma extreme outlier
            if self.enable_5_sigma and upper_5sigma is not None and npv > upper_5sigma:
                anomalies.append(AnomalyFlag(
                    runId=run_id,
                    bucketId=bucket_id,
                    anomalyType=AnomalyType.FIVE_SIGMA,
                    npvValue=npv,
                    deviationFromMean=deviation,
                    bucketMean=mean,
                    bucketStdDev=std_dev,
                    threshold=upper_5sigma,
                    engineId=engine_id
                ))
                continue  # Don't flag as 3-sigma as well

            # 3-sigma high outlier
            if npv > upper_3sigma:
                anomalies.append(AnomalyFlag(
                    runId=run_id,
                    bucketId=bucket_id,
                    anomalyType=AnomalyType.THREE_SIGMA_HIGH,
                    npvValue=npv,
                    deviationFromMean=deviation,
                    bucketMean=mean,
                    bucketStdDev=std_dev,
                    threshold=upper_3sigma,
                    engineId=engine_id
                ))

            # 3-sigma low outlier
            elif npv < lower_3sigma:
                anomalies.append(AnomalyFlag(
                    runId=run_id,
                    bucketId=bucket_id,
                    anomalyType=AnomalyType.THREE_SIGMA_LOW,
                    npvValue=npv,
                    deviationFromMean=deviation,
                    bucketMean=mean,
                    bucketStdDev=std_dev,
                    threshold=lower_3sigma,
                    engineId=engine_id
                ))

            # Negative NPV when mean is positive (unusual for insurance)
            elif mean > 0 and npv < 0:
                anomalies.append(AnomalyFlag(
                    runId=run_id,
                    bucketId=bucket_id,
                    anomalyType=AnomalyType.NEGATIVE_NPV_OUTLIER,
                    npvValue=npv,
                    deviationFromMean=deviation,
                    bucketMean=mean,
                    bucketStdDev=std_dev,
                    threshold=0.0,
                    engineId=engine_id
                ))

            # Zero NPV (potential calculation error)
            elif self.enable_zero_detection and npv == 0.0:
                anomalies.append(AnomalyFlag(
                    runId=run_id,
                    bucketId=bucket_id,
                    anomalyType=AnomalyType.ZERO_NPV,
                    npvValue=npv,
                    deviationFromMean=deviation,
                    bucketMean=mean,
                    bucketStdDev=std_dev,
                    threshold=0.0,
                    engineId=engine_id
                ))

        return anomalies

    def _generate_diagnostic_bundles(
        self,
        run_results: List[Dict[str, Any]],
        anomalies: List[AnomalyFlag],
        bucket_stats: BucketStatistics
    ) -> List[DiagnosticBundle]:
        """Generate diagnostic bundles for anomalies."""
        # Create lookup map for run results
        run_map = {r["runId"]: r for r in run_results}

        bundles = []
        for anomaly in anomalies:
            run_result = run_map.get(anomaly.runId)
            if not run_result:
                logger.warning(f"No run data found for anomaly {anomaly.runId}")
                continue

            # Build comparison data
            comparison_data = {
                "percentile_rank": self._calculate_percentile_rank(
                    anomaly.npvValue, bucket_stats
                ),
                "z_score": anomaly.deviationFromMean,
                "iqr_position": self._calculate_iqr_position(
                    anomaly.npvValue, bucket_stats
                )
            }

            bundle = DiagnosticBundle(
                runId=anomaly.runId,
                anomalyFlag=anomaly,
                inputSnapshot=run_result.get("inputs"),
                intermediateBusData=run_result.get("busData"),
                engineMetadata=run_result.get("engineMetadata"),
                comparisonData=comparison_data
            )
            bundles.append(bundle)

        return bundles

    def _calculate_percentile_rank(
        self,
        value: float,
        stats: BucketStatistics
    ) -> float:
        """
        Estimate percentile rank of a value (0-100).

        Uses interpolation between known percentiles for estimation.
        """
        if value <= stats.min:
            return 0.0
        if value >= stats.max:
            return 100.0
        if value == stats.median:
            return 50.0

        # Interpolate between known percentiles
        if value < stats.percentile25:
            # Between min and p25
            return 25.0 * (value - stats.min) / (stats.percentile25 - stats.min)
        elif value < stats.median:
            # Between p25 and p50
            return 25.0 + 25.0 * (value - stats.percentile25) / (stats.median - stats.percentile25)
        elif value < stats.percentile75:
            # Between p50 and p75
            return 50.0 + 25.0 * (value - stats.median) / (stats.percentile75 - stats.median)
        elif value < stats.percentile95:
            # Between p75 and p95
            return 75.0 + 20.0 * (value - stats.percentile75) / (stats.percentile95 - stats.percentile75)
        else:
            # Between p95 and max
            return 95.0 + 5.0 * (value - stats.percentile95) / (stats.max - stats.percentile95)

    def _calculate_iqr_position(
        self,
        value: float,
        stats: BucketStatistics
    ) -> str:
        """
        Determine position relative to IQR (Interquartile Range).

        Returns: "within_iqr", "below_iqr", "above_iqr", "far_below_iqr", "far_above_iqr"
        """
        iqr = stats.percentile75 - stats.percentile25
        lower_fence = stats.percentile25 - (1.5 * iqr)
        upper_fence = stats.percentile75 + (1.5 * iqr)

        if value < lower_fence:
            return "far_below_iqr"
        elif value < stats.percentile25:
            return "below_iqr"
        elif value <= stats.percentile75:
            return "within_iqr"
        elif value <= upper_fence:
            return "above_iqr"
        else:
            return "far_above_iqr"
