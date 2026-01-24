# Architecture Standard

Questions to guide architectural decisions. Reference this when designing systems, adding services, or making infrastructure choices.

*Adapted from [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/). Principles are generic; apply to any project type.*

---

## 1. Operational Excellence

Can you deploy, monitor, and evolve this system confidently?

**Consider:**
- How will you deploy changes? (CI/CD, rollback strategy)
- What happens when something fails at 2 AM? (alerts, runbooks)
- How do you know the system is healthy? (metrics, logs, dashboards)
- Can the team maintain this in 6 months? (documentation, simplicity)

**Apply:**
- Automate deployments—no manual steps in production
- Add health checks and structured logging from the start
- Design for incremental changes, not big-bang releases
- Document operational procedures alongside code

---

## 2. Security

Is access controlled and data protected at every layer?

**Consider:**
- Who can access this system? How is identity verified?
- What's the blast radius if credentials leak?
- Is sensitive data encrypted in transit and at rest?
- How do you detect and respond to security incidents?

**Apply:**
- Apply least-privilege: grant minimum necessary permissions
- Never store secrets in code; use environment variables or vaults
- Encrypt all external communication (HTTPS, TLS)
- Log access attempts; alert on anomalies

*See also: `standards/api-security.md` for API-specific security.*

---

## 3. Reliability

Will this system recover gracefully when things go wrong?

**Consider:**
- What happens when a dependency fails? (timeout, retry, fallback)
- How does the system behave under unexpected load?
- What's the recovery process for data loss?
- Are there single points of failure?

**Apply:**
- Design for failure: timeouts, circuit breakers, graceful degradation
- Test failure scenarios (dependency down, disk full, OOM)
- Implement backups and verify restore procedures
- Avoid single points of failure in critical paths

---

## 4. Performance

Is the system fast enough for users and efficient in resource use?

**Consider:**
- What are the latency requirements? (P50, P95, P99)
- Where are the likely bottlenecks? (DB queries, network, compute)
- How does performance scale with load?
- Are you caching effectively without creating consistency issues?

**Apply:**
- Measure before optimizing—profile, don't guess
- Cache at appropriate layers (CDN, app, DB)
- Use async/background processing for slow operations
- Set performance budgets and monitor against them

---

## 5. Cost

Are you spending efficiently, avoiding waste?

**Consider:**
- What does this cost to run? (compute, storage, bandwidth)
- Are resources right-sized, or over-provisioned "just in case"?
- Do you have visibility into cost drivers?
- What's the cost of not doing this? (opportunity cost)

**Apply:**
- Start small; scale based on measured need
- Use autoscaling rather than over-provisioning
- Review costs regularly; sunset unused resources
- Consider cost in technology choices (managed vs self-hosted)

---

## 6. Sustainability

Is this system efficient and maintainable long-term?

**Consider:**
- Are resources utilized efficiently? (CPU, memory, storage)
- Does the architecture minimize unnecessary computation?
- Can this system evolve without major rewrites?
- Is the technical debt manageable?

**Apply:**
- Right-size resources; shut down idle environments
- Avoid premature optimization but design for efficiency
- Keep dependencies minimal and up-to-date
- Refactor incrementally; don't let debt compound

---

## Quick Reference

| Pillar | Core Question |
|--------|---------------|
| Operational Excellence | Can we deploy and operate confidently? |
| Security | Is access controlled, data protected? |
| Reliability | Does it recover gracefully from failure? |
| Performance | Is it fast enough, efficient enough? |
| Cost | Are we spending wisely? |
| Sustainability | Is it efficient and maintainable long-term? |

---

## When to Read This Standard

Read this document when:
- Designing a new system or service
- Adding significant infrastructure (databases, queues, caches)
- Making technology choices (build vs buy, language, framework)
- Reviewing architecture decisions
- Planning for scale or reliability improvements
