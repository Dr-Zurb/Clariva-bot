# Plan medications library — 13 Jul 2026 program

> **Why this exists.** Plan Medications still uses starter packs + per-row “Save current row” favorites. Subjective / Objective / Investigations use scoped Rx templates. Entry should mirror PMH chart-med capture + card (Rx-relevant fields only).

---

## The one-sentence goal

> **Replace starter packs and drug-favorite chips with scoped medicines templates, and align Plan medicine capture/edit with the PMH chart-med UX (course duration + route kept).**

---

## Decision lock

- **MED-D1 — Remove cold-start chrome.** Drop `PlanStarterPacksStrip` and `FavoritesChipStrip` (“Save current row” / Manage) from the Medications L1 zone. Full-Rx `TemplatePicker` and Previous Rx stay.
- **MED-D2 — Scoped list templates.** New `doctor_rx_templates.scope = medicines`. Payload stays in existing `medicines_json` (no new column). Apply = surgical replace of `fields.medicines` (like investigations).
- **MED-D3 — PMH entry pattern, Plan data model.** Capture bar + collapsible structured card like `ChartMedicationCaptureBar` / `ChartMedicationCard`. Persist as `RxMedicine` / `prescription_medicines` — not `patient_medications`.
- **MED-D4 — Relevant fields only.** Bring: drug search, sig-line parse (+ optional AI), form, strength/dosage, dose qty/unit, frequency, food timing, collapse/summary. Keep Plan-only: duration, route, instructions. Skip PMH-only: condition link, active/past, started/stopped ago, source, intake pattern.
- **MED-D5 — No doctor_settings custom baskets in v1.** Templates cover multi-drug presets; `drug_master` covers catalog search. Optional later if needed.
- **MED-D6 — Favorites API soft-retire.** UI removed from Plan; `doctor_drug_favorites` table/API left in place until a later cleanup (no data migration this program).

---

## Phasing

| Wave | Task | Scope | Migration? |
|---|---|---|---|
| **W1** | `med-lib-01` | Remove starter packs + favorites chrome; update tests | No |
| **W2** | `med-lib-02` | Align capture/row with chart-med (Rx-relevant) | No |
| **W3** | `med-lib-03` | Scoped `medicines` templates (button + apply + scope) | **Yes (170)** — Opus |

---

**Created:** 2026-07-13. **Status:** W1–W3 landed.
