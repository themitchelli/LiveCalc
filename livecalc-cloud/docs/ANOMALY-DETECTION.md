# Statistical Anomaly Detection Engine

## Overview

The LiveCalc Statistical Anomaly Detection Engine automatically identifies outlier projections in actuarial model runs using the 3-sigma rule and provides diagnostic bundles for investigation.

This feature is essential for validating million-run batches where manual inspection is impractical. By automatically flagging suspicious projections, validators can focus their audit efforts on the most critical cases.

---

## Key Features

- **3-Sigma Rule**: Flags runs where NPV exceeds mean ± 3 standard deviations
- **5-Sigma Detection**: Identifies extreme outliers (> 5 std devs) separately
- **Zero NPV Detection**: Flags zero NPV values as potential calculation errors
- **Negative NPV Outliers**: Detects negative NPV when bucket mean is positive
- **Diagnostic Bundles**: Captures input snapshots, bus data, and engine metadata for anomalies
- **Engine Culprit Identification**: Tracks which engine instance calculated each anomalous result
- **Statistical Comparison**: Provides percentile rank, z-score, and IQR position for each anomaly

---

## API Endpoints

### POST /v1/platform/anomalies/analyze

Analyze a bucket of projection runs for statistical anomalies.

**Request Body:**
```json
{
  "bucket_id": "bucket-2026-Q1-001",
  "run_results": [
    {
      "runId": "run-001",
      "npv": 102345.67,
      "engineId": "engine-worker-03",
      "inputs": {
        "policy_count": 10000,
        "scenario_count": 1000
      },
      "busData": {
        "bus://results/npv": [102345.67]
      },
      "engineMetadata": {
        "version": "1.2.0",
        "simd": true
      }
    }
  ],
  "include_diagnostics": true,
  "sigma_threshold": 3.0
}
```

**Response:**
```json
{
  "bucket_statistics": {
    "bucketId": "bucket-2026-Q1-001",
    "runCount": 1000,
    "mean": 100000.0,
    "stdDev": 10000.0,
    "min": 75000.0,
    "max": 125000.0,
    "median": 99800.0,
    "percentile25": 93500.0,
    "percentile75": 106200.0,
    "percentile95": 116000.0,
    "percentile99": 120000.0,
    "anomalyCount": 5,
    "calculatedAt": "2026-01-25T10:30:00Z"
  },
  "anomalies": [
    {
      "runId": "run-789",
      "bucketId": "bucket-2026-Q1-001",
      "anomalyType": "3_sigma_high",
      "npvValue": 145000.0,
      "deviationFromMean": 4.5,
      "bucketMean": 100000.0,
      "bucketStdDev": 10000.0,
      "threshold": 130000.0,
      "engineId": "engine-worker-07",
      "timestamp": "2026-01-25T10:30:05Z"
    }
  ],
  "diagnostic_bundles": [
    {
      "runId": "run-789",
      "anomalyFlag": { /* anomaly details */ },
      "inputSnapshot": {
        "policy_count": 10000,
        "scenario_count": 1000
      },
      "intermediateBusData": {
        "bus://results/npv": [145000.0]
      },
      "engineMetadata": {
        "version": "1.2.0",
        "simd": true
      },
      "comparisonData": {
        "percentile_rank": 98.5,
        "z_score": 4.5,
        "iqr_position": "far_above_iqr"
      }
    }
  ]
}
```

---

## Anomaly Types

| Type | Description | Threshold |
|------|-------------|-----------|
| `3_sigma_high` | NPV > mean + 3σ | Upper 3-sigma bound |
| `3_sigma_low` | NPV < mean - 3σ | Lower 3-sigma bound |
| `5_sigma` | NPV > mean + 5σ | Upper 5-sigma bound (extreme) |
| `negative_npv_outlier` | NPV < 0 when mean > 0 | Zero |
| `zero_npv` | NPV == 0.0 | Zero (potential error) |

---

## Configuration

### Engine Parameters

```python
from services.anomaly_detection import AnomalyDetectionEngine

engine = AnomalyDetectionEngine(
    sigma_threshold=3.0,        # Sigma threshold (2.0-5.0)
    enable_5_sigma=True,        # Flag extreme outliers separately
    enable_zero_detection=True, # Flag zero NPV as errors
    min_bucket_size=30          # Minimum runs for statistical validity
)
```

### API Request Parameters

- **sigma_threshold** (float, 2.0-5.0): Number of standard deviations for anomaly threshold
- **include_diagnostics** (bool): Whether to generate diagnostic bundles
- **bucket_id** (str): Unique bucket identifier
- **run_results** (list): Array of run result objects

---

## Statistical Methodology

### 3-Sigma Rule

The engine uses the empirical rule (68-95-99.7 rule) from normal distribution theory:

- **±1σ**: ~68% of values (normal)
- **±2σ**: ~95% of values (normal)
- **±3σ**: ~99.7% of values (normal)
- **>3σ**: ~0.3% of values (anomaly)

For a bucket of 1,000 runs, expect approximately 3 anomalies under normal distribution.

### Sample Standard Deviation

Uses Bessel's correction (n-1 denominator) for unbiased population estimate:

```
σ = √(Σ(x - μ)² / (n - 1))
```

### Percentile Rank Estimation

Interpolates between known percentiles (P25, P50, P75, P95, P99) to estimate rank.

### IQR Position

Uses Tukey's fences to categorize values relative to interquartile range:

- **Within IQR**: P25 ≤ value ≤ P75
- **Below IQR**: value < P25
- **Above IQR**: value > P75
- **Far Below**: value < P25 - 1.5×IQR
- **Far Above**: value > P75 + 1.5×IQR

---

## Usage Examples

### Basic Bucket Analysis

```python
from services.anomaly_detection import AnomalyDetectionEngine

engine = AnomalyDetectionEngine()

run_results = [
    {"runId": f"run-{i}", "npv": npv_value}
    for i, npv_value in enumerate(npv_values)
]

result = engine.analyze_bucket(
    bucket_id="bucket-001",
    run_results=run_results,
    include_diagnostics=True
)

print(f"Detected {len(result.anomalies)} anomalies")
print(f"Mean NPV: {result.bucket_statistics.mean}")
print(f"Std Dev: {result.bucket_statistics.stdDev}")
```

### Custom Sigma Threshold

```python
# More sensitive detection (2.5 sigma)
engine = AnomalyDetectionEngine(sigma_threshold=2.5)

# More conservative detection (4.0 sigma)
engine = AnomalyDetectionEngine(sigma_threshold=4.0)
```

### Filtering Anomalies by Type

```python
result = engine.analyze_bucket(...)

# Get only 5-sigma extreme outliers
extreme_anomalies = [
    a for a in result.anomalies
    if a.anomalyType == AnomalyType.FIVE_SIGMA
]

# Get zero NPV errors
zero_errors = [
    a for a in result.anomalies
    if a.anomalyType == AnomalyType.ZERO_NPV
]
```

### Engine Culprit Analysis

```python
from collections import Counter

result = engine.analyze_bucket(...)

# Count anomalies by engine
engine_counts = Counter(a.engineId for a in result.anomalies)

print("Anomalies by engine:")
for engine_id, count in engine_counts.most_common():
    print(f"  {engine_id}: {count} anomalies")
```

---

## Integration with Job Pipeline

The anomaly detection engine integrates with the job execution pipeline:

1. **Post-Run Analysis**: After a bucket of jobs completes, run anomaly detection
2. **Automatic Flagging**: Anomalies are flagged in job metadata
3. **Diagnostic Storage**: Diagnostic bundles stored in Azure Blob Storage
4. **Alert Notifications**: High-severity anomalies trigger notifications
5. **Audit Trail**: All anomaly detections logged for compliance

```python
# Example post-run workflow
async def post_run_analysis(bucket_id: str, job_results: List[Dict]):
    """Analyze bucket after all jobs complete."""

    # Run anomaly detection
    result = engine.analyze_bucket(
        bucket_id=bucket_id,
        run_results=job_results,
        include_diagnostics=True
    )

    # Store diagnostic bundles
    for bundle in result.diagnostic_bundles:
        await store_diagnostic_bundle(bucket_id, bundle)

    # Flag high-severity anomalies
    extreme_anomalies = [
        a for a in result.anomalies
        if a.anomalyType == AnomalyType.FIVE_SIGMA
    ]

    if extreme_anomalies:
        await notify_validators(bucket_id, extreme_anomalies)

    return result
```

---

## Performance Considerations

### Computational Complexity

- **Time**: O(n) for statistics calculation, O(n) for anomaly detection
- **Space**: O(n) for storing run results, O(k) for anomalies (k << n)

### Scalability

| Bucket Size | Analysis Time | Memory Usage |
|-------------|---------------|--------------|
| 100 runs | <10ms | <1MB |
| 1,000 runs | <50ms | <5MB |
| 10,000 runs | <500ms | <50MB |
| 100,000 runs | <5s | <500MB |

### Optimization Tips

1. **Disable diagnostics** for large buckets if not needed (`include_diagnostics=false`)
2. **Batch processing**: Analyze buckets in parallel for throughput
3. **Sampling**: For validation, analyze representative sample instead of full bucket
4. **Caching**: Cache bucket statistics for repeated queries

---

## Testing

### Unit Tests

```bash
cd livecalc-cloud/api
pytest tests/test_anomaly_detection.py -v
```

**Test Coverage:**
- 3-sigma high/low outlier detection
- 5-sigma extreme outlier detection
- Zero NPV detection
- Negative NPV outlier detection
- Diagnostic bundle generation
- Statistical calculations
- IQR and percentile rank estimation
- Custom threshold configuration

### Integration Tests

```bash
pytest tests/test_anomaly_api.py -v
```

**Test Coverage:**
- API endpoint validation
- Request/response format
- Error handling
- Authentication
- Large bucket performance
- Engine culprit tracking

---

## Future Enhancements

- **Persistent Storage**: Store diagnostic bundles in database for retrieval
- **Anomaly Trends**: Track anomaly rates over time
- **Multi-Metric Analysis**: Analyze other metrics beyond NPV (reserves, profits, etc.)
- **Machine Learning**: Use ML models to detect non-Gaussian anomalies
- **Real-Time Detection**: Stream anomaly detection during job execution
- **Comparative Analysis**: Compare anomalies across buckets/versions

---

## References

- [3-Sigma Rule (Wikipedia)](https://en.wikipedia.org/wiki/68%E2%80%9395%E2%80%9399.7_rule)
- [Tukey's Fences (Wikipedia)](https://en.wikipedia.org/wiki/Outlier#Tukey's_fences)
- [Percentile Rank](https://en.wikipedia.org/wiki/Percentile_rank)
- PRD-LC-013 US-PLAT-03: Statistical Anomaly Engine specification
