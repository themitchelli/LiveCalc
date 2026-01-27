<!-- FADE FADE.md v0.3.1 -->

# LiveCalc

<!-- FADE.md - Project context for AI coding agents. This file is READ-ONLY for agents. -->

---

## Project Overview

LiveCalc provides **instant actuarial model feedback** through a VS Code extension powered by a high-performance WASM calculation engine.

**What problem does it solve?**
- Eliminates the traditional actuarial workflow delay: write model → export to Excel/Python → wait for results → iterate
- Provides sub-second feedback for model changes with auto-run on save
- Scales from desktop (1K scenarios) to cloud (1M+ scenarios) seamlessly
- Enables collaborative modeling with centralized assumption management

**Who are the users?**
- Actuaries building and testing life insurance projection models
- Actuarial teams collaborating on shared assumption libraries
- Platform engineers deploying cloud-scale actuarial computations

**Current state:**
- **MVP Complete**: Core engine (C++/WASM), VS Code extension with results visualization, assumptions manager integration, modular pipeline orchestration
- **In Progress**: Cloud execution infrastructure (Azure Batch), remote debugging capabilities
- **Planned**: Model versioning, collaborative features, production deployment

**Tech Stack:**
- **Core Engine**: C++ compiled to WASM via Emscripten (with SIMD support)
- **Desktop**: TypeScript (VS Code extension), Web Workers for parallelism
- **Cloud API**: Python (FastAPI), Azure services (Blob Storage, Batch, Key Vault)
- **Infrastructure**: Terraform (Azure), Kubernetes (AKS), GitHub Actions (CI/CD)

**Repository:** https://github.com/themitchelli/LiveCalc

---

## Coding Standards

<!--
Define how code should be written in this project. Link to external style guides
rather than duplicating them. Include project-specific conventions that differ
from or extend the standard guides.
-->

### Style Guides

- **TypeScript:** [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- **Python:** [PEP 8](https://peps.python.org/pep-0008/)
- **API Design:** [JSON:API Specification](https://jsonapi.org/)

### Project Conventions

- Naming: `camelCase` for variables, `PascalCase` for components
- Tests: Co-locate with source files as `*.test.ts`
- Commits: Conventional commits format (`feat:`, `fix:`, `chore:`)

---

## Standards

<!--
Link to detailed standards documents. These are loaded by Claude when working
on relevant tasks. Add your own project-specific standards as needed.
-->

| Standard | Description |
|----------|-------------|
| [API Security](standards/api-security.md) | API-first strategy, security by design, JWT auth, tenant isolation |
| [Git](standards/git.md) | Commit messages, branch naming, FADE-specific conventions |
| [Coding](standards/coding.md) | Naming, comments philosophy, error handling, code organization |
| [Testing](standards/testing.md) | Test pyramid, performance benchmarks, regression protection |
| [Infrastructure](standards/infrastructure.md) | Everything as code (Terraform, Helm, config) |
| [Documentation](standards/documentation.md) | README structure, API docs, code comments, what NOT to document |

---

## Architecture References

### System Overview

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

**Key Architectural Patterns:**
- **Zero-copy parallelism**: SharedArrayBuffer with bus:// protocol eliminates data copying between workers
- **CalcEngine interface**: Pluggable calculation engines (WASM, Python, future: Milliman Integrate)
- **API-first**: All cloud services expose REST APIs consumed by VS Code extension
- **Modular pipelines**: DAG-based orchestration for multi-engine calculations

### Key Documents

| Document | Location | Description |
|----------|----------|-------------|
| Data Flow & Scaling | `docs/architecture/data-flow-and-scaling.md` | Memory budgets, tiered execution (local vs cloud) |
| SIMD Alignment | `livecalc-engine/docs/simd-alignment.md` | 16-byte alignment requirements for SIMD |
| CalcEngine Interface | `livecalc-engine/README.md` | Interface for pluggable engines |
| Pipeline Orchestration | PRD-LC-010 | Modular DAG execution with bus:// resources |

---

## Target Architecture

**Bias toward these patterns in all work, even when the current PRD doesn't directly address them:**

- **API-first design**: Design OpenAPI spec before implementation. All cloud services expose REST APIs.
- **bus:// protocol**: All pipeline data flows through SharedArrayBuffer bus resources (no copying).
- **CalcEngine interface**: All calculation engines implement the standardized interface (initialize, runChunk, dispose).
- **Zero-copy parallelism**: Use SharedArrayBuffer and Atomics for inter-worker communication (no postMessage data copying).
- **16-byte alignment**: All SharedArrayBuffer allocations must be 16-byte aligned for SIMD compatibility.
- **Everything as code**: Infrastructure (Terraform), config (JSON/YAML), docs (Markdown), monitoring (Prometheus rules).
- **Security by design**: Authentication, authorization, encryption, and audit logging considered from the start (not retrofitted).
- **Config-driven**: Feature flags, environment-specific values, and behavior in config files (not hardcoded).

---

---

## Off-Limits Modules

**These directories should NOT be modified by agents:**

| Path | Reason | Contact |
|------|--------|---------|
| `livecalc-engine/build/` | Generated files from CMake/Make | n/a |
| `livecalc-engine/build-wasm*/` | Generated WASM build outputs | n/a |
| `*/node_modules/` | Third-party dependencies managed by npm | n/a |
| `livecalc-vscode/dist/` | Build output from esbuild | n/a |
| `livecalc-vscode/media/vendor/` | Vendored Chart.js and plugins | n/a |
| `.github/workflows/*.yml` | CI/CD configuration (requires human approval) | @platform |

**If you need to modify an off-limits module:** Stop and ask the human for guidance.

---

## Session Boundaries

### Allowed Actions

**Agents may freely perform these actions:**
- Create, modify, delete files in `livecalc-engine/src/`, `livecalc-vscode/src/`, `tests/`, `docs/`, `standards/`
- Add/modify unit and integration tests
- Run tests and linters (`npm test`, `npm run compile`, `make test`)
- Install dev dependencies (`npm install --save-dev`)
- Create feature branches (`feature/PRD-LC-XXX-description`)
- Update PRD files (set `passes: true` after completion)
- Append to `progress.md` and `learned.md`
- Create/modify documentation files (README, standards, architecture docs)

### Requires Human Approval

**Ask before proceeding with:**
- Changes to CI/CD configuration (`.github/workflows/`, `Dockerfile`)
- Cloud infrastructure changes (Terraform, Kubernetes manifests)
- Changes to authentication or authorization logic
- Dependency upgrades (major versions)
- Deleting more than 5 files in one session
- Adding new npm/pip dependencies (production dependencies)
- Creating new Azure services or resources

### Never Do

**Agents must NEVER:**
- Push directly to `main` branch (always use feature branches)
- Commit secrets, API keys, or credentials (use Azure Key Vault references)
- Modify files in `build/`, `dist/`, `node_modules/` directories
- Disable security features (CORS, authentication, TLS validation)
- Run destructive commands on cloud resources
- Disable or skip tests to "make things pass"

---

## Session Termination Protocol

After outputting a completion signal, Claude Code MUST STOP IMMEDIATELY.

### After STORY_DONE: US-XXX
- Output ONLY the signal line: `STORY_DONE: US-XXX`
- Do NOT continue processing
- Do NOT output "Starting next iteration"
- Do NOT process another story
- The fade orchestrator will restart with fresh context for the next story

### After ALL_COMPLETE
- Output ONLY the signal line: `ALL_COMPLETE`
- Do NOT continue processing
- Fade will trigger regression test generation automatically
- Do NOT attempt to run tests yourself

### After BLOCKED: [reason]
- Output ONLY the signal line: `BLOCKED: [reason]`
- Ensure progress.md has been updated with block documentation
- Do NOT continue processing
- Fade will exit and wait for human intervention

**CRITICAL:** Any output after a completion signal will break the orchestrator's signal detection. Stop immediately after outputting the signal. The fade script uses exact line-based matching.

---

---

## System Context

### Current Challenges

- **Performance targets**: Multi-threaded execution must meet <3s for 10K×1K (currently: 370ms ✓)
- **Memory constraints**: Browser-based execution limited by SharedArrayBuffer and WASM memory
- **Cloud integration**: Azure Batch infrastructure in progress (PRD-LC-008)
- **Security hardening**: Assumptions Manager authentication complete, but SAS token scoping needs implementation

### Transition Plan

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Core Engine & VS Code MVP | ✅ COMPLETE |
| Phase 2 | Assumptions Manager & Pipeline Orchestration | ✅ COMPLETE |
| Phase 3 | Cloud Execution (Azure Batch) | ← CURRENT |
| Phase 4 | Production Deployment & Monitoring | NOT STARTED |

### Active Work Items

- [FEATURE] Cloud execution infrastructure (PRD-LC-008) - in progress
- [FEATURE] Remote debugging capabilities (PRD-LC-012) - planned
- [DOCS] Standards documentation (PRD-LC-014) - in progress
- [SPIKE] Multi-threading performance optimization (SPIKE-LC-007) - ✅ complete

---

## Development Environment

### Local Development

**LiveCalc Engine (C++/WASM):**
```bash
cd livecalc-engine

# Native build for testing
mkdir build && cd build
cmake ..
make
./livecalc_tests

# WASM build (requires Emscripten)
mkdir build-wasm && cd build-wasm
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release
emmake make
```

**VS Code Extension (TypeScript):**
```bash
cd livecalc-vscode
npm install
npm run compile     # TypeScript compilation
npm test           # Run tests
npm run package    # Create .vsix package

# Debug: Press F5 in VS Code to launch Extension Development Host
```

**JavaScript Wrapper (for engine):**
```bash
cd livecalc-engine/js
npm install
npm test                    # Unit and integration tests
npm run benchmark          # Performance benchmarks
```

**Required Tools:**
- Node.js 18+ (for TypeScript and npm)
- Emscripten SDK (for WASM builds)
- CMake 3.20+ (for C++ builds)
- VS Code 1.85.0+ (for extension development)

**Environment Variables:**
- None required for local development
- Cloud API credentials stored in VS Code SecretStorage (encrypted)

### Production/Deployment

**VS Code Extension:**
- Packaged as `.vsix` file via `npm run package`
- Published to VS Code Marketplace (manual process, requires publisher account)
- Version managed in `package.json`

**Cloud API (future):**
- Deployed to Azure Kubernetes Service (AKS) via Helm charts
- Infrastructure managed via Terraform
- CI/CD via GitHub Actions (`.github/workflows/`)
- Secrets stored in Azure Key Vault

---

## Additional Context

### Known Gotchas

- **SIMD builds require 16-byte alignment**: All SharedArrayBuffer allocations must use `alignUp(size, 16)` not just 8-byte alignment
- **BigInt for uint64_t**: WASM functions with `uint64_t` parameters require `BigInt(value)` in JavaScript
- **SharedArrayBuffer requires headers**: Browsers need `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`
- **Worker pool overhead**: Cold start includes ~200ms (init + load). Use warm timing for production benchmarks.
- **CRC32 performance**: Integrity checking adds ~1ms per MB. Disabled by default, enable for debugging.

### Recent Major Changes

- **2026-01-24**: Completed modular pipeline orchestration (PRD-LC-010) with bus:// protocol and breakpoint debugging
- **2026-01-24**: Integrated Assumptions Manager (PRD-LC-006) with JWT auth and local caching
- **2026-01-24**: Implemented auto-run on save (PRD-LC-005) with smart re-run optimization
- **2026-01-24**: Added comprehensive results visualization (PRD-LC-004) with comparison and export
- **2026-01-23**: Multi-threading via work-stealing scheduler (SPIKE-LC-007) achieving 5.6x speedup

### Upcoming Changes

- **PRD-LC-008**: Cloud execution infrastructure with Azure Batch for large-scale runs (100K+ policies)
- **PRD-LC-012**: Remote debugging API for step-through debugging of cloud-executed models
- **Production deployment**: Monitoring, alerting, and operational readiness for cloud services

---

## Fragile Areas

<!--
Known problem spots. Exercise extra caution here - smaller commits, more
verification, ask before major refactoring. Remove when cleaned up.
-->

| Area | Why it's fragile |
|------|------------------|
| `example/path/` | Example: Changes cascade unpredictably |
| `another/module.py` | Example: Looks simple, always takes 5x longer |
