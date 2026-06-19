# Objective tab — Phase 2: Vitals 2.0 (extended vitals + units + range flags + derived values + ghost) — 18 Jun 2026 batch plan

> **Phase 2 of the Objective-tab program.** Phase 1 shipped structured system-wise exam cards + the derived-`examination_findings` contract. The vitals surface, though, is still the shipped 7-field numeric grid ([`VitalsGrid.tsx`](../../../../../../../frontend/components/cockpit/rx/inputs/VitalsGrid.tsx) over the [`vitals_*` columns](../../../../../../../backend/migrations/103_prescription_soap_fields_expansion.sql) from migration 103: BP sys/dia, HR, temp °C, SpO₂, weight, height + an auto-BMI badge). Phase 2 is **Vitals 2.0**: additive extended-vitals columns (RR, pain score, glucose, GCS total, BP posture/limb, peds HC/MUAC, waist), display-only **unit toggles** (°C/°F · kg/lb · cm/in · mg/dL↔mmol/L) over **canonical storage**, **reference-range flags**, **derived values** (MAP, BSA), and **last-visit ghost values** as entry references.
>
> **Source plan:** [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) — phase P2 (Zone A additions); inherits `OBJ-D1..OBJ-D7`. Detail in [`capture/features/objective-tab/exam-catalog.md`](../../../../../capture/features/objective-tab/exam-catalog.md) §B.
>
> **Prefix note:** tasks are `obj-05..08` (program numbering continues from P1's `obj-01..04`).
>
> **Builds on:** P1's `RxFormContext` vitals form-state + `buildRxPayload` mapping, migration 103's additive `vitals_*` + CHECK-range pattern, the existing [`bmi.ts`](../../../../../../../frontend/lib/cockpit/bmi.ts) derived-badge precedent, and `getLastPrescriptionInEpisode` (for ghost values). No exam-card change — P2 is vitals-only.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). obj-05 (new migration + PHI vitals columns + form state) is **Opus** (hard rule: new migration on a PHI table). obj-06 (pure schema registry + calculators), obj-07 (grid UI) are Auto. obj-08 (unit-conversion / range-flag / derived close-gate) is **Opus** (correctness + regression-parity fixtures).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p2-objective-tab-vitals-2.md`](./Tasks/EXECUTION-ORDER-p2-objective-tab-vitals-2.md).

---

## What Phase 2 does (one sentence)

> **Add additive typed extended-vitals columns to `prescriptions` (RR, pain, glucose, GCS total, BP posture/limb, peds HC/MUAC, waist) stored in canonical units, surface them in a Vitals 2.0 grid with display-only unit toggles, age/sex-aware out-of-range flags, derived MAP/BSA badges, and last-visit ghost-value references — all additive, with the shipped 7 vitals + BMI badge + legacy `vitalsText` untouched.**

---

## Scope (confirmed 2026-06-18)

| Decision | Choice |
|---|---|
| Storage | **Additive typed `vitals_*` columns** on `prescriptions` (one migration 151), cloning the migration-103 nullable-numeric + CHECK-range pattern. No JSONB — vitals are flat scalars (unlike exam). |
| New fields in P2 | RR (`/min`), pain score (0–10 NRS), glucose (canonical **mg/dL**), GCS total (3–15), BP posture (sitting/standing/supine) + limb (L/R arm/leg), head circumference (cm), MUAC (cm), waist (cm). |
| Units | **Canonical storage; display-only conversion** (P2-D2). Store °C / kg / cm / mg/dL; toggle to °F / lb / in / mmol/L is a pure render concern. Persisting the doctor's preferred display unit is **deferred to P3** (config columns). |
| Range flags | **Computed, not stored** (P2-D3). Age/sex-aware advisory bands in a frontend registry; out-of-range shows an icon/color (extends the BMI-badge idea to all vitals). |
| Derived values | **MAP** (from BP) and **BSA** (Mosteller, for dosing) — computed badges, never hand-entered or stored. BMI badge stays as-is. |
| Pediatric percentiles | **Deferred to P6** (needs a WHO/CDC/Fenton data source — open question I in the catalog). P2 ships HC/MUAC/waist as plain measurements with simple range flags only. |
| GCS | **Total only** in P2 (3–15). E/V/M structured sub-fields are a later enhancement (noted, not built). |
| Ghost values | **Read-only references** from the last prescription in the episode (P2-D5) — shown as placeholder/ghost while entering. **No carry-forward write** in P2. |
| Exam cards | **Unchanged** — P1's `ExamSystemList` + derived `examination_findings` are untouched. |
| Patient-facing output | **Unchanged contract** — PDF/SMS read what they read today; new vitals appear additively only where vitals already render (snapshot/visit-detail). No new patient-facing surface in P2. |

---

## Decision lock (frozen for this phase)

- **P2-D1 — additive typed vitals columns (OBJ-D1 spirit, scalar variant).** Extended vitals are nullable typed columns on `prescriptions` with CHECK ranges + PHI comments, mirroring migration 103. `NULL = not recorded` (never empty string). One additive migration (151).
- **P2-D2 — canonical storage, display-only units.** Columns store SI/clinic-canonical units (°C, kg, cm, mg/dL). Unit toggles convert **only at the display edge**; the persisted value is always canonical. Round-trip (enter in °F → store °C → show °F) must not drift (obj-08 gate). Unit-preference **persistence** is P3.
- **P2-D3 — range flags + derived values are computed, never stored.** A frontend `vitals-schema.ts` registry holds per-vital canonical unit, display units + conversion, step, and age/sex-aware advisory bands; `vitals-derive.ts` holds MAP/BSA + the range-flag evaluator. Pure, deterministic, unit-tested. No new columns for flags/derived.
- **P2-D4 — pediatric percentiles deferred (P6).** Growth-curve percentiles require a licensed data source (WHO/CDC/Fenton) and a trends surface; out of P2. HC/MUAC/waist ship as measurements with flat range flags only.
- **P2-D5 — ghost values are read-only.** Last-visit vitals are surfaced as entry references (placeholder/ghost), sourced from the episode's previous prescription. No automatic carry-forward write; carry-forward-as-edit is a later phase.
- **P2-D6 — additive only; no removal.** The shipped 7 vitals, the BMI badge, and the legacy free-text `vitalsText` (OBJ-D7) all stay. No column, constraint, or UI removal.
- **P2-D7 — no config/layout chrome, no templates.** Per-doctor unit preference, section order/visibility for vitals, and vitals templates are out (P3/P4). P2 ships one Vitals 2.0 grid, all fields visible (peds group may be collapsible by default).

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| Pediatric growth percentiles / growth charts | P2-D4 — needs WHO/CDC/Fenton data source; ships with trends (P6). |
| Persisting a doctor's preferred display unit | P3 (config columns) — P2's toggle is per-session/local. |
| GCS E/V/M structured sub-fields | Later enhancement — P2 stores GCS total only. |
| Vitals templates / specialty vitals presets | P4 (template scopes incl. `vitals`). |
| Vital sparklines / trends across visits | P6. |
| Carry-forward (writing) last visit's vitals | Later — P2 ghost values are read-only references only. |
| Section reorder / collapse / visibility for vitals | P3 (ported layout engines, OBJ-D6). |
| Structured vitals blocks in the PDF | PDF reads its current vitals surface; richer PDF vitals is a later enhancement. |
| Removing legacy `vitalsText` | OBJ-D7 — kept as escape hatch; sunset is a separate decision. |

---

## Cross-cutting acceptance gate (whole phase)

Phase 2 is green only when **all** hold:

- [x] ✅ Migration 151 is idempotent (`ADD COLUMN IF NOT EXISTS` + CHECK drop/add), RLS doctor-scoped (migration 026 covers new columns), PHI-commented; `NULL` reads back; existing rows unaffected. (obj-05; migration-151 content-sanity test.)
- [x] ✅ New vitals round-trip through the prescription read/write path (BE type + Zod range validation + service mapping); out-of-range values rejected per CHECK via Zod, never bricks a save. (obj-05; `prescriptions.test.ts`.)
- [x] ✅ Vitals 2.0 grid renders the new fields (core + extended; peds group), with unit toggles, out-of-range flags, and MAP/BSA derived badges; the shipped 7 vitals + BMI badge are unchanged. (obj-07; `VitalsGrid.test.tsx`.)
- [x] ✅ **Unit round-trip parity:** entering a value in a non-canonical unit (°F / lb / in / mmol/L) stores the canonical value and re-displays the entered value with no drift. (obj-08; `vitalsParity.test.tsx`.)
- [x] ✅ Range-flag + MAP/BSA outputs are deterministic and correct across age/sex bands (boundary fixtures). (obj-06 + obj-08.)
- [x] ✅ Last-visit ghost values hydrate read-only and never overwrite the current entry. (obj-07 `useLastVisitVitals`; obj-08 fixtures.)
- [x] ✅ No PHI in logs; the legacy `vitalsText` escape hatch still works (additive-only, OBJ-D7).
- [x] ✅ Phase-2 vitals suites green: backend 61 pass; frontend 73 pass (5 files); eslint + `tsc` clean on touched files. **Routed pre-existing/unrelated (not introduced):** backend `@react-pdf/renderer` ESM jest-transform failures in the PDF-service import chain (working-tree WIP, untouched by Phase 2); repo-wide frontend `tsc` errors in cockpit-v3 WIP files (none in vitals files).

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| [`obj-05`](./Tasks/task-obj-05-vitals-data-model-and-form-state.md) | Vitals 2.0 data model (migration 151) + BE type/Zod/service + form state | M | **Opus** |
| [`obj-06`](./Tasks/task-obj-06-vitals-schema-and-derived-calculators.md) | `vitals-schema.ts` registry + `vitals-derive.ts` (units, MAP/BSA, range flags) | S–M | Auto |
| [`obj-07`](./Tasks/task-obj-07-vitals-grid-2-ui.md) | Vitals 2.0 grid UI (extended fields, unit toggles, flags, derived badges, ghost) | M | Auto |
| [`obj-08`](./Tasks/task-obj-08-vitals-close-gate.md) | Unit round-trip / range-flag / derived close-gate + a11y + verification | S–M | **Opus** |

---

## References

- Exec order: [`Tasks/EXECUTION-ORDER-p2-objective-tab-vitals-2.md`](./Tasks/EXECUTION-ORDER-p2-objective-tab-vitals-2.md).
- Product plan: [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) — P2, Zone A.
- Catalog detail: [`capture/features/objective-tab/exam-catalog.md`](../../../../../capture/features/objective-tab/exam-catalog.md) §B.
- Phase 1 (predecessor): [`../p1-structured-exam/`](../p1-structured-exam/) — the form-state + `buildRxPayload` + close-gate patterns this phase reuses.
- Process: [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-18. **Status:** ⏳ `Drafted` — pending commit (R-items locked above; promote when scheduled).
