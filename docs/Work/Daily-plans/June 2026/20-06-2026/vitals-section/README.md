# Vitals 3.0 — full catalog + hide/unhide + per-vital trends (20 Jun 2026 program)

> **What this is.** The Objective tab's vitals surface today is a **fixed 14-field numeric grid** (migrations 103 + 151) — every doctor sees every field every visit, nothing can be turned off, and there is no room to grow the catalog without a column per vital. This program turns vitals into a **registry-driven, doctor-configurable surface**: it (1) **builds the full vitals catalog** — every bedside measurement a clinician of any specialty might record — behind a storage-agnostic registry, (2) adds an unrestricted **hide/unhide** engine so a doctor shapes their own grid, and (3) gives **every numeric vital a visit-based trend** (clickable sparkline → chart) on top of the P6 trends substrate.
>
> **Builds on:** P2 Vitals 2.0 (`vitals-schema.ts` registry, `vitals-derive.ts` units/MAP/BSA, range flags, ghost values) and P6 trends (`vitals-trends.ts` series projection, `TrendChart`/`SingleMetricTrendChart`, sparklines). **Reuse, do not fork.**
>
> **Predecessor program:** objective-tab — [`../../18-06-2026/objective-tab/`](../../18-06-2026/objective-tab/) (this is its vitals deepening; the `vitals` objective section is the host).

**Task prefix:** `vit` · **Numbering:** continuous `vit-01..13` across 5 phases.

---

## Scope (locked 2026-06-20)

- **Build everything, for every specialty, now.** No specialty gating in this program — the catalog is complete and every vital is available to every doctor. Specialty **auto-select** (a gynaecologist's grid pre-shaped to gynae vitals, etc.) is a **deferred follow-up** that layers on top once the full catalog + visibility engine exist.
- **Hide/unhide is unrestricted.** Any vital can be hidden, **including the core ones** — no locks. **Hidden means off-screen (not rendered)**, *not* "view-only". A hidden vital's stored value is **always retained**; hiding never deletes data. Hiding a vital that currently holds a value shows a **one-line warning, then proceeds** — the doctor has the final say.
- **Default visible set = classic core** (BP, HR, RR, Temp, SpO₂, Weight, Height) **on**; everything else **hidden-but-one-tap-addable**.
- **Per-vital visit trends** for every numeric vital; categorical vitals get a value-timeline, not a line chart.

---

## Decision lock (V3-D1..D6)

- **V3-D1 — Storage: one additive `prescriptions.vitals_json` JSONB column for all new/extended vitals.** The shipped 7 core columns (`vitals_bp_*`, `vitals_hr`, `vitals_temp_c`, `vitals_spo2`, `vitals_wt_kg`, `vitals_ht_cm`) stay **unchanged** (back-compat). The vitals **registry becomes the single source of truth** with a `storage: "column" | "json"` flag per vital; the grid, validation, derived-text, visibility, and trends all read through the registry and never hardcode where a value lives. Validation moves to **Zod** (no per-field SQL CHECK for json-backed vitals) — consistent with `objective_json` (153/154) + `test_results_json` (154). One migration covers all future vitals.
- **V3-D2 — Hide/unhide is unrestricted; hidden = off-screen; data is never lost.** No vital is locked. Hidden vitals are not rendered. The stored value survives a hide (retained in form state + storage). Hiding a vital holding a value warns-then-proceeds. (Contrast with objective P3: this is true removal-from-view, not the objective "hidden section still prints" rule — vitals that are *empty* serialize to `null` anyway, and vitals *with data* still serialize, so output parity holds either way — see V3-D5.)
- **V3-D3 — Default visible = classic core; all else hidden-but-addable; NO specialty gating yet.** Build the full catalog for every specialty; ship a single sensible default; specialty auto-select is deferred.
- **V3-D4 — Per-vital visit trends, read-only.** Each numeric vital's inline sparkline is **clickable → opens that vital's full chart** (reusing `SingleMetricTrendChart` + the registry's advisory `range` as a reference band), plus a **"Vital trends" overview** expander listing charts for vitals with ≥1 prior reading. Categorical vitals (rhythm, AVPU, O₂ method) get a **value-timeline** (chips), never a misleading line. `recharts` reused; no new dependency.
- **V3-D5 — Visibility + per-visit reveal are UX-only; zero `buildRxPayload` impact.** Visibility is a **per-doctor default** (`doctor_settings.vitals_hidden`, a clone of `objective_section_hidden`) plus a **per-visit working override** ("+ Add vital"). Neither reaches `buildRxPayload`, the PDF, SMS, or the snapshot. A hidden empty vital is `null`; a hidden vital with data still serializes. Re-proven byte-for-byte in the close-gate (mirror obj-15/obj-29).
- **V3-D6 — Additive + reversible + degradable.** Existing core columns and existing `RxFormFields` vital keys are untouched; legacy rows load unchanged; 0/1-visit patients, missing vitals, and unknown json keys all degrade gracefully (no throw, no blank tab).

---

## Phase plan

| Phase | Theme | Tasks | Schema | Model | Status |
|---|---|---|---|---|---|
| **VP1** | Catalog + storage foundation (full registry, `vitals_json`, validation, derived-text parity) | `vit-01..04` | **1 additive migration** (`prescriptions.vitals_json` + `doctor_settings.vitals_hidden`) | mixed (**1 Opus**) | ✅ Done |
| **VP2** | Render all vitals (grouped numeric + categorical/context) | `vit-05..06` | none | Sonnet | ✅ Done |
| **VP3** | Hide/unhide engine (no locks, warn-on-hide-with-data, "+ Add vital") | `vit-07..09` | none | Sonnet | ✅ Done |
| **VP4** | Per-vital visit trends (sparkline→chart, overview, categorical timeline) | `vit-10..12` | none | Sonnet | ✅ Done |
| **VP5** | Close-gate (byte-parity + visibility round-trip + a11y + sparse + verification) | `vit-13` | none | **Opus** | ✅ Done (2026-06-21) |

> **Opus density:** 2 Opus tasks total — `vit-02` (migration / new `prescriptions` column) and `vit-13` (close-gate parity rigor). `vit-03` (the derived-text + contract plumbing) is Opus-grade care but routed under VP1's migration gate. Everything else is Sonnet (frontend-heavy, no schema).

---

## Tasks

| Task | Title | Phase | Model |
|---|---|---|---|
| `vit-01` | Storage-agnostic vitals registry + full catalog definition | VP1 | Sonnet |
| `vit-02` | Migration: additive `prescriptions.vitals_json` + `doctor_settings.vitals_hidden` | VP1 | **Opus / STOP** |
| `vit-03` | Backend + frontend types, Zod validation, service read/write, derived-text mirror | VP1 | **Opus-grade** |
| `vit-04` | Frontend form-state + `buildRxPayload` wiring for json-backed vitals (byte-parity) | VP1 | Sonnet |
| `vit-05` | Grouped numeric vitals grid (registry-driven, storage-agnostic) | VP2 | Sonnet |
| `vit-06` | Categorical / context vitals (O₂ delivery, glucose timing, pupils, AVPU, rhythm, temp site) | VP2 | Sonnet |
| `vit-07` | Per-doctor vitals visibility persistence + pure resolver (core-on default) | VP3 | Sonnet |
| `vit-08` | `ManageVitalsMenu` — hide/unhide (no locks), grouped, has-data hint + warning | VP3 | Sonnet |
| `vit-09` | Per-visit "+ Add vital" ephemeral reveal (working override, not saved default) | VP3 | Sonnet |
| `vit-10` | Extend trend series to all vitals (storage-aware read) | VP4 | Sonnet |
| `vit-11` | Clickable sparkline → per-vital chart popover (reference band) | VP4 | Sonnet |
| `vit-12` | "Vital trends" overview expander + categorical value-timeline | VP4 | Sonnet |
| `vit-13` | Close-gate: byte-parity + visibility round-trip + a11y + sparse + verification | VP5 | **Opus** |

---

## The catalog (what "all vitals" means)

A *vital* = a bedside measurement captured at the visit. Labs (HbA1c, lipids) belong in `test_results`; descriptive findings (murmur, rash) belong in the exam systems — neither is in scope here. `*` = already a stored column today (stays `storage: "column"`); everything else is new (`storage: "json"`).

| Group | Numeric | Categorical / context | Derived (never stored) |
|---|---|---|---|
| **Core** | BP sys*, BP dia*, HR*, RR*, Temp*, SpO₂*, Weight*, Height* | BP posture*, BP limb*, pulse rhythm, temp site, O₂ delivery method | MAP, pulse pressure, BMI, BSA |
| **Respiratory** | O₂ flow (L/min), FiO₂ (%), PEFR (L/min) | — | — |
| **Metabolic** | Glucose*, blood ketones (mmol/L), Waist*, Hip (cm) | glucose timing (fasting/random/post-prandial) | waist–hip ratio |
| **Neuro** | GCS total*, GCS E / V / M, pupil size L/R (mm), capillary refill (s) | AVPU, pupil reactivity L/R | GCS-total from E+V+M |
| **Paediatric** | Head circ.*, MUAC* | — | growth percentiles (P6) |
| **Obstetric** | Fetal heart rate (bpm), Fundal height (cm) | — | — |

> **GCS reconciliation:** `gcs_total` remains the canonical stored value; E/V/M are optional sub-entries that auto-sum into it (entering E/V/M fills total; total alone is still valid).

---

## Cross-cutting acceptance gate (whole program)

Vitals 3.0 is green only when **all** hold:

- [ ] The full catalog renders behind a **storage-agnostic registry**; every vital declares its group, units, range, and `storage`; the existing 7 core columns and existing form-state keys are untouched. _(vit-01, vit-04, vit-05, vit-06)_
- [ ] Extended vitals persist in `prescriptions.vitals_json` (additive, Zod-validated, reversible); legacy rows load byte-identically; the derived `examination_findings`/`vitals` payload is **unchanged for rows that use only the shipped columns**. _(vit-02, vit-03)_
- [ ] Any vital — core included — can be **hidden (off-screen) and unhidden**, with **no lock**; hiding a vital that holds a value **warns then proceeds and retains the value**; the per-doctor hidden set persists and round-trips a remount. _(vit-07, vit-08)_
- [ ] A per-visit **"+ Add vital"** reveals a hidden vital for the current visit only, without changing the saved default. _(vit-09)_
- [ ] Every numeric vital has a **visit trend**: a clickable sparkline → chart with the registry advisory band, plus a "Vital trends" overview; categorical vitals show a value-timeline; all read-only, recharts reused, sparse/empty graceful. _(vit-10, vit-11, vit-12)_
- [x] ✅ **View-only parity:** no visibility, "+ Add vital", or trend surface changes `buildRxPayload` by a byte; a11y holds; `frontend` lint/test green for the vitals + objective slice. _(vit-13, 2026-06-21 — pre-existing unrelated tsc/subjective/backend failures routed to the capture inbox)_

---

## Execution

- **Batch plan:** [`plan-vitals-section-batch.md`](./plan-vitals-section-batch.md) — full per-phase scope + the cross-cutting gate.
- **Execution order:** [`Tasks/EXECUTION-ORDER-vitals-section.md`](./Tasks/EXECUTION-ORDER-vitals-section.md) — waves, model picks, the migration/Opus boundary.
- **Tasks:** [`Tasks/`](./Tasks/) — `task-vit-01..13`.

> ⚠️ **Migration / Opus boundary:** `vit-02` introduces a new `prescriptions` column → a **hard-rules STOP**. Per [`../../../process/CODE_CHANGE_RULES.md`](../../../process/CODE_CHANGE_RULES.md) + `.cursor/rules/migrations.mdc`, confirm the migration approach and run that task on **Opus (max-thinking)** before writing SQL. `vit-03` (contract + derived-text parity) and `vit-13` (close-gate) are also Opus-grade. VP2–VP4 are frontend-only and low-risk.

---

**Created:** 2026-06-20. **Status:** 🗒 `Drafted` — promotes to `Committed` once V3-D1..D6 + the catalog are confirmed and VP1's migration approach is signed off on an Opus turn.
