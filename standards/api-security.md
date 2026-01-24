# API & Security Standards

## Core Principles

### API-First Strategy

**Design the API contract before implementation.** All cloud services expose well-documented REST APIs. VS Code integration and other clients consume these APIs.

1. **OpenAPI/Swagger specification first**: Write the API spec before code
2. **Generate server stubs** from spec (ensures compliance)
3. **Generate client SDKs** from spec (ensures type safety)
4. **Versioning**: Use URL path versioning (`/v1/`, `/v2/`)
5. **Documentation**: Auto-generate from spec, keep in sync via CI

```yaml
# openapi.yaml
openapi: 3.0.0
info:
  title: LiveCalc Cloud API
  version: 1.0.0
paths:
  /v1/jobs:
    post:
      summary: Submit a new projection job
      # ... detailed spec
```

### Security by Design

**Privacy and security are architectural requirements, not afterthoughts.** Every data flow must consider:

1. **Authentication**: Who is making this request?
2. **Authorization**: Are they allowed to access this resource?
3. **Encryption**: Is data protected in transit and at rest?
4. **Audit**: Can we trace who did what and when?

Build these in from day one. Retrofitting security is expensive and error-prone.

---

## Authentication

### JWT Bearer Tokens

All cloud API requests require JWT authentication:

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Requirements**:
- Tokens issued by Assumptions Manager authentication service
- RS256 algorithm (asymmetric signing)
- Short-lived: **1 hour maximum expiry**
- Include claims: `sub` (user ID), `tenant_id`, `email`, `iat`, `exp`

**Validation**:
```python
# Python (FastAPI)
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer
import jwt

security = HTTPBearer()

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        # Fetch JWKS from Assumptions Manager
        payload = jwt.decode(
            token,
            key=get_jwks_public_key(),
            algorithms=["RS256"],
            audience="livecalc-api"
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
```

### Token Refresh

Use refresh tokens for long-lived sessions:

1. **Access token**: Short-lived (1 hour), used for API calls
2. **Refresh token**: Longer-lived (7 days), used to get new access tokens
3. **Rotation**: Issue new refresh token on each refresh (invalidate old one)

```typescript
// TypeScript (VS Code extension)
class AuthManager {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  async getAccessToken(): Promise<string> {
    if (this.isTokenExpired(this.accessToken)) {
      await this.refreshAccessToken();
    }
    return this.accessToken!;
  }

  private async refreshAccessToken(): Promise<void> {
    const response = await fetch(`${AUTH_URL}/token/refresh`, {
      method: 'POST',
      body: JSON.stringify({ refresh_token: this.refreshToken }),
    });
    const { access_token, refresh_token } = await response.json();
    this.accessToken = access_token;
    this.refreshToken = refresh_token;
  }
}
```

---

## Authorization

### Tenant Isolation

**Hard requirement**: Users can **only** access their own tenant's data.

**Implementation**:
1. Extract `tenant_id` from validated JWT
2. Scope all queries by tenant: `WHERE tenant_id = :tenant_id`
3. Validate resource ownership before mutations
4. Never trust client-provided tenant IDs (use JWT claim)

```python
# Python API endpoint
@router.get("/v1/jobs/{job_id}")
async def get_job(job_id: str, user: User = Depends(verify_token)):
    # Get job from database
    job = await db.get_job(job_id)

    # Authorization: verify ownership
    if job.tenant_id != user.tenant_id:
        raise HTTPException(403, "Access denied")

    return job
```

**Database queries**:
```sql
-- Always scope by tenant
SELECT * FROM jobs
WHERE job_id = :job_id
  AND tenant_id = :tenant_id;  -- Prevents cross-tenant access

-- Use row-level security (PostgreSQL)
CREATE POLICY tenant_isolation ON jobs
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### Resource Scoping

Scope access tokens to specific resources where possible:

**Azure Blob SAS Tokens**:
```python
def generate_upload_sas(tenant_id: str, filename: str) -> str:
    # Scope to tenant's container + specific file prefix
    sas = generate_blob_sas(
        account_name="livecalc",
        container_name="uploads",
        blob_name=f"{tenant_id}/{filename}",
        permission="racw",  # read, add, create, write
        expiry=datetime.utcnow() + timedelta(hours=1)
    )
    return f"https://livecalc.blob.core.windows.net/uploads/{tenant_id}/{filename}?{sas}"
```

**Key characteristics**:
- **Short-lived**: 1 hour maximum
- **Minimum permissions**: Only what's needed (read-only for downloads, write for uploads)
- **Scoped path**: Include tenant ID in path to prevent cross-tenant access

### Quota Enforcement

Prevent resource exhaustion with per-tenant quotas:

```python
class QuotaService:
    async def check_quota(self, tenant_id: str, resource: str) -> None:
        usage = await self.get_usage(tenant_id, resource)
        limit = await self.get_limit(tenant_id, resource)

        if usage >= limit:
            raise HTTPException(
                429,  # Too Many Requests
                f"Quota exceeded for {resource}. "
                f"Current: {usage}, Limit: {limit}. "
                f"Upgrade your plan or contact support."
            )

    async def increment_usage(self, tenant_id: str, resource: str, amount: int):
        await redis.hincrby(f"quota:{tenant_id}", resource, amount)
```

**Quota types**:
- Concurrent jobs (e.g., 5 for standard, 20 for enterprise)
- Compute hours per month
- Storage size
- API requests per minute

---

## Data Protection

### Encryption in Transit

**Requirement**: TLS 1.3 for all network traffic.

```yaml
# Kubernetes Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    nginx.ingress.kubernetes.io/ssl-protocols: "TLSv1.3"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
    - hosts:
        - api.livecalc.io
      secretName: livecalc-tls
```

**Reject**: TLS 1.2 and below (vulnerable to attacks)

### Encryption at Rest

**Azure Storage**: Encryption enabled by default (AES-256)

```python
# Verify encryption in Terraform
resource "azurerm_storage_account" "livecalc" {
  name                     = "livecalcstorage"
  enable_https_traffic_only = true
  min_tls_version          = "TLS1_3"

  # Encryption enabled by default, but be explicit
  encryption {
    services {
      blob {
        enabled = true
      }
    }
  }
}
```

**Database**: Enable transparent data encryption (TDE)

```python
# PostgreSQL on Azure
resource "azurerm_postgresql_server" "livecalc" {
  name = "livecalc-db"

  # TDE enabled by default on Azure
  infrastructure_encryption_enabled = true
}
```

### Secrets Management

**Never commit secrets to code or config.**

Use Azure Key Vault for all secrets:

```yaml
# Kubernetes: Reference Key Vault via CSI driver
apiVersion: v1
kind: Pod
metadata:
  name: api-pod
spec:
  containers:
    - name: api
      env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: livecalc-secrets
              key: db-password
  volumes:
    - name: secrets
      csi:
        driver: secrets-store.csi.k8s.io
        volumeAttributes:
          secretProviderClass: "azure-keyvault"
```

**Local development**:
- Use `.env` files (add to `.gitignore`)
- Provide `.env.example` with placeholder values
- Document how to get real secrets (Key Vault, team lead)

---

## Input Validation

### Validate at System Boundaries

**Validate all inputs at API endpoints and file uploads. Trust internal interfaces.**

```python
from pydantic import BaseModel, Field, validator

class JobSubmitRequest(BaseModel):
    policy_count: int = Field(..., ge=1, le=10_000_000)
    scenario_count: int = Field(..., ge=1, le=10_000)
    timeout_seconds: int = Field(300, ge=10, le=3600)

    @validator('policy_count')
    def validate_policy_count(cls, v):
        if v > 1_000_000 and tier == 'standard':
            raise ValueError('Standard tier limited to 1M policies')
        return v

@router.post("/v1/jobs")
async def submit_job(request: JobSubmitRequest, user: User = Depends(verify_token)):
    # Input already validated by Pydantic
    job = await job_service.submit(request, user.tenant_id)
    return job
```

**Don't validate internal calls**:
```python
# Internal service method - trust caller validated input
class JobService:
    async def submit(self, request: JobSubmitRequest, tenant_id: str):
        # No re-validation needed, request already validated at boundary
        job_id = generate_job_id()
        await queue.publish(job_id, request)
        return job_id
```

### Fail Fast with Clear Errors

Return helpful error messages for invalid input:

```python
# Good: Clear, actionable error
{
  "error": "Invalid request",
  "message": "policy_count must be between 1 and 10,000,000",
  "field": "policy_count",
  "value": -100
}

# Bad: Opaque error
{
  "error": "Bad request"
}
```

---

## Error Handling

### Never Expose Internal Details

**Production API responses**:
```python
try:
    result = process_job(job_id)
except Exception as e:
    # Log full details server-side
    logger.error(f"Job {job_id} failed: {e}", exc_info=True)

    # Return generic message to client
    raise HTTPException(500, "Internal server error")
```

**Development/staging** (optional):
```python
# Only in non-production environments
if settings.ENVIRONMENT != "production":
    raise HTTPException(500, f"Error: {str(e)}")
```

**What to hide**:
- Stack traces (reveal code structure)
- File paths (reveal directory layout)
- Database errors (reveal schema details)
- Internal service names (reveal architecture)

**What to show**:
- Request ID (for support/debugging)
- High-level error category (authentication, authorization, validation, server error)
- Next steps (retry, contact support, check input)

---

## Rate Limiting

### Per-Tenant Limits

Prevent abuse and ensure fair resource allocation:

```python
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=lambda request: request.state.user.tenant_id)

@router.post("/v1/jobs")
@limiter.limit("10/minute")  # 10 job submissions per minute per tenant
async def submit_job(request: Request, ...):
    # ...
```

**Limits**:
- Job submissions: 10/minute, 100/hour
- API requests: 100/minute, 1000/hour
- Refresh tokens: 10/hour
- Upload URLs: 20/hour

**Response headers**:
```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1643097600
```

**When exceeded**:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60

{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again in 60 seconds.",
  "limit": 100,
  "window": "1 minute"
}
```

---

## CORS Policy

### Explicit Origin Whitelisting

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "vscode-webview://",  # VS Code extension
        "https://app.livecalc.io",  # Web UI (if built)
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

**Never use `allow_origins=["*"]` with `allow_credentials=True`** (security risk).

---

## Audit Logging

### Log All Tenant Actions

```python
class AuditLogger:
    async def log(
        self,
        action: str,
        tenant_id: str,
        user_id: str,
        resource_id: str,
        details: dict,
    ):
        await db.insert("audit_log", {
            "timestamp": datetime.utcnow(),
            "action": action,
            "tenant_id": tenant_id,
            "user_id": user_id,
            "resource_id": resource_id,
            "details": json.dumps(details),
            "ip_address": request.client.host,
            "user_agent": request.headers.get("user-agent"),
        })

# Usage
await audit_logger.log(
    action="job.submit",
    tenant_id=user.tenant_id,
    user_id=user.user_id,
    resource_id=job_id,
    details={"policy_count": 100000, "scenario_count": 1000},
)
```

**What to log**:
- Job submissions, cancellations
- Data access (uploads, downloads)
- Authentication events (login, logout, token refresh)
- Authorization failures (attempted unauthorized access)
- Configuration changes
- Quota violations

**Retention**: 12 months minimum (compliance requirement)

---

## Security Checklist

Before deploying to production:

- [ ] All APIs require authentication (no anonymous endpoints)
- [ ] JWT validation against JWKS endpoint
- [ ] Tenant isolation verified (cannot access other tenant data)
- [ ] Rate limiting enabled
- [ ] TLS 1.3 enforced
- [ ] Secrets in Key Vault (not in code/config)
- [ ] Input validation at all boundaries
- [ ] Error messages don't expose internals
- [ ] Audit logging enabled
- [ ] CORS policy restrictive (no wildcard origins)
- [ ] Penetration testing completed
- [ ] Security review sign-off

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Azure Security Best Practices](https://learn.microsoft.com/en-us/azure/security/fundamentals/best-practices-and-patterns)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
