# Compliance Monitoring (COMPLIANCE.md §J)

Alerts and checks required for production per [COMPLIANCE.md](../Reference/COMPLIANCE.md) §J (Incident Response & Monitoring).  
**Related:** [OBSERVABILITY.md](../Reference/OBSERVABILITY.md) | [deployment-runbook.md](./deployment-runbook.md)

---

## 1. Monitoring Requirements (MUST)

| Requirement | How to implement | Status |
|-------------|------------------|--------|
| Monitor authentication failures (alert on spike) | Error tracking (Sentry) filter on 401/403; or log aggregation alert on `auth failure` / `Unauthorized` count > threshold in 5 min | Document / configure |
| Monitor rate limit violations (alert on abuse) | Log 429 responses; alert when 429 rate > N per minute per IP or globally | Document / configure |
| Monitor error rates (alert on >5% error rate) | Sentry or APM: alert if 5xx + 4xx as % of total requests > 5% over 10–15 min | Document / configure |
| Monitor database connection health | `GET /health` returns DB status; uptime check on `/health` and alert if 503 | Implemented (health endpoint) |

---

## 2. Alerting Triggers (MUST / SHOULD)

| Trigger | Priority | Implementation |
|---------|----------|----------------|
| Multiple failed authentication attempts | MUST | Alert on 401 spike (e.g. >10 in 5 min from same IP or total) |
| Suspicious access patterns (unusual IP, time) | MUST | Optional: log IP + timestamp; use SIEM or log alert for anomalies; or defer with doc |
| Data breach indicators (unauthorized access, exfiltration) | MUST | Alert on 403 spike; audit log review; Sentry for unexpected errors |
| Compliance: PHI in logs | SHOULD | Periodic grep/review of log pipeline for PHI patterns; redaction in code (already required) |
| Compliance: missing audit entries | SHOULD | Periodic check that sensitive operations write audit log |

---

## 3. Error Tracking (Sentry or equivalent)

- **Backend:** Add Sentry SDK; capture unhandled errors and 5xx responses; set `release` to deploy version.
- **Frontend:** Add Sentry for Next.js; capture client errors and failed API calls; no PHI in breadcrumbs or messages.
- **Config:** Document DSN and env vars in deployment runbook; use same project or separate for backend/frontend.

*Implementation:* Add `@sentry/node` (backend) and `@sentry/nextjs` (frontend) when ready; document in this file and in [deployment-runbook.md](./deployment-runbook.md).

---

## 4. Health Check and Uptime

- **Endpoint:** `GET /health` (see [DEPLOYMENT.md](../Reference/DEPLOYMENT.md)).
- **Uptime:** Use UptimeRobot, Pingdom, or platform health checks to hit `/health` every 1–5 min; alert on 5xx or timeout.
- **DB/queue in health:** Response includes `services.database.connected`, `services.queue.connected`; 503 when unhealthy.

---

## 5. Incident Response (COMPLIANCE §J)

- **Document procedures:** Maintain an incident runbook (who to contact, how to rotate secrets, how to revoke access). See [secrets-and-environments.md](./secrets-and-environments.md) for rotation on breach.
- **Escalate:** Security incidents escalated within 1 hour (define owner and channel).
- **Incident log:** Document all incidents (date, impact, resolution).
- **User notification:** Notify affected users per jurisdiction (GDPR, DPDPA, etc.) when required.

---

## 6. Checklist for Go-Live

- [ ] Error tracking (e.g. Sentry) configured for backend and frontend; no PHI in events.
- [ ] Uptime check on `GET /health`; alert on 503 or timeout.
- [ ] Alert on auth failure spike (401/403 rate).
- [ ] Alert on error rate >5% (or document as phased).
- [ ] Alert on rate limit abuse (429) optional but recommended.
- [ ] Incident response owner and escalation path documented.

---

**Last updated:** 2026-02-07  
**Reference:** COMPLIANCE.md §J, e-task-8
