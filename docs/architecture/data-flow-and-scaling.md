# LiveCalc Data Flow and Scaling Architecture

This document describes how data flows through the LiveCalc system across different deployment scenarios, with particular focus on memory management and scaling to large datasets.

## Overview

LiveCalc supports a tiered execution model:

| Dataset Size | Execution Location | Strategy |
|--------------|-------------------|----------|
| < 10GB | Local (VS Code / Browser) | WASM + Web Workers |
| > 10GB | Cloud (Azure Batch) | Distributed chunked processing |

The key architectural principle is that **users never need to load full datasets into browser memory**. A user with 8GB of available RAM can work with 50GB+ datasets because only sample data and results summaries are transferred to the client.

---

## Scenario 1: Local File on User's Machine

When policy data exists as a local file (e.g., `policies.csv` on the user's laptop):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER'S MACHINE (16GB RAM, 10GB available)          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────────┐  │
│  │ LOCAL DISK   │    │   MEMORY     │    │      VS CODE / BROWSER       │  │
│  │              │    │   (10GB)     │    │                              │  │
│  │ policies.csv │    │              │    │  ┌────────────────────────┐  │  │
│  │ (2GB file)   │───▶│ Sample 10K   │───▶│  │  WASM Engine           │  │  │
│  │              │    │ (~3MB)       │    │  │  - Runs preview        │  │  │
│  │ assumptions/ │    │              │    │  │  - 10K policies max    │  │  │
│  │ (few KB)     │───▶│ Full load    │───▶│  │                        │  │  │
│  │              │    │ (~50KB)      │    │  └────────────────────────┘  │  │
│  │ results/     │◀───│              │◀───│                              │  │
│  │ cache (MB)   │    │ Results only │    │  Results: mean, std, P95    │  │
│  │              │    │ (~1MB)       │    │  (NOT 2M rows of output)    │  │
│  └──────────────┘    └──────────────┘    └──────────────────────────────┘  │
│         │                                              │                    │
│         │ Stream upload (4MB chunks)                   │ Job submit         │
│         ▼                                              ▼                    │
└─────────────────────────────────────────────────────────────────────────────┘
          │                                              │
          │                    NETWORK                   │
          ▼                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AZURE CLOUD                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐         ┌─────────────────────────────────────────┐  │
│  │  BLOB STORAGE    │         │         AZURE BATCH / AKS               │  │
│  │                  │         │                                         │  │
│  │  policies.csv    │────────▶│  Worker 1: policies[0..500K]            │  │
│  │  (2GB - 50GB)    │────────▶│  Worker 2: policies[500K..1M]           │  │
│  │                  │────────▶│  Worker 3: policies[1M..1.5M]           │  │
│  │  Never in user's │────────▶│  Worker 4: policies[1.5M..2M]           │  │
│  │  browser memory! │         │                                         │  │
│  │                  │         │  Each worker: same WASM binary          │  │
│  └──────────────────┘         │  Memory per worker: ~500MB              │  │
│                               │                                         │  │
│                               └──────────────┬──────────────────────────┘  │
│                                              │                              │
│                                              ▼                              │
│                               ┌──────────────────────────────┐             │
│                               │  AGGREGATOR                  │             │
│                               │  - Merge chunk statistics    │             │
│                               │  - mean, std, percentiles    │             │
│                               │  - Output: ~1KB JSON         │             │
│                               └──────────────────────────────┘             │
│                                              │                              │
└──────────────────────────────────────────────┼──────────────────────────────┘
                                               │
                                               ▼ Results (~1KB - 1MB)
                                         Back to user
```

### Memory Budget (Local File Scenario)

| Data Type | Size | Where it Lives | In Browser Memory? |
|-----------|------|----------------|-------------------|
| Policy file (2M rows) | 2GB | Local disk → Blob storage | Never loaded fully |
| Policy sample (10K) | ~3MB | Browser memory | For preview only |
| Assumptions (all) | ~50KB | Browser memory | Always |
| WASM engine | ~5MB | Browser memory | Always |
| Results (summary) | ~1KB | Browser memory | Always |
| Results (full distribution) | ~8MB | Local disk cache | Streamed if needed |
| VS Code / Browser overhead | ~500MB | Browser memory | Always |

**Total browser memory for 2M policy job: ~510MB** (not 2GB)

---

## Scenario 2: Cloud-Native Data (Recommended for Enterprise)

When policy data already lives in cloud storage (Azure Blob, Data Lake, or database):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER'S MACHINE (10GB available)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────────┐  │
│  │ LOCAL DISK   │    │   MEMORY     │    │      VS CODE / BROWSER       │  │
│  │              │    │              │    │                              │  │
│  │ (nothing)    │    │ Sample 10K   │◀───│  GET /sample?n=10000         │  │
│  │              │    │ (~3MB)       │    │                              │  │
│  │ assumptions/ │    │              │    │  Assumptions loaded from     │  │
│  │ (local edits)│───▶│ Full load    │───▶│  Assumptions Manager API     │  │
│  │              │    │ (~50KB)      │    │                              │  │
│  │ results/     │◀───│              │◀───│  Results: summary only       │  │
│  │ cache        │    │ Results      │    │                              │  │
│  └──────────────┘    └──────────────┘    └──────────────────────────────┘  │
│                                                    │                        │
│                                                    │ API calls only         │
│                                                    │ (no file upload)       │
└────────────────────────────────────────────────────┼────────────────────────┘
                                                     │
                                                     │ NETWORK
                                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AZURE CLOUD                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                       │
│  │  DATA LAKE /     │◀─────────────────────────────────────────────────┐   │
│  │  BLOB STORAGE    │                                                   │   │
│  │                  │         ┌─────────────────────────────────────┐   │   │
│  │  policies/       │────────▶│         DATA API SERVICE            │   │   │
│  │   2026-Q1.parquet│         │                                     │   │   │
│  │   (2GB)          │         │  GET /policies/metadata             │───┘   │
│  │                  │         │  → {rows: 2M, size: 2GB, cols: [...]}      │
│  │  Source of truth │         │                                     │       │
│  │  (never moves)   │         │  GET /policies/sample?n=10000       │───────┤
│  │                  │         │  → [10K random policies, ~3MB]      │       │
│  └──────────────────┘         │                                     │       │
│          │                    │  GET /policies/schema               │       │
│          │                    │  → {columns, types, validation}     │       │
│          │                    │                                     │       │
│          │                    └─────────────────────────────────────┘       │
│          │                                                                   │
│          │ Direct read (no copy)                                            │
│          ▼                                                                   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         AZURE BATCH                                    │  │
│  │                                                                        │  │
│  │   Reads directly from blob - data never leaves Azure                  │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Impact: Local File vs Cloud-Native Data

| Aspect | Local File | Cloud-Native Data |
|--------|------------|-------------------|
| Upload | Stream 2GB to blob | Not needed - already there |
| Preview sample | Read first 10K from local file | API call: `GET /sample?n=10000` |
| Metadata | `fs.stat()` + count lines | API call: `GET /metadata` |
| Full run trigger | Upload → Submit job | Submit job with data reference |
| Data movement | User → Blob → Batch | Blob → Batch (no user hop) |
| Network cost | Upload 2GB | Download 3MB sample only |
| Latency | Upload time (minutes) | API call (milliseconds) |

### Memory Budget (Cloud-Native Scenario)

| Data Type | Size | In Browser? | Notes |
|-----------|------|-------------|-------|
| Policy sample | ~3MB | Yes | Downloaded via API |
| Full policy data | 2GB+ | No | Never leaves cloud |
| Assumptions | ~50KB | Yes | Edited locally, synced to cloud |
| Results summary | ~1KB | Yes | Downloaded via API |
| Results detail | ~8MB+ | No | Stays in cloud, query on demand |

**Total browser memory: ~4MB** regardless of dataset size.

---

## Data Reference Model

To support both local files and cloud-native data, the system uses a unified data reference model:

```typescript
interface PolicySource {
  type: 'local' | 'blob' | 'dataLake' | 'database';
  uri: string;         // Path or cloud URI
  version?: string;    // For immutable/versioned datasets
  filter?: string;     // Optional: SQL-like filter expression
}

// Examples:
// Local file
{ type: 'local', uri: '/Users/steve/policies.csv' }

// Azure Blob
{ type: 'blob', uri: 'azure://livecalc/policies/2026-Q1.parquet' }

// Data Lake with version
{ type: 'dataLake', uri: 'adl://company/actuarial/policies', version: '2026-01-15' }

// Database with filter
{ type: 'database', uri: 'sqlserver://prod/policies', filter: "region = 'UK'" }
```

---

## Data API Service

For cloud-native data, a Data API Service provides controlled access to datasets:

```
┌─────────────────────────────────────────────────────────────────┐
│                     DATA API SERVICE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GET  /datasets                    → List available datasets    │
│  GET  /datasets/{id}/metadata      → Row count, size, schema    │
│  GET  /datasets/{id}/sample?n=N    → Random N rows for preview  │
│  GET  /datasets/{id}/schema        → Column definitions         │
│  POST /datasets/{id}/validate      → Check assumptions match    │
│                                                                 │
│  Authentication: Same JWT as Assumptions Manager                │
│  Caching: Sample cached for 5 mins (same seed = same sample)   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Sample Endpoint Specification

```
GET /datasets/{id}/sample?n=10000&seed=42

Response:
{
  "datasetId": "policies-2026-q1",
  "totalRows": 2000000,
  "sampleSize": 10000,
  "seed": 42,
  "data": [
    { "policy_id": 1234, "age": 45, "term": 20, ... },
    ...
  ]
}
```

**Key features:**
- `seed` parameter ensures reproducible samples for debugging
- Server-side random sampling (no need to download full dataset)
- Response size ~3MB for 10K policies regardless of full dataset size

---

## Scaling to 50GB+ Datasets

For datasets exceeding 10GB, the system uses Azure Batch for distributed processing:

```
50GB dataset processing:

┌─────────────────────────────────────────────────────────────────────────────┐
│                              AZURE BATCH                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   50GB ÷ 100 chunks = 500MB per chunk                                      │
│                                                                             │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐       ┌─────────┐                  │
│   │ Task 1  │  │ Task 2  │  │ Task 3  │  ...  │ Task 100│                  │
│   │ 500MB   │  │ 500MB   │  │ 500MB   │       │ 500MB   │                  │
│   │ WASM    │  │ WASM    │  │ WASM    │       │ WASM    │                  │
│   └────┬────┘  └────┬────┘  └────┬────┘       └────┬────┘                  │
│        │            │            │                  │                       │
│        └────────────┴────────────┴──────────────────┘                       │
│                              │                                              │
│                              ▼                                              │
│                    ┌─────────────────┐                                      │
│                    │   AGGREGATOR    │                                      │
│                    │                 │                                      │
│                    │  Merge stats:   │                                      │
│                    │  - Welford's    │                                      │
│                    │    algorithm    │                                      │
│                    │  - Parallel     │                                      │
│                    │    percentiles  │                                      │
│                    │                 │                                      │
│                    └─────────────────┘                                      │
│                              │                                              │
│                              ▼                                              │
│                       Final Results                                         │
│                       (~1KB JSON)                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Aggregation Strategy

Statistics must be computed in a way that allows merging from distributed chunks:

| Statistic | Aggregation Method |
|-----------|-------------------|
| Mean | Weighted average of chunk means |
| Variance | Welford's online algorithm (parallel variant) |
| Percentiles | t-digest or GK sketch (approximate, mergeable) |
| CTE (Conditional Tail Expectation) | Collect tail values from all chunks |

### WASM Memory Considerations

Each Batch task runs the same WASM binary with these constraints:

- **WASM memory limit**: 4GB (configurable up to 16GB with 64-bit WASM)
- **Chunk size**: 500MB - 2GB per task (well within limit)
- **Worker count**: Scales based on dataset size and urgency

---

## User Experience Flow

### Hybrid Workflow: Preview + Full Run

```
1. User opens project referencing 2M policy dataset (cloud or local)
2. Extension reads metadata: "2M policies, 2.3GB"
3. Extension recommends: "Preview locally (10K sample), Full run in cloud"
4. User edits assumptions (always in memory, ~50KB)
5. Auto-preview on save: 10K sample runs locally (~3 seconds)
6. Results panel shows: "Preview: Mean £1.21M (±2%, 10K sample)"
7. User clicks "Full Run" → job submitted to cloud
8. Progress: "Processing... 67% (1.34M / 2M policies)"
9. Results: Full statistics displayed alongside preview
10. Comparison: "Preview was within 1.9% of full run"
```

### Memory Timeline

```
                    Local Preview              Cloud Full Run
                         │                           │
Memory                   │                           │
  │                      │                           │
4MB ─────────────────────┼───────────────────────────┼─────────────
  │    ┌────┐            │                           │
3MB    │    │ Sample     │                           │
  │    │    │ loaded     │                           │
2MB    │    │            │                           │
  │    │    └────────────┼───────────────────────────┼─────────────
1MB ───┴─────────────────┴───────────────────────────┴─────────────
  │    Baseline (WASM + assumptions)
0  ────────────────────────────────────────────────────────────────▶
                                                              Time

Note: Memory stays flat during cloud run - no data loaded locally
```

---

## Architecture Compatibility

### What Works Today

| Aspect | Status | Notes |
|--------|--------|-------|
| Result aggregation | Compatible | Statistics computed per-chunk, mergeable |
| WASM binary portability | Compatible | Same binary works in browser and Wasmtime |
| SharedArrayBuffer | Compatible | Zero-copy for multi-worker local execution |
| Streaming upload | Compatible | 4MB chunked uploads implemented |

### Gaps to Address

| Gap | Current State | Required Change |
|-----|---------------|-----------------|
| Data source abstraction | Assumes local file path | Support blob/database URIs |
| Server-side sampling | Client must load sample | Add `/sample` API endpoint |
| Metadata without loading | Must read file to count rows | Add `/metadata` API endpoint |
| Dataset browser | File picker only | UI to browse cloud datasets |
| Version tracking | None | Track which data version was used |

---

## Related PRDs

- **PRD-LC-002**: WASM Compilation and Threading (local execution)
- **PRD-LC-008**: AKS WASM Runtime Service (cloud execution)
- **PRD-LC-009**: Cloud Job Integration (VS Code ↔ cloud)

---

## Appendix: Memory Estimation Formula

```typescript
// For local preview (correct)
const previewMemory = Math.min(policies, sampleSize) * 200 + scenarios * 8;

// Example: 2M policies, 10K sample, 1K scenarios
// previewMemory = 10,000 * 200 + 1,000 * 8 = 2.008 MB

// For cloud job (does not impact client memory)
// Client only receives summary results (~1KB - 1MB)
```
