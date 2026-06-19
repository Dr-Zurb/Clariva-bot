# Subjective tab — Phase 1: complaint cards — execution order

> Sibling of [`plan-p1-subjective-tab-complaint-cards-batch.md`](../plan-p1-subjective-tab-complaint-cards-batch.md). The plan covers what + why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** Wave 1 is the keystone (`subj-01` — schema + shared form state + `cc`/`hopi` derivation) and must land first; everything reads that state. Wave 2 builds the UI: `subj-02` (the card host) is sequential, then `subj-03` / `subj-04` / `subj-05` run as **three parallel lanes** on disjoint surfaces (attribute schema · history fields · linked-section embed). The close-gate is deferred to Phase 3 (`subj-10`).

---

## Wave plan (2 waves)

```
Wave 1 (keystone — ~2–3h):
  subj-01 (data model + state + cc/hopi derivation)

        │
        ▼
Wave 2 (UI — ~5–7h):
  subj-02 (complaint card host)  ──┬── subj-03 (complaint-type schema)   [Lane α]
                                   ├── subj-04 (owned history fields)    [Lane β]
                                   └── subj-05 (linked chart sections)   [Lane γ]
```

**Total wall-clock:** ~7–10h agent-time (Wave 2 lanes overlap after subj-02).

---

## Wave-by-wave

### Wave 1 — keystone

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **subj-01** | M | **Auto** (Opus escalation budget) | `RxFormContext.tsx` (medicines reducer + `buildRxPayload`), `103_prescription_soap_fields_expansion.sql` (additive-column pattern), `prescription-service.ts`, the prescription types + PDF/notification mappers | Migration 116 (`complaints` JSONB + `family_history` / `social_history` / `past_surgical_history`); `RxFormFields` + `Complaint` type + `ADD/UPDATE/REMOVE/REORDER_COMPLAINT` actions; derive `cc`/`hopi` in `buildRxPayload`. **Schema + PHI + shared state** → escalate one message to Opus if the derivation/ripple is deeper than the named callsites. |

### Wave 2 — UI (subj-02 sequential, then three parallel lanes)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **subj-02** | M | Auto | `MedicineRow.tsx` (card pattern), `SubjectiveSection.tsx`, subj-01 state | The `ComplaintCard` + `ComplaintList`; rewire `SubjectiveSection` to host them + a collapsed free-text fallback. Host for 03. |
| 1α | subj-03 | S | Auto | subj-02, OLDCARTS/SOCRATES vocab | The complaint-type → attribute schema registry (`complaint-schema.ts`); default OLDCARTS. Feeds the card's attribute rows. |
| 1β | subj-04 | S | Auto | subj-01 state, `FavoritesChipStrip` pattern | The three owned history fields (FH/SH/PSH) — chip-assist + free text, collapsible. |
| 1γ | subj-05 | S | Auto | `SubjectivePane.tsx`, `ChronicConditionsSection` / `AllergiesSection` | Embed the shipped chart sections as a "Patient background" zone (read + quick-add); no re-keying. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| subj-01 | M | **Auto** (+Opus budget) | Bounded additive migration + a localized state/derivation change, but it touches PHI schema + the shared Rx form state + the send payload — escalate one message if the `cc`/`hopi` derivation ripples past the named callsites. |
| subj-02 | M | Auto | A structured-card UI cloned from the proven `MedicineRow` pattern. |
| subj-03 | S | Auto | Bounded data registry + a resolver; no clinical/data path. |
| subj-04 | S | Auto | Three small chip-assisted fields. |
| subj-05 | S | Auto | Mounting shipped sections in a new zone; the sections already own their data/RLS. |

**Caps check:** 0 Opus tasks in Phase 1 (the close-gate Opus is Phase 3 / `subj-10`); ≤1 Opus per wave. ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p1-subjective-tab-complaint-cards-batch.md#cross-cutting-acceptance-gate-whole-phase). Phase 1 is green when all five tasks are done, `cc`/`hopi` derive byte-identically, the linked sections don't double-write, and `tsc`/lint/suites pass.

---

## References

- Batch plan: [`plan-p1-subjective-tab-complaint-cards-batch.md`](../plan-p1-subjective-tab-complaint-cards-batch.md).
- Product plan: [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — ST.1–ST.5.
- Tasks: [`task-subj-01-…`](./task-subj-01-data-model-complaints-and-histories.md) · [`task-subj-02-…`](./task-subj-02-complaint-card-and-list-ui.md) · [`task-subj-03-…`](./task-subj-03-complaint-type-attribute-schema.md) · [`task-subj-04-…`](./task-subj-04-owned-history-fields.md) · [`task-subj-05-…`](./task-subj-05-linked-chart-sections.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-03.  
**Status:** ⏳ `Planned`.
