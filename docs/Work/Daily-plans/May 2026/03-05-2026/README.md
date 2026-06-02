# 2026-05-03 — EHR implementation batch

## Today's folder = the commitment + execution package for the EHR product plans

This folder turns the [EHR product plans](../../../Product%20plans/ehr/) into ready-to-execute task files.

---

## Files in this folder

| File | Purpose | Size |
|---|---|---|
| [plan-ehr-implementation-batch.md](./plan-ehr-implementation-batch.md) | **Master batch plan.** Selects items, sequences sub-batches, locks decisions, lists files expected to touch, defines whole-batch acceptance. Mirrors the [text-consult precedent](../../April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md). | Large |
| [tasks-subbatch-A-foundation.md](./tasks-subbatch-A-foundation.md) | T1 (6 items, ~3 days) — patient chart context spine. **Hard prerequisite for everything else.** | Medium |
| [tasks-subbatch-B1-speed.md](./tasks-subbatch-B1-speed.md) | T2 (7 items, ~4 days) — drug autocomplete + structured pickers + templates + auto-save. Doctor-side love. | Medium |
| [tasks-subbatch-B2-output.md](./tasks-subbatch-B2-output.md) | T3 (5 items, ~3 days) — branded PDF + patient-facing page + send-pipeline upgrade. Patient-side trust. | Medium |
| [tasks-subbatch-C-safety.md](./tasks-subbatch-C-safety.md) | T4 (4 items, ~2 days) — allergy clash + DDI + pre-send soft guards. Needs T1 + T2. | Medium |
| [tasks-subbatch-D-trends.md](./tasks-subbatch-D-trends.md) | T5 (4 items, ~2 days) — vitals capture + sparklines + episode linkage + problem list. Needs T1. | Medium |

T6 (AI assist) is **deferred** per Decision E3 in [plan-00-ehr-roadmap.md](../../../Product%20plans/ehr/plan-00-ehr-roadmap.md). No task file in this folder.

---

## Read-order

Pick what fits the question:

- **"What did we commit to and in what order?"** → Read [plan-ehr-implementation-batch.md](./plan-ehr-implementation-batch.md).
- **"I'm starting implementation today, where do I begin?"** → Read [tasks-subbatch-A-foundation.md](./tasks-subbatch-A-foundation.md). It's pre-approved and unblocked.
- **"What's the WHY behind these tasks?"** → Open the corresponding [product plan tier file](../../../Product%20plans/ehr/) — the rationale, decisions, and risks live there. The task files in this folder are pure execution.

---

## How the task files differ from the product plans

| Source | Lives in | Answers |
|---|---|---|
| Product plans (`docs/Work/Product plans/ehr/`) | Per-tier (T1 / T2 / T3 / T4 / T5 / T6) | **Why** we're doing this. Decisions, code sketches, acceptance criteria, risks. |
| Task files (this folder) | Per sub-batch (A / B1 / B2 / C / D) | **How** to execute, ordered. Pre-batch checklist, numbered tasks, suggested PR slicing, post-batch validation. |

The task files **reference** the product plan sections instead of restating them. Each numbered task points back with `→ §T1.1` so the spec is one click away.

---

## Sub-batch sequencing at a glance

```
Sub-batch A (T1, ~3 days)
   │
   ├──→ Sub-batch B1 (T2, ~4 days)  ← parallel
   │       │
   │       └──→ Sub-batch C (T4, ~2 days)  ← needs T1 + T2
   │
   └──→ Sub-batch B2 (T3, ~3 days)  ← parallel
   │
   └──→ Sub-batch D (T5, ~2 days)   ← needs T1; ship after C if doing solo

Total solo: ~14 dev-days (~3 calendar weeks)
Total 2-dev: ~9 calendar days (B1 + B2 in parallel; A/C/D serial)
```

---

## Status

`Drafted, awaiting commit-start` — 2026-05-03.

Once Sub-batch A is picked up, this folder gets in-place updates: tasks move from `pending` → `in-progress` → `shipped` (with dated check-marks), and each tier source plan gets `[SELECTED 2026-05-03]` markers on the items in this batch.

---

## References

- [EHR product plans (folder)](../../../Product%20plans/ehr/)
- [EHR roadmap master index](../../../Product%20plans/ehr/plan-00-ehr-roadmap.md)
- [Prescription V1 foundation status](../../../Product%20plans/ehr/plan-f01-prescription-foundation-status.md)
- Precedent for batch structure: [text-consult selected features](../../April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md), [voice-consult selected features](../../April%202026/28-04-2026/Plans/plan-voice-consult-selected-features.md), [video-consult selected features](../../April%202026/28-04-2026/Plans/plan-video-consult-selected-features.md)
