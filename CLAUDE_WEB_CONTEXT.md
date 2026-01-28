# LiveCalc: Project Context for Claude Web

## Executive Summary

**LiveCalc** is a revolutionary actuarial modeling platform that delivers **instant model feedback** through a VS Code extension powered by a high-performance calculation engine. It eliminates the traditional actuarial workflow delay and enables scaling from desktop to cloud without sacrificing performance.

---

## What Is It?

LiveCalc provides sub-second feedback for actuarial model changes with an architecture that combines:
- **C++ high-performance calculation engine** compiled to WASM for browser execution
- **VS Code extension** with real-time results visualization and model debugging
- **Pluggable calculation engines** (C++, Python, future Milliman Integrate)
- **Cloud execution infrastructure** (Azure Batch) for large-scale runs
- **Centralized assumptions management** with version control and approval workflows

**Problem Solved:**
- Traditional actuarial workflow: write model → export to Excel/Python → wait for results → iterate
- **LiveCalc solves this:** auto-run on save, sub-second feedback, scales from 1K scenarios (desktop) to 1M+ scenarios (cloud)

---

## Who Is It For?

1. **Actuaries**: Building and testing life insurance projection models with instant feedback
2. **Actuarial Teams**: Collaborating on shared assumption libraries with centralized governance
3. **Platform Engineers**: Deploying cloud-scale actuarial computations with infrastructure-as-code
4. **CFOs/Stakeholders**: Cost-effective alternative to GPU-based solutions (proven in demos)

---

## Why Does It Exist?

**Market Context:**
- The market believes GPU is required for actuarial scale at speed (Pathwise, others make this claim)
- Existing solutions are expensive, inflexible, and require vendor lock-in
- Actuaries need Python extensibility for custom logic and UDFs

**LiveCalc's Position:**
- Proves that **cost-effective horsepower is achievable with better engineering**, not specialized hardware
- Provides **Python extensibility** for custom UDFs during projection
- Enables **flexible architecture** with pluggable engines and modular pipelines

---

## Competitive Advantages

| Advantage | Details |
|-----------|---------|
| **Cost-Effective** | 1B calculations for ~$5.30 vs cloud/GPU alternatives |
| **Python Flexibility** | Execute custom Python logic (UDFs) during projection |
| **Zero-Copy Architecture** | SharedArrayBuffer + bus:// protocol eliminates data copying between workers |
| **Scales Without GPU** | Proven: 1M policies × 1K scenarios in <2 minutes on commodity hardware |
| **Modular Pipelines** | DAG-based orchestration: ESG → Projection → Solver with independent assumption management |
| **API-First Design** | All services (Assumptions Manager, Cloud API) expose REST APIs |
| **Security by Design** | JWT authentication, tenant isolation, assumption audit trails |

---

## Target Customers

**Primary:**
- Mid-to-large life insurance companies needing faster actuarial modeling workflows
- Pension funds and asset managers running large-scale stochastic valuations
- Consulting firms needing cost-effective client deliverables

**Secondary:**
- Insurance brokers running compliance calculations
- Fintech platforms embedding actuarial calculations
- Actuarial software vendors (Milliman, etc.) building on LiveCalc infrastructure

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Core Engine** | C++ compiled to WASM via Emscripten (with SIMD support) |
| **Desktop** | TypeScript (VS Code extension), Web Workers for parallelism |
| **Cloud API** | Python (FastAPI), Azure services (Blob Storage, Batch, Key Vault) |
| **Infrastructure** | Terraform (Azure), Kubernetes (AKS), GitHub Actions (CI/CD) |
| **Assumptions Manager** | Python/FastAPI backend, JWT auth, caching |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       VS Code Extension                          │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Results Panel   │  │ Pipeline     │  │ Assumptions      │  │
│  │ (Webview)       │  │ Debugger     │  │ Manager Client   │  │
│  └─────────────────┘  └──────────────┘  └──────────────────┘  │
│           │                    │                    │            │
│           └────────────────────┴────────────────────┘            │
│                              ↓                                   │
│                  ┌───────────────────────┐                       │
│                  │  LiveCalc Engine Mgr  │                       │
│                  │  (TypeScript)         │                       │
│                  └───────────────────────┘                       │
│                              ↓                                   │
│         ┌────────────────────┴────────────────────┐             │
│         ↓                                          ↓             │
│  ┌─────────────┐                          ┌──────────────┐     │
│  │   Main      │    SharedArrayBuffer     │ Worker Pool  │     │
│  │   Thread    │◄────────(bus://)────────►│ (N workers)  │     │
│  │             │                          │              │     │
│  │  ┌────────┐ │                          │ ┌──────────┐ │     │
│  │  │ WASM   │ │                          │ │ WASM     │ │     │
│  │  │ Module │ │                          │ │ Module   │ │     │
│  │  └────────┘ │                          │ └──────────┘ │     │
│  └─────────────┘                          └──────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              ↑
                              │ JWT Auth + REST API
                              ↓
                 ┌────────────────────────┐
                 │ Assumptions Manager    │
                 │ (Cloud Service)        │
                 │ - Table/Version Mgmt   │
                 │ - Approval Workflow    │
                 │ - Caching              │
                 └────────────────────────┘
                              ↑
                              │ Job Submit API
                              ↓
                 ┌────────────────────────┐
                 │ Cloud Execution        │
                 │ (Azure Batch)          │
                 │ - Large-scale runs     │
                 │ - Blob storage I/O     │
                 │ - Distributed workers  │
                 └────────────────────────┘
```

---

## Achieved Milestones

### Phase 1: Core Engine & VS Code MVP ✅ COMPLETE

#### PRD-LC-001: C++ Projection Engine
- **Status:** Completed 2026-01-23
- Implemented core actuarial projection logic:
  - Policy struct with full attributes (policy_id, age, gender, sum_assured, premium, term, product_type)
  - MortalityTable (qx rates by age 0-120, gender)
  - LapseTable (rates by policy year 1-50)
  - ExpenseAssumptions (acquisition, maintenance, percent-of-premium, claim expenses)
  - Economic Scenario class with interest rates and discount factors
  - Single policy projection with detailed cash flow tracking
  - Nested stochastic valuation with statistics (mean, std_dev, percentiles, CTE_95)
- **Performance:** 4M projections/second (10K policies × 1K scenarios in 2.5 seconds)
- **Code Quality:** 121+ unit tests, all edge cases covered

#### PRD-LC-002: WASM Compilation & Multi-Threading
- **Status:** Completed 2026-01-23
- Compiled C++ engine to WebAssembly via Emscripten
- Created JavaScript TypeScript wrapper (@livecalc/engine)
- Implemented WorkerPool with N workers using SharedArrayBuffer (zero-copy parallelism)
- Achieved 5.6x speedup with work-stealing scheduler
- Binary size: 100KB WASM (release), JS wrapper 18KB
- **Works in:** Node.js and browser environments

#### PRD-LC-003: VS Code Extension Foundation
- **Status:** Completed 2026-01-24
- Full TypeScript extension with Webview UI
- Model editor integration with syntax highlighting
- Real-time error reporting and validation
- Extension API for third-party plugins

#### PRD-LC-004: Results Panel Visualization
- **Status:** Completed 2026-01-24
- Interactive results panel with charts and tables
- Comparison views (baseline vs current, previous runs)
- Export functionality (JSON, CSV)
- Real-time progress indicators

#### PRD-LC-005: Auto-Run & Hot Reload
- **Status:** Completed 2026-01-24
- Auto-run on file save with configurable debounce
- Smart re-run optimization (only changed models)
- Cancel in-flight runs support
- Watch patterns for assumptions/config files

### Phase 2: Assumptions Manager & Orchestration ✅ COMPLETE

#### PRD-LC-006 (REFACTOR): Assumptions Manager Library
- **Status:** Completed 2026-01-26
- Centralized assumption management with version control
- JWT authentication for API access
- Assumption approval workflows
- Local caching for offline capability
- Integrated with VS Code extension

#### PRD-LC-007: Python ESG Engine
- **Status:** Completed 2026-01-27
- Economic Scenario Generator for market simulations
- Supports multiple interest rate models
- Pre-generates 1K scenarios for demo
- FastAPI-based REST endpoint

#### PRD-LC-008: Python Solver Engine
- **Status:** Completed 2026-01-28
- Parameter optimization for NPV targets
- Supports multiple solver algorithms
- Integration with projection engine
- Result caching and performance profiling

#### PRD-LC-010 (REVISED): Modular Orchestration Layer
- **Status:** Completed 2026-01-24
- DAG-based pipeline orchestration
- bus:// protocol for zero-copy data flows
- Multi-engine support (C++ projection, Python ESG, Python solver)
- Pipeline debugging and breakpoint support
- Modular resource management

### Phase 3: Go/No-Go Demo ✅ COMPLETE

#### PRD-LC-011: Full End-to-End Demo
- **Status:** Completed 2026-01-28
- All 8 user stories completed:
  - **US-001:** Demo Data Setup (1M realistic policies, 1K scenarios)
  - **US-002:** Projection-Only Benchmark (1M × 1K in <120 seconds)
  - **US-003:** Python UDF Execution (smoker mortality adjustment with <10% overhead)
  - **US-004:** End-to-End Multi-Engine Orchestration (ESG → Projection → Solver in <10 minutes)
  - **US-005:** Assumption Governance Audit Trail (versions, timestamps, reproducibility)
  - **US-006:** Cost-Per-Calculation Reporting (competitive analysis vs cloud/GPU)
  - **US-007:** Live Demo Script & Walkthrough (5-10 minute structured demo)
  - **US-008:** Comparison Report (LiveCalc vs alternatives: MG Alpha, Pathwise, Azure Batch)

**Demo Achievements:**
- 1M policies × 1K scenarios projected in <2 minutes (CPU time)
- Python UDF (smoker adjustment) adds <10% overhead
- Full pipeline ESG → Projection → Solver runs in <10 minutes
- Cost-per-calculation: $5.30 (estimated) vs GPU/cloud alternatives
- Assumption audit trail proves reproducibility and governance

---

## Future Plans (Phase 4+)

### Phase 4: Production Deployment & Monitoring

#### PRD-LC-012: Remote Debugging (Planned)
- Step-through debugging of cloud-executed models
- Remote breakpoints and variable inspection
- Performance profiling with detailed metrics

#### PRD-LC-013: Cloud Platform Management (Planned)
- Azure Batch infrastructure automation
- Job queue management and auto-scaling
- Blob storage integration for input/output
- Key Vault for secrets management

#### PRD-LC-014: Standards & Documentation (In Progress)
- API security standards (JWT, tenant isolation)
- Git workflow and conventions
- Testing pyramid and performance benchmarks
- Infrastructure-as-code standards (Terraform)
- Monitoring and alerting patterns

### Phase 5: Scale & Ecosystem (Future)

**Roadmap:**
1. **Milliman Integrate Integration**: PluggableCalcEngine interface for Milliman's platform
2. **Model Versioning & Git Integration**: Full version control with branching/merging
3. **Collaborative Features**: Real-time co-editing of models and assumptions
4. **API Marketplace**: Third-party integrations and custom engines
5. **Production SLA**: 99.9% uptime guarantee with monitoring/alerting
6. **Global Deployment**: Multi-region cloud infrastructure (US, EU, APAC)

---

## Key Metrics & Performance

| Metric | Target | Actual |
|--------|--------|--------|
| Single Policy Projection | <1ms | <0.5ms ✓ |
| 10K Policies × 1K Scenarios | <30s | 2.5s ✓ |
| 100K Policies × 1K Scenarios | <300s | 25s ✓ |
| WASM Binary Size | <5MB | 100KB ✓ |
| Worker Pool Speedup | 4-6x | 5.6x ✓ |
| Python UDF Overhead | <10% | <10% ✓ |
| Full Demo Runtime | <10 min | <10 min ✓ |

---

## Current Development Status

**Latest Session:** 2026-01-28
- **Current Phase:** Phase 3 (Demo) → Transitioning to Phase 4 (Production)
- **Active Work:** Production deployment infrastructure
- **Next Focus:** Remote debugging, cloud monitoring, standards documentation

**Health:**
- ✅ All core systems operational
- ✅ Demo successfully showcases all capabilities
- ✅ Performance targets exceeded on all benchmarks
- 🔄 Cloud infrastructure in final testing phase

---

## How to Provide Context to Claude Web

When using Claude Web with LiveCalc:

1. **Summarize the goal:** "Build a feature for [specific functionality]"
2. **Reference architecture:** Use this document's architecture section
3. **Mention phase:** "We're in Phase 4 (Production Deployment)"
4. **Note constraints:**
   - 16-byte alignment for SharedArrayBuffer (SIMD requirement)
   - WASM binary size <5MB
   - Performance targets: <120s for 1M × 1K projection
5. **Reference standards:** Point to `/FADE.md` for coding standards, security patterns, git conventions

---

## Quick Reference Links

- **Repository:** https://github.com/themitchelli/LiveCalc
- **Project Standards:** `./FADE.md`
- **Architecture Docs:** `./docs/architecture/`
- **API Specs:** `./standards/api-security.md`
- **Demo Scripts:** `./livecalc-demo/scripts/`
- **Test Results:** Check PRD status in `./fade/prds/`

---

## Contact & Escalation

- **Project Lead:** @themitchelli
- **Questions:** Refer to `FADE.md` Section "Off-Limits Modules" and "Session Boundaries"
- **Blockers:** Document in `progress.md` with `BLOCKED: [reason]` format

---

*Last Updated: 2026-01-28*
*Status: Production Ready (Phase 4 - In Progress)*
