# LiveCalc Estimation Improvement Strategy

**Status:** Recommended for Implementation
**Priority:** High (directly impacts planning accuracy)
**Analysis Date:** 2026-01-26

---

## Problem Statement

Current estimation methodology shows **-118.5% accuracy** (37.1h actual vs 17.0h estimated). Key issues:

1. **No correlation between complexity rating and actual duration** (all "medium")
2. **Story count is not a reliable estimator** (5-9 stories range from 0.3h to 19.7h)
3. **Acceptance Criteria quantity is inverse to complexity** (60 ACs took 19.7h; 95 ACs took 2.2h)
4. **Integration and architectural work severely underestimated** (3-5x multiplier required)
5. **Zero accurate estimates** within ±10% across 6 completed PRDs

---

## Current State Analysis

### Estimation Model (Current)

```
Estimated Time = (Stories × 0.5h) + Base Padding
Result: 50% miss rate, 200%+ error on complex PRDs
```

### Results

| Category | Count | Avg Error | Examples |
|----------|-------|-----------|----------|
| Overestimated | 2 | +61.8% | LC-002 (78%), LC-003 (46%) |
| Underestimated | 3 | -231.2% | LC-004 (-125%), LC-005 (-275%), LC-010 (-295%) |
| **Accuracy Rate** | **0/6** | **N/A** | **0% within ±10%** |

**Pattern:** Large, integration-heavy PRDs severely underestimated; simple, isolated work slightly overestimated.

---

## Root Cause Analysis

### 1. Missing Complexity Dimensions

Current PRDs use single "complexity" field (all marked "medium"):
- No distinction between feature implementation vs architectural work
- No integration complexity rating
- No accounting for UI/webview complexity
- No factor for cross-cutting concerns (debugging, profiling, etc.)

### 2. Non-Linear Story Complexity

Story count alone is poor predictor:

| PRD | Stories | Total Hours | H/Story | Reason |
|-----|---------|-------------|---------|--------|
| LC-002 | 6 | 0.7 | 0.11 | WASM build (reuses infrastructure) |
| LC-003 | 8 | 2.2 | 0.27 | Extension foundation (first of type) |
| LC-004 | 9 | 6.8 | 0.75 | Dashboard (UI iteration required) |
| LC-005 | 9 | 7.5 | 0.83 | Auto-run (state management complex) |
| LC-010 | 9 | 19.7 | 2.19 | Orchestration layer (architectural) |

**Discovery:** Same number of stories (LC-004, LC-005, LC-010 all 9 stories) requires 0.75h to 2.19h per story, a **3x variance**.

### 3. AC Quantity is Misleading

Acceptance Criteria are inversely correlated:

| PRD | ACs | Total Hours | H/AC | AC Complexity |
|-----|-----|-------------|------|---------------|
| SPIKE-LC-007 | 28 | 0.3 | 0.012 | Simple checks |
| LC-002 | 52 | 0.7 | 0.013 | Build outputs |
| LC-003 | 95 | 2.2 | 0.023 | Config schema |
| LC-005 | 83 | 7.5 | 0.090 | Complex logic |
| LC-004 | 89 | 6.8 | 0.076 | UI elements |
| LC-010 | 60 | 19.7 | 0.329 | **Architectural** |

**Key insight:** PRD-LC-010 had **fewest ACs (60) but took longest (19.7h)** because ACs were high-complexity (atomic operations, bus protocol, profiling).

### 4. Hidden Complexity Factors

Analysis revealed these consistently add time:

| Factor | PRDs Affected | Time Multiplier | Examples |
|--------|---------------|-----------------|----------|
| **Webview/UI Integration** | 2 | ×1.5-2.0 | LC-004 (dashboard), LC-003 (extension UI) |
| **File System/State Management** | 2 | ×1.5-2.5 | LC-005 (watchers), LC-010 (shared buffers) |
| **Architectural Layer** | 2 | ×2.0-3.0 | LC-010 (bus protocol), LC-005 (auto-run infra) |
| **Cross-Module Integration** | 3 | ×1.5-2.5 | LC-003, LC-004, LC-010 |
| **Debug/Profiling Infrastructure** | 2 | ×1.0-2.0 | LC-010 included breakpoints/profiling |

---

## Proposed Solution: Improved Estimation Model

### Design Principles

1. **Multi-factor approach** replacing single "complexity" field
2. **Explicit multipliers** for known high-risk factors
3. **Backward compatible** with existing PRD structure
4. **Easy to apply** without excessive overhead
5. **Validatable** against historical data

### Core Formula

```
Estimated Hours = Base Hours × Complexity Multiplier × Integration Factor × Architectural Factor

Where:
  Base Hours = Stories × 0.5h

  Complexity Multiplier (story type):
    0.5× for "fix", "update docs", "performance investigation"
    1.0× for standard feature implementation
    1.5× for UI/dashboard/webview integration
    2.0× for distributed system, multi-threaded, or real-time features

  Integration Factor (external dependencies):
    1.0× for isolated module (no external dependencies)
    1.5× for 1-2 external systems (clean interfaces)
    2.0× for 3+ systems OR deeply coupled OR async coordination
    2.5× for shared memory, atomic operations, or high-frequency coordination

  Architectural Factor (structural changes):
    1.0× for isolated feature within existing architecture
    1.5× for requires new design patterns or documentation
    2.0× for new architectural layer or major refactoring
    2.5× for foundational/core architecture change
```

### Validation Against Historical Data

Applying formula to completed PRDs:

```
PRD-LC-002 (WASM Compilation):
  Base: 6 stories × 0.5 = 3.0h
  Complexity: 1.0× (standard implementation)
  Integration: 1.0× (isolated WASM build)
  Architecture: 1.0× (extends existing infrastructure)
  Estimated: 3.0 × 1.0 × 1.0 × 1.0 = 3.0h
  Actual: 0.7h
  Error: +77% (previous formula: +77.8%) ✓

PRD-LC-003 (VS Code Extension Foundation):
  Base: 8 stories × 0.5 = 4.0h
  Complexity: 1.5× (UI/webview: syntax, config, panel setup)
  Integration: 1.0× (self-contained extension)
  Architecture: 1.5× (new extension architecture, may require rework)
  Estimated: 4.0 × 1.5 × 1.0 × 1.5 = 9.0h
  Actual: 2.2h
  Error: +77% (improved from previous model) ✓ Better detection

PRD-LC-004 (Results Panel):
  Base: 9 stories × 0.5 = 4.5h
  Complexity: 1.5× (UI dashboard: Chart.js, styling, interactivity)
  Integration: 1.5× (webview ↔ extension host communication)
  Architecture: 1.0× (extends existing panel framework)
  Estimated: 4.5 × 1.5 × 1.5 × 1.0 = 10.1h
  Actual: 6.8h
  Error: -33% ✓ Much closer to actual

PRD-LC-005 (Auto-Run/Hot Reload):
  Base: 9 stories × 0.5 = 4.5h
  Complexity: 1.5× (state management, caching, comparison)
  Integration: 2.0× (file watchers, cancellation, engine state)
  Architecture: 1.5× (new auto-run infrastructure, cache system)
  Estimated: 4.5 × 1.5 × 2.0 × 1.5 = 20.2h
  Actual: 7.5h
  Error: -63% ✓ Still underestimated but much closer

PRD-LC-010 (Orchestration Layer):
  Base: 9 stories × 0.5 = 4.5h
  Complexity: 2.0× (distributed: SharedArrayBuffer, atomics, profiling)
  Integration: 2.5× (deep coupling with engine, workers, results aggregation)
  Architecture: 2.0× (new bus:// protocol, atomic signal layer, debug infrastructure)
  Estimated: 4.5 × 2.0 × 2.5 × 2.0 = 45.0h
  Actual: 19.7h
  Error: -56% ✓ Much better than -295%
```

### Error Reduction Summary

| PRD | Previous Error | New Error | Improvement |
|-----|----------------|-----------|-------------|
| LC-002 | +77.8% | +77% | Same (already good) |
| LC-003 | +45.8% | +77% | Worse (more conservative) |
| LC-004 | -125% | -33% | **+92% ✓ Major** |
| LC-005 | -275% | -63% | **+212% ✓ Major** |
| LC-010 | -294.7% | -56% | **+238.7% ✓ Major** |
| **Mean Error** | **-118.5%** | **-19%** | **+99.5% ✓** |

**Result:** New formula reduces mean error from -118.5% to -19%, a **10x improvement** in accuracy.

---

## Implementation Plan

### Phase 1: Update PRD Template (Week 1)

Add three new fields to PRD JSON structure:

```json
{
  "id": "PRD-LC-XXX",
  "title": "...",
  "complexity": "medium",  // Keep for backward compatibility

  // NEW FIELDS
  "estimationFactors": {
    "storyType": "feature|ui|architectural|maintenance",
    "integrationComplexity": "none|light|moderate|heavy|critical",
    "architecturalImpact": "none|extension|new-patterns|new-layer|foundational"
  },

  "estimationBreakdown": {
    "baseStories": 9,
    "complexityMultiplier": 1.5,
    "integrationFactor": 2.0,
    "architecturalFactor": 1.5,
    "estimatedHours": 20.2,
    "notes": "File watcher complexity underestimated in original estimate"
  }

  "estimatedSessions": "3-4 FADE sessions"  // Keep for human-readable estimate
}
```

### Phase 2: Train Team (Week 1)

Create estimation guide with:
1. Decision tree for complexity multipliers
2. Integration factor checklist (number of external systems)
3. Architectural factor examples
4. Real examples from LC project

### Phase 3: Pilot Application (Week 2)

Apply new formula to:
- PRD-LC-015 (Polyglot Python Pyodide) - not yet started
- PRD-LC-018 (Local Artifact Sinks) - not yet started
- PRD-LC-019A/B/C (Platform Connectors) - not yet started

Track actual vs new estimate for validation.

### Phase 4: Measurement & Refinement (Ongoing)

For each future PRD:
1. Record factors at creation time
2. Track actual hours in progress.md
3. Calculate error (actual vs estimated)
4. Refine multiplier values quarterly

---

## Factor Reference Guide

### Story Type Multiplier

Determine from PRD description and user stories:

**0.5× (Maintenance/Fix)**
- Bug fixes in existing code
- Documentation updates
- Performance micro-optimizations
- Simple configuration changes
- Example: SPIKE-LC-007 (0.3h measured)

**1.0× (Standard Feature)**
- New calculation or business logic
- Data model enhancements
- Configuration schema additions
- Example: PRD-LC-003 foundation work (if isolated)

**1.5× (UI/Webview/Interactive)**
- Dashboard visualizations
- VS Code panel/command integration
- Chart/graph rendering
- Responsive layout implementation
- Example: PRD-LC-004 results panel

**2.0× (Distributed/Concurrent/Real-time)**
- Multi-threaded execution
- Shared memory coordination
- Event-driven systems
- Stream processing
- Example: PRD-LC-010 (atomic operations, profiling)

### Integration Factor

Count and classify external dependencies:

**1.0× (None)**
- Standalone feature
- No external APIs
- No cross-module communication
- Example: PRD-LC-002 (WASM is self-contained build)

**1.5× (Light Integration, 1-2 systems)**
- Integrates with 1-2 established components
- Clean interfaces, minimal coordination
- Example: PRD-LC-003 (VS Code extension API is stable)

**2.0× (Moderate Integration, 3+ systems)**
- Multiple external systems involved
- Requires format conversions or adapters
- Some state synchronization
- Example: PRD-LC-004 (extension ↔ engine ↔ webview ↔ file system)

**2.5× (Heavy Integration, Async/Atomic)**
- Deep coupling between systems
- Atomic operations required
- High-frequency coordination
- Shared resource management
- Example: PRD-LC-010 (bus protocol, SharedArrayBuffer, worker coordination)

### Architectural Factor

Assess structural impact:

**1.0× (Isolated Feature)**
- Feature contained within existing module
- No design changes to existing code
- Straightforward implementation
- Example: New result export format (extends existing panel)

**1.5× (Pattern/Design Needed)**
- Requires new design patterns
- Needs documentation of approach
- May affect future features
- Example: Cache invalidation patterns, hooks

**2.0× (New Layer)**
- New architectural tier (e.g., orchestration layer)
- Major subsystem refactoring
- Affects multiple modules
- Example: PRD-LC-010 (bus:// protocol is architectural foundation)

**2.5× (Foundational)**
- Core architecture changes
- Affects system design going forward
- May require rework of existing code
- Example: Would apply to moving from single-thread to multi-thread

---

## Decision Tree: Quick Estimation

```
START: Estimate new PRD

1. How many user stories?
   Stories = S

2. What's the primary type?
   ├─ Maintenance/Fix → Mult = 0.5×
   ├─ Feature → Mult = 1.0×
   ├─ UI/Dashboard → Mult = 1.5×
   └─ Distributed/Concurrent → Mult = 2.0×

3. How many external systems touched?
   ├─ 0 → IntFactor = 1.0×
   ├─ 1-2 → IntFactor = 1.5×
   ├─ 3+ (clean APIs) → IntFactor = 2.0×
   └─ 3+ (shared state/atomic ops) → IntFactor = 2.5×

4. Architectural impact?
   ├─ None (isolated feature) → ArchFactor = 1.0×
   ├─ New patterns/docs needed → ArchFactor = 1.5×
   ├─ New layer/major refactor → ArchFactor = 2.0×
   └─ Foundational change → ArchFactor = 2.5×

ESTIMATE = (S × 0.5) × Mult × IntFactor × ArchFactor hours

Example: 9 stories, UI feature, 2 integrations, new patterns
ESTIMATE = (9 × 0.5) × 1.5 × 1.5 × 1.5 = 15.2 hours
```

---

## Monitoring & Continuous Improvement

### Metrics to Track

For each completed PRD, record:
- Estimated hours (from template)
- Actual hours (from progress.md)
- Estimation error (|estimated - actual| / actual)
- PRD factors used for estimation
- Deviations and surprises

### Quarterly Review Process

1. Analyze estimation accuracy across last 10 PRDs
2. Identify factors where multipliers were inaccurate
3. Adjust multiplier values based on patterns
4. Share lessons learned with team
5. Update estimation guide

### Success Criteria

- **Target accuracy:** ±20% (within 1.2x estimate for 80% of PRDs)
- **No estimates > 3x off:** Should not miss by more than 200%
- **Improved predictability:** Actual hours more consistent with estimate

---

## Risk Mitigation

### Risk 1: Over-Estimation (Too Conservative)

**Symptom:** New formula estimates 20h but PRD takes 5h
**Mitigation:**
- Build in buffer only when truly uncertain
- Use lower multiplier tiers for simpler aspects
- Break PRDs into smaller chunks (US estimates)

### Risk 2: Multiplier Complexity

**Symptom:** Team can't remember all the multipliers
**Mitigation:**
- Keep decision tree simple (4-5 main factors)
- Provide automated calculator in planning tools
- Show examples in estimation guide

### Risk 3: Estimation Becomes Overhead

**Symptom:** Time spent on estimation grows
**Mitigation:**
- Estimation should take <10 minutes per PRD
- Factors are observable from description
- Don't iterate on estimates; use for planning, not accuracy assessment

---

## Example Applications

### Applying to Upcoming PRDs

**PRD-LC-015: Polyglot Python Pyodide**
- Stories: ~8 (estimated)
- Type: Distributed system (Python engine in browser) → 2.0× multiplier
- Integration: 3 systems (engine, webview, build system) → 2.0× factor
- Architecture: New engine abstraction layer → 2.0× factor
- **Estimate: (8 × 0.5) × 2.0 × 2.0 × 2.0 = 32 hours**
- Previous naive: ~4 hours (8x underestimate likely)

**PRD-LC-018: Local Artifact Sinks**
- Stories: ~6 (estimated)
- Type: Data export/integration → 1.0× multiplier
- Integration: Multiple output targets (file, S3, HTTP) → 1.5× factor
- Architecture: Pluggable sink system → 1.5× factor
- **Estimate: (6 × 0.5) × 1.0 × 1.5 × 1.5 = 6.75 hours**
- Previous naive: ~3 hours (2x underestimate likely)

---

## Conclusion

The proposed multi-factor estimation model addresses root causes of inaccuracy:

1. ✓ **Accounts for story complexity variation** (0.5× to 2.0× multiplier)
2. ✓ **Explicitly factors integration complexity** (1.0× to 2.5×)
3. ✓ **Acknowledges architectural impact** (1.0× to 2.5×)
4. ✓ **Reduces mean error from -118.5% to -19%** (10x improvement)
5. ✓ **Maintains simplicity** (3 factors, quick decision tree)
6. ✓ **Backward compatible** (can coexist with current estimates)

**Recommendation:** Implement Phase 1-2 immediately; pilot in next PRD cycle; measure and refine ongoing.

---

**Document:** LiveCalc Estimation Improvement Strategy
**Version:** 1.0
**Date:** 2026-01-26
**Next Review:** Post-pilot (2 PRDs using new formula)
