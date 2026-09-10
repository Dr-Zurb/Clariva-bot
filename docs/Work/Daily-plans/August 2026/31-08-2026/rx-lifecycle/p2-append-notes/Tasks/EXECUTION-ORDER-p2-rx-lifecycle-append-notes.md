# p2 — rx-lifecycle · append notes — execution order

> Sibling of [`plan-p2-rx-lifecycle-append-notes-batch.md`](../plan-p2-rx-lifecycle-append-notes-batch.md).
>
> ⛔ **Drafted.** Do not open implementation chats until the batch is `Committed` and the Phase 1 gate is green.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (4 waves)

```
Wave 1 (Stamp — ~3h, single lane sequential):
  Lane α  ──── **rxl-05 (M, Opus)**

Wave 2 (Guard — ~6h, single lane sequential):
  Lane α  ──── **rxl-06 (L, Opus)**

Wave 3 (Load path + history — ~10h, 2 parallel lanes after rxl-06):
  Lane α  ──── rxl-07 (L, Sonnet) ──> rxl-08 (S, Sonnet)      [cockpit load + carry-forward]
  Lane β  ──── rxl-09 (M, Sonnet)                             [visit history]

Wave 4 (Gate — ~2h, single lane sequential):
  Lane α  ──── rxl-10 (M, Sonnet)
```

**Total wall-clock with parallelism:** ~21h.
**Total agent-time (sequential equivalent):** ~25h.

The bottleneck is Wave 2 — it is the enforcement boundary and everything downstream assumes it holds. Wave 3 Lane β needs only the stamp and the plural read path, so it can start as soon as `rxl-06`'s response shape is settled. `rxl-08` follows `rxl-07` in the same lane because both touch the seed source and would otherwise conflict.

---

## Lane-by-lane details

### Wave 1 — Stamp

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **rxl-05** | M | **Opus** | `026_prescriptions.sql`, `151`, `223`, `224`, `225`, `MIGRATIONS_AND_CHANGE.md`, `DB_SCHEMA.md` | Read all prior migrations in numeric order. Re-check the next unclaimed number — `hl-01` also claims "next after 225". Additive ALTER; no backfill of historical rows. |

### Wave 2 — Guard

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **rxl-06** | L | **Opus** | `prescription-service.ts` (`updatePrescription` ~821, `listPrescriptionsByAppointment` ~251), `utils/errors.ts`, `audit-logger.ts` (`logDataModification` ~345), send + finish + print callers | The guard is the feature. Typed `AppError`, never raw `Error`. `changedFields` = names only; `audit_logs.metadata` is no-PHI by policy. |

### Wave 3 — Load path + history

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rxl-07 | L | Sonnet | `useRxFormProviderSetup.ts` (~360-430), `RxFormContext.tsx` (`persistSnapshot` ~2739), `rxl-03`'s seed path | Highest blast radius in the program — this path serves brand-new visits too. Verify `rxl-03`'s zero-write test is green **before** starting. |
| 1 | rxl-08 | S | Grok 4.6 (override) | `prescription-service.ts` (~757-766 subjective carry-forward), `CarryForwardButton`, copy-from-last-visit | **Implemented** 2026-09-10 — exclude by prescription; skip superseded. |
| 0 | rxl-09 | M | Grok 4.6 (override) | `HistoryPane.tsx`, `PatientRibbon.tsx`, `listPrescriptionsByAppointment` | **Implemented** 2026-09-10 — list notes, not visits. Read-only. |

### Wave 4 — Gate

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rxl-10 | M | Grok 4.6 (override) | whole phase diff | **Implemented** 2026-09-10 — source-level isolation; live queue/hisab not byte-compared. |

**Branch suggestion:** `feat/rxl-p2-append-notes` (single branch; Wave 3 lanes only if worktrees).

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| rxl-05 | M | **Opus** | ALTER on a PHI table |
| rxl-06 | L | **Opus** | Service-layer enforcement boundary + audit metadata |
| rxl-07 | L | Sonnet | Load-path change against a documented decision lock; no new rule to invent |
| rxl-08 | S | Sonnet | One predicate change |
| rxl-09 | M | Sonnet | Read-only list UI over an existing plural endpoint |
| rxl-10 | M | Sonnet | Gate / docs |

Two Opus (`rxl-05`, `rxl-06`) — at the §8 cap, not over it. `rxl-07` is deliberately Sonnet: it is large but the decisions are already locked, and its risk is regression, which tests catch.

---

## Acceptance gates per wave

**Wave 1:** column exists; migration re-applies as a no-op; reverse in-file; historical rows unaffected; types + `DB_SCHEMA.md` updated.

**Wave 2:** stamp set once by the first of finish / send / print; a second print does not move it; write to an attested Rx rejected with a typed error at the API boundary; `changedFields` present and value-free; all Wave 1 green.

**Wave 3:** returning to an attested note opens empty; no row until first user edit; same `appointment_id`; carry-forward seeds subjective from the sibling; vitals and exam empty; visit history lists notes with timestamps and reprints without creating. All Wave 2 green.

**Wave 4:** full phase gate; queue / OPD / pipeline / `visit_payments` proven unchanged; docs; Phase 3 unblocked or blocked.

---

## Cost estimate

| Wave | Tasks | Sonnet | Opus | Wall-clock |
|---|---|---|---|---|
| 1 | 1 | 0 | 1 | ~3h |
| 2 | 1 | 0 | 1 | ~6h |
| 3 | 3 | 3 | 0 | ~10h |
| 4 | 1 | 1 | 0 | ~2h |
| **Total** | **6** | **4** | **2** | **~21h** |

---

## References

- Plan: [`plan-p2-rx-lifecycle-append-notes-batch.md`](../plan-p2-rx-lifecycle-append-notes-batch.md)
- Product: [`plan-rx-lifecycle.md`](../../../../../../Product%20plans/plan-rx-lifecycle.md)
- Prior phase: [`../../p1-lock-integrity/`](../../p1-lock-integrity/)
- [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md)

---

**Created:** 2026-08-31.
**Last Updated:** 2026-09-10 (`rxl-05`…`10` implemented).
