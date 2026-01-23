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

