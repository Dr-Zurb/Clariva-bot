# Subjective tab — Phase 2: fast entry (complaint master + favourites + carry-forward + presets) — 03 Jun 2026 batch plan

> **Phase 2 of the Subjective-tab program (the `v2` slice).** Phase 1 made the tab *structured* (complaint cards + owned histories + linked sections). Phase 2 makes it *fast*: complaint **autocomplete** (a `complaint_master` lookup, like `drug_master`), per-doctor **favourite chips** (a generic `doctor_note_favorites` table, like `doctor_drug_favorites`), one-tap **carry-forward** of the subjective from the last visit, and **subjective presets** (reusing the shipped `doctor_rx_templates` + picker). Typing becomes the escape hatch, not the default (ST-D5).
>
> **Source plan:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — realises **ST.6–ST.8**. Inherits **ST-D1..ST-D7** + the Phase-1 decision lock (complaints array, derived `cc`/`hopi`).
>
> **Prefix note:** tasks are `subj-06..08`, continuing the program numbering.
>
> **Builds on:** Phase 1 ([`../p1-complaint-cards/`](../p1-complaint-cards/)) — the complaint cards + history fields these mechanisms fill. And EHR T2 (shipped): [`DrugAutocomplete`](../../../../../../../frontend/components/ehr/DrugAutocomplete.tsx) (autocomplete pattern), [`doctor_drug_favorites`](../../../../../../../backend/migrations/109_doctor_drug_favorites.sql) (favourites pattern), [`doctor_rx_templates`](../../../../../../../backend/migrations/091_doctor_rx_templates.sql) + [`TemplatePicker`](../../../../../../../frontend/components/ehr/TemplatePicker.tsx) (presets), [`PreviousRxPopover`](../../../../../../../frontend/components/consultation/cockpit/PreviousRxPopover.tsx) (carry-forward surface).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). All Auto/Sonnet — bounded lookups + UI that clone shipped T2 patterns; the only Opus is Phase 3's close-gate.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p2-subjective-tab-fast-entry.md`](./Tasks/EXECUTION-ORDER-p2-subjective-tab-fast-entry.md).

---

## What Phase 2 does (one sentence)

> **Add a `complaint_master` lookup (+ seed) and a generic `doctor_note_favorites` table, wire complaint autocomplete + per-field favourite chips into the Phase-1 cards/history fields, add one-tap carry-forward of the last visit's subjective, and let doctors save/apply subjective presets — so the common note is a handful of taps.**

---

## Decision lock (frozen for this phase)

- **ST-D5** — every owned field gets the full fast-entry stack (favourites, autocomplete, carry-forward, presets); typing is the escape hatch.
- **ST-D1/ST-D2** (inherited) — complaints stay a JSONB array; `cc`/`hopi` stay derived; carry-forward/presets fill the *array*, not the raw text.
- **T2-D2** (inherited) — favourites + presets are **per-doctor** (no clinic-wide sharing in v1).
- Autocomplete + favourites + presets reuse the shipped T2 patterns/components rather than new bespoke ones.

---

## What this phase does NOT do (deferred)

| Item | Lands |
|---|---|
| Smart-confirm defaults; integration/a11y/close-gate | **Phase 3** (`subj-09..10`) |
| ROS / ICE / structured social history / AI scribe | Out of program v1 |
| Clinic-wide sharing of favourites/presets | Deferred (T2-D2) |

---

## Cross-cutting acceptance gate (whole phase)

- [ ] Migrations `117_complaint_master.sql` (+ seed ~150 presentations) and `118_doctor_note_favorites.sql` run idempotently; `complaint_master` is globally readable (lookup), `doctor_note_favorites` is doctor-scoped RLS.
- [ ] Complaint name field autocompletes from `complaint_master` (< 250ms typical) and sets the card's `category` (feeds subj-03's schema).
- [ ] Per-field favourite chips (complaint / FH / SH / PSH / associated) insert in one tap, rank by `use_count`, and "save current" adds a favourite.
- [ ] One-tap carry-forward hydrates the complaint cards + owned histories from the patient's last subjective; "copy all" + "pick fields" both work; autosaves.
- [ ] Subjective presets save/apply via the shipped picker (subjective fields only); usage counter bumps.
- [ ] `cd frontend; npx tsc --noEmit` + `npm run lint` clean; backend + frontend suites green.

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Structured cards + owned histories + linked sections (ST.1–ST.5) | ⏳ Planned (subj-01..05) |
| **Phase 2** | **Fast entry: master + favourites + carry-forward + presets (ST.6–ST.8)** | ⏳ Planned (subj-06..08) |
| Phase 3 | Polish: smart-confirm defaults + integration/a11y/gate (ST.9–ST.10) | ⏳ Planned (subj-09..10) |

---

## Cost estimate

| Wave | Tasks | Sonnet / Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | subj-06 (master + favourites + autocomplete) | 1 | 0 | ~3–4h |
| Wave 2 | subj-07 (carry-forward) · subj-08 (presets) | 2 | 0 | ~2–3h (parallel) |
| **Total** | **3** | **3** | **0** | **~5–7h agent-time** |

---

## Sequencing notes

- **subj-06 first.** It lands the two lookups (master + note-favourites) + their services + the autocomplete/chip wiring — the substrate carry-forward and presets benefit from. subj-07 (carry-forward) and subj-08 (presets) are independent of each other and can run in parallel after subj-06 (07 touches the prescription read path + a button; 08 extends the template payload + the picker).

---

## References

- **Source:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — ST.6–ST.8 + the fast-entry strategy table.
- **Shipped patterns reused:** [`DrugAutocomplete.tsx`](../../../../../../../frontend/components/ehr/DrugAutocomplete.tsx) · [`109_doctor_drug_favorites.sql`](../../../../../../../backend/migrations/109_doctor_drug_favorites.sql) · [`091_doctor_rx_templates.sql`](../../../../../../../backend/migrations/091_doctor_rx_templates.sql) + [`TemplatePicker.tsx`](../../../../../../../frontend/components/ehr/TemplatePicker.tsx) · [`PreviousRxPopover.tsx`](../../../../../../../frontend/components/consultation/cockpit/PreviousRxPopover.tsx) · [`088_drug_master.sql`](../../../../../../../backend/migrations/088_drug_master.sql) (the lookup pattern subj-06 mirrors).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../../../process/TASK_MANAGEMENT_GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p2-subjective-tab-fast-entry.md`](./Tasks/EXECUTION-ORDER-p2-subjective-tab-fast-entry.md).

---

**Created:** 2026-06-03.  
**Status:** ⏳ `Planned` (2026-06-03) — Phase 2 of the Subjective-tab program; the `v2` slice.  
**Next phase:** Phase 3 — polish (smart-confirm defaults + integration/a11y/gate).
