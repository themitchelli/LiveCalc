<!-- FADE progress.md v0.3.1 -->

# Progress Log

Session history for this project. Append-only.

<!--
Entry format (append new entries below the line):

## YYYY-MM-DD HH:MM - US-XXX: Story Title - COMPLETE

- Summary of what was implemented
- Files changed: list key files
- Tests: passed/added

For blocked stories, use:

## YYYY-MM-DD HH:MM - US-XXX: Story Title - BLOCKED

- What was attempted
- What's blocking progress
- Suggested resolution
-->

---

## 2026-01-23 20:30 - US-001: Policy Data Structure - COMPLETE

- Implemented Policy struct with all required fields (policy_id, age, gender, sum_assured, premium, term, product_type)
- Created PolicySet container supporting 100,000+ policies
- Implemented CSV loading with flexible gender/product_type parsing
- Implemented binary serialization/deserialization for WASM deployment
- Documented memory footprint: 24 bytes serialized, 32 bytes in-memory per policy
- Files changed:
  - livecalc-engine/CMakeLists.txt (build configuration with Catch2)
  - livecalc-engine/src/policy.hpp, policy.cpp
  - livecalc-engine/src/io/csv_reader.hpp, csv_reader.cpp
  - livecalc-engine/src/main.cpp
  - livecalc-engine/tests/test_policy.cpp
  - livecalc-engine/data/sample_policies.csv
  - livecalc-engine/README.md
- Tests: 12 tests passed (struct fields, equality, serialization round-trip, 100K capacity, CSV loading, memory footprint)

## 2026-01-23 21:15 - US-002: Assumption Tables - COMPLETE

- Implemented MortalityTable class with qx rates by age (0-120) and gender
- Implemented LapseTable class with lapse rates by policy year (1-50)
- Implemented ExpenseAssumptions struct with per-policy acquisition, maintenance, percent-of-premium, and claim expenses
- All tables support CSV loading and binary serialization for WASM deployment
- Added assumption multiplier support to stress-test results (with automatic 1.0 capping for probabilities)
- Documented memory footprint: MortalityTable 1,936 bytes, LapseTable 400 bytes, ExpenseAssumptions 32 bytes
- Files changed:
  - livecalc-engine/src/assumptions.hpp, assumptions.cpp (new)
  - livecalc-engine/tests/test_assumptions.cpp (new)
  - livecalc-engine/data/sample_mortality.csv (new)
  - livecalc-engine/data/sample_lapse.csv (new)
  - livecalc-engine/data/sample_expenses.csv (new)
  - livecalc-engine/CMakeLists.txt (added new sources)
  - livecalc-engine/README.md (documented assumption tables)
- Tests: 32 new tests added (44 total), covering boundary lookups (age 0/120, year 1/50), multipliers, CSV loading, serialization round-trips

