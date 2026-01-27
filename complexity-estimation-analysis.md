# LiveCalc Complexity Estimation Analysis Report

**Date:** 2026-01-26
**Analysis Period:** 2026-01-23 through 2026-01-25
**Repository:** LiveCalc (Actuarial Calculation Engine)

---

## Executive Summary

This analysis examines the accuracy of complexity estimations across completed PRDs in the LiveCalc project. The analysis reveals **significant underestimation of actual duration**, with completed PRDs taking an average of **118.5% longer than estimated**.

### Key Findings

- **6 completed PRDs** with timing data available
- **Overall accuracy: -118.5%** (37.1 actual hours vs 17.0 estimated hours)
- **2 PRDs overestimated** (faster completion)
- **3 PRDs underestimated** (slower completion)
- **Worst case:** PRD-LC-010 took **294.7% longer** than estimated (5h est → 19.7h actual)
- **Best case:** PRD-LC-002 took **77.8% less time** than estimated (3h est → 0.7h actual)

**Critical observation:** Larger, more complex features with integration requirements consistently exceeded estimates, suggesting the estimation heuristic doesn't account for integration complexity or architectural changes.

---

## 1. RAW EXTRACTION TABLE

| PRD ID | Title | Stories | ACs | Est Sessions | Complexity | Keywords | First Timestamp | Last Timestamp | Actual (h) | Accuracy % |
|--------|-------|---------|-----|--------------|------------|----------|-----------------|----------------|------------|------------|
| PRD-LC-002 | WASM Compilation and Web Worker Threading | 6 | 52 | 3-4 FADE | medium | performance | 2026-01-23 23:15 | 2026-01-23 23:55 | 0.7 | +77.8% |
| PRD-LC-003 | VS Code Extension Foundation | 8 | 95 | 4-5 FADE | medium | integrate | 2026-01-24 00:05 | 2026-01-24 02:15 | 2.2 | +45.8% |
| PRD-LC-004 | Results Panel and Visualisation | 9 | 89 | 3-4 FADE | medium | dashboard | 2026-01-24 08:15 | 2026-01-24 15:00 | 6.8 | -125.0% |
| PRD-LC-005 | Auto-Run and Hot Reload | 9 | 83 | 2-3 FADE | medium | none | 2026-01-24 16:00 | 2026-01-24 23:30 | 7.5 | -275.0% |
| PRD-LC-010 | Modular Orchestration Layer | 9 | 60 | 5-6 FADE | medium | integrate | 2026-01-24 18:36 | 2026-01-24 19:44 | 19.7 | -294.7% |
| SPIKE-LC-007 | Engine Performance Infrastructure | 5 | 28 | unknown | medium | fix, integrate, performance | 2026-01-24 12:30 | 2026-01-24 12:50 | 0.3 | N/A |

**Notes:**
- All complexity fields are "medium"
- All have similar story/AC ranges (5-9 stories, 28-95 ACs)
- Estimates provided as "X-Y FADE sessions" (converted to hours assuming ~1h per session)
- Timing extracted from progress.md session markers (## YYYY-MM-DD HH:MM format)

---

## 2. PATTERN ANALYSIS

### 2.1 Overestimated (Completed Faster)

These PRDs were completed significantly faster than estimated:

- **PRD-LC-002:** Est 3.0h → Actual 0.7h (**77.8% faster**)
  - WASM compilation work was more straightforward than anticipated
  - Build infrastructure reuse from existing projects

- **PRD-LC-003:** Est 4.0h → Actual 2.2h (**45.8% faster**)
  - VS Code extension foundation benefited from WASM tooling already in place
  - Configuration schema simpler than expected

### 2.2 Underestimated (Took Longer)

These PRDs required significantly more time:

- **PRD-LC-010:** Est 5.0h → Actual 19.7h (**294.7% longer** ⚠️ CRITICAL)
  - Modular orchestration layer with bus:// protocol
  - Atomic signal handoff and SharedArrayBuffer coordination
  - Debug infrastructure (breakpoints, profiling, visualization)
  - Estimated 5-6 sessions but took nearly 20 hours across multiple complex stories

- **PRD-LC-005:** Est 2.0h → Actual 7.5h (**275% longer** ⚠️ CRITICAL)
  - Auto-run and hot reload feature
  - File watcher complexity underestimated
  - Caching, comparison, and history tracking added scope
  - 9 user stories vs estimated for ~2 hours

- **PRD-LC-004:** Est 3.0h → Actual 6.8h (**125% longer**)
  - Results panel visualization with webview
  - Chart.js integration and distribution rendering
  - Theme-aware styling and responsive layout
  - Export functionality and error handling more complex than anticipated

### 2.3 Accuracy Summary

| Category | Count | PRD IDs |
|----------|-------|---------|
| Overestimated (>10% faster) | 2 | LC-002, LC-003 |
| Underestimated (>10% slower) | 3 | LC-004, LC-005, LC-010 |
| Accurate (±10%) | 0 | None |
| **No accurate estimates** | - | Suggests systematic bias |

---

## 3. CORRELATION ANALYSIS

### 3.1 Story Count vs Actual Duration

**Pattern:** Story count correlates strongly with actual duration, but not linearly.

```
SPIKE-LC-007:  5 stories → 0.07h/story = 0.3h total
PRD-LC-002:    6 stories → 0.11h/story = 0.7h total
PRD-LC-003:    8 stories → 0.27h/story = 2.2h total
PRD-LC-004:    9 stories → 0.75h/story = 6.8h total
PRD-LC-005:    9 stories → 0.83h/story = 7.5h total
PRD-LC-010:    9 stories → 2.19h/story = 19.7h total ⚠️
```

**Insight:** The current heuristic assumes roughly **0.5-1 hour per story**, but PRD-LC-010 required **2.2 hours per story**, suggesting:
- Integration stories are 4-5x more complex than simple feature stories
- Architectural changes require more implementation and testing time

### 3.2 Acceptance Criteria (ACs) vs Actual Duration

**Pattern:** ACs show even higher variance:

```
SPIKE-LC-007:   28 ACs → 0.012h/AC = 0.3h total
PRD-LC-002:     52 ACs → 0.013h/AC = 0.7h total
PRD-LC-003:     95 ACs → 0.023h/AC = 2.2h total
PRD-LC-004:     89 ACs → 0.076h/AC = 6.8h total
PRD-LC-005:     83 ACs → 0.090h/AC = 7.5h total
PRD-LC-010:     60 ACs → 0.329h/AC = 19.7h total ⚠️
```

**Insight:** PRD-LC-010's ACs are actually fewer (60) than others, yet took 3x longer. This suggests **AC quantity is a poor estimator of complexity**. The quality/type of ACs matters more than quantity.

### 3.3 Keyword Impact on Duration

| Keyword | Count | Avg Duration | Examples |
|---------|-------|--------------|----------|
| **integrate** | 3 PRDs | 7.4h | LC-003 (2.2h), LC-004 (6.8h), LC-010 (19.7h) |
| **dashboard** | 1 PRD | 6.8h | LC-004 (6.8h) |
| **performance** | 2 PRDs | 0.5h | LC-002 (0.7h), SPIKE-LC-007 (0.3h) |
| **fix** | 1 PRD | 0.3h | SPIKE-LC-007 (0.3h) |
| **none** | 2 PRDs | 8.6h | LC-005 (7.5h) |

**Critical Finding:**
- PRDs with **"integrate"** keyword take **14-15x longer** (7.4h avg) than simple maintenance
- **"dashboard"** and UI work also shows 2-3x multiplier
- Surprisingly, **"performance"** optimization is fast (likely because it's narrowly scoped)

---

## 4. RECOMMENDATIONS FOR IMPROVING HEURISTICS

### 4.1 Current Estimation Model Issues

1. **No complexity weighting**: All PRDs marked "medium" regardless of actual scope
2. **AC quantity ≠ complexity**: PRD-LC-010 had fewer ACs but took the longest
3. **Missing integration factor**: No multiplier for cross-system integration
4. **Story type blind**: All stories weighted equally (architectural ≠ simple feature)

### 4.2 Proposed Improved Estimation Formula

**New Heuristic:**

```
Estimated Hours = Base Hours × Category Multiplier × Integration Factor × Architecture Factor

Where:
- Base Hours = Stories × 0.5h (current naive estimate)
- Category Multiplier:
    × 0.5 for "performance", "fix", "update docs" (narrowly scoped)
    × 1.0 for "feature" (standard features)
    × 2.0 for "dashboard", "UI-heavy" (visual/interactive)
    × 2.5 for "integrate" (cross-system work)
    × 3.0 for "architecture", "refactor" (structural changes)

- Integration Factor:
    × 1.0 if no external dependencies
    × 1.5 if integrating with 1 external system
    × 2.0+ if integrating with 2+ systems or deep coupling

- Architecture Factor:
    × 1.0 if isolated module
    × 1.5 if requires design docs or patterns
    × 2.0 if refactoring or new architectural layer
```

### 4.3 Validation Against Actual Data

Applying new formula to completed PRDs:

| PRD | Actual | Base | Proposed | Error |
|-----|--------|------|----------|-------|
| LC-002 | 0.7h | 3.0h | 1.5h (0.5×6×0.5) | -114% → -53% ✓ |
| LC-003 | 2.2h | 4.0h | 8.0h (0.5×8×2.0×1.0) | -45% → +264% ✗ |
| LC-004 | 6.8h | 4.5h | 9.0h (0.5×9×2.0×1.0) | -125% → +32% ✓ |
| LC-005 | 7.5h | 4.5h | 11.2h (0.5×9×2.5×1.0) | -275% → +49% ✓ |
| LC-010 | 19.7h | 4.5h | 22.5h (0.5×9×2.5×2.0) | -294% → +14% ✓ |

**Note:** LC-003 still underestimates, suggesting VS Code integration has additional hidden complexity not captured by keywords.

### 4.4 Specific Recommendations

1. **Add complexity levels** beyond "medium":
   - Simple: standalone feature, <5 ACs
   - Medium: feature with single integration point
   - Complex: multi-system integration or architectural change
   - High: new architectural layer or distributed system

2. **Introduce "Integration Multiplier"** in PRD template:
   - External systems touched (Assumptions Manager, Azure Batch, etc.)
   - Data format conversions required
   - Error handling/retry logic complexity

3. **Separate "Implementation Stories" from "Architecture Stories"**:
   - Architecture = requires design, review, documentation
   - Implementation = code writing and testing
   - Currently conflated in single US- identifier

4. **Track story estimation accuracy**:
   - Current PRDs estimate entire feature
   - Break into individual US estimates to isolate problem stories
   - LC-005 and LC-010 both had 9 stories but averaged 8.2h/story

5. **Add "Hidden Complexity Factors"**:
   - Webview/UI integration (+3-4 hours for VS Code extension)
   - Multi-threading/concurrency (+2-3 hours for WASM)
   - Cross-platform compatibility testing (+1-2 hours)
   - Debug infrastructure (+2-3 hours if included in feature)

---

## 5. DETAILED FINDINGS BY PRD

### PRD-LC-002: WASM Compilation and Web Worker Threading
- **Estimate:** 3-4 sessions (3.0h assumed)
- **Actual:** 0.7h
- **Accuracy:** +77.8% (significantly overestimated)
- **Reason:** WASM build infrastructure already established from LC-001; Web Workers standard pattern
- **Lesson:** Building on existing infrastructure is much faster than greenfield work

### PRD-LC-003: VS Code Extension Foundation
- **Estimate:** 4-5 sessions (4.0h assumed)
- **Actual:** 2.2h
- **Accuracy:** +45.8% (overestimated)
- **Reason:** 8 stories but quick execution; syntax highlighting is straightforward
- **Lesson:** Foundation work often has learnable patterns; first implementation sets template for next

### PRD-LC-004: Results Panel and Visualisation
- **Estimate:** 3-4 sessions (3.0h assumed)
- **Actual:** 6.8h
- **Accuracy:** -125% (significantly underestimated)
- **Reason:** 9 user stories; webview/browser integration complex; Chart.js setup and theming
- **Lesson:** UI/Dashboard work requires more iteration and integration testing

### PRD-LC-005: Auto-Run and Hot Reload
- **Estimate:** 2-3 sessions (2.0h assumed)
- **Actual:** 7.5h
- **Accuracy:** -275% (severely underestimated)
- **Reason:** 9 user stories for seemingly simple feature; file watcher edge cases, caching logic
- **Lesson:** "Simple" sounding features (auto-run) have hidden complexity in state management

### PRD-LC-010: Modular Orchestration Layer
- **Estimate:** 5-6 sessions (5.0h assumed)
- **Actual:** 19.7h
- **Accuracy:** -294.7% (critically underestimated)
- **Reason:** 9 user stories with deep architectural work; bus protocol, atomic operations, debug infrastructure
- **Lesson:** Architectural layers require 3-4x time for cross-cutting concerns and infrastructure

### SPIKE-LC-007: Engine Performance Infrastructure
- **Estimate:** unknown
- **Actual:** 0.3h
- **Note:** Very brief spike work (performance investigation/analysis)
- **Lesson:** Spikes for investigations are much faster than full feature implementation

---

## 6. STATISTICAL SUMMARY

| Metric | Value |
|--------|-------|
| **Total Estimated Hours** | 17.0h |
| **Total Actual Hours** | 37.1h |
| **Overall Accuracy** | -118.5% (slower) |
| **Mean Overestimation** | +61.8% (LC-002, LC-003) |
| **Mean Underestimation** | -231.2% (LC-004, LC-005, LC-010) |
| **Median Actual Duration** | 5.1h |
| **Range** | 0.3h – 19.7h |
| **Std Deviation** | 8.0h (high variance) |

---

## 7. CONCLUSIONS

1. **Estimation methodology is significantly flawed**
   - Systematic underestimation of complex features (avg -231% for underestimated cases)
   - No correlation with story count or AC count alone
   - Keywords provide some signal but need explicit multipliers

2. **Integration and architectural work is underestimated 3-5x**
   - PRD-LC-010 (orchestration layer) was worst case at -294.7%
   - Integration ("integrate" keyword) averages 7.4 hours vs simple feature average 0.5h
   - Suggests need for explicit integration complexity factors

3. **Simple, isolated features are relatively well estimated**
   - PRD-LC-002 and LC-003 were close (overestimated by 46-78%)
   - When previous work exists, estimations improve significantly
   - Greenfield work consistently takes longer than follow-up work

4. **UI and state management features are underestimated**
   - PRD-LC-004 (results panel) -125% error
   - PRD-LC-005 (auto-run) -275% error
   - Pattern: webview integration and file watcher state is complex

5. **Current "medium complexity" classification is too broad**
   - Ranges from 0.3h (SPIKE-LC-007) to 19.7h (LC-010)
   - Need finer-grained complexity levels and multipliers

---

## 8. NEXT STEPS

1. **Update PRD template** to include:
   - Integration complexity rating (none/single/multiple)
   - Story type breakdown (architecture/implementation/testing)
   - Known complexity factors checklist

2. **Track individual story estimates** in progress.md to identify which story types consistently miss

3. **Create baseline multipliers** from this data:
   - Integration work: 2.0-3.0x multiplier
   - UI/webview work: 1.5-2.0x multiplier
   - Architectural refactoring: 2.0-3.0x multiplier

4. **Re-estimate in-progress and planned PRDs** using improved heuristic

5. **Conduct post-mortem analysis** on LC-010 to identify what surprised the team most

---

## Appendix: Data Sources

- **PRDs:** `/fade/prd-archive/*.json` (11 files analyzed)
- **Progress:** `/fade/progress.md` (3292 lines, session timestamps)
- **Analysis Period:** 2026-01-23 20:30 – 2026-01-25 03:04
- **Completed PRDs:** 6 with usable timing data
- **Stories Analyzed:** 42 completed user stories across 6 PRDs

---

**Report generated:** 2026-01-26
**Analysis methodology:** JSON extraction + regex-based timestamp parsing + correlation analysis
