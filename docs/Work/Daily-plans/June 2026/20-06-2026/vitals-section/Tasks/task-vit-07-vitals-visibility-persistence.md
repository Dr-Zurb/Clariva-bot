# Task vit-07: Per-doctor vitals visibility persistence + pure resolver (core-on default)

> **Filename:** `task-vit-07-vitals-visibility-persistence.md` in `vitals-section/Tasks/`.
> **Relative-link note:** `process/` = five `../`; `Reference/` = six; `frontend/`/`backend/` = seven.

---

## 📋 Task Overview

Build the data layer for hide/unhide: a **pure resolver** `resolveVisibleVitals({ hidden }) → visibleKeys[]`
(default = classic core on — BP, HR, RR, Temp, SpO₂, Weight, Height — everything else hidden) plus the
`vitals_hidden` transport over `doctor_settings`, cloning `objective-section-visibility.ts`. **No specialty
input yet** (V3-D3) — the resolver signature leaves room for it later but this program ships the single
core-on default. The resolver is the single source of "what's visible"; the menu (vit-08) and grid (vit-05/06)
consume it.

**Program / Phase:** vitals-section · VP3 (hide/unhide engine)  
**Batch:** [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md)  
**Execution order:** [`EXECUTION-ORDER-vitals-section.md`](./EXECUTION-ORDER-vitals-section.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **Done** (2026-06-21).

**Change Type:**
- [x] **Add helper + transport** — pure resolver + `vitals_hidden` load/save. Follow [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** `objective-section-visibility.ts` (the resolver/transport pattern to clone); vit-02 `doctor_settings.vitals_hidden`; vit-03 types; the patch/get doctor-settings api; `vitals-visibility.ts` resolver + transport.
- ✅ **Shipped:** pure `resolveVisibleVitals` + `vitals_hidden` load/save helpers + tests.

**Scope Guard:**
- Expected files touched: ≤ 3 (a `vitals-visibility.ts` resolver/transport + test). **No** menu UI (vit-08), **no** "+ Add vital" (vit-09), **no** specialty logic (deferred V3-D3).
- Resolver is pure (no I/O); transport reuses the existing doctor-settings api.

**Reference Documentation:**
- [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md) · [`../../../../../Reference/engineering/development/STANDARDS.md`](../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Pure resolver
- [x] ✅ 1.1 `resolveVisibleVitals({ hidden })` → ordered visible vital keys: start from `VITAL_ORDER`, hide the `hidden` set; the **default** (empty stored set) shows the classic core only and hides the rest (V3-D3). - **Completed: 2026-06-21**
- [x] ✅ 1.2 Distinguish "default hidden" (not in the core set) from "explicitly hidden by the doctor" so unhiding a non-core vital works and the menu can show accurate state. Tolerant of unknown/stale keys. - **Completed: 2026-06-21**

### 2. Transport
- [x] ✅ 2.1 `fetchVitalsHidden(token)` / `saveVitalsHidden(token, keys)` over `doctor_settings.vitals_hidden` (clone of the objective hidden-set transport); minimal persisted set (dedupe, known keys only). - **Completed: 2026-06-21**
- [x] ✅ 2.2 A stable serialize helper for debounce guards (sorted keys). - **Completed: 2026-06-21**

### 3. Verification & Testing
- [x] ✅ 3.1 Test: default = core-on; hiding a core vital removes it; unhiding a non-core vital shows it; unknown keys ignored; persisted set minimal. - **Completed: 2026-06-21**
- [x] ✅ 3.2 `frontend tsc` + lint clean; targeted vitest green. - **Completed: 2026-06-21**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: frontend/lib/cockpit/vitals-visibility.ts (resolver + vitals_hidden transport) + test
DO NOT TOUCH: menu UI (vit-08); "+ Add vital" (vit-09); specialty logic (deferred); buildRxPayload
```

**When updating existing code:**
- [x] Clone `objective-section-visibility.ts` shape; do not fork a different visibility model.
- [x] Leave a clear seam for a future `specialty` input without implementing it (V3-D3).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Default = classic core on** (V3-D3); no specialty gating yet.
- **No locks** — the resolver can hide any key, core included (V3-D2); enforcement of "no lock" is just the absence of a lock list.
- **UX-only** — visibility never reaches `buildRxPayload` (V3-D5).
- Pure resolver + thin transport (clone of the shipped objective pattern).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Write** of doctor-authored `vitals_hidden` (config strings, no PHI).
  - [x] **RLS verified?** **Yes** — `doctor_settings` RLS already covers the column (vit-02).
- [x] **Any PHI in logs?** **No** — hidden set is vital *keys*, never values.
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

> **No STOP/Opus gate** — config transport + pure resolver; clone of migration-152-backed objective visibility.

---

## ✅ Acceptance & Verification Criteria

- [x] Pure resolver: core-on default; any vital hideable/unhideable; tolerant of unknown keys; specialty seam left unused.
- [x] `vitals_hidden` persists minimally + round-trips.
- [x] `tsc`/lint/tests green for the slice.

**See also:** [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The hinge of VP3: a pure visible-set function + a persisted hidden set, both cloned from the proven objective engine. Specialty auto-select later only has to feed a seed into `resolveVisibleVitals` — the signature already anticipates it.

---

## 🔗 Related Tasks

- [`task-vit-08-manage-vitals-menu.md`](./task-vit-08-manage-vitals-menu.md) — the UI over this resolver.
- [`task-vit-09-add-vital-per-visit.md`](./task-vit-09-add-vital-per-visit.md) — the per-visit override layered on top.

---

**Last Updated:** 2026-06-21  
**Pattern:** clone of `objective-section-visibility.ts` (resolver + hidden-set transport), one level deeper (per vital).  
**Reference:** `process/CODE_CHANGE_RULES.md`
