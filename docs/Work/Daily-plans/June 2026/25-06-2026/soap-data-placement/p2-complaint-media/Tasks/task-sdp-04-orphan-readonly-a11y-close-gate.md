# Task sdp-04: Orphan/unpinned fallback + read-only + a11y + verification close-gate

> **Filename:** `task-sdp-04-orphan-readonly-a11y-close-gate.md` in `soap-data-placement/p2-complaint-media/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Close Phase 2: handle the **orphan/unpinned** case (a photo whose `complaintId` matches no current complaint — e.g. the complaint card was deleted), enforce **read-only** mode, run the **a11y** sweep, and prove **media round-trip** on reload. Per P2-D3 the orphan policy is **non-destructive** — orphans surface under an **"Other photos"** fallback in the Subjective area, never auto-deleted by a reducer.

**Program / Phase:** soap-data-placement · Phase 2 (per-complaint symptom media)
**Batch:** [`plan-p2-soap-data-placement-complaint-media-batch.md`](../plan-p2-soap-data-placement-complaint-media-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-soap-data-placement-complaint-media.md`](./EXECUTION-ORDER-p2-soap-data-placement-complaint-media.md)
**Estimated Time:** ~2–3 hours
**Status:** ✅ **DONE** — 2026-06-25. **Model: Sonnet** (depends on sdp-03).

**Change Type:**
- [ ] **Update existing** (Subjective media surface) + verification. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** sdp-03's per-complaint strip + `subjective-media.ts` filter; the form-shell attachment store; `disabled` (read-only) conventions in `ObjectiveMediaStrip`; the objective media tests to mirror.
- ❌ **What's missing:** the "Other photos" orphan fallback; an explicit read-only assertion for the per-complaint strip; the round-trip + a11y proofs.

**Scope Guard:**
- Expected files touched: ≤ 5 — a small "Other photos" fallback in the Subjective area; the per-complaint strip's read-only path; tests. **DO NOT** add cascade-delete on complaint removal (P2-D3 — non-destructive); **DO NOT** touch sdp-02 backend.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Orphan / unpinned fallback (P2-D3)
- [x] ✅ 1.1 Orphans computed via `filterOrphanSubjectiveAttachments` + `collectKnownComplaintIdSegments` (subjective photos whose folder matches no current complaint id). - **Completed: 2026-06-25**
- [x] ✅ 1.2 Rendered under "Other photos" in `ComplaintList` via `SubjectiveOtherPhotosStrip` (view + remove, no add); complaint removal never auto-deletes attachments. - **Completed: 2026-06-25**

### 2. Read-only mode
- [x] ✅ 2.1 `disabled` hides add/remove on per-complaint strip and "Other photos" (mirrors `ObjectiveMediaStrip`). - **Completed: 2026-06-25**

### 3. a11y
- [x] ✅ 3.1 Generic index-based aria labels on open/remove (`Attachment N` — no filenames or complaint text); keyboard-operable buttons with focus rings. - **Completed: 2026-06-25**

### 4. Verification close-gate
- [x] ✅ 4.1 Round-trip: pinned photo survives reload-shaped re-filter; complaint removal → photo surfaces as orphan (reducer does not cascade-delete). - **Completed: 2026-06-25**
- [x] ✅ 4.2 PHI-safe: no file paths / signed URLs / complaint text in logs or aria labels. - **Completed: 2026-06-25**
- [x] ✅ 4.3 FE slice: eslint clean on touched files; 49/49 tests pass; tsc clean on touched files. BE: 7/7 attachment tests pass. - **Completed: 2026-06-25**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/sections/SubjectiveSection.tsx (or a small OtherPhotos component) — orphan fallback
UPDATE: frontend/components/cockpit/rx/media/PrescriptionMediaStrip.tsx (read-only path, if not already)
CREATE/UPDATE: __tests__ — orphan fallback, read-only, round-trip, a11y
DO NOT TOUCH: sdp-02 backend; cascade-delete on complaint removal (non-destructive, P2-D3)
```

**When updating existing code:**
- [ ] Mirror `ObjectiveMediaStrip`'s read-only + a11y conventions; do not invent new ones.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Non-destructive orphans (P2-D3).** Deleting a complaint never deletes its photos; they fall to "Other photos".
- **Read-only honored (P2-D5 / SDP-D5).** No add/remove in `disabled`.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — reads/removes PHI media via the shipped store.
  - [ ] **RLS verified?** **Yes** — inherits sdp-02's verified path.
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** Explicit removes only; **no** cascade delete (P2-D3).

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ Orphan photos surface under "Other photos" (non-destructive); read-only mode hides add/remove; a11y operable.
- [x] ✅ Media round-trips on reload pinned to the right complaint.
- [x] ✅ eslint + 49/49 slice tests green; tsc clean on touched files; BE attachment tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The Phase-2 close-gate — mirrors objective-tab `obj-24`'s media round-trip + read-only + a11y posture, scoped to per-complaint subjective media.

---

## 🔗 Related Tasks

- [`task-sdp-02-subjective-attachment-segment.md`](./task-sdp-02-subjective-attachment-segment.md) · [`task-sdp-03-per-complaint-photo-strip.md`](./task-sdp-03-per-complaint-photo-strip.md).

---

**Last Updated:** 2026-06-25
**Pattern:** non-destructive orphan fallback + read-only + a11y + round-trip gate (mirror `obj-24`).
**Reference:** `process/CODE_CHANGE_RULES.md`
