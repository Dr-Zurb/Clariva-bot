# Subjective tab — Phase 3: polish — execution order

> Sibling of [`plan-p3-subjective-tab-polish-batch.md`](../plan-p3-subjective-tab-polish-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `subj-09` (smart-confirm defaults) builds; `subj-10` (integration + a11y + close-gate) verifies the whole program and stamps the gate. Build → verify cut; the one Opus in the program is the gate.

---

## Wave plan (2 waves)

```
Wave 1 (build — ~1h):
  subj-09 (smart-confirm defaults)

        │
        ▼
Wave 2 (verify + gate — ~1–2h):
  subj-10 (integration + a11y + pipeline-unchanged assertion + stamp)   [Opus]
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **subj-09** | S | Auto | subj-06 (`doctor_note_favorites` / prior complaints), subj-02/03 cards | Per-doctor most-common attribute values pre-selected on complaint pick; suggestions visually distinct until confirmed; never overwrite explicit edits. |
| W2.0 | **subj-10** | S | **Opus** | the whole-program gate, the changed-files diff, the v1 suites, an a11y/contrast checklist, a PDF/SMS/snapshot fixture | Integration smoke + a11y (light+dark) + keyboard-only + the **pipeline-unchanged** byte-parity assertion (`cc`/`hopi`/PDF/SMS/snapshot). Build nothing. Stamp the gate. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| subj-09 | S | Auto | Bounded per-doctor defaulting logic; suggestions only, no clinical-path change. |
| subj-10 | S | **Opus** | Close-gate review of the whole program + a11y + the "nothing clinical moved" assertion (hard-rule §5). One careful review. |

**Caps check:** 1 Opus in Phase 3 (subj-10) ≤ §8 max; ≤1 Opus per wave. ✓

---

## Acceptance gate

The program close-gate lives in the [batch plan](../plan-p3-subjective-tab-polish-batch.md#cross-cutting-acceptance-gate-whole-program-close-gate-owned-by-subj-10). subj-10 stamps it green.

---

## References

- Batch plan: [`plan-p3-subjective-tab-polish-batch.md`](../plan-p3-subjective-tab-polish-batch.md).
- Tasks: [`task-subj-09-…`](./task-subj-09-smart-confirm-defaults.md) · [`task-subj-10-…`](./task-subj-10-integration-a11y-and-close-gate.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

**Created:** 2026-06-03. **Status:** ⏳ `Planned`.
