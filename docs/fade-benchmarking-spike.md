# FADE Research Spike: Benchmarking and Performance Testing Standard

**For**: FADE Repository
**Type**: Research Spike
**Created**: 2026-01-24
**Origin**: LiveCalc project - discovered need for standardized benchmarking approach

---

## Problem Statement

Benchmarking was created ad-hoc for the LiveCalc project but isn't part of FADE core. This leads to:

1. **Inconsistent approaches** - each project invents its own benchmarking
2. **No baseline management** - unclear when/how to establish baselines
3. **No progression tracking** - can't trace performance through phases (baseline → feature → spike)
4. **No CI integration pattern** - projects reinvent regression detection
5. **No comparison standards** - "is this improvement significant?" is subjective

---

## Proposed Solution: FADE Benchmarking Extension

### Core Concepts

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FADE BENCHMARK LIFECYCLE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐        │
│   │ BASELINE  │───▶│  CURRENT  │───▶│  FEATURE  │───▶│   SPIKE   │        │
│   │           │    │           │    │           │    │           │        │
│   │ Tagged    │    │ HEAD of   │    │ Feature   │    │ Experiment│        │
│   │ release   │    │ main      │    │ branch    │    │ branch    │        │
│   └───────────┘    └───────────┘    └───────────┘    └───────────┘        │
│        │                │                │                │                │
│        │    must >=     │    should >=   │    proves >    │                │
│        └────────────────┴────────────────┴────────────────┘                │
│                                                                             │
│   Regression = current < baseline (CI fails)                               │
│   Improvement = spike > current (spike validates hypothesis)               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### File Structure Convention

```
fade/
├── benchmarks/
│   ├── config.json           # Benchmark configuration
│   ├── run-benchmarks.ts     # Benchmark runner (project-specific)
│   ├── baselines/
│   │   ├── v1.0.0.json       # Tagged release baselines
│   │   └── v2.0.0.json
│   ├── results/
│   │   ├── latest.json       # Most recent run (gitignored)
│   │   └── history/          # Historical runs (optional, gitignored)
│   └── reports/
│       └── comparison.md     # Generated comparison report
```

### Benchmark Configuration Schema

```json
{
  "$schema": "https://fade.dev/schemas/benchmark-config.json",
  "version": "1.0.0",
  "targets": [
    {
      "name": "core-operation",
      "description": "Primary performance-critical operation",
      "unit": "ops/sec",
      "baseline": 10000,
      "regressionThreshold": 0.10,
      "improvementThreshold": 0.20
    }
  ],
  "environments": {
    "ci": { "iterations": 3, "warmup": 1 },
    "local": { "iterations": 5, "warmup": 2 },
    "full": { "iterations": 10, "warmup": 3 }
  }
}
```

### Benchmark Result Schema

```json
{
  "$schema": "https://fade.dev/schemas/benchmark-result.json",
  "timestamp": "2026-01-24T10:00:00Z",
  "commit": "abc123",
  "branch": "main",
  "environment": {
    "platform": "darwin",
    "cpu": "Apple M2",
    "memory": "16GB",
    "runtime": "Node.js 18.20.8"
  },
  "results": [
    {
      "target": "core-operation",
      "value": 12500,
      "unit": "ops/sec",
      "samples": [12400, 12550, 12500],
      "stdDev": 75
    }
  ],
  "comparison": {
    "baseline": "v1.0.0",
    "baselineValue": 10000,
    "delta": 0.25,
    "status": "improved"
  }
}
```

---

## Integration Points with FADE

### 1. PRD Benchmark Targets (Optional Section)

```json
{
  "id": "PRD-XXX",
  "performanceTargets": [
    {
      "metric": "projections-per-second",
      "target": 10000000,
      "baseline": 5000000,
      "rationale": "2x improvement required for cloud scaling"
    }
  ]
}
```

### 2. User Story Acceptance Criteria

```json
{
  "id": "US-001",
  "acceptanceCriteria": [
    "Feature implemented",
    "PERF: No regression >10% on core-operation benchmark",
    "PERF: Improvement >20% on target-operation benchmark"
  ]
}
```

### 3. Spike Definition of Done

```json
{
  "type": "spike",
  "definitionOfDone": [
    "Hypothesis tested",
    "Benchmark comparison report generated",
    "Recommendation documented with data"
  ]
}
```

### 4. Progress.md Performance Entries

```markdown
## 2026-01-24 - US-001: Feature Name - COMPLETE

- Feature implemented
- Performance: 12,500 ops/sec (+25% vs baseline)
- Benchmark: fade/benchmarks/results/feature-us001.json
```

---

## CI Integration Pattern

### GitHub Actions Example

```yaml
name: Benchmarks

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run benchmarks
        run: npm run benchmark -- --env=ci

      - name: Compare to baseline
        run: npm run benchmark:compare

      - name: Check for regressions
        run: |
          if grep -q '"status": "regression"' fade/benchmarks/results/latest.json; then
            echo "Performance regression detected!"
            exit 1
          fi

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const report = require('./fade/benchmarks/reports/comparison.md');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              body: report
            });
```

---

## Benchmark Runner Interface

Projects implement a runner that conforms to this interface:

```typescript
interface BenchmarkRunner {
  // Load configuration
  loadConfig(): BenchmarkConfig;

  // Run all benchmarks
  run(environment: 'ci' | 'local' | 'full'): Promise<BenchmarkResult>;

  // Compare results to baseline
  compare(result: BenchmarkResult, baseline: BenchmarkResult): ComparisonReport;

  // Generate markdown report
  generateReport(comparison: ComparisonReport): string;
}
```

FADE could provide a reference implementation or just the interface/schemas.

---

## Statistical Significance

To avoid false positives/negatives, benchmarks should consider:

1. **Multiple samples** - run each benchmark N times
2. **Warmup runs** - discard initial runs
3. **Standard deviation** - report variability
4. **Significance threshold** - don't flag noise as regression

```
Regression detected if:
  (baseline - current) / baseline > threshold
  AND
  (baseline - current) > 2 * stdDev
```

---

## Scope Options for FADE Integration

### Option A: Minimal (Conventions Only)
- Document file structure conventions
- Provide JSON schemas for config/results
- Leave implementation to projects

### Option B: Reference Implementation
- Provide TypeScript benchmark runner library
- Projects extend/customize for their needs
- Shared comparison logic

### Option C: Full Integration
- Benchmark runner as FADE core feature
- Automatic integration with progress.md
- PRD validation against benchmark results

**Recommendation**: Start with Option A, evolve to B based on adoption.

---

## Research Questions for Spike

1. Should benchmark results be tracked in git or external?
2. How to handle environment variability (CI vs local)?
3. Should FADE CLI have `fade benchmark` command?
4. How to integrate with cloud benchmarking (for distributed systems)?
5. Should there be a FADE benchmark dashboard?

---

## Next Steps

1. Review this proposal with FADE maintainers
2. Create JSON schemas for config/result formats
3. Document conventions in FADE core docs
4. Optionally build reference benchmark runner
5. Test approach on 2-3 projects before standardizing
