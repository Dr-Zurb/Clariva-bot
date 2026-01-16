# Compliance & Governance Guide

**Source of Truth:** This document governs compliance posture, data handling, and security requirements for Clariva. `STANDARDS.md` governs code quality and patterns. If conflicts exist, `STANDARDS.md` remains the code source of truth, but `COMPLIANCE.md` defines system constraints that code must satisfy.

**Product Scope:** Clariva is digital infrastructure for doctors operating on social media. MVP focuses on administrative workflows (appointment booking, patient intake via DMs). Future evolution includes deeper clinical workflows and EHR-like capabilities. We are global-first from day 1.

---

## A. Compliance Scope & Product Boundaries

### MVP Scope (Current)
- **MUST:** Clearly declare we provide administrative workflow tools only.
- **MUST NOT:** Claim to provide diagnosis, prescription, or clinical decision support.
- **MUST:** State that Clariva does not replace clinician judgment.
- **MUST:** Document that doctors remain responsible for all clinical decisions.

### Compliance Claims
- **MUST NOT:** Overclaim "HIPAA certified" or "certified compliant."
- **MUST:** Use phrasing: "designed to be HIPAA-aligned" or "supports DPDPA/GDPR principles."
- **MUST:** Document which frameworks we align with (HIPAA, GDPR, DPDPA) without certification claims.
- **SHOULD:** Maintain alignment posture that enables future certification if needed.

### Future Scope (Not in MVP)
- **MUST:** Document that future clinical workflows will require additional compliance measures.
- **MUST:** Maintain architecture that supports future compliance expansion.

---

## B. Data Classification

### Data Categories

| Category | Examples | Handling Requirements |
|----------|----------|----------------------|
| **Public Social Data** | Public posts, public profile info | Standard encryption at rest + access controls; treated as personal data once linked to a patient or appointment |
| **Administrative Data** | Appointment requests, scheduling preferences, contact info | Encrypted at rest; access via RLS; audit logged |
| **Sensitive Health Data (PHI)** | Patient intake forms, medical history, symptoms, complaints | Encryption at rest + strict RLS; audit logged; consent required |
| **Platform Data** | User accounts, auth tokens, audit logs | Encrypted at rest; never logged in plaintext |

### Classification Rules
- **MUST:** Classify all data at creation time.
- **MUST:** Apply highest classification if data spans categories.
- **MUST NOT:** Store PHI in logs, error messages, or audit log content (only metadata).
- **MUST:** Enforce strict RLS and least privilege for PHI access.

---

## C. Consent & User Transparency

### Doctor Configuration
- **MUST:** Allow doctors to configure consent workflows.
- **MUST:** Support opt-in/opt-out mechanisms per jurisdiction.
- **SHOULD:** Provide consent templates for common scenarios.

### Patient Consent
- **MUST:** Obtain explicit consent before collecting PHI.
- **MUST:** Document consent timestamp and method.
- **MUST:** Allow patients to revoke consent (with data deletion per lifecycle rules).
- **SHOULD:** Provide clear, plain-language consent explanations.

### Transparency
- **MUST:** Document what data is collected and why.
- **MUST:** Provide data access/deletion mechanisms.
- **SHOULD:** Support data portability requests (GDPR/DPDPA).

---

## D. Audit Logging

### Events That MUST Be Audited

| Event Type | Examples | Required Fields |
|------------|----------|----------------|
| **Authentication** | Login, logout, token refresh | `userId`, `timestamp`, `ipAddress`, `success/failure` |
| **Data Access** | Read PHI, read appointment data | `userId`, `resourceId`, `resourceType`, `action`, `correlationId` |
| **Data Modification** | Create/update/delete appointments, intake forms | `userId`, `resourceId`, `resourceType`, `action`, `changedFields` (field names only, no values) |
| **Configuration Changes** | Update consent settings, access controls | `userId`, `resourceType`, `action`, `changes` (metadata) |
| **AI Interactions** | AI-generated responses, prompts sent | `userId`, `conversationId`, `model`, `tokens`, `redactionApplied` |
| **Security Events** | Failed auth, rate limit exceeded, suspicious activity | `userId`, `eventType`, `severity`, `ipAddress`, `correlationId` |

### Audit Log Requirements
- **MUST:** Include `correlationId` in all audit logs (from middleware).
- **MUST:** Include `timestamp`, `userId`, `action`, `resourceType`, `resourceId`.
- **MUST NOT:** Store raw PHI in audit log content (only resource IDs and metadata).
- **MUST NOT:** Store field values or snapshots in audit logs (only field names in `changedFields`).
- **MUST:** Make audit logs immutable (append-only).
- **MUST:** Retain audit logs per data lifecycle rules (per jurisdiction policy).
- **SHOULD:** Support audit log export for compliance reviews.
- **NOTE:** If version history is needed, implement a separate versioning system (not audit logs).

---

## E. Access Control Model

### Roles

| Role | Permissions | Constraints |
|------|------------|-------------|
| **Doctor** | Full access to own data, configure consent, manage staff | Owns all data; cannot access other doctors' data |
| **Staff** | Manage appointments, view intake forms (doctor-assigned) | Least privilege; doctor can revoke access |
| **Clinic Admin** | Manage clinic settings, operational workflows, limited patient index | Operational + limited patient index (no clinical notes by default); PHI access must be explicitly granted |
| **Platform Admin** | System administration, support access | Audit logged; requires justification; time-limited |

### Access Control Rules
- **MUST:** Implement least privilege (grant minimum required access).
- **MUST:** Use Row Level Security (RLS) for all PHI tables.
- **MUST:** Doctor owns all data; staff access is delegated.
- **MUST:** Support role-based access control (RBAC) with Supabase RLS policies.
- **MUST:** Log all access attempts (success and failure).
- **SHOULD:** Support time-limited access tokens for support scenarios.

### Authentication
- **MUST:** Use Supabase Auth for authentication.
- **MUST:** Enforce strong password policies.
- **SHOULD:** Support MFA for doctor accounts.
- **MUST:** Rate limit authentication endpoints.

---

## F. Data Lifecycle

### Retention Rules

| Data Type | Retention Period | Notes |
|-----------|------------------|-------|
| **PHI** | Per jurisdiction (policy-driven) | Configurable per region; minimums defined in region policy table |
| **Administrative Data** | Per jurisdiction policy or until account deletion | Align with PHI retention requirements |
| **Audit Logs** | Per jurisdiction policy (minimum per applicable law) | Immutable; append-only |
| **Backups** | 30 days rolling | Encrypted; separate from primary storage |

### Deletion Rules
- **MUST:** Support soft delete (mark as deleted, retain for retention period).
- **MUST:** Support hard delete (purge) after retention period expires.
- **MUST:** Cascade delete: if doctor account deleted, delete all associated data.
- **MUST:** Log all deletion events in audit log.
- **SHOULD:** Support data export before deletion (GDPR/DPDPA).

### Backup & Recovery
- **MUST:** Encrypt backups at rest.
- **MUST:** Test backup restoration quarterly.
- **MUST:** Store backups in separate region/jurisdiction if required.
- **SHOULD:** Maintain point-in-time recovery capability.

---

## G. AI Safety & Governance

### AI Role Definition
- **MUST:** Document that AI is assistive only; no autonomous diagnosis or prescription.
- **MUST:** Require human review for all AI-generated clinical suggestions.
- **MUST NOT:** Allow AI to make clinical decisions without doctor approval.

### AI Data Handling
- **MUST:** Redact PHI from prompts sent to external AI services.
- **MUST NOT:** Persist raw AI prompts or responses if they may contain PHI.
- **MUST:** Store metadata only (model, token count, redaction flag, hash).
- **MUST:** Log all AI interactions (metadata only: model, tokens, redaction applied, conversation ID).
- **MUST NOT:** Store raw PHI in AI service logs or training data.
- **MUST:** Support human override for all AI actions.

### AI Audit Requirements
- **MUST:** Audit all AI interactions (see Audit Logging section).
- **MUST:** Track AI usage per doctor (for billing/compliance).
- **SHOULD:** Monitor AI response quality and safety metrics.

### Prompt Engineering Rules
- **MUST:** Include disclaimers in prompts: "This is administrative assistance only."
- **MUST:** Validate AI responses before presenting to users.
- **SHOULD:** Use structured prompts that minimize PHI exposure.

---

## H. Security Baseline

### Rate Limiting
- **MUST:** Rate limit all public endpoints (per IP and per user).
- **MUST:** Rate limit authentication endpoints more strictly.
- **SHOULD:** Implement progressive rate limiting (warn → throttle → block).

### Authentication Hardening
- **MUST:** Use Supabase Auth (industry-standard JWT).
- **MUST:** Validate JWT tokens on every request (middleware).
- **MUST:** Enforce HTTPS in production.
- **SHOULD:** Support MFA for doctor accounts.

### Webhook Security
- **MUST:** Verify webhook signatures (e.g., X-Hub-Signature-256).
- **MUST:** Implement idempotency keys for webhook processing.
- **MUST:** Log all webhook events in audit log.
- **MUST:** Rate limit webhook processing.

### Encryption
- **MUST:** Encrypt data at rest (Supabase default).
- **MUST:** Use TLS 1.2+ for data in transit.
- **MUST:** Enforce strict RLS and least privilege for PHI access.
- **SHOULD:** Use application-layer encryption for high-risk PHI fields where feasible.
- **MUST:** Encrypt backups.

### Secrets Management
- **MUST:** Store secrets in environment variables (validated via `config/env.ts`).
- **MUST NOT:** Commit secrets to version control.
- **MUST:** Rotate service role keys quarterly.
- **MUST:** Use different keys per environment (dev/staging/prod).

---

## I. Environments & Secrets

### Environment Separation
- **MUST:** Maintain separate environments: dev, staging, prod.
- **MUST:** Use different Supabase projects per environment.
- **MUST:** Use different API keys per environment.
- **MUST NOT:** Use production data in dev/staging.

### Secrets Management
- **MUST:** Validate all environment variables via `config/env.ts` (Zod schema).
- **MUST:** Fail fast if required secrets are missing.
- **MUST:** Use service role keys server-side only (never client-side).
- **MUST:** Rotate secrets on security incidents.

### Configuration
- **MUST:** Document all required environment variables.
- **SHOULD:** Use secret management service (e.g., AWS Secrets Manager) in production.
- **MUST:** Audit secret access (who accessed which secrets when).

---

## J. Incident Response & Monitoring

### Monitoring Requirements
- **MUST:** Monitor authentication failures (alert on spike).
- **MUST:** Monitor rate limit violations (alert on abuse).
- **MUST:** Monitor error rates (alert on >5% error rate).
- **MUST:** Monitor database connection health.
- **SHOULD:** Monitor AI service latency and errors.

### Alerting Triggers
- **MUST:** Alert on multiple failed authentication attempts.
- **MUST:** Alert on suspicious access patterns (unusual IP, unusual time).
- **MUST:** Alert on data breach indicators (unauthorized access, data exfiltration).
- **SHOULD:** Alert on compliance violations (PHI in logs, missing audit entries).

### Incident Response
- **MUST:** Document incident response procedures.
- **MUST:** Escalate security incidents within 1 hour.
- **MUST:** Document all incidents in incident log.
- **MUST:** Notify affected users per jurisdiction requirements (timelines follow applicable jurisdictional requirements based on role: controller/processor).
- **SHOULD:** Conduct post-incident reviews.

---

## K. Global Readiness Notes

### Data Residency
- **SHOULD:** Support data residency configuration (store data in specific regions).
- **SHOULD:** Support region-specific Supabase projects.
- **MUST:** Document where data is stored (transparency requirement).

### Region-Specific Retention
- **MUST:** Support configurable retention periods per jurisdiction.
- **MUST:** Document retention requirements per region.
- **SHOULD:** Automate retention enforcement (scheduled cleanup jobs).

### Language & Accessibility
- **SHOULD:** Support multi-language interfaces.
- **SHOULD:** Support accessibility standards (WCAG 2.1 AA).
- **MUST:** Provide clear, plain-language privacy policies per jurisdiction.

### Compliance Framework Alignment
- **MUST:** Document alignment with HIPAA (US), GDPR (EU), DPDPA (India).
- **MUST:** Support data subject rights (access, deletion, portability).
- **SHOULD:** Maintain compliance posture that enables future certifications.

---

## L. Third-Party & Platform Data Sharing

### Data Minimization
- **MUST:** Share minimum data required for third-party service functionality.
- **MUST NOT:** Share PHI with third parties unless required for service delivery.
- **MUST:** Document all third-party integrations and data sharing agreements.

### Vendor Requirements
- **MUST:** Require vendor agreements (BAA, DPA) where applicable for PHI-handling services.
- **MUST:** Periodically review third-party integrations for compliance posture.
- **MUST:** Monitor third-party service security incidents and respond accordingly.

### Platform Dependencies
- **MUST:** Document data sharing with social media platforms (Meta/Instagram, WhatsApp).
- **MUST:** Minimize data sent to platform APIs (only what's necessary for functionality).
- **MUST:** Handle platform API changes and deprecations gracefully.
- **SHOULD:** Support platform-specific consent mechanisms where available.

### AI Service Providers
- **MUST:** Use AI providers that support data processing agreements (DPA).
- **MUST:** Redact PHI before sending to AI services (see AI Safety & Governance).
- **MUST:** Log all AI service interactions (metadata only).
- **SHOULD:** Prefer AI providers with healthcare-specific compliance certifications.

---

## Implementation Hooks

### Where Compliance is Enforced in Code

| Compliance Requirement | Implementation Location | Notes |
|------------------------|-------------------------|-------|
| **Audit Logging** | `services/*.ts` | All service methods log actions with correlationId |
| **Access Control** | Supabase RLS policies | Row-level security enforced at database layer |
| **Structured Logging** | `config/logger.ts` | Standard log fields (correlationId, path, method, statusCode, durationMs) |
| **Correlation IDs** | `middleware/correlation-id.ts` | Generated per request; included in all logs |
| **Request Timing** | `middleware/request-timing.ts` | Duration tracking for performance monitoring |
| **Error Handling** | `utils/errors.ts`, `index.ts` error middleware | Centralized error handling; no PHI in error messages |
| **Environment Validation** | `config/env.ts` | Zod schema validates all env vars at startup |
| **Authentication** | Supabase Auth + middleware | JWT validation on every request |
| **Rate Limiting** | (To be implemented) | Per-endpoint rate limiting middleware |
| **Webhook Security** | (To be implemented) | Signature verification + idempotency in webhook handlers |
| **PII/PHI Logging Prevention** | `STANDARDS.md` + `config/logger.ts` | Explicit rule: MUST NOT log PII/PHI in operational logs |

### Operational Logging Rules (from STANDARDS.md)
- **MUST NOT:** Log raw request objects (may contain PII).
- **MUST NOT:** Log PHI in error messages or stack traces.
- **MUST:** Use structured logging with standard fields only.
- **MUST:** Include correlationId in all logs for traceability.

### Future Implementation Tasks
- [ ] Implement rate limiting middleware
- [ ] Implement webhook signature verification
- [ ] Implement field-level encryption for PHI fields
- [ ] Implement audit log service (centralized audit logging)
- [ ] Implement data retention automation (scheduled cleanup)
- [ ] Implement MFA support for doctor accounts
- [ ] Implement data export/deletion APIs (GDPR/DPDPA)

---

**Version:** 1.0.0  
**Owner:** Engineering + Compliance  
**Note:** This document is updated on change; see git history for revision tracking.
