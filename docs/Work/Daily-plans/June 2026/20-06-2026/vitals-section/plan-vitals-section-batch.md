# Vitals 3.0 — batch plan (full catalog + hide/unhide + per-vital trends)

> **Program README:** [`README.md`](./README.md) · **Execution order:** [`Tasks/EXECUTION-ORDER-vitals-section.md`](./Tasks/EXECUTION-ORDER-vitals-section.md)
>
> **One sentence:** Turn the fixed 14-field vitals grid into a **registry-driven, doctor-configurable** surface — build the **full vitals catalog** behind a storage-agnostic registry (`prescriptions.vitals_json`), add an **unrestricted hide/unhide** engine (hidden = off-screen, no locks, data retained), and give **every numeric vital a visit-based trend** — all additive, reversible, and changing the derived `buildRxPayload` output by **zero bytes** for rows that use only the shipped columns.

---

## Why now

P2 (Vitals 2.0) shipped a typed registry + units + range flags + derived MAP/BSA, and P6 (trends) shipped the per-vital series projection + sparklines + charts. But the grid is still **hardcoded and fixed**: 14 numeric fields + 2 selects, always all visible, with no way to grow the catalog except a column per vital. Doctors of different specialties record different vitals — a pulmonologist wants O₂ delivery + PEFR; a neurologist wants GCS E/V/M + pupils; an obstetrician wants FHR + fundal height — and none want the full firehose every visit. Vitals 3.0 makes the catalog **complete** and the grid **shapeable**, on top of the substrate P2/P6 already built.

---

## Decision lock (V3-D1..D6 — see [`README.md`](./README.md) for full text)

- **V3-D1** — extended vitals live in **one additive `prescriptions.vitals_json`**; the 7 core columns stay; the **registry is the single source of truth** with a `storage` flag; Zod validates json-backed vitals.
- **V3-D2** — hide/unhide is **unrestricted** (core included, no locks); **hidden = off-screen**; stored values are **never lost**; hide-with-data **warns then proceeds**.
- **V3-D3** — default visible = **classic core**; all else hidden-but-addable; **no specialty gating** in this program (deferred).
- **V3-D4** — **per-vital visit trends**: clickable sparkline → chart + a "Vital trends" overview; categorical → value-timeline; recharts reused.
- **V3-D5** — visibility + "+ Add vital" are **UX-only**; zero `buildRxPayload` / PDF / SMS / snapshot impact.
- **V3-D6** — **additive + reversible + degradable**; existing columns/fields untouched; legacy + sparse rows load cleanly.

---

## VP1 — Catalog + storage foundation `vit-01..04`

**Goal:** freeze the full catalog + the storage-agnostic data layer everything downstream consumes.

- **vit-01 — Storage-agnostic registry + full catalog.** Extend `VitalDefinition` with `group` and `storage: "column" | "json"`; add every new vital (Respiratory / Metabolic / Neuro / Obstetric groups + new core context fields) to `VITALS_REGISTRY`. Pure frontend module — no UI, no storage yet. Freezes the catalog shape. _(Sonnet)_
- **vit-02 — Migration (additive).** `prescriptions.vitals_json JSONB NOT NULL DEFAULT '{}'` (+ `jsonb_typeof = 'object'` CHECK) for all json-backed vitals, and `doctor_settings.vitals_hidden JSONB NOT NULL DEFAULT '[]'` (+ array CHECK) for the per-doctor hidden set — a verbatim clone of migration 152's `objective_section_hidden`. No PHI columns beyond the existing vitals pattern; RLS already covers both tables. **⚠️ STOP / Opus — confirm approach before writing SQL.** _(Opus)_
- **vit-03 — Contract plumbing + derived-text parity.** Backend + frontend types for `vitals_json` + `vitals_hidden`; Zod schema for the json payload (per-vital bounds from the registry); service read/write; the **derived-text mirror** so `examination_findings`/`vitals` and the PDF/SMS/snapshot are **byte-identical for rows that use only the shipped columns**, and additive for json-backed vitals. _(Opus-grade — contract + parity rigor)_
- **vit-04 — Form-state + payload wiring.** Thread json-backed vitals through `RxFormFields` + `buildRxPayload` + load/serialize, reusing the canonical-unit discipline (P2-D2). Round-trip stable; byte-parity preserved. _(Sonnet)_

---

## VP2 — Render all vitals `vit-05..06`

**Goal:** every catalogued vital is enterable in the grid, grouped, registry-driven.

- **vit-05 — Grouped numeric grid.** Render all numeric vitals from the registry, **grouped** (Core / Respiratory / Metabolic / Neuro / Paediatric / Obstetric); reuse `VitalField` (unit toggle, range flag, ghost, sparkline slot). No hardcoded field list — the grid maps over the registry. _(Sonnet)_
- **vit-06 — Categorical / context vitals.** Add the non-numeric fields (O₂ delivery method, glucose timing, pupil reactivity L/R, AVPU, pulse rhythm, temp site) as plain selects (extend the obj-07 posture/limb pattern); GCS E/V/M sub-entry that auto-sums to total. _(Sonnet)_

---

## VP3 — Hide/unhide engine `vit-07..09`

**Goal:** the doctor shapes their grid; no locks; data never lost.

- **vit-07 — Visibility persistence + resolver.** A pure `resolveVisibleVitals({ hidden }) → visible[]` (default = classic core on, all else hidden); `vitals_hidden` transport over `doctor_settings` (clone of `objective-section-visibility.ts`). No specialty input yet (V3-D3). _(Sonnet)_
- **vit-08 — `ManageVitalsMenu`.** A near-clone of `ManageObjectiveSectionsMenu`: eye/eye-off per vital, **grouped**, boolean "has data" hint, **nothing locked**. Hiding a vital that holds a value triggers a **one-line confirm/warning** ("Value is kept, just hidden"), then proceeds. _(Sonnet)_
- **vit-09 — Per-visit "+ Add vital".** An ephemeral reveal: surface a hidden vital for the **current visit only** via a working override in form/component state, without mutating the saved `vitals_hidden` default. _(Sonnet)_

---

## VP4 — Per-vital visit trends `vit-10..12`

**Goal:** every numeric vital is glanceable + drillable across visits.

- **vit-10 — Extend trend series to all vitals.** Make `buildVitalsTrendSeries` **storage-aware** (read column *or* `vitals_json` per the registry) so every numeric vital — not just the original 14 — produces a series. _(Sonnet)_
- **vit-11 — Clickable sparkline → chart.** The inline sparkline (obj-26) becomes a button opening that vital's **full chart** (`SingleMetricTrendChart`, already built) with the registry advisory `range` as the green reference band, unit-aware tooltip, oldest→newest x-axis. _(Sonnet)_
- **vit-12 — "Vital trends" overview + categorical timeline.** A collapsible "Vital trends" panel listing charts only for vitals with ≥1 prior reading (skips empties); categorical vitals (rhythm, AVPU, O₂ method) render a **value-timeline** (chips by visit), never a line. _(Sonnet)_

---

## VP5 — Close-gate `vit-13`

**Goal:** prove the whole surface is view-only + accessible + green.

- **vit-13 — Close-gate.** Byte-parity (`buildRxPayload` unchanged by any visibility / "+ Add vital" / trend permutation; legacy + shipped-column rows byte-identical; hidden-with-data still serializes; hidden-empty is `null`); visibility round-trip (hidden set survives a remount as the per-doctor default); a11y sweep (menu, "+ Add vital", clickable sparklines, charts); sparse/empty states; `frontend tsc/lint/test` + `backend test` green. Mirrors obj-15 / obj-29. _(Opus)_

---

## Cross-cutting acceptance gate (whole program)

- [ ] Full catalog renders behind a **storage-agnostic registry**; existing 7 core columns + existing form keys untouched. _(vit-01, vit-04, vit-05, vit-06)_
- [ ] Extended vitals persist in `vitals_json` (additive, Zod-validated, reversible); legacy rows byte-identical; shipped-column derived output unchanged. _(vit-02, vit-03)_
- [ ] Any vital (core included) hides off-screen + unhides with **no lock**; hide-with-data **warns then proceeds and retains the value**; the per-doctor hidden set round-trips a remount. _(vit-07, vit-08)_
- [ ] Per-visit **"+ Add vital"** reveals a hidden vital for the current visit only; saved default unchanged. _(vit-09)_
- [ ] Every numeric vital has a visit trend (sparkline→chart + overview + registry band); categorical → value-timeline; read-only, recharts reused, sparse/empty graceful. _(vit-10, vit-11, vit-12)_
- [x] ✅ **View-only parity** + a11y + `frontend` vitals/objective slice green; pre-existing unrelated failures routed, not introduced (subjective subj-20/23/25/35/38; repo-wide tsc debt; backend env import failures → capture inbox). _(vit-13, 2026-06-21)_

---

## Cost estimate

| Wave | Tasks | Sonnet | Opus | Notes |
|---|---|---|---|---|
| 1 | vit-01 | 1 | 0 | catalog/registry freeze |
| 2 | vit-02 | 0 | 1 | **migration STOP** |
| 3 | vit-03 | 0 | 1 | contract + derived-text parity (Opus-grade) |
| 4 | vit-04 | 1 | 0 | payload wiring |
| 5 | vit-05, vit-06 | 2 | 0 | render (parallelizable) |
| 6 | vit-07, vit-08, vit-09 | 3 | 0 | hide/unhide |
| 7 | vit-10, vit-11, vit-12 | 3 | 0 | trends |
| 8 | vit-13 | 0 | 1 | close-gate |
| **Total** | **13** | **10** | **3** | ~1 migration, no RLS change |

---

## What this program does NOT do (deferred)

| Item | Why / where it lands |
|---|---|
| **Specialty auto-select** (pre-shape the grid to the doctor's specialty) | V3-D3 — needs the full catalog + visibility engine first; layers on `resolveVisibleVitals` later (reuses `normalizeSpecialty` from `objective-default-layout.ts`). |
| Lab trends (HbA1c, lipids over visits) | Belongs to `test_results` (P5/P7), not vitals. |
| Non-visit / home-monitoring vitals timeline | No store exists (P6-D5 defers it). |
| Pediatric growth percentiles | Already shipped in P6 (`growth-percentiles.ts`); referenced, not rebuilt. |
| New SQL CHECK per json vital | V3-D1 — json-backed vitals validate via Zod, not per-field SQL. |

---

## References

- **Predecessor:** objective-tab program — [`../../18-06-2026/objective-tab/`](../../18-06-2026/objective-tab/) (P2 vitals + P6 trends substrate; P3 layout-engine pattern this hide/unhide mirrors).
- **Reused code:** `frontend/lib/cockpit/vitals-schema.ts`, `vitals-derive.ts`, `vitals-trends.ts`; `frontend/components/cockpit/rx/inputs/VitalsGrid.tsx`, `VitalsExtended.tsx`; `frontend/components/cockpit/rx/objective/{TrendChart,VitalSparkline}.tsx`; `frontend/lib/cockpit/objective-section-visibility.ts` + `ManageObjectiveSectionsMenu.tsx` (visibility pattern); migration `152_doctor_settings_objective_layout.sql` (hidden-set clone).
- **Process:** [`../../../process/PHASED-PLANS-GUIDE.md`](../../../process/PHASED-PLANS-GUIDE.md) · [`../../../process/CODE_CHANGE_RULES.md`](../../../process/CODE_CHANGE_RULES.md) · [`../../../process/EXECUTION-ORDER-GUIDELINES.md`](../../../process/EXECUTION-ORDER-GUIDELINES.md).

---

**Created:** 2026-06-20. **Status:** 🗒 `Drafted` — confirm V3-D1..D6 + the catalog + VP1 migration approach (Opus) to promote to `Committed`.
