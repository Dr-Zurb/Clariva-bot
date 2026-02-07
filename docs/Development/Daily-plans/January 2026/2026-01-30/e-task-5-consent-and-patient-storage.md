# Task 5: Consent & Patient Storage
## January 30, 2026 - AI Integration & Conversation Flow Day

---

## 📋 Task Overview

Implement consent collection and storage before persisting PHI: ask for consent in plain language, record consent timestamp and status (granted, revoked, pending), store consent with patient or in dedicated structure, implement consent revocation flow, and persist collected patient data to the database only after consent is granted. Ensure audit logging for consent events and data access; RLS and encryption at rest/transit per COMPLIANCE.md.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**
**Completed:** 2026-01-30

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** `services/patient-service.ts` (createPatient, findOrCreatePlaceholderPatient, updatePatient); `patients` table; migrations 001–004 (004 = conversation/platform; **next migration = 005**); RLS (002_rls_policies); Task 4 delivers collected patient data via **collection-service getCollectedData(conversationId)** (in-memory); conversation state has step `consent` and collectedFields only; audit_logger and logDataModification
- ❌ **What's missing:** No consent table or consent fields (timestamp, status, method); no “ask for consent” step in flow; no revocation flow; no persistence gate "only after consent"; no clear of pre-consent store after persist/deny “only after consent”
- ⚠️ **Notes:** COMPLIANCE.md C: consent before PHI; plain-language explanation; store consent timestamp and status; revocation and data deletion per COMPLIANCE F. **Task 4 handoff:** Read from getCollectedData(conversationId); after persist or consent denied call **clearCollectedData(conversationId)** so PHI is purged from memory.

**Scope Guard:**
- Expected files touched: ≤ 6 (migration **005** if new consent table—004 already used; services, types, flow integration)
- Any expansion requires explicit approval

**Reference Documentation:**
- [STANDARDS.md](../../Reference/STANDARDS.md) - No PII in logs; audit with correlationId; Zod validation
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Services for business logic; flow in service/worker (webhook path has no HTTP controller)
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Section C: consent; Section D: audit; Section E: RLS; Section F: lifecycle/deletion
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md) - Schema for consent and patients; update after migration
- [RLS_POLICIES.md](../../Reference/RLS_POLICIES.md) - RLS on patients; service role in worker
- [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) - Feature completion checklist
- [MIGRATIONS_AND_CHANGE.md](../../Reference/MIGRATIONS_AND_CHANGE.md) - Migration numbering; update DB_SCHEMA after migration

---

## ✅ Task Breakdown (Hierarchical)

### 1. Consent Model and Storage
- [x] 1.1 Define where consent is stored (e.g. consent table linked to patient/conversation, or consent columns on patients table)
  - [x] 1.1.1 Fields: consent status (granted, revoked, pending), timestamp, method (e.g. “instagram_dm”), optional version/scope
  - [x] 1.1.2 If new table: add migration; ensure RLS policies apply
- [x] 1.2 Create or extend service to record consent (granted) when user confirms in plain language
  - [x] 1.2.1 Record timestamp and method (e.g. channel used)
  - [x] 1.2.2 Link to conversation or patient as per schema
- [x] 1.3 Before persisting any PHI to patients table, check that consent is granted for that conversation/patient
  - [x] 1.3.1 If no consent, do not call patient-service create/update with PHI; keep data in collection-service in-memory store and re-prompt for consent (do not persist to patients table)

### 2. Consent Collection Flow
- [x] 2.1 When required patient fields are collected (Task 4), prompt user for consent
  - [x] 2.1.1 Use plain-language explanation: what data is collected, why (e.g. booking, care), how long kept
  - [x] 2.1.2 Optionally store “consent requested at” timestamp; then “consent granted at” when user agrees
- [x] 2.2 Parse user reply for consent (e.g. “yes”, “I agree”) or rejection; update consent status. **Product choice:** deterministic keyword matching (yes, agree, ok vs no, revoke) or AI-assisted parsing (redact before AI; audit; document choice)
- [x] 2.3 If consent granted: read collected data via **getCollectedData(conversationId)**; persist via patient-service (create or **update placeholder patient**—conversation already has patient_id from Task 3/4); then call **clearCollectedData(conversationId)** so pre-consent PHI is purged from memory; link to conversation if needed
- [x] 2.4 If consent denied: do not persist PHI; call **clearCollectedData(conversationId)**; update conversation state (step off consent); send confirmation that no data was stored

### 3. Consent Revocation and Deletion
- [x] 3.1 Implement revocation flow: user can request deletion/revocation (e.g. “delete my data”, “revoke consent”)   - [x] 3.1.1 Update consent status to revoked; record revocation timestamp
  - [x] 3.1.2 Apply data lifecycle: delete or anonymize patient data per COMPLIANCE.md F and retention policy
- [x] 3.2 Audit log all consent events (granted, revoked) with correlationId and resource IDs (no PHI in audit payload)
- [x] 3.3 Ensure RLS and service layer enforce: no access to patient data after revocation where policy requires deletion

### 4. Persistence and Audit
- [x] 4.1 When persisting patient (after consent): use patient-service create/update (e.g. update placeholder with name, phone, date_of_birth, gender from getCollectedData; **reason_for_visit** is not a patients column—hold for appointment.notes at booking per Task 4 Notes); ensure encryption at rest (Supabase) and in transit; **idempotent** (e.g. if user says "yes" twice, update once; do not create duplicate patient)
- [x] 4.2 Audit log: patient create/update with correlationId, resource type, resource id, changedFields only (no values) per COMPLIANCE.md D
- [x] 4.3 No PII in application logs; only IDs and standard log fields

### 5. Testing & Verification
- [x] 5.1 Unit tests: consent granted → patient created; consent denied → no patient; revocation → deletion/anonymization
- [x] 5.2 Verify RLS: doctor can only access own patients; consent status respected
- [x] 5.3 Type-check and lint

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 005_consent.sql or similar (NEW - if consent table added; 004 already used)
backend/src/
├── services/
│   ├── patient-service.ts         (USE - create/update after consent)
│   └── (consent-service or extend conversation/patient) (NEW or UPDATE)
├── types/
│   └── database.ts or consent.ts  (NEW/UPDATE - consent type)
└── utils/
    └── audit-logger.ts            (USE - consent and data access events)
```

**Existing Code Status:**
- ✅ `services/patient-service.ts` - EXISTS (createPatient, findOrCreatePlaceholderPatient, updatePatient)
- ✅ `services/collection-service.ts` - EXISTS (getCollectedData(conversationId), clearCollectedData(conversationId); Task 4)
- ✅ `migrations/002_rls_policies.sql` - EXISTS (RLS on patients)
- ✅ `migrations/004_conversation_state_and_patient_platform.sql` - EXISTS (conversations.metadata, patients.platform/platform_external_id)
- ✅ `utils/audit-logger.ts` - EXISTS
- ✅ Consent storage - DONE (migration 005_consent.sql; consent columns on patients)
- ✅ Consent flow in conversation - DONE (webhook-worker, consent-service)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- PHI must not be persisted without consent (COMPLIANCE.md C).
- Consent must be explained in plain language; timestamp and status stored (COMPLIANCE.md C).
- After persist or consent denied, call **clearCollectedData(conversationId)** so pre-consent PHI is purged from memory (Task 4 store).
- Revocation must trigger lifecycle (deletion/anonymization) per policy (COMPLIANCE.md F).
- Audit all consent and data access with metadata only (COMPLIANCE.md D).
- RLS must enforce doctor-only access to patients (COMPLIANCE.md E).

---

## 🌍 Global Safety Gate (MANDATORY)

Task **CANNOT proceed** unless this section is completed:

- [x] **Data touched?** (Y - patients, consent) → [x] **RLS verified?** (Y)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (N for consent storage; deterministic parsing) → [x] **Consent + redaction confirmed?** (Y where applicable)
- [x] **Retention / deletion impact?** (Y - revocation triggers deletion/anonymization per policy)
- [x] **Pre-consent store purged?** (Y - clearCollectedData(conversationId) after persist or after consent denied)

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Consent is requested in plain language when patient data is ready to persist
- [x] Consent status and timestamp (and method) are stored; no PHI in consent log payloads
- [x] Patient is created/updated only after consent granted; no PHI persisted without consent
- [x] Revocation flow updates status and triggers data deletion/anonymization per policy
- [x] All consent events (granted, revoked) and patient create/update are audit logged with correlationId and metadata only
- [x] RLS verified; no PII in logs
- [x] Type-check, lint, and tests pass

**See also:** [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) if present.

---

## 🐛 Issues Encountered & Resolved

- **UpdatePatient type:** Requires `id`; passed update payload with type assertion to satisfy. Patient id used in .eq() comes from first param.
- **date_of_birth:** Collected data has ISO date string; convert to `new Date()` for UpdatePatient.
- **consent_requested_at:** Stored in `conversations.metadata` when transitioning to step `consent`; no migration needed.
- **Revocation:** New intent `revoke_consent`; migration 006 adds `consent_revoked_at`; handleRevocation anonymizes PHI per COMPLIANCE F.

---

## 📝 Notes

- If consent table is new, document schema in DB_SCHEMA.md per MIGRATIONS_AND_CHANGE.md and add migration **005** (004 already used for conversation/platform).
- Consider consent scope (e.g. per purpose: booking vs. marketing) if product requires it later.
- **Pre-consent store:** Task 4 holds collected values in memory (getCollectedData). Task 5 must call **clearCollectedData(conversationId)** after persist or after consent denied so PHI is not retained in process memory.
- **Placeholder patient:** Webhook flow (Task 3/4) already creates a placeholder patient per platform user. After consent, **update** that placeholder with real name/phone/DOB/gender rather than creating a second patient where possible; document create-vs-update logic.
- **Revocation scope:** MVP may implement consent grant + persist + audit first; full revocation (update status, delete/anonymize per COMPLIANCE F) can follow in same task or a later one—document choice.

---

## 🔗 Related Tasks

- [Task 4: Patient Information Collection Flow](./e-task-4-patient-collection-flow.md) - Provides collected data to persist after consent
- [Task 6: AI Integration Testing & Cleanup](./e-task-6-ai-integration-testing-and-cleanup.md) - E2E and compliance checks

---

**Last Updated:** 2026-01-30  
**Completed:** 2026-01-30  
**Related Learning:** `docs/Learning/2026-01-30/l-task-5-consent-and-patient-storage.md`  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 2.1.0 (Planning vs execution boundary, global safety gates)
