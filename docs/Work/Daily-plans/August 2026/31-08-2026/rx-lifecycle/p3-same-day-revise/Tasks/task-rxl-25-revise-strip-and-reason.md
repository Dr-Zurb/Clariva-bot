# Task rxl-25: Cockpit revise strip + reason presets

> **Model:** executed on Grok 4.6 at owner override 2026-09-10 (Opus gate waived).

---

## 📋 Task Overview

When the doctor reopens a finished note the same day, the form is fully editable and a strip says so:

> Issued 10:15 AM. The next print or send replaces that slip.

The version advances on **re-issue**, never on autosave. On re-issue after Finish, collect a required reason from one-tap presets (RXL-Q8, relocked 2026-09-11):

- treatment change
- item added
- other

**Program / Phase:** rx-lifecycle · Phase 3-B
**Batch:** [`plan-p3-rx-lifecycle-same-day-revise-batch.md`](../plan-p3-rx-lifecycle-same-day-revise-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md`](./EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md)
**Estimated Time:** ~4 hours
**Status:** ✅ **IMPLEMENTED** 2026-09-10
**Completed:** 2026-09-10

**Change Type:**
- [x] **New feature** — cockpit chrome + `POST /prescriptions/:id/reissue`

**Cockpit table (do not invent a fifth state):**

| When | Behaviour |
|---|---|
| Same day, not yet finished | Fully editable, **no** banner |
| Same day, finished, doctor reopens | Editable + the strip above |
| Same day, viewing superseded | Read-only, marked superseded, reprintable |
| Later day | Past-visit (`lvc`) — not this task |

**Scope Guard:** Frontend strip + reason UI wired to `reissuePrescriptionAsRevision`. No footer PDF work (`rxl-26`). No filename (`rxl-27`). No history list (`rxl-28`).

**Reference:** RXL-DL-9, DL-11 (cockpit, not slip), DL-12, Q6, Q8

---

## ✅ Task Breakdown

### 1. Strip
- [x] 1.1 Visible only on an issued, not-superseded, same-day note.
- [x] 1.2 Copy names the issued time and the *next* version number.
- [x] 1.3 No countdown. No 15-minute language.

### 2. Reason
- [x] 2.1 Required on re-issue. Presets above. Optional note under "other" is dialog-only (no column to persist).
- [x] 2.2 Do not prompt on autosave.
- [x] 2.3 After a delivery, prompt reprint / resend — never auto-resend (RXL-Q6).

### 3. Verification
- [x] 3.1 Draft same-day visit: no strip.
- [x] 3.2 Finished same-day reopen: strip + editable surfaces.
- [x] 3.3 Re-issue without a reason is refused (dialog + Zod).
- [x] 3.4 Targeted vitest + jest + eslint on touched files. Backend `tsc` clean.

---

## 📁 Files

```
UPDATE: backend/src/controllers/prescription-controller.ts
UPDATE: backend/src/routes/api/v1/prescriptions.ts
UPDATE: backend/src/utils/validation.ts
CREATE: backend/tests/unit/utils/reissue-prescription-body.test.ts
UPDATE: frontend/lib/api.ts
CREATE: frontend/components/cockpit/rx/rxRevise.ts
CREATE: frontend/components/cockpit/rx/RxReviseStrip.tsx
CREATE: frontend/components/cockpit/rx/RxRevisionReasonDialog.tsx
CREATE: frontend/components/cockpit/rx/RxRevisionDeliveryPrompt.tsx
UPDATE: frontend/components/cockpit/rx/useRxCommitActions.ts
UPDATE: frontend/components/cockpit/rx/CockpitRxActionDock.tsx
UPDATE: frontend/components/consultation/cockpit/RxWorkspace.tsx
```

---

**Not this task:** PDF footer wording (pharmacist copy is `rxl-26`).

**Residual:** optional "other" free text is not stored (`revision_reason` is the enum only). `printed_at` is still unset on print, so the reprint half of the delivery prompt rarely fires until a later stamp lands.

**Last Updated:** 2026-09-10 (implemented)
**Completed:** 2026-09-10
