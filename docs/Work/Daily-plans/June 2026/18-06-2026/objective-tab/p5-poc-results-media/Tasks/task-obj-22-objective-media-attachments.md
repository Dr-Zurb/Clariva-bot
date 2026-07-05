# Task obj-22: Objective media strip (wound/rash/ECG/report-scan attachments via the shipped storage)

> **Filename:** `task-obj-22-objective-media-attachments.md` in `objective-tab/p5-poc-results-media/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Give the Objective tab a media home: an **objective-native attachment strip** for wound/rash photos, ECG images,
and report scans, **reusing the shipped `prescription_attachments` storage** (bucket migration 027) with a
**context/category tag** so objective media is distinguishable from other prescription files. Telemed
(patient-captured) media attaches the same way. **No new bucket and no new RLS policy** — inherit the
prescription-scoped policy and *verify* it covers the tag. **No structured-result changes** (obj-20/21), **no
OCR/AI parse** (deferred, compliance gate).

**Program / Phase:** objective-tab · Phase 5 (point-of-care results + media)  
**Batch:** [`plan-p5-objective-tab-poc-results-media-batch.md`](../plan-p5-objective-tab-poc-results-media-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p5-objective-tab-poc-results-media.md`](./EXECUTION-ORDER-p5-objective-tab-poc-results-media.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **COMPLETE** — 2026-06-19 — **Opus** (storage + PHI media + RLS). Depends on **obj-20** (section host; can run parallel to obj-21/23).

> **Decision (surfaced first):** objective media is tagged via an **`objective/` storage path segment** (NO new column, NO migration, NO new bucket/RLS policy) — the prescription-scoped policy (migration 026) already covers every object under `{doctor_id}/{prescription_id}/…`. Chosen over a `category` column to avoid re-triggering the batch's Opus-density cut. Remove is backed by the **already-shipped DELETE RLS policy** (migration 026) — no policy widening.

**Change Type:**
- [x] **Update existing** (reuse attachment storage + add an objective surface). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** [`027_prescription_attachments_bucket.sql`](../../../../../../../../backend/migrations/027_prescription_attachments_bucket.sql) (the storage bucket + policy); `prescription_attachments` on the prescription type + how [`rxFormFieldsFromPrescription`](../../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx) reads `attachments`; the existing attachment upload path/API; [`ObjectiveSection.tsx`](../../../../../../../../frontend/components/cockpit/rx/sections/ObjectiveSection.tsx) (section host) + P3 registry.
- ❌ **What's missing:** an objective context/category tag on attachments; the objective media strip UI; the registry section id for media.

**Scope Guard:**
- Expected files touched: ≤ 6 (attachment context tag — type + the upload/list path; the media-strip UI; registry id; `ObjectiveSection` mount; tests). **No new bucket, no new RLS policy, no new migration** unless a tag column is strictly required (prefer metadata/category on the existing attachment shape). **No** structured-result changes (obj-20/21), **no** OCR/AI.

> **⚠️ Decide first (one line):** can objective media be tagged via the **existing** attachment metadata/category field, or does it need a new column? If a column is required, this becomes a migration task (re-confirm Opus + the batch plan's Opus-density cut). **Surface before coding.**

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Attachment context tag (reuse, don't widen)
- [x] ✅ 1.1 Added an `objective` category marker as a **storage path segment** (`createUploadUrlBodySchema.category` enum + `createUploadUrl(category)` builds `{doctor}/{rx}/objective/{uuid}-{file}`). No column added — surfaced the decision first. - **Completed: 2026-06-19**
- [x] ✅ 1.2 Tag flows through the upload path (`getPrescriptionUploadUrl({ category })`); `filterObjectiveAttachments` filters by the `objective/` segment. RLS unchanged — prescription-scoped policy (026) covers the segment. - **Completed: 2026-06-19**

### 2. Objective media strip
- [x] ✅ 2.1 `ObjectiveMediaStrip` — thumbnails (image) + file chips (PDF), add (reuses the shipped uploader + mime/size guards verbatim), remove (DELETE endpoint on the shipped RLS policy), open (signed download URL). - **Completed: 2026-06-19**
- [x] ✅ 2.2 Registered a `media` section id in the P3 registry + mounted in `ObjectiveSection`; reorder/collapse/visibility/seed all apply; read-only (`disabled`) shows thumbnails with no add/remove. - **Completed: 2026-06-19**

### 3. Telemed tie-in (light)
- [x] ✅ 3.1 Patient-captured media flows through the SAME upload path + `objective` tag (no separate flow). Media is visible by default for `in_clinic`/`video`; hidden by default for async `voice`/`text`. - **Completed: 2026-06-19**

### 4. Verification & Testing
- [x] ✅ 4.1 Tests: upload tags `category: 'objective'` (path segment); strip lists only objective-tagged files; remove calls the delete endpoint; read-only hides edit affordances; legacy/non-objective attachments untouched. (`objective-media.test.ts`, `ObjectiveMediaStrip.test.tsx`, `prescription-attachment-objective-tag.test.ts`.) - **Completed: 2026-06-19**
- [x] ✅ 4.2 RLS/path: no policy widening (segment lives under the same prescription folder; DELETE reuses the shipped 026 policy); PHI media paths/URLs never logged. - **Completed: 2026-06-19**
- [x] ✅ 4.3 Frontend `tsc`/lint/tests clean on touched files (objective suites green: 104; new obj-22: 14). Backend `npm test`: my 2 suites green; full-suite failures are pre-existing `@react-pdf/renderer` ESM noise (identical 31/12 on baseline). - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: <attachment type + upload/list path> (objective context/category tag)
CREATE: frontend/components/cockpit/rx/objective/ObjectiveMediaStrip.tsx
UPDATE: frontend/lib/cockpit/objective-section-order.ts (media section id)
UPDATE: frontend/components/cockpit/rx/sections/ObjectiveSection.tsx (mount the strip)
DO NOT TOUCH: the storage bucket/RLS policy (reuse); structured results (obj-20/21); OCR/AI parse
```

**When updating existing code:**
- [ ] Reuse the shipped uploader + mime/size guards verbatim; do not fork an upload path.
- [ ] Tag-and-filter, don't relocate — objective media is the same `prescription_attachments`, just categorized.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Objective-native, reuse storage (P5-D4).** No new bucket, no new RLS policy; tag the shipped attachments.
- **Registry-aware (P3).** The media strip is a registered Objective section.
- **No OCR/AI (deferred).** Attach + view only; parsing report scans is a separate compliance-gated slice.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — **PHI media** via the existing `prescription_attachments` storage (per-patient).
  - [x] **RLS verified?** **Yes** — inherits the prescription-scoped policy (026); the `objective/` segment sits under the same `{doctor}/{rx}/…` folder, so SELECT/INSERT/DELETE policies cover it unchanged. **No new policy.**
- [x] **Any PHI in logs?** **No** — media paths / signed URLs / filenames / patient context are never logged (backend + strip).
- [x] **External API or AI call?** **No** (OCR/AI deferred).
- [x] **Retention / deletion impact?** **Confirmed** — objective media follows the existing attachment retention (account-deletion cascade + 7-yr); delete reuses the shipped 026 DELETE policy. No new retention surface.

> **STOP/Opus gate:** touches **storage + PHI media + RLS**. Opus-grade. If a tag column/migration is required (see Scope Guard), re-confirm with the owner before coding.

---

## ✅ Acceptance & Verification Criteria

- [x] Objective media uploads through the shipped storage with an objective context tag, renders as a registered strip, round-trips on reload, and is read-only in `disabled` mode; no new bucket/policy.
- [x] Non-objective attachments untouched; RLS not widened; no PHI in logs.
- [x] `tsc`/lint/tests green (touched scope; pre-existing repo noise routed).

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The one genuinely new surface in P5. Kept bounded by reusing shipped storage — the risk is the RLS/tag boundary, hence Opus. Catalog §G; resolves the photo-strip-home open-Q to the Objective pane (P5-D4).

---

## 🔗 Related Tasks

- [`task-obj-20-structured-test-results-foundation.md`](./task-obj-20-structured-test-results-foundation.md) — the section host this mounts beside.
- [`task-obj-24-poc-results-close-gate.md`](./task-obj-24-poc-results-close-gate.md) — media round-trip proven in the close-gate.

---

**Last Updated:** 2026-06-19  
**Pattern:** reuse `prescription_attachments` storage + a category tag + a registered objective media strip.  
**Reference:** `process/CODE_CHANGE_RULES.md`
