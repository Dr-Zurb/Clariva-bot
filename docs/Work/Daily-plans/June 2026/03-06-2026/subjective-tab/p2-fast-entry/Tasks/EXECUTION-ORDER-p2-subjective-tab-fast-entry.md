# Subjective tab — Phase 2: fast entry — execution order

> Sibling of [`plan-p2-subjective-tab-fast-entry-batch.md`](../plan-p2-subjective-tab-fast-entry-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `subj-06` lands the substrate (two lookups + services + autocomplete/chips) and runs first. `subj-07` (carry-forward) and `subj-08` (presets) are disjoint and run as two parallel lanes after it.

---

## Wave plan (2 waves)

```
Wave 1 (substrate — ~3–4h):
  subj-06 (complaint_master + doctor_note_favorites + autocomplete + favourite chips)

        │
        ▼
Wave 2 (~2–3h, parallel):
  subj-07 (carry-forward last visit)   [Lane α]
  subj-08 (subjective presets)         [Lane β]
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **subj-06** | M | Auto | `088_drug_master.sql` + `DrugAutocomplete.tsx` (lookup+autocomplete pattern); `109_doctor_drug_favorites.sql` + `FavoritesChipStrip.tsx` (favourites); subj-02/03/04 mount points | Migrations 117 (`complaint_master` + seed) & 118 (`doctor_note_favorites`) + services/routes; complaint autocomplete (sets `category`); per-field favourite chips. |
| W2.α | subj-07 | S | Auto | `prescription-service.ts` read path; `PreviousRxPopover.tsx`; subj-01 fields | `getLastSubjectiveForPatient` + a one-tap carry-forward (copy-all / pick-fields) that hydrates the cards + histories. |
| W2.β | subj-08 | S | Auto | `091_doctor_rx_templates.sql` payload; `TemplatePicker.tsx` | Extend the template payload to carry `complaints` + histories; add a "Subjective only" apply mode. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| subj-06 | M | Auto | Two bounded lookups + services + UI cloned from the shipped `drug_master`/`DrugAutocomplete` + `doctor_drug_favorites`/`FavoritesChipStrip` patterns. |
| subj-07 | S | Auto | One read query + a copy action reusing the prior-Rx surface. |
| subj-08 | S | Auto | Payload extension + an apply-subset mode on the shipped picker. |

**Caps check:** 0 Opus in Phase 2 (close-gate Opus is Phase 3). ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p2-subjective-tab-fast-entry-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p2-subjective-tab-fast-entry-batch.md`](../plan-p2-subjective-tab-fast-entry-batch.md).
- Tasks: [`task-subj-06-…`](./task-subj-06-complaint-master-and-favorites.md) · [`task-subj-07-…`](./task-subj-07-carry-forward-last-visit.md) · [`task-subj-08-…`](./task-subj-08-subjective-presets.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-03. **Status:** ⏳ `Planned`.
