# p3 — rx-lifecycle · revise window — execution order

> Sibling of [`plan-p3-rx-lifecycle-revise-window-batch.md`](../plan-p3-rx-lifecycle-revise-window-batch.md).
>
> ⛔ **Drafted.** Do not open implementation chats until the batch is `Committed` and the Phase 2 gate is green.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (5 waves)

```
Wave 1 (Store — ~5h, single lane sequential):
  Lane α  ──── **rxl-11 (L, Opus)**

Wave 2 (Integrity — ~11h, 2 parallel lanes after rxl-11):
  Lane α  ──── **rxl-12 (L, Opus)**                     [snapshot + revision bump]
  Lane β  ──── **rxl-15 (L, Opus)**                     [PDF freeze + retention]

Wave 3 (Window — ~4h, single lane sequential; needs rxl-12):
  Lane α  ──── **rxl-13 (M, Opus)**

Wave 4 (Surfaces — ~8h, 3 parallel lanes after rxl-13 + rxl-15):
  Lane α  ──── rxl-14 (M, Sonnet)                       [countdown + flush]
  Lane β  ──── rxl-16 (S, Sonnet)                       [slip marker]
  Lane γ  ──── rxl-17 (M, Sonnet)                       [supersede]

Wave 5 (Gate — ~3h, single lane sequential):
  Lane α  ──── rxl-18 (M, Sonnet)
```

**Total wall-clock with parallelism:** ~31h.
**Total agent-time (sequential equivalent):** ~41h.

Wave 2's two lanes are genuinely independent — one writes clinical snapshots, the other manages storage artifacts — and both only need the table and columns from Wave 1. Wave 3 must wait for `rxl-12`, because relaxing the guard before snapshots exist would breach RXL-DL-8. `rxl-16` needs `rxl-15`'s revision-aware path before it can print a revision number.

---

## Lane-by-lane details

### Wave 1 — Store

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **rxl-11** | L | **Opus** | `026`, `223`, `224`, `225`, the `rxl-05` attest migration, `MIGRATIONS_AND_CHANGE.md`, `RLS_POLICIES.md` | New PHI table holding clinical payload snapshots. Deny-all RLS, append-only, in-file reverse. Also adds the revision counter and supersede columns to `prescriptions`. |

### Wave 2 — Integrity

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **rxl-12** | L | **Opus** | `prescription-service.ts` (`updatePrescription`, the `rxl-06` guard), `buildRxPayload` shape, PDF service result shape | Snapshot on **first** post-attest edit only. Revision advances on finalize, never per save (RXL-DL-9). |
| 0 | **rxl-15** | L | **Opus** | `prescription-pdf-service.ts` (header locks T3-D2 / BRD-D4 / batch-18; path built at ~407, ~494, ~548), `prescription-pdf-cache.ts`, `invalidatePrescriptionPdfCache` callers | Three hardcoded path sites — extract one helper first. Re-key the existing freeze from `sent_to_patient_at` to the attest stamp so print-only inherits it. |

### Wave 3 — Window

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **rxl-13** | M | **Opus** | the `rxl-06` guard, `config/env.ts`, `rxl-12`'s snapshot hook | Weakens `rxl-06` by exactly 15 minutes. Fixed from attest, non-rolling. Any ambiguity refuses the write. Never read `process.env` directly. |

### Wave 4 — Surfaces

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rxl-14 | M | Sonnet | `rxl-01`'s lock module, `RxFormContext` autosave scheduling + `persistSnapshot`, `rxl-02`'s banner | The expiry race is the whole task: flush pending save, then flip read-only. A render-time check will not fire on its own. |
| 0 | rxl-16 | S | Sonnet | PDF footer data assembly (~309-318), the `PrescriptionDocument` footer component, letterhead footer options | System text beside the short id. **Not** inside the letterhead footer — a branding setting must not suppress it. |
| 0 | rxl-17 | M | Sonnet | `rxl-11`'s supersede columns, `rxl-09`'s history list, validation + controller pattern | Reason required. Superseded shows as superseded, never deleted. |

### Wave 5 — Gate

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rxl-18 | M | Sonnet | whole phase diff | The boundary tests are the headline: minute 16 with a lying client, and continuous typing producing `Rev 2`. Honest ticks. |

**Branch suggestion:** `feat/rxl-p3-revise-window` (single branch; Wave 2 and Wave 4 lanes only if worktrees).

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| rxl-11 | L | **Opus** | New PHI table + RLS + ALTER |
| rxl-12 | L | **Opus** | The integrity mechanism; a subtle bug here loses the record of what was issued |
| rxl-13 | M | **Opus** | Deliberately weakening an enforcement boundary |
| rxl-14 | M | Sonnet | Timer + flush against a settled rule |
| rxl-15 | L | **Opus** | Reverses a documented storage lock; three path sites; already-issued artifacts at stake |
| rxl-16 | S | Sonnet | One footer line in an existing render tree |
| rxl-17 | M | Sonnet | Standard write path over columns `rxl-11` creates |
| rxl-18 | M | Sonnet | Gate / docs |

Four Opus — over the §8 cap of two. Accept it: a new PHI store, the snapshot mechanism, the enforcement relaxation and a storage-lock reversal are four separate hard-rules surfaces, and there is no honest Sonnet substitute for any of them. If cost forces a cut, `rxl-13` is the only candidate to demote, and only if `rxl-12` landed with its snapshot hook fully tested.

---

## Acceptance gates per wave

**Wave 1:** table exists, deny-all RLS proven closed to anon/authenticated, append-only enforced, reverse in-file, re-applies as no-op; counter and supersede columns additive with no backfill; types + `DB_SCHEMA.md` + `RLS_POLICIES.md` updated.

**Wave 2 Lane α:** first post-attest edit writes exactly one snapshot; a second in-window edit writes none; continuous typing does not advance the counter; finalize does.
**Wave 2 Lane β:** print-only attested prescription is frozen; issued bytes for revision N retrievable after N+1 exists; draft prints still re-render and overwrite; cache key is revision-aware; invalidation no longer fires for attested rows.

**Wave 3:** minute 14 accepted, minute 16 refused with a client clock that disagrees; window does not roll; unknown stamp refuses; all Wave 2 green.

**Wave 4:** countdown visible and accurate; window closing flips read-only after flushing, with no lost keystrokes; footer marker present, correct, and unsuppressible by letterhead settings; supersede records reason and history shows it. All Wave 3 green.

**Wave 5:** full phase gate; program acceptance gate walked end to end; docs; product plan marked `Shipped` or the residue recorded.

---

## Cost estimate

| Wave | Tasks | Sonnet | Opus | Wall-clock |
|---|---|---|---|---|
| 1 | 1 | 0 | 1 | ~5h |
| 2 | 2 | 0 | 2 | ~11h |
| 3 | 1 | 0 | 1 | ~4h |
| 4 | 3 | 3 | 0 | ~8h |
| 5 | 1 | 1 | 0 | ~3h |
| **Total** | **8** | **4** | **4** | **~31h** |

---

## References

- Plan: [`plan-p3-rx-lifecycle-revise-window-batch.md`](../plan-p3-rx-lifecycle-revise-window-batch.md)
- Product: [`plan-rx-lifecycle.md`](../../../../../../Product%20plans/plan-rx-lifecycle.md)
- Prior phases: [`../../p1-lock-integrity/`](../../p1-lock-integrity/) · [`../../p2-append-notes/`](../../p2-append-notes/)
- [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md)

---

**Created:** 2026-08-31.
