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

