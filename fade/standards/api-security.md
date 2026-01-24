# API Security Standard

Guidelines for building secure APIs. Apply these when generating or reviewing API code.

---

## 1. Authenticate by Default

Every endpoint requires authentication unless explicitly marked public.

**Apply:**
- Add auth middleware to all routes by default
- Use bearer tokens or API keys with proper validation
- Never trust client-provided user IDs—extract from verified token

**Rationale:** Unauthenticated endpoints are the #1 source of API vulnerabilities. Default-secure means you must opt OUT of auth, not opt IN.

---

## 2. Object-Level Authorization

Verify the authenticated user can access the specific resource being requested.

**Apply:**
- Check ownership or role permissions before returning data
- Use `WHERE user_id = ?` in queries, not just `WHERE id = ?`
- Never trust that a valid session means access to all resources

```python
# Bad - only checks if object exists
def get_order(order_id):
    return Order.query.get(order_id)

# Good - checks ownership
def get_order(order_id, current_user):
    return Order.query.filter_by(id=order_id, user_id=current_user.id).first_or_404()
```

**Rationale:** BOLA (Broken Object Level Authorization) is OWASP API #1. Users can enumerate IDs; you must verify they own what they're requesting.

---

## 3. Schema-First Input Validation

Define expected input shape; reject anything that doesn't match.

**Apply:**
- Use schema validation (Zod, Pydantic, JSON Schema) on all inputs
- Validate type, format, length, and allowed values
- Reject requests with extra fields (disallow unknown)
- Validate path params, query params, headers—not just body

```typescript
// Good - explicit schema
const createUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  role: z.enum(['user', 'admin']).default('user')
}).strict();  // Rejects extra fields
```

**Rationale:** Unvalidated input leads to injection, type confusion, and mass assignment. Schema validation catches these at the boundary.

---

## 4. Least Data Returned

Return only fields the client needs; never expose internal fields.

**Apply:**
- Define response schemas; don't return raw database objects
- Exclude: IDs of related objects the user can't access, internal timestamps, soft-delete flags, hashed passwords, tokens
- Use explicit allow-lists, not block-lists

```javascript
// Bad - returns entire user object
return user;

// Good - explicit response shape
return {
  id: user.id,
  name: user.name,
  email: user.email
};
```

**Rationale:** Excess data exposure leaks information attackers use for enumeration, privilege escalation, or further attacks.

---

## 5. Rate Limiting

Limit request frequency to prevent abuse and brute-force attacks.

**Apply:**
- Apply rate limits at API gateway or middleware level
- Stricter limits on auth endpoints (login, password reset)
- Include rate limit headers in responses (`X-RateLimit-*`)
- Consider per-user AND per-IP limits

| Endpoint Type | Suggested Limit |
|---------------|-----------------|
| Public read | 100/min |
| Authenticated | 300/min |
| Auth (login, signup) | 10/min |
| Password reset | 5/min |

**Rationale:** Without rate limits, attackers can brute-force credentials, enumerate resources, or DoS your API.

---

## 6. Parameterized Queries

Never interpolate user input into SQL, commands, or queries.

**Apply:**
- Use parameterized queries or ORM methods exclusively
- Never use string concatenation or f-strings for queries
- Same rule for NoSQL, shell commands, LDAP queries

```python
# Bad - SQL injection
cursor.execute(f"SELECT * FROM users WHERE email = '{email}'")

# Good - parameterized
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
```

**Rationale:** Injection attacks (SQL, NoSQL, command) remain in OWASP top 10. Parameterized queries make injection structurally impossible.

---

## 7. Secure Error Handling

Return safe error messages; log detailed errors server-side.

**Apply:**
- Use generic client messages: "Not found", "Unauthorized", "Invalid request"
- Never expose: stack traces, SQL errors, file paths, internal IPs
- Log full details server-side for debugging
- Use consistent error response format

```json
// Good - safe client response
{
  "error": "Not found",
  "code": "RESOURCE_NOT_FOUND"
}

// Server log (not returned to client)
// "User 123 attempted to access Order 456 (not owner) at 2024-01-15T10:30:00Z"
```

**Rationale:** Detailed errors help attackers understand your stack, find vulnerabilities, and craft exploits.

---

## Quick Reference

| Principle | Key Action |
|-----------|------------|
| Auth by default | Add middleware to ALL routes |
| Object-level authz | Check ownership, not just existence |
| Schema validation | Validate ALL input with explicit schemas |
| Least data | Return allow-listed fields only |
| Rate limiting | Apply limits, stricter on auth |
| Parameterized queries | Never interpolate user input |
| Safe errors | Generic to client, detailed in logs |

---

## When to Read This Standard

Read this document when:
- Creating new API endpoints
- Reviewing API code for security
- Designing authentication or authorization flows
- Handling user input or database queries
