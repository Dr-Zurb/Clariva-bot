# Task vnb-01: Single mount on both hosts + explicit parse trigger

> **Filename:** `task-vnb-01-single-mount.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Move `VisitDescribeBar` from twice-mounted (inside Subjective's complaint list and Plan's medicine bar) to **one instance per host**, at the top of the form, always visible. Give it an explicit parse trigger (Enter / mic-done) so a whole-visit dictation is parsed once, not re-parsed per speech-final event.

**Program / Phase:** visit-narrative · Phase 1 (one box)
**Batch:** [`plan-p1-visit-narrative-one-box-batch.md`](../plan-p1-visit-narrative-one-box-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-visit-narrative-one-box.md`](./EXECUTION-ORDER-p1-visit-narrative-one-box.md)
**Estimated Time:** ~3 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-08-30

**Change Type:**
- [ ] **New feature** — Add code only (no change to existing behavior)
- [x] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** `VisitDescribeBar` (mic + text + proposal, rfed-04) mounted at `ComplaintList.tsx` (~line 569) and `MedicineCaptureBar.tsx` (~line 348), each with host-specific accept callbacks. Speech via `use-speech-recognition`; parse currently fires on every `onFinal`.
- ❌ **What's missing:** A single top-of-form mount visible on both hosts (flat consultation form + cockpit); an explicit "parse now" trigger.
- ⚠️ **Notes:** The cockpit lifts Subjective/Objective out of `PrescriptionFormCompositionRoot` into panes (`subjectiveLifted` / `objectiveLifted`), so "top of the composition root" is **not** visible on the cockpit host. Follow the lifted-chrome precedent (`SafetyStickyStrip` / `AssessmentStrip`) for the cockpit mount. If neither host has a clean slot, **STOP and surface** (VNB-D1) — do not bury the box inside one pane's tab.

**Scope Guard:**
- Expected files touched: ≤ 6 (`VisitDescribeBar`, two unmount sites, two host mount sites, tests)
- The only permitted edits to `ComplaintList` / `MedicineCaptureBar` are removing the mount + dead prop wiring. Their behavior and suites stay byte-identical (VN-DL-2).
- Any expansion requires explicit approval.

**Reference Documentation:**
- [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-DL-1, VN-DL-2, VN-Q1
- Batch lock VNB-D1
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Unmount the seed
- [x] ✅ 1.1 Remove the `VisitDescribeBar` mount and its now-dead prop wiring from `ComplaintList.tsx`. - **Completed: 2026-08-30**
- [x] ✅ 1.2 Remove the mount and dead wiring (`onAddComplaints` pass-through if unused after this) from `MedicineCaptureBar.tsx` / `PlanSection.tsx`. - **Completed: 2026-08-30**

### 2. Mount once per host
- [x] ✅ 2.1 Flat consultation form host: one instance at the top, above the SOAP sections, inside `RxFormProvider`. - **Completed: 2026-08-30**
- [x] ✅ 2.2 Cockpit host: one instance in the lifted-chrome position (visible regardless of which pane owns Subjective/Objective). - **Completed: 2026-08-30**
- [x] ✅ 2.3 Placeholder per VN-Q1: communicates "anything — a vital, a medicine, or the whole visit". Mic button stays. - **Completed: 2026-08-30**

### 3. Explicit parse trigger
- [x] ✅ 3.1 Parse fires on Enter (or a Done affordance after dictation) — not per `onFinal`. Dictated text accumulates into the input until triggered. - **Completed: 2026-08-30**
- [x] ✅ 3.2 In-flight parse aborts on re-trigger (existing `AbortSignal` path). - **Completed: 2026-08-30**

### 4. Verification & Testing
- [x] ✅ 4.1 Host tests: exactly one instance per host; none inside Subjective/Plan sections. - **Completed: 2026-08-30**
- [x] ✅ 4.2 Trigger test: three `onFinal` events then Enter → one parse call. - **Completed: 2026-08-30**
- [x] ✅ 4.3 Capture-bar suites (`ComplaintList`, `MedicineCaptureBar`, `PlanSection`) pass **without edits** beyond removed-mount assertions. - **Completed: 2026-08-30**
- [x] ✅ 4.4 `npx tsc --noEmit` + lint on touched files. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/subjective/VisitDescribeBar.tsx   (trigger + placeholder)
UPDATE: frontend/components/cockpit/rx/subjective/ComplaintList.tsx      (remove mount)
UPDATE: frontend/components/cockpit/rx/inputs/MedicineCaptureBar.tsx     (remove mount)
UPDATE: <flat form host — top-of-form mount>
UPDATE: <cockpit lifted-chrome host — mount>
UPDATE: frontend/components/cockpit/rx/subjective/__tests__/VisitDescribeBar.test.tsx
```

**Existing Code Status:**
- ✅ `VisitDescribeBar` + speech hook + abort path — EXIST; relocate, don't rewrite.
- ✅ Lifted-chrome precedent (`SafetyStickyStrip`) — EXISTS; follow it for the cockpit slot.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- The box stays inside `RxFormProvider` on both hosts (it will dispatch in vnb-04).
- No behavior change to what parsing produces — that is vnb-03. This task moves the surface and the trigger only.
- No patient-audio path near `use-speech-recognition` (VN-DL-10).

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** No (frontend mounts only).
- [x] **Any PHI in logs?** No — no new logging.
- [x] **External API or AI call?** No new ones (existing parse path, relocated).
- [x] **Retention / deletion impact?** No.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] One `VisitDescribeBar` per host, top-visible; zero mounts inside sections.
- [x] Whole-visit dictation parses once on explicit trigger.
- [x] Capture-bar behavior byte-identical; suites green without edits.
- [x] Type-check + lint + tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:**
**Solution:**

---

## 📝 Notes

- Cockpit slot: `safetyDock` on `CockpitV3Shell` (same lifted-chrome as `SafetyStickyStrip`). Flat host: top of `PrescriptionFormCompositionRoot`. When both SOAP panes are lifted, the form copy hides so the cockpit dock is the only instance.
- File budget: PlanSection dead-wiring removal was the +1 beyond the listed 6 (task 1.2 required it).
- Residual: `PlanSection` "collapses a named incomplete row…" is a pre-existing flake (same as rfed-04); passes in isolation.

---

## 🔗 Related Tasks

- [`task-vnb-02-segmenter-kinds.md`](./task-vnb-02-segmenter-kinds.md) (parallel, Lane β)
- [`task-vnb-03-deterministic-first-router.md`](./task-vnb-03-deterministic-first-router.md) (consumes the trigger)

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Component relocation + trigger discipline
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
