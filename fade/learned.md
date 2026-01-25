<!-- FADE learned.md v0.3.1 -->

# Learned

Discoveries and insights from development sessions. Append-only.

<!--
Entry format (append new entries below the line):

## YYYY-MM-DD - Discovery Title
**Source:** PRD-ID US-XXX

- **What:** Brief description of the discovery
- **Why it matters:** How this helps future work

Only add learnings that are:
- Reusable (not story-specific details)
- Non-obvious (things a future session wouldn't know)
- Actionable (helps avoid mistakes or speeds up work)
-->

---

## 2026-01-23 - Policy struct alignment vs serialization size
**Source:** PRD-LC-001 US-001

- **What:** sizeof(Policy) is 32 bytes due to struct alignment/padding on 64-bit systems, but serialized binary format is only 24 bytes
- **Why it matters:** When calculating memory requirements or serialization sizes, use the appropriate measure. In-memory calculations need sizeof(), binary file sizes need serialized_size()

## 2026-01-23 - CMake needs to be installed separately on macOS
**Source:** PRD-LC-001 US-001

- **What:** macOS with Xcode Command Line Tools has clang++ but not cmake. Use `brew install cmake` to add it.
- **Why it matters:** Don't assume cmake is available; check and install via Homebrew if needed for C++ projects

## 2026-01-23 - Probability-based rates need upper bound capping
**Source:** PRD-LC-001 US-002

- **What:** When applying multipliers to mortality/lapse rates, cap results at 1.0 since probabilities can't exceed 100%
- **Why it matters:** Stress testing with multipliers (e.g., 2x mortality on 80% base rate) would otherwise produce invalid probabilities >1.0

## 2026-01-23 - GBM discretization for interest rate simulation
**Source:** PRD-LC-001 US-003

- **What:** For Geometric Brownian Motion with annual time steps: S(t+1) = S(t) * exp((mu - 0.5*sigma^2) + sigma*Z) where Z~N(0,1)
- **Why it matters:** The -0.5*sigma^2 drift correction is necessary for the discrete approximation to preserve the expected drift; omitting it leads to upward bias

## 2026-01-23 - CSV format detection using column names
**Source:** PRD-LC-001 US-003

- **What:** When loading CSVs that support multiple formats (wide vs long), checking specific column names (e.g., "year") in the header is more robust than relying on column count alone
- **Why it matters:** Enables flexible data input without requiring users to specify format explicitly

## 2026-01-23 - Decrement ordering in actuarial projections
**Source:** PRD-LC-001 US-004

- **What:** In multi-decrement projection models, apply decrements sequentially: (1) deaths during the year, (2) lapses applied to survivors. Lapses can't occur on people who died.
- **Why it matters:** Applying decrements in the wrong order or simultaneously (e.g., lapse on full lives_boy) overstates decrements and produces incorrect cash flows

## 2026-01-23 - Discount factor timing convention
**Source:** PRD-LC-001 US-004

- **What:** When discounting cash flows, be explicit about timing: EOY (end of year) discounting applies the full year's discount factor to that year's cash flow. The cumulative discount factor for year n is the product 1/(1+r_1) × 1/(1+r_2) × ... × 1/(1+r_n)
- **Why it matters:** Different timing conventions (BOY, mid-year, EOY) produce different NPVs. EOY is simplest but may understate NPV for products with BOY premium collection

## 2026-01-23 - Emscripten ES6 modules require .mjs extension for Node.js
**Source:** PRD-LC-002 US-001

- **What:** When building with MODULARIZE=1 and EXPORT_ES6=1, the output JS file must have .mjs extension for Node.js to import it correctly without "Cannot use 'import.meta' outside a module" errors
- **Why it matters:** Using .js extension causes Node.js to treat it as CommonJS, but ES6 features like import.meta fail. Set CMake SUFFIX to ".mjs" for proper ES6 module support

## 2026-01-23 - uint64_t parameters require BigInt in JavaScript
**Source:** PRD-LC-002 US-001

- **What:** WASM functions with uint64_t parameters (like the seed in run_valuation) require BigInt in JavaScript: `Module._run_valuation(100, BigInt(42), ...)`
- **Why it matters:** Passing a regular number to a uint64_t parameter causes "Cannot convert X to a BigInt" error. Document this in API usage examples

## 2026-01-23 - Emscripten exceptions vs -fno-exceptions
**Source:** PRD-LC-002 US-001

- **What:** If C++ code uses try/catch or throw, cannot use -fno-exceptions flag in Emscripten. The core library uses exceptions for error handling (out of range, file not found, etc.)
- **Why it matters:** Build will fail with "cannot use 'throw' with exceptions disabled" if -fno-exceptions is used on code that throws. Either refactor to return error codes or remove the flag

## 2026-01-23 - SharedArrayBuffer requires crossOriginIsolated headers
**Source:** PRD-LC-002 US-004

- **What:** In browsers, SharedArrayBuffer is only available when the page is cross-origin isolated. This requires setting two HTTP headers: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`
- **Why it matters:** Code that assumes SAB is available will fail silently or throw in non-isolated contexts. Always check `crossOriginIsolated` or use try/catch when creating SharedArrayBuffer

## 2026-01-23 - SharedArrayBuffer memory savings depend on data volume
**Source:** PRD-LC-002 US-004

- **What:** SharedArrayBuffer provides memory savings by sharing data across workers instead of copying. However, the results buffer must be per-worker (each worker writes to its own section). With small data and many workers, the fixed overhead (header, assumptions, results areas) can exceed the copy-mode memory
- **Why it matters:** SAB mode shows significant savings only with large policy counts. For small policy sets, standard WorkerPool may be more memory-efficient. The createAutoWorkerPool fallback handles this gracefully

## 2026-01-23 - Worker message postMessage cannot transfer SharedArrayBuffer
**Source:** PRD-LC-002 US-004

- **What:** While SharedArrayBuffer can be passed to workers via postMessage, it is not "transferred" (moved) but rather shared. The same buffer is accessible from both main thread and workers simultaneously. This is different from Transferable objects (like ArrayBuffer) which are moved and become unusable in the sender
- **Why it matters:** Design the buffer layout with concurrent access in mind. Use separate sections for different workers' results to avoid write conflicts. Atomics can be used for synchronization when needed

## 2026-01-24 - Cloud-native data means user never loads full dataset
**Source:** PRD-LC-008 US-009, Architecture Documentation

- **What:** When policy data lives in cloud storage (blob/data lake), users only receive: (1) metadata via API call (~1KB), (2) random sample for preview (~3MB for 10K policies), (3) summary results (~1KB). The full dataset (2GB-50GB) never leaves the cloud - Batch workers read directly from blob.
- **Why it matters:** A user with 8GB available RAM can work with 500GB datasets. Memory requirements are constant regardless of dataset size: ~4MB browser memory vs dataset size. This fundamentally changes capacity planning - client memory is not a constraint.

## 2026-01-24 - Server-side sampling with fixed seed enables reproducibility
**Source:** PRD-LC-008 US-009

- **What:** The /datasets/{id}/sample?n=10000&seed=42 endpoint returns the same 10K policies every time the same seed is used. This enables debugging and comparison: "preview was 1.9% off from full run" is meaningful when the sample is deterministic.
- **Why it matters:** Random sampling is essential for large datasets but must be reproducible for debugging. Store the seed used for each preview so results can be recreated

## 2026-01-24 - Cold vs warm worker pool timing matters for performance targets
**Source:** SPIKE-LC-007 US-S05

- **What:** Worker pool benchmarks show dramatically different speedups for cold (includes init + load) vs warm (valuation only) execution. For 10K×1K: cold=2.6x, warm=5.6x. The ~200ms overhead (init ~170ms, load ~25ms) is a fixed cost per pool creation.
- **Why it matters:** When evaluating if a target like "4x speedup with 8 workers" is met, use warm timing for production scenarios where the pool is reused. Use cold timing for cold-start SLA validation. Document which metric you're measuring.

## 2026-01-24 - Benchmark reports need clear baseline context
**Source:** SPIKE-LC-007 US-S05

- **What:** When comparing baseline vs spike, the baseline may not have all features (e.g., multi-threading was broken in baseline, so wasmMultiMs was null). Comparisons must account for what was actually measured vs what was expected.
- **Why it matters:** A naive comparison showing "throughput decreased 91%" is misleading if baseline was single-threaded and spike is multi-threaded with different measurement points. Always verify what the baseline actually represents.


## 2026-01-24 - CRC32 lookup table for performance
**Source:** PRD-LC-010 US-007

- **What:** CRC32 checksum computation uses a pre-computed 256-entry lookup table to avoid calculating the polynomial for every byte. The table is computed once on first use and cached globally. This reduces per-byte computation from 8 bit shifts to a single table lookup.
- **Why it matters:** For large SharedArrayBuffer segments (MB scale), the lookup table approach is ~8x faster than naive bit-by-bit computation. The one-time table initialization cost (~256 iterations) is amortized over all checksum computations in the session.

## 2026-01-24 - Integrity checks as opt-in for performance
**Source:** PRD-LC-010 US-007

- **What:** Pipeline integrity checking is disabled by default (livecalc.enableIntegrityChecks: false) because CRC32 computation adds ~1ms per MB of bus data. For large pipelines with multiple multi-MB bus resources, this overhead can add up. Users enable it when debugging memory corruption issues.
- **Why it matters:** Performance vs debugging tradeoff - production runs prioritize speed, debug runs prioritize correctness. Making it configurable allows users to choose based on their current needs. Document the overhead clearly in the setting description.


## 2026-01-25 - DR = BAU: Transient infrastructure lifecycle
**Source:** PRD-LC-013 US-PLAT-01

- **What:** The "Disaster Recovery = Business As Usual" pattern treats all infrastructure as transient by default. Namespaces automatically evaporate after inactivity, with diagnostics extracted before deletion. This ensures zero idle cost and forces infrastructure to be recreatable from code/manifests.
- **Why it matters:** Traditional DR is an "event" that often fails because it's rarely tested. DR=BAU means infrastructure is constantly being created/destroyed, so the recovery path is the normal path. This also prevents resource leak and reduces cloud costs to only active workloads.

## 2026-01-25 - Kubernetes namespace finalizers and deletion timing
**Source:** PRD-LC-013 US-PLAT-01

- **What:** When deleting a Kubernetes namespace, the API returns immediately but the namespace may take 30-60 seconds to fully delete due to finalizers. Resources inside the namespace (pods, PVCs) must be deleted first. Polling `read_namespace()` with a 404 check is the correct way to wait for full deletion.
- **Why it matters:** Don't assume namespace deletion is instant. If you need to verify cleanup (e.g., checking for orphaned PVCs), wait for the namespace to be fully deleted first. Otherwise you may see stale resources that are actually in the process of being cleaned up.

## 2026-01-25 - Pod annotations for diagnostic metadata
**Source:** PRD-LC-013 US-PLAT-01

- **What:** Worker pods can self-annotate with diagnostic metadata (e.g., memory sentinel violations) using the Kubernetes API. These annotations persist with the pod and can be extracted before the namespace is reaped: `kubectl.core_v1.patch_namespaced_pod(name=pod_name, namespace=namespace, body={"metadata": {"annotations": {"key": "value"}}})`
- **Why it matters:** This enables workers to report issues (memory corruption, integrity failures) that the platform can detect and archive before cleanup. The annotation survives pod crashes and can be extracted even if the pod is terminated.


## 2026-01-25 - NumPy sample standard deviation requires ddof=1
**Source:** PRD-LC-013 US-PLAT-03

- **What:** When calculating sample standard deviation for statistical inference, NumPy's np.std() requires ddof=1 (degrees of freedom) to use Bessel's correction (n-1 denominator): `np.std(values, ddof=1)`. Default ddof=0 calculates population std dev (n denominator).
- **Why it matters:** For anomaly detection on samples (not full populations), using population std dev (ddof=0) underestimates variability and produces overly-sensitive 3-sigma thresholds. Bessel's correction provides unbiased population estimate from sample data.

## 2026-01-25 - 3-sigma rule applies to normal distributions
**Source:** PRD-LC-013 US-PLAT-03

- **What:** The 3-sigma rule (99.7% of values within ±3σ) assumes data follows a normal distribution. For actuarial NPV results, this is often valid due to Central Limit Theorem (averaging over many policies/scenarios), but non-normal distributions may have different tail probabilities.
- **Why it matters:** When analyzing buckets, check if distribution is approximately normal (mean ≈ median, symmetric histogram). For skewed distributions, consider using percentile-based outlier detection (IQR method) or transforming data before applying 3-sigma rule.

## 2026-01-25 - Percentile interpolation for rank estimation
**Source:** PRD-LC-013 US-PLAT-03

- **What:** When estimating percentile rank of a value between known percentiles (P25, P50, P75, etc.), linear interpolation provides reasonable approximation: rank = lower_percentile + (upper_percentile - lower_percentile) × (value - lower_value) / (upper_value - lower_value)
- **Why it matters:** Computing exact percentile rank requires sorting all values (O(n log n)). For diagnostic bundles where we already have summary percentiles, interpolation gives fast approximation without re-processing full dataset.

