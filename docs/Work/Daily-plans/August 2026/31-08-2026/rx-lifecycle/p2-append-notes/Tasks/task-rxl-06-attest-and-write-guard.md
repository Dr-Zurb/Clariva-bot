# Task rxl-06: Set the attest stamp; refuse writes to an attested Rx

> **Model:** executed on Grok 4.6 at owner override 2026-08-31 (Opus gate waived). Enforcement boundary.

---

## 📋 Task Overview

Set the attest stamp at the right moment, then make the service layer refuse writes to an attested prescription. Today `updatePrescription` checks that the caller owns the row and nothing else — a completed, sent and printed prescription accepts edits through the API. Every UI lock in Phase 1 is a courtesy until this lands.

**Program / Phase:** rx-lifecycle · Phase 2 (append notes)
**Batch:** [`plan-p2-rx-lifecycle-append-notes-batch.md`](../plan-p2-rx-lifecycle-append-notes-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-rx-lifecycle-append-notes.md`](./EXECUTION-ORDER-p2-rx-lifecycle-append-notes.md)
**Estimated Time:** ~6 hours
**Status:** ✅ **IMPLEMENTED** (apply `226` on dev before dogfood)
**Completed:** 2026-08-31

**Change Type:**
- [x] **Update existing** — adds a guard to an existing write path; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ `updatePrescription` — EXISTS; fetches the row, verifies `doctor_id`, resolves the appointment's episode, maps a long list of optional fields, then updates.
- ✅ Typed error classes exist (`ValidationError`, `ForbiddenError`, `NotFoundError`, `InternalError`) and are already used in this service.
- ✅ `logDataModification` — EXISTS and accepts a `changedFields` array (field **names** only, documented as such).
- ✅ `listPrescriptionsByAppointment` — EXISTS and already returns a list ordered `created_at DESC`. No change needed.
- ❌ No status, attest or sent guard anywhere in `updatePrescription`.
- ❌ `updatePrescription` calls `logDataModification` **without** `changedFields`, so an audit entry records only that a prescription changed, never which fields.
- ⚠️ `invalidatePrescriptionPdfCache(id)` fires on every update. Leave it alone this phase — `rxl-15` owns the cache and the freeze.
- ⚠️ `audit_logs.metadata` is documented no-PHI. Field **names** are permitted; values are not.

**Scope Guard:** ≤ 7 files. Do not touch the PDF service, the PDF cache, or `sent_to_patient_at` semantics. Do not implement the 15-minute window — an attested Rx is hard-locked this phase (RXL-DL-8). No appointment status change.

**Reference:** product plan RXL-DL-1, RXL-DL-8, RXL-Q1 · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [x] 1.1 Column defined in `226` (operator apply outstanding). Founder override to continue.
- [x] 1.2 Finish = `wrapUpAppointment`. Send = `sendPrescriptionToPatient` (any channel sent). Print = `GET /prescriptions/:id/pdf-url` (download reuses this URL). One owner: `attestPrescriptionIfUnset`.
- [x] 1.3 Writers: `updatePrescription` (row + medicines replace), attachment create/register/delete, `sent_to_patient_at` on send, PDF regenerate (untouched). Reads (get, download URL) unguarded.

### 2. Set the stamp
- [x] 2.1 First of finish / send / print. `.is('attested_at', null)` so a second print does not move it.
- [x] 2.2 `attestPrescriptionIfUnset` (+ `attestLatestPrescriptionForAppointment` for wrap-up).
- [x] 2.3 Attest does not call `updatePrescription`.

### 3. The guard
- [x] 3.1 `ConflictError` 409 — `reason: attested`.
- [x] 3.2 See Notes.
- [x] 3.3 Medicines via `updatePrescription`. Attachments: upload / register / delete call `assertPrescriptionContentWritable`.
- [x] 3.4 Null stamp + appointment `completed` / `cancelled` / `no_show` → `reason: appointment_locked`.
- [x] 3.5 Exempt: `attestPrescriptionIfUnset`, `sent_to_patient_at` on send, PDF cache/regenerate, attachment download.

### 4. Audit
- [x] 4.1 `changedFields` on `updatePrescription` (names; `episode_id` omitted) and on first attest (`['attested_at']`).
- [x] 4.2 Test asserts the clinical string is not in the audit call.

### 5. Verification
- [x] 5.1 `prescription-attest-guard.test.ts` — ConflictError 409.
- [x] 5.2 Draft write succeeds.
- [x] 5.3 Second attest returns `alreadyAttested: true`.
- [x] 5.4 Attachment upload refused.
- [x] 5.5 Historical completed + null stamp refused.
- [x] 5.6 Backend `tsc` clean. ESLint clean on new code (pre-existing `any` warnings in appointment-service untouched).

---

## 📁 Files

```
UPDATE: backend/src/services/prescription-service.ts (guard + changedFields)
UPDATE: backend/src/services/<send / finish / print owner> (set the stamp — one owner, per 1.2)
UPDATE: backend/src/utils/errors.ts (only if no existing class fits — justify in Notes)
UPDATE: backend/src/controllers/<prescription controller> (map the new error state if the global mapper does not)
UPDATE: backend/src/types/prescription.ts (input/output shape if the stamp is exposed)
UPDATE/CREATE: backend tests (guard, idempotency, child tables, historical rows)
UPDATE: docs/Reference/engineering/architecture/CONTRACTS.md (if a new error state is now returnable)
```

**Existing Code Status:**
- ⚠️ `prescription-service.ts` — EXISTS; `updatePrescription` has ownership check only
- ✅ `utils/errors.ts` — EXISTS (prefer an existing class)
- ✅ `audit-logger.ts` — EXISTS and already supports `changedFields`
- ✅ `listPrescriptionsByAppointment` — EXISTS, correct as-is

**When updating existing code:**
- [ ] Audit all writers from 1.3 (files, callers, config) — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [ ] Map desired change to concrete changes per writer
- [ ] Remove obsolete branches — no "temporarily allow" flag
- [ ] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **The service layer is the boundary.** The UI lock from Phase 1 is not a security control and must not be relied on here.
- Throw typed `AppError` subclasses, never raw `Error` (agent contract). Controllers orchestrate only; no DB access in controllers.
- Validate external input with Zod **in the controller** before the service is called (agent contract). The guard itself is a service-layer state check, not input validation.
- Fail closed on ambiguity: if the stamp cannot be determined, refuse the write rather than allowing it.
- Do **not** implement the 15-minute window here, in any partial form, including "allow if recent". RXL-DL-8 forbids a state where post-attest edits are accepted but not captured, and the snapshot that captures them does not exist until `rxl-11`.
- Never log PII/PHI or raw request objects. `changedFields` is names only — this is a hard rule, not a preference.
- Do not read `process.env` directly; use `config/env.ts` if any threshold becomes configurable (it should not in this task).
- No behaviour change to the PDF pipeline. If a test shows the guard breaking a print, record it for `rxl-15` rather than working around it.

---

## 🌍 Global Safety Gate

- [x] Data touched? **Yes** — write path to a PHI table. RLS unchanged (`doctor_id` policies still apply); the guard is an additional service-layer state check, not a policy change.
- [x] PHI in logs? **No** — `changedFields` is field names only; asserted in `prescription-attest-guard.test.ts`.
- [x] External API / AI? No.
- [x] Retention? No.

---

## ✅ Acceptance & Verification Criteria

- [x] Attested prescription refuses content writes with a typed error at the API boundary.
- [x] Draft prescriptions unaffected.
- [x] Stamp set exactly once by the first of finish / send / print; idempotent thereafter.
- [x] Child-table writers guarded.
- [x] Historical null-stamp rows handled explicitly.
- [x] `changedFields` present and value-free.
- [x] Response contracts respected — existing `ConflictError` (409); no new error class.
- [x] Tests added: `backend/tests/unit/services/prescription-attest-guard.test.ts`
- [x] Logs contain no PHI.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 📝 Notes

**Error class:** `ConflictError` (409). The doctor is authorised and the payload may be valid; the row is in a state that refuses mutation. Not `ValidationError` (input) and not `ForbiddenError` / 404-as-ownership (this is not an auth miss).

**Stamp owner:** `attestPrescriptionIfUnset` in `prescription-service.ts`. Callers:
- Send: `sendPrescriptionToPatient` after a successful channel send (does not change `sent_to_patient_at` meaning).
- Print: `getPrescriptionPdfUrlHandler` — download reuses this URL, so download also stamps. Preview does not hit this route. PDF regenerate does not stamp.
- Finish: `attestLatestPrescriptionForAppointment` from `wrapUpAppointment` (latest note only; no row → no-op).

**Guarded:** `updatePrescription` (includes medicines replace); `createUploadUrl` / `registerAttachment` / `deleteAttachment`.
**Unguarded (named):** attest itself; `sent_to_patient_at`; attachment download; PDF regenerate / cache; `createPrescription` (needed by `rxl-07`).

**Last Updated:** 2026-08-31 (implemented)
**Completed:** 2026-08-31

---

## 🔗 Related Tasks

- [`task-rxl-05-attest-stamp-migration.md`](./task-rxl-05-attest-stamp-migration.md) — must be deployed first
- [`task-rxl-07-lazy-new-note.md`](./task-rxl-07-lazy-new-note.md) — the client-side consequence of this guard
- `rxl-13` (Phase 3) — relaxes this guard by exactly 15 minutes, once tracing exists
