# Subjective tab — Phase 4: rapid capture + nested complaints — execution order

> Sibling of [`plan-p4-subjective-tab-rapid-capture-batch.md`](../plan-p4-subjective-tab-rapid-capture-batch.md). The plan covers what + why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** strictly sequential. `subj-11` adds the rapid-capture bar (pure interaction rewire). `subj-12` adds one level of nested associated complaints and **reuses subj-11's capture bar** one level down, so it must run after. No parallel lanes.

---

## Wave plan (2 waves, sequential)

```
Wave 1 (~0.5–1d):
  subj-11 (rapid-capture bar — type → Enter → collapsed card)

        │
        ▼
Wave 2 (~1–1.5d):
  subj-12 (nested associated complaints — reuses the capture bar)
```

**Total wall-clock:** ~1.5–2.5d agent-time (sequential).

---

## Wave-by-wave

### Wave 1 — rapid-capture bar

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **subj-11** | S | Auto | `ComplaintList.tsx`, `ComplaintAutocomplete.tsx`, `ComplaintCard.tsx` (collapse/expand) | Persistent capture bar; Enter commits (highlighted match or free text) → `ADD_COMPLAINT`, clear, retain focus; new cards land **collapsed** (don't set `activeInstanceId`); duplicate name focuses existing. Replaces the editor-on-add flow. No data change. |

### Wave 2 — nested associated complaints

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **subj-12** | M | **Auto** (Opus escalation budget) | subj-11, `RxFormContext.tsx` (reducer + `cc`/`hopi` derivation + `buildRxPayload`/`complaintsFromPrescription`), `types/prescription.ts`, the PDF/notification/snapshot mappers | Add `associatedComplaints?: Complaint[]` (one level); reducer `parentId`; recurse serialize/hydrate; `hopi` indented sub-lines (`cc` unchanged); chips + promote; sibling-only reorder. **Changes the byte-parity contract + JSONB round-trip** → escalate one message to Opus if the derivation ripple reaches mappers beyond the named callsites. No migration. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| subj-11 | S | Auto | A localized interaction rewire on existing components; no data/clinical path. |
| subj-12 | M | **Auto** (+Opus budget) | JSONB shape extension with no migration, but it changes `cc`/`hopi` derivation (close-gate locked byte-parity) and the serialize/hydrate round-trip — escalate one message if the ripple reaches the PDF/SMS/snapshot mappers. |

**Caps check:** 0 Opus tasks in Phase 4 (subj-12 carries a per-message escalation budget only); ≤1 Opus per wave. ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p4-subjective-tab-rapid-capture-batch.md#cross-cutting-acceptance-gate-whole-phase). Phase 4 is green when both tasks are done, the capture bar + nesting behave per spec, `cc` is unchanged, `hopi` renders indented associated sub-lines with the gate fixtures updated, no migration was added, and `tsc`/lint/suites pass.

---

## References

- Batch plan: [`plan-p4-subjective-tab-rapid-capture-batch.md`](../plan-p4-subjective-tab-rapid-capture-batch.md).
- Product plan: [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md).
- Tasks: [`task-subj-11-…`](./task-subj-11-rapid-complaint-capture.md) · [`task-subj-12-…`](./task-subj-12-nested-associated-complaints.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-04.  
**Status:** ⏳ `Planned`.
