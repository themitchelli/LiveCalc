# LiveCalc Cloud API

Job submission and execution bridge for LiveCalc cloud runtime.

## Overview

The Cloud API provides the bridge between the local VS Code extension and the cloud execution grid. It handles:

- **Job Submission**: Upload model packages and queue for execution
- **Authentication**: JWT validation against Assumptions Manager
- **Storage**: Tenant-isolated package storage with SHA-256 integrity
- **Job Queue**: Redis-backed priority queue for worker coordination
- **Progress Streaming**: WebSocket endpoints for real-time progress (US-BRIDGE-05)

## Architecture

```
VS Code Extension → POST /v1/jobs/submit → Cloud API → Redis Queue → Worker Pool
                                              ↓
                                       Blob Storage
```

## API Endpoints

### POST /v1/jobs/submit

Submit a job for cloud execution.

**Authentication**: Requires JWT Bearer token from Assumptions Manager.

**Request** (multipart/form-data):
- `package` (file): Model package .zip file (max 100MB)
- `model_name` (string, optional): Model name for identification
- `priority` (int, 0-10): Job priority (default: 0)

**Response** (201 Created):
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "websocketUrl": "ws://localhost:8000/jobs/550e8400-e29b-41d4-a716-446655440000/stream",
  "createdAt": "2026-01-25T01:30:00Z",
  "estimatedStartTime": null
}
```

**Errors**:
- `401 Unauthorized`: Missing or invalid JWT token
- `400 Bad Request`: Invalid package format
- `413 Request Entity Too Large`: Package exceeds 100MB
- `500 Internal Server Error`: Storage or queue failure

### GET /v1/jobs/{job_id}

Get job status and details.

**Authentication**: Requires JWT Bearer token. Only returns jobs for the authenticated tenant.

**Response** (200 OK):
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "tenant-123",
  "userId": "user-456",
  "modelName": "term-life-model",
  "priority": 5,
  "status": "running",
  "packagePath": "/data/packages/tenant-123/550e8400-e29b-41d4-a716-446655440000.zip",
  "packageHash": "abc123...",
  "websocketUrl": "ws://localhost:8000/jobs/550e8400-e29b-41d4-a716-446655440000/stream",
  "createdAt": "2026-01-25T01:30:00Z",
  "startedAt": "2026-01-25T01:30:05Z",
  "completedAt": null,
  "resultData": null,
  "errorMessage": null,
  "executionTimeMs": null
}
```

### DELETE /v1/jobs/{job_id}

Cancel a job.

**Authentication**: Requires JWT Bearer token. Only allows cancelling jobs for the authenticated tenant.

**Response** (204 No Content)

**Errors**:
- `404 Not Found`: Job does not exist
- `403 Forbidden`: Job belongs to different tenant
- `409 Conflict`: Job cannot be cancelled (already running/completed)

## Development

### Prerequisites

- Python 3.11+
- Redis 7.0+

### Setup

```bash
cd livecalc-cloud/api

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Run Locally

```bash
# Start Redis (if not running)
docker run -d -p 6379:6379 redis:7-alpine

# Run API
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API will be available at:
- Docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

### Docker Build

```bash
# Build image
docker build -t livecalc-cloud-api -f Dockerfile .

# Run container
docker run -d \
  -p 8000:8000 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -v /data/packages:/data/packages \
  livecalc-cloud-api
```

## Authentication

All endpoints (except `/health` and `/`) require a valid JWT Bearer token from Assumptions Manager.

**Example**:
```bash
curl -X POST http://localhost:8000/v1/jobs/submit \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -F "package=@model-package.zip" \
  -F "priority=5"
```

The API validates tokens against the Assumptions Manager JWKS endpoint and extracts:
- `tenant_id`: For storage isolation
- `user_id`: For audit logging
- `exp`: Token expiration

## Storage

Packages are stored in tenant-isolated directories:
```
/data/packages/
  ├── tenant-123/
  │   ├── 550e8400-e29b-41d4-a716-446655440000.zip
  │   └── 660e8400-e29b-41d4-a716-446655440001.zip
  └── tenant-456/
      └── 770e8400-e29b-41d4-a716-446655440002.zip
```

Each package:
- Has a unique job ID filename
- Is limited to 100MB
- Has a SHA-256 hash computed on upload
- Is deleted after job completion or cancellation

## Job Queue

Jobs are stored in Redis with:
- **Job Data**: `job:{jobId}` (24 hour TTL)
- **Tenant Index**: `tenant:{tenantId}:jobs` (set of job IDs)
- **Status Queues**: `queue:{status}` (sorted sets by priority + timestamp)

Job lifecycle:
1. `QUEUED`: Waiting for worker pickup
2. `INITIALIZING`: Worker loading package
3. `RUNNING`: Execution in progress
4. `COMPLETED`: Success
5. `FAILED`: Error occurred
6. `CANCELLED`: User cancelled

Priority scoring: `score = (10 - priority) * 1e10 + timestamp`
- Higher priority (10) → lower score → dequeued first
- Same priority → FIFO by timestamp

## Testing

```bash
# Install test dependencies
pip install pytest pytest-asyncio httpx

# Run tests
pytest tests/

# Run with coverage
pytest --cov=. tests/
```

## Deployment

See `livecalc-cloud/k8s/api-deployment.yaml` for Kubernetes deployment manifest.

## Next Steps

- **US-BRIDGE-04**: Cloud pipeline reconstruction (worker implementation)
- **US-BRIDGE-05**: WebSocket result streaming
- **Production**: Add observability (Prometheus metrics, structured logging)
