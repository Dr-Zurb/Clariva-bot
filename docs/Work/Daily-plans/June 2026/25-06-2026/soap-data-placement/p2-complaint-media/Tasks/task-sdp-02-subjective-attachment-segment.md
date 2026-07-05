# Task sdp-02: `subjective` attachment category + `subjective/{complaintId}/` path segment

> **Filename:** `task-sdp-02-subjective-attachment-segment.md` in `soap-data-placement/p2-complaint-media/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Extend the shipped prescription-attachment path so a photo can be pinned to a **complaint**. Add a `subjective` attachment category and have `createUploadUrl` build a `subjective/{complaintId}/{uuid}-{file}` storage path — mirroring the shipped `objective/` segment (P5-D4). **No new bucket, column, RLS policy, or migration:** the prescription-scoped storage policy (migration 026) already covers the deeper path; this task **verifies** that and does not widen it. Backend-only substrate; the UI lands in `sdp-03`.

**Program / Phase:** soap-data-placement · Phase 2 (per-complaint symptom media)
**Batch:** [`plan-p2-soap-data-placement-complaint-media-batch.md`](../plan-p2-soap-data-placement-complaint-media-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-soap-data-placement-complaint-media.md`](./EXECUTION-ORDER-p2-soap-data-placement-complaint-media.md)
**Estimated Time:** ~2–3 hours
**Status:** ✅ **DONE** — 2026-06-25. **Model: Opus** (storage + PHI media + RLS).

**Change Type:**
- [ ] **Update existing** (attachment service + validation + controller). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** `AttachmentCategory = 'objective'` + the `objective/` segment build in [`prescription-attachment-service.ts`](../../../../../../../../backend/src/services/prescription-attachment-service.ts) `createUploadUrl`; `ATTACHMENT_CATEGORY_VALUES = ['objective']` + `createUploadUrlBodySchema` (with optional `category`) in [`validation.ts`](../../../../../../../../backend/src/utils/validation.ts); `createUploadUrlHandler` passing `category` in [`prescription-controller.ts`](../../../../../../../../backend/src/controllers/prescription-controller.ts); the prescription-scoped storage RLS policy in `026_prescriptions.sql`.
- ❌ **What's missing:** the `subjective` category; an optional `complaintId`; the `subjective/{complaintId}/` path build; the controller passing `complaintId`.

**Scope Guard:**
- Expected files touched: ≤ 4 — `prescription-attachment-service.ts`, `validation.ts`, `prescription-controller.ts`, + a service/validation test. **DO NOT** add a migration, column, bucket, or RLS policy; **DO NOT** touch the objective path's behaviour; **DO NOT** read/verify the prescription's `complaints` JSONB (P2-D2 — opaque sanitized segment).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Category + path segment (service)
- [x] ✅ 1.1 `AttachmentCategory`: `'objective'` → `'objective' | 'subjective'`. - **Completed: 2026-06-25**
- [x] ✅ 1.2 `createUploadUrl` accepts an optional `complaintId`; for `subjective`, build `subjective/{sanitizedComplaintId}/{uuid}-{file}`; `objective` + legacy paths unchanged. - **Completed: 2026-06-25**
- [x] ✅ 1.3 Sanitize `complaintId` to a safe folder segment (`[a-zA-Z0-9-]`, bounded 64); empties collapse to `unpinned` (P2-D2 — opaque, no JSONB existence check). - **Completed: 2026-06-25**

### 2. Validation (Zod)
- [x] ✅ 2.1 Add `'subjective'` to `ATTACHMENT_CATEGORY_VALUES`. - **Completed: 2026-06-25**
- [x] ✅ 2.2 Add an optional `complaintId` to `createUploadUrlBodySchema` (bounded 64-char string, trimmed); `z.object` still strips unknown keys. - **Completed: 2026-06-25**

### 3. Controller wiring
- [x] ✅ 3.1 `createUploadUrlHandler` reads `complaintId` from the validated body and passes `category` + `complaintId` into `createUploadUrl` (orchestration only — sanitize/build stay in the service). - **Completed: 2026-06-25**

### 4. RLS verification (no change)
- [x] ✅ 4.1 Verified: the `prescription-attachments` bucket is **private** (`027_prescription_attachments_bucket.sql`) and reached only via service-role signed URLs gated by `verifyPrescriptionOwnership`; there is no `storage.objects` RLS to widen. The deeper `subjective/{complaintId}/…` object stays under `{doctor}/{prescription}/`, so the same ownership flow covers it — no policy edit. - **Completed: 2026-06-25**

### 5. Verification & Testing
- [x] ✅ 5.1 Service test (`prescription-attachment-objective-tag.test.ts`): `subjective` builds the `{complaintId}` segment; unsafe id stripped (no traversal); empty → `unpinned`; objective/legacy untouched. Validation test (`prescriptions.test.ts`): subjective + optional/over-long `complaintId`, unknown keys dropped. - **Completed: 2026-06-25**
- [x] ✅ 5.2 `cd backend && npm test` green for the slice (77 passed); `tsc --noEmit` clean; no new lint on touched files; PHI-safe (no file paths / complaint ids logged). - **Completed: 2026-06-25**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/services/prescription-attachment-service.ts (AttachmentCategory + subjective/{complaintId}/ path build + sanitize)
UPDATE: backend/src/utils/validation.ts (ATTACHMENT_CATEGORY_VALUES + complaintId in createUploadUrlBodySchema)
UPDATE: backend/src/controllers/prescription-controller.ts (pass category + complaintId)
UPDATE/CREATE: backend/tests/unit/services/* (subjective segment + sanitize + objective parity)
DO NOT TOUCH: any migration; storage bucket; RLS policy; the objective path behaviour; complaints JSONB reads
```

**When updating existing code:**
- [ ] Mirror the `objective/` segment build exactly; add a branch, do not refactor the existing path.
- [ ] Keep the controller orchestration-only; sanitize + build in the service.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Path segment, not a column (P2-D1).** The complaint pin lives in the storage path.
- **Opaque complaintId (P2-D2).** Sanitize + treat as a folder; no existence check against `complaints`.
- **Reuse-not-widen (SDP-D3 / P5-D4).** No new bucket/policy/migration; verify the shipped policy covers the deeper path.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — PHI media (symptom photos) via the shipped `prescription_attachments` storage.
  - [ ] **RLS verified?** **Yes** — inherits the doctor-scoped prescription policy; this task verifies the deeper path is covered and does **not** widen it.
- [ ] **Any PHI in logs?** **No** — never log file paths, signed URLs, or complaint content.
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No** new retention surface — same bucket lifecycle as objective media.
- [ ] **Migration?** **No.** (Reuse-not-widen; still **Opus** per the PHI-media/RLS hard rule.)

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ `subjective` uploads write `subjective/{complaintId}/{uuid}-{file}`; category enum + optional `complaintId` validate; `objective`/legacy paths byte-identical; no migration/column/bucket/policy added.
- [x] ✅ RLS coverage of the deeper path is verified + documented (private bucket + service-role signed URLs gated by ownership; no `storage.objects` policy to widen).
- [x] ✅ `cd backend && npm test` green for the slice; PHI-safe logs.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The Subjective analog of objective-tab `obj-22` — a near-verbatim clone of the `objective/` segment with a `{complaintId}` sub-folder. The genuinely new bit is the per-complaint pin.

---

## 🔗 Related Tasks

- [`task-sdp-03-per-complaint-photo-strip.md`](./task-sdp-03-per-complaint-photo-strip.md) — the UI that consumes this segment.
- [`task-sdp-04-orphan-readonly-a11y-close-gate.md`](./task-sdp-04-orphan-readonly-a11y-close-gate.md) — orphan/read-only/a11y/round-trip gate.

---

**Last Updated:** 2026-06-25
**Pattern:** clone the shipped `objective/` attachment segment; add a `subjective/{complaintId}/` branch + Zod + controller wiring; verify-not-widen RLS.
**Reference:** `process/CODE_CHANGE_RULES.md`
