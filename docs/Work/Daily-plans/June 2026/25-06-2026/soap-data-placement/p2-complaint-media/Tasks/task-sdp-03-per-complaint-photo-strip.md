# Task sdp-03: Per-complaint photo strip (shared uploader + `ComplaintCard` mount)

> **Filename:** `task-sdp-03-per-complaint-photo-strip.md` in `soap-data-placement/p2-complaint-media/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Surface sdp-02's segment in the UI: extract the shipped objective uploader (upload / thumbnail / remove) into a **reusable** strip/hook, add a `subjective-media.ts` helper mirroring `objective-media.ts`, and mount a compact **"Photos"** affordance inside each `ComplaintCard`, filtered to that complaint's stable `id`. A symptom photo (rash / wound / swelling) now attaches next to the complaint that prompted it. **Form-state / UI only — no schema, no derivation; reuses the shipped attachment store.**

**Program / Phase:** soap-data-placement · Phase 2 (per-complaint symptom media)
**Batch:** [`plan-p2-soap-data-placement-complaint-media-batch.md`](../plan-p2-soap-data-placement-complaint-media-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-soap-data-placement-complaint-media.md`](./EXECUTION-ORDER-p2-soap-data-placement-complaint-media.md)
**Estimated Time:** ~3–4 hours
**Status:** ✅ **DONE** — 2026-06-25. **Model: Sonnet** (depends on sdp-02).

**Change Type:**
- [ ] **Update existing** (`ComplaintCard`) + **add** the shared strip + `subjective-media.ts`. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** sdp-02's `subjective/{complaintId}/` segment + the `getPrescriptionUploadUrl` `category` body in [`lib/api.ts`](../../../../../../../../frontend/lib/api.ts); the full upload/thumbnail/remove flow in [`ObjectiveMediaStrip.tsx`](../../../../../../../../frontend/components/cockpit/rx/objective/ObjectiveMediaStrip.tsx); the tag/filter helpers in [`objective-media.ts`](../../../../../../../../frontend/lib/cockpit/objective-media.ts); the complaint card [`ComplaintCard.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintCard.tsx) with `PrescriptionComplaint.id`; the form-shell attachment store (`shell.attachments`).
- ❌ **What's missing:** a reusable uploader (today it's inline in `ObjectiveMediaStrip`); `subjective-media.ts`; the `'subjective'`/`complaintId` body on `getPrescriptionUploadUrl`; the per-complaint mount.

**Scope Guard:**
- Expected files touched: ≤ 6 — extract a shared strip/hook; `subjective-media.ts`; `lib/api.ts` (`category: "objective" | "subjective"` + `complaintId`); `ComplaintCard.tsx` mount; tests. **Refactor of `ObjectiveMediaStrip` is behaviour-preserving** (it consumes the shared strip with `category="objective"`). **DO NOT** change the objective filter/limits or sdp-02's backend.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Extract the shared uploader
- [x] ✅ 1.1 Pulled upload / signed-thumbnail / remove into `PrescriptionMediaStrip`, parameterized by `category` + `complaintId` + filter predicate. - **Completed: 2026-06-25**
- [x] ✅ 1.2 `ObjectiveMediaStrip` re-pointed at shared strip with `category="objective"` — behaviour-preserving (5/5 objective tests green). - **Completed: 2026-06-25**

### 2. Subjective media helpers
- [x] ✅ 2.1 `subjective-media.ts`: `SUBJECTIVE_ATTACHMENT_CATEGORY`, `isSubjectiveAttachment`, `filterSubjectiveAttachmentsForComplaint`, re-exported MIME/limit constants + `sanitizeComplaintIdSegment`. - **Completed: 2026-06-25**

### 3. API wiring
- [x] ✅ 3.1 `getPrescriptionUploadUrl` body: `category?: "objective" | "subjective"` + optional `complaintId`. - **Completed: 2026-06-25**

### 4. Per-complaint mount
- [x] ✅ 4.1 Compact "Photos" affordance mounted in `ComplaintCard` (expanded body), filtered to `value.id`; uploads tag `subjective` + `complaintId`. - **Completed: 2026-06-25**
- [x] ✅ 4.2 Compact variant: smaller thumbnails (14×14), no help/empty block — add-photo button only when empty. - **Completed: 2026-06-25**

### 5. Verification & Testing
- [x] ✅ 5.1 Tests: per-complaint filter isolation (`PrescriptionMediaStrip.test.tsx`); upload tags subjective+complaintId; ComplaintCard mount; objective strip parity unchanged (`ObjectiveMediaStrip.test.tsx` 5/5). - **Completed: 2026-06-25**
- [x] ✅ 5.2 Slice: eslint clean on touched files; 39/39 tests pass for the slice; tsc clean on touched files (pre-existing errors elsewhere unrelated). - **Completed: 2026-06-25**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/components/cockpit/rx/media/PrescriptionMediaStrip.tsx (shared strip) — or a hook
UPDATE: frontend/components/cockpit/rx/objective/ObjectiveMediaStrip.tsx (consume shared strip, category="objective")
CREATE: frontend/lib/cockpit/subjective-media.ts (category const + isSubjectiveAttachment + filterForComplaint)
UPDATE: frontend/lib/api.ts (getPrescriptionUploadUrl: category union + complaintId)
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintCard.tsx (mount the per-complaint strip)
CREATE/UPDATE: __tests__ for the strip + ComplaintCard + objective parity
DO NOT TOUCH: sdp-02 backend; objective filter/limits behaviour
```

**When updating existing code:**
- [ ] Extract once; both strips consume the same component (P2-D4 — one media model).
- [ ] The objective refactor must keep `ObjectiveMediaStrip`'s existing tests green.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **One media model (P2-D4).** No forked second uploader; only the path segment + filter differ.
- **Per-complaint filter.** A card shows only its own `subjective/{id}` photos.
- **Compact.** The strip is a small affordance on the card, not a dominant block.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — uploads PHI media via sdp-02's segment (doctor-scoped prescription).
  - [ ] **RLS verified?** **Yes** — inherits sdp-02's verified prescription-scoped path.
- [ ] **Any PHI in logs?** **No** — never log file paths / signed URLs / complaint text.
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No** new surface.

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ A per-complaint photo strip renders in `ComplaintCard`, filtered to that complaint's `id`; uploads tag `subjective` + `complaintId`.
- [x] ✅ Upload/thumbnail/remove reuse the shared uploader; `ObjectiveMediaStrip` is unchanged in behaviour.
- [x] ✅ eslint + 39/39 slice tests green; tsc clean on touched files.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Reuses the shipped objective uploader wholesale; the only new surface is the per-complaint mount + filter.

---

## 🔗 Related Tasks

- [`task-sdp-02-subjective-attachment-segment.md`](./task-sdp-02-subjective-attachment-segment.md) — the segment consumed here.
- [`task-sdp-04-orphan-readonly-a11y-close-gate.md`](./task-sdp-04-orphan-readonly-a11y-close-gate.md) — edges + gate.

---

**Last Updated:** 2026-06-25
**Pattern:** extract the shipped objective uploader; mount a per-complaint strip filtered by `complaintId`.
**Reference:** `process/CODE_CHANGE_RULES.md`
