# Task rfeq-02: Cockpit consumes `rxFocus`

> **Filename:** `task-rfeq-02-rx-focus-deep-link.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

When `/dashboard/appointments/:id` loads (or its query changes) with `rxFocus`, restore the target SOAP pane if it is hidden, activate its tab, expand the section, scroll it into view, focus the field if one was named, then strip the query param so a refresh does not re-fire.

**Program / Phase:** rx-fast-entry · Phase 1 (field-search)
**Batch:** [`plan-p1-rx-fast-entry-field-search-batch.md`](../plan-p1-rx-fast-entry-field-search-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-rx-fast-entry-field-search.md`](./EXECUTION-ORDER-p1-rx-fast-entry-field-search.md)
**Estimated Time:** ~2–3 hours
**Status:** ✅ **COMPLETE**
**Completed:** 2026-08-30

**Change Type:**
- [ ] **New feature** — Add code only (no change to existing behavior)
- [x] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** `restoreLeaf` and `setActiveTab` on the layout-tree mutation module; `useShellLayout` already exposes `setActiveTab`. Per-surface scroll helpers: `collapse-scroll.ts`, `exam-card-scroll.ts`, `complaint-card-scroll.ts`, plus chart-allergy / chart-medication scroll. SOAP pane ids: `body` / `subjective` / `objective` / `assessment` / `plan`. Appointment page does **not** currently read a field-focus query param (only `chat-history` reads `from` / `pid` / `date`).
- ✅ **What's missing (now shipped):** `rxFocus` consumer on `CockpitV3Shell` via `useRxFocusDeepLink`. Parse / in-place pane restore / tab activate / section scroll / best-effort field focus / param strip.
- ⚠️ **Still missing:** Shared expand across the four SOAP tabs (no common collapse store). Deferred to rfeq-03 per the file-budget escape hatch. Hidden *sections* stay hidden (Phase 2).
- ⚠️ **Notes:** `focusLeafInTree` is a **snap-rail** — it reparents leaves and remounts non-focused panes. RFE-DL-11 / RFE1-D4 forbid using it here. Hidden *sections* stay hidden; the jump may land on a pane whose target section is not mounted. Do not unhide (Phase 2).

**Scope Guard:**
- Expected files touched: ≤ 5
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md)
- [`plan-rx-fast-entry.md`](../../../../../../Product%20plans/plan-rx-fast-entry.md) — RFE-DL-11, RFE1-D1, RFE1-D4

---

## ✅ Task Breakdown (Hierarchical)

### 1. Parse and consume
- [x] ✅ 1.1 Read `rxFocus` on the appointment / cockpit mount (client). Ignore unknown / malformed values fail-soft. - **Completed: 2026-08-30**
  - [x] ✅ 1.1.1 Valid shape: `pane.section` or `pane.section.field` using existing ids. - **Completed: 2026-08-30**
  - [x] ✅ 1.1.2 After a successful apply, strip `rxFocus` from the URL without a full navigation reset of form state. - **Completed: 2026-08-30**
- [x] ✅ 1.2 If the target pane is hidden on the canvas, unhide the host leaf in place then `setActiveTab`. If it is visible but not the active tab in its group, activate it only. (Legacy `restoreLeaf` is the old `LayoutNode` API — not used.) - **Completed: 2026-08-30**

### 2. Expand, scroll, focus
- [ ] 2.1 Expand the named section if it is collapsed — **deferred to rfeq-03** (no shared expand API across the four SOAP tabs; file-budget escape hatch).
- [x] ✅ 2.2 Scroll the section (or the field) into view using the existing per-surface scroll helpers where they already cover that surface. - **Completed: 2026-08-30**
- [x] ✅ 2.3 If a field id is present and that input is mounted, focus it. If the section is hidden, skip focus (do not unhide). - **Completed: 2026-08-30**

### 3. Verification & Testing
- [x] ✅ 3.1 Unit-test parse: good dotted values resolve; garbage is ignored. - **Completed: 2026-08-30**
- [x] ✅ 3.2 Test: hidden pane is restored; snap-rail helper is not called. - **Completed: 2026-08-30**
- [x] ✅ 3.3 Test: param is stripped after apply. - **Completed: 2026-08-30**
- [x] ✅ 3.4 `npx tsc --noEmit` + lint on touched files. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/rx-focus.ts                    ← parse + apply (name may vary)
CREATE: frontend/lib/cockpit/__tests__/rx-focus.test.ts
UPDATE: the appointment / cockpit client mount that already owns layout
        (likely PatientProfilePage or CockpitV3Shell — audit first, touch one)
```

**Existing Code Status:**
- ✅ `layout-tree-mutations.ts` `restoreLeaf` / `setActiveTab` — EXISTS; reuse.
- ✅ `useShellLayout` — EXISTS; already the write path for tab activation.
- ✅ Scroll helpers under `frontend/lib/cockpit/` and `frontend/lib/chart/` — EXIST; reuse, do not duplicate.
- ❌ `rxFocus` consumer — MISSING.
- ⚠️ Appointment `[id]` page — EXISTS; does not read this param today.

**When updating existing code:**
- [x] ✅ Audit which mount already has layout + the SOAP sections before adding a second listener. - **Completed: 2026-08-30**
- [x] ✅ Map the change to: one consumer, one parse module, tests. - **Completed: 2026-08-30**
- [x] ✅ Do not import `focusLeafInTree`. - **Completed: 2026-08-30**

**DO NOT TOUCH:** `focus-leaf.ts`, `CockpitPalette.tsx`, the four factory-default visibility lists, doctor-settings hidden persist (Phase 2).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Restore + activate, never snap-rail (RFE-DL-11, RFE1-D4).
- Hidden sections stay hidden (RFE-DL-11).
- Fail-soft on garbage query values — do not toast a doctor for a bad URL.
- No PHI in logs. Do not log `rxFocus` (it can name a clinical field, not a patient, but keep the channel clean).
- Strip the param after apply so back/refresh does not re-animate.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — URL query + existing layout mutations. No new column.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] `rxFocus=objective.vitals.vitalsSpo2` on an open visit focuses SpO₂ when that vital is visible. (unit: aria-label match inside the vitals section; browser smoke in rfeq-03)
- [x] A hidden Objective pane is restored and activated; the layout is not snap-railed.
- [x] `rxFocus=subjective.family_history` activates Subjective even if Family history is still hidden.
- [x] The query param is gone after apply.
- [x] Type-check + lint clean; parse + restore tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** Task text named `restoreLeaf`, but that helper is the legacy `LayoutNode` API (reparents a missing leaf). Live v3 hidden panes use `hidden` on `PaneTreeNode`.
**Solution:** In-place unhide of the host leaf + `setActiveTab`. No snap-rail import.

**Issue:** Collapse state is per-section React state inside each SOAP tab — no shared expand API.
**Solution:** Used the file-budget escape hatch. Pane restore + tab activate + section scroll + best-effort field focus shipped; expand of a collapsed section is a rfeq-03 note. Hidden sections stay hidden.

---

## 📝 Notes

- If expand/focus across four SOAP tabs cannot stay inside the file budget, land pane restore + tab activate + section scroll in this task and leave per-input focus as a note for rfeq-03 — do not silently expand into Phase 2 unhide.
- Shipped best-effort field focus when the input is mounted (`aria-label` contains the registry label). Expand-collapsed-section is the remaining rfeq-03 note.

---

## 🔗 Related Tasks

- [`task-rfeq-01-field-index-and-cmdk-source.md`](./task-rfeq-01-field-index-and-cmdk-source.md) — writes the URL
- [`task-rfeq-03-field-search-gate.md`](./task-rfeq-03-field-search-gate.md) — phase gate
- [Phase 2](../../p2-command-bar/) — unhide is not this task

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30
**Pattern:** Query-param deep-link consumed once, then stripped
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
