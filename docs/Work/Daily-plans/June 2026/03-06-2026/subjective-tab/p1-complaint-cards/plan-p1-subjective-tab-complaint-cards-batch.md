# Subjective tab — Phase 1: structured complaint cards + owned histories + linked sections — 03 Jun 2026 batch plan

> **Phase 1 of the Subjective-tab program (the `v1` slice of the product plan).** Today the Cockpit-v3 Subjective tab is two raw fields — a Chief-complaint `<input>` and an HOPI `<textarea>` ([`SubjectiveSection.tsx`](../../../../../../../frontend/components/cockpit/rx/sections/SubjectiveSection.tsx)). Phase 1 replaces them with **structured, reorderable complaint cards** (each complaint = one card with complaint-type-aware OLDCARTS attributes), adds the three **owned** narrative histories (Family / Social / Past-surgical), and **embeds** the already-shipped patient-background sections (PMH / allergies / meds) read-only-plus-quick-edit — without re-keying them. `cc` / `hopi` become **derived** from the cards so the PDF, SMS summary, and snapshot are untouched.
>
> **Source plan:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — realises items **ST.1–ST.5** (the `v1` phasing block). Decisions **ST-D1..ST-D7** are frozen there.
>
> **Prefix note:** tasks are `subj-*` (`subj` = Subjective tab), numbered continuously across phases. Phase 1 = `subj-01..05`; Phase 2 = `subj-06..08`; Phase 3 = `subj-09..10`. Item IDs `ST.1..ST.10` map 1:1 to `subj-01..10`.
>
> **Builds on:** Cockpit-v3 (shipped — the tab, `RxFormContext`, `useAutoSave`, the `medicines` array/reducer pattern this mirrors) and EHR T1 (`patient_allergies` / `patient_chronic_conditions` + their shipped `AllergiesSection` / `ChronicConditionsSection` UIs). This phase is **additive** to the Rx artifact (one migration adds columns; no existing column is dropped or renamed).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). One Opus task (the close-gate is in Phase 3; Phase 1's keystone `subj-01` touches schema + the shared form state, so it carries a per-message Opus escalation budget). Everything else is Auto/Sonnet.
>
> **Task-file note:** every `task-subj-*` file follows [`TASK_TEMPLATE.md`](../../../../../process/TASK_TEMPLATE.md) — **no code, schemas, or function signatures in tasks** ([planning/execution boundary](../../../../../process/TASK_MANAGEMENT_GUIDE.md)). The concrete SQL / types live in the product plan + the code; the task files state the *contract*.
>
> **Exec order + wave plan:** [`Tasks/EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md`](./Tasks/EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md).

---

## What Phase 1 does (one sentence)

> **Add a `complaints` JSONB array + three history columns to `prescriptions`, surface them as reorderable complaint cards (complaint-type-aware OLDCARTS) and chip-assisted history fields inside the Subjective tab, embed the shipped PMH/allergy/meds chart sections as linked patient-background, and derive `cc`/`hopi` from the cards so nothing downstream changes.**

After Phase 1: a doctor with "headache, leg pain, body ache" enters three structured cards
instead of one prose blob; the note carries Family / Social / Past-surgical history; the
patient's PMH and allergies show inline (pulled from their patient-level chart, not
re-typed); and the prescription PDF/SMS still render exactly as before because `cc`/`hopi`
are derived.

---

## Decision lock (frozen for this phase)

Carried from the product plan (binding here):

- **ST-D1** — Complaints are a **structured JSONB array** on `prescriptions`, mirroring the `medicines` array + reducer pattern in [`RxFormContext`](../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx) — not packed into `hopi`.
- **ST-D2** — `cc` / `hopi` become **derived** from `complaints` in `buildRxPayload`; the columns stay. A manual free-text fallback edit is preserved.
- **ST-D3** — **Own** FH / SH / PSH (new columns); **link** PMH / allergies / current-meds (the shipped patient-level sections), never re-keyed into the note.
- **ST-D4** — Per-complaint attributes are **complaint-type aware** (pain → SOCRATES, fever → pattern/max-temp/chills, default → OLDCARTS) via a frontend schema registry.
- **ST-D6** — Social history is **free-text + chips** in v1; structured columns deferred.
- **ST-D7** — **ROS + ICE deferred**; Phase 1 ships complaint cards + owned histories + linked sections only.

---

## What this phase does NOT do (deferred)

| Item | Lands |
|---|---|
| Complaint autocomplete (`complaint_master`) + favourite chips + carry-forward + presets | **Phase 2** (`subj-06..08`) |
| Smart-confirm defaults; integration/a11y/close-gate | **Phase 3** (`subj-09..10`) |
| ROS, ICE, structured social-history columns, AI/voice scribe | Later (out of program v1) |
| Any change to Objective / Assessment / Plan tabs | — |

---

## Cross-cutting acceptance gate (whole phase)

- [ ] Migration `116_prescriptions_subjective_expansion.sql` runs idempotently; existing rows unaffected; RLS unchanged (doctor-only, migration 026).
- [ ] `complaints` + `familyHistory` / `socialHistory` / `pastSurgicalHistory` round-trip through create / update / autosave.
- [ ] Subjective tab renders reorderable complaint cards (add / edit / remove / reorder), collapsed-summary-vs-editor, narrow-rail friendly; attribute set is complaint-type aware.
- [ ] Owned history fields save to their columns with chip-assist + free text.
- [ ] PMH / allergies / current-meds appear as linked sections (read + quick-add), **no double-write**; allergies still feed the safety strip.
- [ ] `cc` / `hopi` are derived from `complaints` on save; the prescription PDF + SMS summary + snapshot are byte-identical for an equivalent note.
- [ ] `cd frontend; npx tsc --noEmit` + `npm run lint` clean; backend + frontend unit suites for the reducer/derivation/cards green.

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | **Structured complaint cards + owned histories + linked sections (ST.1–ST.5)** | ⏳ Planned (subj-01..05) |
| Phase 2 | Fast entry: complaint master + favourites + carry-forward + presets (ST.6–ST.8) | ⏳ Planned (subj-06..08) |
| Phase 3 | Polish: smart-confirm defaults + integration/a11y/gate (ST.9–ST.10) | ⏳ Planned (subj-09..10) |

---

## Cost estimate

| Wave | Tasks | Sonnet / Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | subj-01 (data model + state) | 1 | 0 (escalation budget) | ~2–3h |
| Wave 2 | subj-02 (cards) · subj-03 (schema) · subj-04 (histories) · subj-05 (linked) | 4 | 0 | ~5–7h (subj-03/04/05 parallel after subj-02) |
| **Total** | **5** | **5** | **0** | **~7–10h agent-time** |

`subj-01` is the keystone (schema + shared `RxFormContext` state + `cc`/`hopi` derivation);
the close-gate Opus review lands in Phase 3 (`subj-10`).

---

## Sequencing notes

- **subj-01 first (gates everything).** It adds the migration, the `RxFormFields` shape, the reducer actions, and the `cc`/`hopi` derivation. subj-02..05 all read that state.
- **subj-02 before subj-03/04/05.** The card component is the host; the schema registry (03) feeds its attribute rows, the history fields (04) sit beside it, and the linked sections (05) mount in the same pane. 03/04/05 are largely disjoint and can run in parallel once 02 lands.

---

## References

- **Source:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — ST.1–ST.5, ST-D1..ST-D7, the data-model sketch.
- **Surfaces this builds on:**
  - [`frontend/components/cockpit/rx/RxFormContext.tsx`](../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx) — the `medicines` array + reducer + `buildRxPayload` this mirrors.
  - [`frontend/components/cockpit/rx/sections/SubjectiveSection.tsx`](../../../../../../../frontend/components/cockpit/rx/sections/SubjectiveSection.tsx) — the two-field section being replaced.
  - [`frontend/components/patient-profile/panes/SubjectivePane.tsx`](../../../../../../../frontend/components/patient-profile/panes/SubjectivePane.tsx) — the pane that hosts the linked sections.
  - [`frontend/components/consultation/MedicineRow.tsx`](../../../../../../../frontend/components/consultation/MedicineRow.tsx) — the card pattern (collapsed-summary vs editor, drag, remove).
  - [`frontend/components/ehr/sections/ChronicConditionsSection.tsx`](../../../../../../../frontend/components/ehr/sections/ChronicConditionsSection.tsx) · [`AllergiesSection.tsx`](../../../../../../../frontend/components/ehr/sections/AllergiesSection.tsx) — the linked sections.
  - [`backend/migrations/103_prescription_soap_fields_expansion.sql`](../../../../../../../backend/migrations/103_prescription_soap_fields_expansion.sql) — the additive-column pattern subj-01's migration follows.
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../../../process/TASK_MANAGEMENT_GUIDE.md) · [`TASK_TEMPLATE.md`](../../../../../process/TASK_TEMPLATE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md`](./Tasks/EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md).

---

**Created:** 2026-06-03.  
**Status:** ⏳ `Planned` (2026-06-03) — Phase 1 of the Subjective-tab program; the `v1` slice.  
**Next phase:** Phase 2 — fast entry (complaint master + favourites + carry-forward + presets).
