# Data Retention (COMPLIANCE.md §F)

Retention policy and automation per [COMPLIANCE.md](../Reference/COMPLIANCE.md) §F and §K (region-specific retention).  
**Related:** [DATA_RETENTION.md](../Reference/DATA_RETENTION.md) | [COMPLIANCE.md](../Reference/COMPLIANCE.md)

---

## 1. Policy Summary

- **PHI / medical-related:** Minimum 6 years, maximum 7 years (or per jurisdiction). Appointments and related data retained per this policy.
- **Audit logs:** Immutable; retained per jurisdiction (minimum per applicable law).
- **Webhook/metadata:** Retained per retention policy; medical/legal overrides deletion until period expires.
- **Backups:** 30 days rolling; encrypted; separate from primary storage (Supabase or provider).

---

## 2. Implementation Requirements (COMPLIANCE §F)

- **MUST:** Support **soft delete** (mark as deleted, retain for retention period).
- **MUST:** Support **hard delete** (purge) after retention period expires.
- **MUST:** Cascade: if doctor account deleted, delete all associated data per policy.
- **MUST:** Log all deletion events in audit log.
- **SHOULD:** Automate retention enforcement (scheduled cleanup jobs).

---

## 3. Current State

- **Audit logging:** Implemented for sensitive access (e.g. data access, payment); see `audit-logger` and COMPLIANCE.
- **Soft delete / hard delete:** Schema and application logic may support soft delete on key tables; full retention automation (scheduled job) is **phased**.
- **Backups:** Supabase (or host) provides automated backups; 30-day retention configured at provider level.

---

## 4. Phased Plan (Target: Automation)

| Phase | Item | Target |
|-------|------|--------|
| 1 (done) | Retention policy and jurisdiction documented | This doc + DATA_RETENTION.md |
| 2 | Soft delete on appointments, patients, conversations where applicable | Backlog / follow-up |
| 3 | Scheduled job: identify records past retention period; hard delete and audit log | Backlog / follow-up |
| 4 | Quarterly backup restoration test | Optional; document when adopted |

---

## 5. Documented Retention by Data Type

| Data type | Retention | Notes |
|-----------|-----------|--------|
| Appointments / PHI | 6–7 years (or per jurisdiction) | Soft delete then hard delete after period |
| Audit logs | Per jurisdiction (immutable) | Append-only; no deletion except per law |
| Backups | 30 days rolling | Encrypted; separate storage |
| Webhook payloads (dead letter) | Per policy; encrypt at rest | ENCRYPTION_KEY; purge after retention |

---

## 6. Checklist

- [x] Retention policy and periods documented.
- [ ] Soft delete implemented for key PHI tables (or documented as follow-up).
- [ ] Scheduled retention enforcement job (or target date for automation documented).
- [ ] All deletions logged in audit log (required when delete flows are implemented).

---

**Last updated:** 2026-02-07  
**Reference:** COMPLIANCE.md §F, §K; DATA_RETENTION.md; e-task-8
