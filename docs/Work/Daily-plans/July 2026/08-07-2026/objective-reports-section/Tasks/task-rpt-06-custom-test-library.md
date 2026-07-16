# Task rpt-06: Per-doctor custom test library (+ optional lab trend view)

> **Filename:** `task-rpt-06-custom-test-library.md` in `objective-reports-section/Tasks/`.
> **Links:** batch plan [`../plan-objective-reports-batch.md`](../plan-objective-reports-batch.md) · overview [`../README.md`](../README.md) · exec order [`./EXECUTION-ORDER-objective-reports.md`](./EXECUTION-ORDER-objective-reports.md). Code paths **repo-relative**.

---

## 📋 Task Overview

**Optional / stretch.** Two additive niceties once the core Reports section is proven:

1. **Per-doctor custom test library** — let a doctor "save to my tests" so a custom analyte (their name/unit/range) appears in their picker on future visits. Persist per-doctor (prefer `doctor_settings` JSON, mirroring the vitals-custom pattern in migration 157; a small table only if it outgrows JSON).
2. **Cross-visit lab trend view (optional)** — reuse the vitals `TrendChart` to plot an analyte across visits (e.g. HbA1c over time), read-only.

Ship or drop either without touching the core section.

**Program / Batch:** objective-reports-section · Wave 6 (optional)
**Plan:** [`../plan-objective-reports-batch.md`](../plan-objective-reports-batch.md)
**Estimated Time:** ~3–4 hours
**Status:** Not started. **Model: Sonnet** — additive per-doctor persistence + optional trend reuse; low risk. (If the persistence choice becomes a **new migration**, re-escalate to Opus per the agent contract.)

**Change Type:**
- [ ] ✅ **Update existing** (doctor settings + picker) **+ optional New** (trend view). Follow `docs/Work/process/CODE_CHANGE_RULES.md`.

**Current State:** (check existing code first!)
- ✅ **Exists:** the static library (rpt-03); custom-row path (rpt-03); `doctor_settings` custom-JSON precedent (`157_doctor_settings_vitals_custom.sql`); vitals `TrendChart` + doctor-scoped trend queries (`vit-10..12`).
- ⚠️ **Escalation watch:** if per-doctor tests need a **new column/table**, that is a migration → STOP/flag → Opus (agent contract). Prefer extending an existing `doctor_settings` JSON field to stay Sonnet.

**Scope Guard:**
- Expected files touched: doctor-settings read/write for custom tests, the Reports picker (surface saved custom tests), optionally a trend view component.
- **DO NOT** silently add a migration without escalating. **DO NOT** change the core row/report model (rpt-02) or extraction (rpt-05).

**Reference Documentation:** `docs/Work/process/CODE_CHANGE_RULES.md` · `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Per-doctor custom tests
- [ ] 1.1 Decide persistence (prefer `doctor_settings` JSON; escalate if a new column/table is required).
- [ ] 1.2 "Save to my tests" from a custom row; surface saved tests in the picker on future visits with the doctor's unit/range.

### 2. Optional trend view
- [ ] 2.1 If in scope: reuse `TrendChart` to plot an analyte across visits (read-only, doctor-scoped query).

### 3. Verification gate
- [ ] 3.1 `cd frontend && npx tsc --noEmit && npm run lint && npm test` (+ `cd backend && npm run typecheck && npm test` if settings I/O touched).
- [ ] 3.2 Custom test persists and reappears in the picker; trend view (if built) is read-only and doctor-scoped.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: doctor-settings read/write (custom tests) — prefer existing JSON field
UPDATE: Reports picker — surface saved custom tests
CREATE (optional): lab trend view reusing TrendChart
DO NOT TOUCH: core row/report model (rpt-02); extraction (rpt-05); no silent migration
```

**When updating existing code:** (MANDATORY)
- [ ] Prefer extending existing `doctor_settings` JSON over a new schema object; escalate if a migration is unavoidable.
- [ ] Trend view is read-only; never mutates prescription rows.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Additive + optional** — droppable without touching the core section.
- **Escalate on migration** — a new column/table re-triggers the agent-contract STOP.
- **Reuse `TrendChart`** for trends; no new charting stack.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] ✅ **Data touched?** Prefer existing `doctor_settings` JSON (no new column). **If a migration is needed → STOP/flag → Opus.**
- [ ] ✅ **Any PHI in logs?** **No** — custom test names are doctor config, not patient data; trend queries never log values.
- [ ] ✅ **External API or AI call?** **No.**
- [ ] ✅ **Retention / deletion impact?** Doctor-config only; existing settings retention applies.

---

## ✅ Acceptance & Verification Criteria

- [ ] A saved custom test reappears in the doctor's picker with their unit/range.
- [ ] Optional trend view is read-only + doctor-scoped.
- [ ] No un-escalated migration; gates green.

**See also:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

## 🔗 Related Tasks

- Requires [`task-rpt-03-lab-test-library.md`](./task-rpt-03-lab-test-library.md). Closes the program.

---

**Last Updated:** 2026-07-08
**Pattern:** additive per-doctor persistence over existing `doctor_settings` JSON + optional trend reuse; escalate if it turns into a migration.
