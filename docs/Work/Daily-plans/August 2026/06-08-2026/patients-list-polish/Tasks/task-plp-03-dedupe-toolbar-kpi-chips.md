# Task plp-03: Deduplicate toolbar chips vs KPI pivots

> **Links:** batch [`../plan-patients-list-polish-batch.md`](../plan-patients-list-polish-batch.md) · exec [`./EXECUTION-ORDER-patients-list-polish.md`](./EXECUTION-ORDER-patients-list-polish.md)

---

## 📋 Task Overview

Stop showing the same four segment filters as both KPI tiles and primary toolbar chips. KPI strip remains the **primary pivot** for Active (90d) / New this month / Follow-up overdue / Open episodes. Toolbar keeps **secondary** chips only, plus a clear indicator when a KPI-driven segment is active.

**Program / Batch:** patients-list-polish · Wave 2  
**Estimated Time:** ~1.5–2 h  
**Status:** ✅ DONE (2026-08-06)  
**Change Type:** Update existing  
**Model:** Sonnet  
**Depends on:** none (preferred after plp-01)  

**Decisions:** PLP-D3  

---

## Current state

- ✅ KPI strip toggles segments via `onSegmentSelect` → `toggleSegment`.
- ✅ `PatientsToolbar` `SEGMENT_CHIPS` includes:
  - Overlap with KPI: `active-90d`, `new-30d`, `at-risk-followup`, `has-open-episodes`
  - Secondary-only: `no-show-prone`, `has-allergies`, `untagged`
- ❌ Doctors see the same filters twice; vertical chrome grows.

---

## ✅ Task Breakdown

### 1. Chip inventory
- [ ] 1.1 Remove the four overlapping IDs from the primary chip row in `PatientsToolbar.tsx`.
- [ ] 1.2 Keep secondary chips: No-show prone, Has allergies, Untagged (and any non-overlapping future chips).
- [ ] 1.3 Confirm Possible duplicates stays out of the chip row (handled by KPI + plp-04 callout).

### 2. Active KPI segment affordance
- [ ] 2.1 When `activeSegment` is one of the KPI-owned segments, show a compact dismissible/clearable pill near the toolbar (e.g. “Filtered: Active (90d)” + clear) so the doctor knows why the table is filtered without re-adding four chips.
- [ ] 2.2 Clearing that pill must call the same clear/toggle path as today (`toggleSegment` or `clearListFilters` as appropriate — match current semantics).
- [ ] 2.3 Secondary chip toggles still clear/replace `activeViewId` as today’s page handlers do.

### 3. Saved views / URL
- [ ] 3.1 Do not break saved views that store KPI segment filters — applying a view that sets `active-90d` must still filter the table and show the active-filter pill.
- [ ] 3.2 URL query params for segments remain the source of truth (no new persistence).

### 4. Verification
- [ ] 4.1 Manual: KPI click filters table; overlapping chip absent; active pill visible; clear restores unfiltered (or prior non-segment state per current behavior).
- [ ] 4.2 Manual: secondary chips still work.
- [ ] 4.3 Manual: saved view with Active (90d) still applies.
- [ ] 4.4 Typecheck + lint; update toolbar tests if any assert the old chip set.

---

## 📁 Files

```
UPDATE: frontend/components/patients-v2/list/PatientsToolbar.tsx
UPDATE: frontend/components/patients-v2/PatientsV2Page.tsx   (only if pill wiring needs page props)
UPDATE: frontend/hooks/usePatientsListFilters.ts            (read-only unless clear semantics need a tiny helper)
DO NOT TOUCH: KPI segment definitions in PatientsKpiStrip (ids stay)
DO NOT TOUCH: backend list filters
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- Do not remove KPI tiles.
- Do not invent a new filter model or “More filters” mega-menu in this task (secondary chips stay visible; a overflow menu is optional only if the remaining row is still crowded — prefer keep simple).
- Do not change saved-view schema.

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** N  
- [ ] **Any PHI in logs?** No  
- [ ] **External API or AI call?** N  
- [ ] **Retention / deletion impact?** N  

---

## ✅ Acceptance Criteria

- [ ] Four overlapping segments appear once (KPI), not twice.
- [ ] Secondary chips remain.
- [ ] Active KPI segment is visible + clearable from the toolbar area.
- [ ] Saved views / URL filters still work.
- [ ] Lint / typecheck green.

---

**Created:** 2026-08-06.
