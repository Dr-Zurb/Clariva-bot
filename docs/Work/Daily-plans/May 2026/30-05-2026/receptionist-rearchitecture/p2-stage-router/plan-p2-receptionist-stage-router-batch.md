# Receptionist re-architecture — Phase 2: funnel stage router — batch plan

> **Program charter:** [`../plan-receptionist-rearchitecture-charter.md`](../plan-receptionist-rearchitecture-charter.md) — §5 Phase 2.
>
> **Builds on Phase 1 ([p1-foundation](../p1-foundation/)).** Strangler-fig extraction of the mega `if/else if` decide chain into `STAGE_ROUTER` + per-stage handlers (DL-11).
>
> **Exec order + stage-extraction playbook:** [`Tasks/EXECUTION-ORDER-p2-receptionist-stage-router.md`](./Tasks/EXECUTION-ORDER-p2-receptionist-stage-router.md).

---

## Scope (rcp-03..08)

| Task | Title | Status |
|---|---|---|
| rcp-03 | Router scaffold + legacy strangler seam | ✅ |
| rcp-04 | Cancel / reschedule / status (first real stage) | ✅ |
| rcp-05 | Idle fee / reason-first / medical / greeting | ✅ |
| rcp-06 | Service-match / staff-review / clarification | ✅ |
| rcp-07 | Collection → consent → convert funnel | ✅ |
| rcp-08 | Book-entry + retire `runLegacyDecideChain` (closer) | ✅ |

**Prior:** [`../p1-foundation/`](../p1-foundation/) · **Next:** [`../p3-channels/`](../p3-channels/)
