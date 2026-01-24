# Documentation Standards

## Core Principle

**Documentation is code.** It lives in the repository, is versioned with the code it describes, and is reviewed like code.

---

## When to Document

### Always Document

1. **Public APIs**: Every endpoint, parameter, response
2. **Architecture decisions**: Why this approach over alternatives
3. **Setup/deployment**: How to run locally, how to deploy
4. **Non-obvious code**: Complex algorithms, performance optimizations
5. **Configuration**: What each setting does, valid values

### Never Document

1. **Obvious code**: Self-explanatory logic
2. **Implementation details**: How a function works internally (use comments in code instead)
3. **Temporary decisions**: "This is a hack for now" (use TODO comments)

---

## README Files

### Project Root README

Every project has a root `README.md` with:

```markdown
# LiveCalc

Brief one-paragraph description of what LiveCalc does.

## Features

- Instant feedback actuarial modeling
- WASM-powered C++ projection engine
- VS Code integration with rich visualizations
- Cloud execution for large-scale batches

## Quick Start

\```bash
# Install dependencies
npm install

# Build engine
cd livecalc-engine/cpp && mkdir build && cd build
cmake .. && make

# Run VS Code extension
cd ../../livecalc-vscode
npm run watch
# Press F5 to launch extension in VS Code
\```

## Repository Structure

\```
livecalc/
├── livecalc-engine/       # C++ projection engine + WASM bindings
├── livecalc-vscode/       # VS Code extension
├── livecalc-api/          # Cloud API (FastAPI)
├── terraform/             # Infrastructure as code
└── docs/                  # Additional documentation
\```

## Documentation

- [Architecture Overview](docs/architecture.md)
- [API Reference](docs/api.md)
- [Development Guide](docs/development.md)
- [Deployment Guide](docs/deployment.md)

## License

MIT
```

### Package README

Each package/module has its own `README.md`:

```markdown
# LiveCalc Engine

High-performance actuarial projection engine in C++ with WASM bindings.

## Build

\```bash
mkdir build && cd build
cmake ..
make
\```

## Test

\```bash
npm test
\```

## Usage

See [API Documentation](../docs/engine-api.md).
```

**Key sections**:
- Purpose (one paragraph)
- How to build
- How to test
- Link to detailed docs

---

## API Documentation

### OpenAPI/Swagger Specification

**All REST APIs have OpenAPI 3.0 specs.**

```yaml
# openapi.yaml
openapi: 3.0.0
info:
  title: LiveCalc Cloud API
  version: 1.2.3
  description: |
    RESTful API for submitting actuarial projection jobs to the cloud.

    ## Authentication
    All endpoints require JWT Bearer token in Authorization header.

    ## Rate Limits
    - Job submissions: 10/minute
    - API requests: 100/minute

servers:
  - url: https://api.livecalc.io/v1
    description: Production

paths:
  /jobs:
    post:
      summary: Submit a new projection job
      description: |
        Submits a projection job to the cloud queue. Returns job ID
        for tracking progress.

      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JobSubmitRequest'

      responses:
        '200':
          description: Job submitted successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/JobSubmitResponse'
        '400':
          description: Invalid request
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '401':
          description: Unauthorized (invalid/expired token)
        '429':
          description: Rate limit exceeded

components:
  schemas:
    JobSubmitRequest:
      type: object
      required:
        - policy_count
        - scenario_count
      properties:
        policy_count:
          type: integer
          minimum: 1
          maximum: 10000000
          description: Number of policies to project
        scenario_count:
          type: integer
          minimum: 1
          maximum: 10000
          description: Number of stochastic scenarios
        # ... more fields

    JobSubmitResponse:
      type: object
      properties:
        job_id:
          type: string
          format: uuid
          description: Unique job identifier
        status:
          type: string
          enum: [queued, running, completed, failed]
        position:
          type: integer
          description: Position in queue
```

**Generate docs from spec**:

```bash
# Redoc (clean, modern)
docker run -p 8080:80 -e SPEC_URL=openapi.yaml redocly/redoc

# Swagger UI (interactive)
docker run -p 8080:8080 -e SWAGGER_JSON=/openapi.yaml swaggerapi/swagger-ui
```

### Code Comments for APIs

**TypeScript/JavaScript**:

```typescript
/**
 * Submits a projection job to the cloud API.
 *
 * @param config - Job configuration (policy count, scenarios, etc.)
 * @param apiUrl - Cloud API base URL
 * @returns Promise resolving to job ID
 * @throws {APIError} If API request fails
 * @throws {ValidationError} If config is invalid
 *
 * @example
 * ```typescript
 * const jobId = await submitCloudJob({
 *   policyCount: 100000,
 *   scenarioCount: 1000,
 * }, 'https://api.livecalc.io');
 * ```
 */
export async function submitCloudJob(
  config: JobConfig,
  apiUrl: string
): Promise<string> {
  // ...
}
```

**Python** (Docstrings):

```python
def submit_job(config: JobConfig, tenant_id: str) -> str:
    """
    Submit a projection job to the queue.

    Args:
        config: Job configuration (policy count, scenarios, etc.)
        tenant_id: Tenant identifier for isolation

    Returns:
        Job ID (UUID string)

    Raises:
        ValidationError: If config is invalid
        QuotaExceededError: If tenant quota exceeded

    Example:
        >>> job_id = submit_job(
        ...     JobConfig(policy_count=1000, scenario_count=100),
        ...     tenant_id="abc-123"
        ... )
        >>> print(job_id)
        'a1b2c3d4-...'
    """
    # ...
```

---

## Code Comments

### When to Comment

**Comment on WHY, not WHAT.**

#### Good Comments

```typescript
// 16-byte alignment required for SIMD compatibility
const alignedOffset = offset & ~15;

// CRC32 lookup table amortizes cost across all checksums in the session
const crc32Table = generateLookupTable();

// Anomaly detection: flag 3-sigma outliers for manual review
if (Math.abs(zscore) > 3.0) {
  flagAnomaly(result);
}

// TODO(PRD-LC-015): Add support for stochastic lapse rates
const lapseRate = assumptions.baseLapseRate;

// HACK: Temporary workaround for Emscripten bug #12345
// Remove when upgrading to Emscripten 3.1.50+
if (typeof Module.wasmBinary === 'undefined') {
  Module.wasmBinary = await fetch('livecalc.wasm').then(r => r.arrayBuffer());
}
```

#### Bad Comments

```typescript
// Bad: Obvious
// Increment counter by one
counter++;

// Bad: Restating code
// Loop through all policies
for (const policy of policies) {
  // Calculate NPV for each policy
  const npv = calculateNpv(policy);
}

// Bad: Outdated comment
// Returns the sum of two numbers
function multiply(a: number, b: number): number {
  return a * b;  // ← Comment is wrong!
}
```

### Comment Style

```typescript
// Single-line comment for brief notes

/*
 * Multi-line comment for longer explanations.
 * Used when a single line isn't enough.
 */

/**
 * JSDoc comment for documentation generation.
 * Used for public APIs, classes, interfaces.
 */
```

### TODOs and FIXMEs

```typescript
// TODO(PRD-LC-015): Add stratified sampling support
// Reference the PRD for context

// FIXME: Race condition when disposing workers during execution
// Seen in issue #42, needs investigation

// HACK: Workaround for browser SAB limit
// Investigate proper solution in PRD-LC-016
```

---

## Architecture Documentation

### High-Level Overview

**In `FADE.md` or `docs/architecture.md`:**

```markdown
## System Architecture

LiveCalc consists of three main components:

1. **VS Code Extension**: User interface and local orchestration
2. **WASM Engine**: High-performance C++ projection engine
3. **Cloud API**: Scalable batch execution on Azure (future)

\```
┌─────────────────────────────────────────────────────────┐
│                    VS Code Extension                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Results Panel│  │Pipeline View │  │ AM Explorer  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
    ┌─────────────────────────────────────────────────┐
    │         Worker Pool (SharedArrayBuffer)         │
    │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │
    │  │Worker 1│ │Worker 2│ │Worker 3│ │Worker N│   │
    │  │  WASM  │ │  WASM  │ │  WASM  │ │  WASM  │   │
    │  └────────┘ └────────┘ └────────┘ └────────┘   │
    └─────────────────────────────────────────────────┘
\```

### Design Principles

1. **API-First**: All cloud services expose REST APIs
2. **Security by Design**: Authentication and tenant isolation built-in
3. **Performance**: Zero-copy parallelism, SIMD optimization
4. **Debugging**: First-class observability and introspection
```

### Architecture Decision Records (ADRs)

**For significant decisions, create ADRs:**

```markdown
# ADR-001: Use SharedArrayBuffer for Zero-Copy Parallelism

## Status
Accepted

## Context
Worker threads need to share large policy datasets (100K+ policies).
Copying data to each worker consumes excessive memory and time.

## Decision
Use SharedArrayBuffer for zero-copy data sharing between workers.

## Consequences

### Positive
- 5.4x speedup with 8 workers (measured in SPIKE-LC-007)
- Memory usage scales with data size, not worker count
- Enables true parallel execution without serialization overhead

### Negative
- Requires crossOriginIsolation headers (complicates deployment)
- Limited browser support (Safari only in recent versions)
- Requires careful synchronization (Atomics API)

## Alternatives Considered
1. **Message passing with transferables**: Still requires copying
2. **Web Workers without SAB**: Memory scales linearly with workers
3. **Single-threaded with async/await**: No parallelism

## References
- PRD-LC-002 US-004
- SPIKE-LC-007 benchmark results
```

---

## Diagrams

### Text-Based Diagrams (Preferred)

**Mermaid** (renders in GitHub, VS Code):

```markdown
\```mermaid
sequenceDiagram
    participant User
    participant VSCode
    participant Worker
    participant WASM

    User->>VSCode: Click "Run"
    VSCode->>Worker: Initialize worker pool
    Worker->>WASM: Load livecalc.wasm
    WASM-->>Worker: Ready
    Worker-->>VSCode: Pool ready
    VSCode->>Worker: Submit chunks
    Worker->>WASM: Run projection
    WASM-->>Worker: Results
    Worker-->>VSCode: Aggregate results
    VSCode-->>User: Display in panel
\```
```

**ASCII art** (works everywhere):

```
┌─────────────────────────────────────────────────────────┐
│                      Client Layer                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Extension│  │  Config  │  │ Results  │              │
│  │  Host    │  │  Loader  │  │  Panel   │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
└───────┼─────────────┼─────────────┼─────────────────────┘
        │             │             │
        └─────────────┴─────────────┘
                      │
        ┌─────────────▼──────────────┐
        │   Orchestration Layer      │
        │  ┌────────────────────────┐│
        │  │ Pipeline Orchestrator  ││
        │  │ Memory Manager         ││
        │  │ Integrity Checker      ││
        │  └────────────────────────┘│
        └────────────┬───────────────┘
                     │
        ┌────────────▼───────────────┐
        │    Execution Layer         │
        │  ┌──────┐  ┌──────┐        │
        │  │ WASM │  │ WASM │  ...   │
        │  │Worker│  │Worker│        │
        │  └──────┘  └──────┘        │
        └────────────────────────────┘
```

**Avoid binary images** (PNG, JPG) - they don't version well and can't be diffed.

---

## Configuration Documentation

### Schema with Descriptions

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "LiveCalc Configuration",
  "description": "Configuration file for actuarial projection models",
  "type": "object",
  "required": ["policyData", "assumptions"],
  "properties": {
    "policyData": {
      "type": "string",
      "description": "Path to policy data file (CSV or binary format)"
    },
    "assumptions": {
      "type": "object",
      "description": "Assumption references for projection",
      "properties": {
        "mortality": {
          "type": "string",
          "description": "Mortality table reference (e.g., 'assumptions://AM2015:v1.2')"
        }
      }
    },
    "scenarios": {
      "type": "object",
      "description": "Stochastic scenario configuration",
      "properties": {
        "count": {
          "type": "integer",
          "minimum": 1,
          "maximum": 10000,
          "default": 1000,
          "description": "Number of scenarios to generate"
        }
      }
    }
  }
}
```

### Configuration Examples

**Provide working examples:**

```json
// livecalc.config.json (minimal example)
{
  "policyData": "./data/policies.csv",
  "assumptions": {
    "mortality": "assumptions://AM2015:v1.2",
    "lapse": "assumptions://Lapse2020:v2.0"
  }
}
```

```json
// livecalc.config.json (advanced example with pipeline)
{
  "policyData": "./data/policies.csv",
  "assumptions": {
    "mortality": "assumptions://AM2015:v1.2"
  },
  "pipeline": {
    "nodes": [
      {
        "id": "esg",
        "engine": "wasm://esg-generator",
        "outputs": ["bus://scenarios/rates"]
      },
      {
        "id": "projection",
        "engine": "wasm://livecalc",
        "inputs": ["bus://scenarios/rates"],
        "outputs": ["bus://results/npv"]
      }
    ]
  }
}
```

---

## Deployment Documentation

### Prerequisites

```markdown
## Prerequisites

- Node.js 18+ ([download](https://nodejs.org/))
- Python 3.11+ ([download](https://www.python.org/))
- CMake 3.20+ (`brew install cmake` on macOS)
- Docker 24+ ([download](https://www.docker.com/))
- Azure CLI ([install](https://docs.microsoft.com/cli/azure/install-azure-cli))
```

### Step-by-Step Instructions

```markdown
## Local Development Setup

1. **Clone repository**

   \```bash
   git clone https://github.com/themitchelli/LiveCalc.git
   cd LiveCalc
   \```

2. **Install dependencies**

   \```bash
   # Install Node.js packages
   cd livecalc-vscode && npm install
   cd ../livecalc-engine/js && npm install
   \```

3. **Build C++ engine**

   \```bash
   cd livecalc-engine/cpp
   mkdir build && cd build
   cmake ..
   make
   \```

4. **Run tests**

   \```bash
   cd livecalc-engine/js
   npm test
   \```

5. **Launch VS Code extension**

   \```bash
   cd livecalc-vscode
   npm run watch
   # Press F5 in VS Code to launch extension host
   \```
```

### Troubleshooting

```markdown
## Troubleshooting

### WASM module fails to load

**Symptom**: `Error: Cannot find module 'livecalc.wasm'`

**Solution**: Rebuild C++ engine
\```bash
cd livecalc-engine/cpp/build
make
\```

### SharedArrayBuffer not available

**Symptom**: `ReferenceError: SharedArrayBuffer is not defined`

**Solution**: Ensure crossOriginIsolation headers are set. See [MDN docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer).
```

---

## What NOT to Document

### Don't Document Obvious Code

```typescript
// Bad: Obvious comment
/**
 * Gets the user's name.
 * @returns The user's name
 */
getName(): string {
  return this.name;
}

// Good: No comment needed (self-documenting)
getName(): string {
  return this.name;
}
```

### Don't Duplicate External Docs

```markdown
<!-- Bad: Copy/paste TypeScript docs -->
## TypeScript Style Guide
1. Use camelCase for variables
2. Use PascalCase for classes
... (50 more lines)

<!-- Good: Link to external docs -->
## TypeScript Style Guide
Follow the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html).

LiveCalc-specific conventions:
- Actuarial terms use domain naming (policies, assumptions, projections)
- ...
```

---

## Documentation Checklist

Before marking a PRD complete:

- [ ] README updated (if project structure changed)
- [ ] API docs generated from OpenAPI spec (if API changed)
- [ ] Code comments added for non-obvious logic
- [ ] Configuration schema updated (if config changed)
- [ ] Architecture docs updated (if system design changed)
- [ ] ADR created (if significant architectural decision)
- [ ] Deployment guide updated (if deployment process changed)
- [ ] All links in docs are valid (no broken links)

---

## References

- [Write the Docs](https://www.writethedocs.org/)
- [Diátaxis Documentation Framework](https://diataxis.fr/)
- [Markdown Guide](https://www.markdownguide.org/)
- [Mermaid Documentation](https://mermaid-js.github.io/)
- [OpenAPI Specification](https://swagger.io/specification/)
