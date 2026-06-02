# Receptionist re-architecture — Phase 1: persistence sink + constitution gates — batch plan

> **Program charter (vision + DL-1..DL-12):** [`../plan-receptionist-rearchitecture-charter.md`](../plan-receptionist-rearchitecture-charter.md) — §5 Phase 1.
>
> **Builds on Phase 0 ([p0-compliance](../p0-compliance/)).** Compliance hardening landed; this phase is the first structural slice — encodes DL-2/DL-11.
>
> **Cost-aware model strategy:** [`../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-receptionist-foundation.md`](./Tasks/EXECUTION-ORDER-p1-receptionist-foundation.md).

---

## Scope (this phase)

| Task | Title | Status |
|---|---|---|
| [rcp-01](./Tasks/task-rcp-01-persist-once-state-sink.md) | Collapse redundant writes to single end-of-turn sink | ✅ done |
| [rcp-02](./Tasks/task-rcp-02-constitution-safety-gates.md) | Extract ordered `CONTROL_GATES` (revoke / paused / emergency) | ✅ done |

**Deliverable:** one DB write per turn; safety/control ordering explicit and unit-tested; seam for Phase 2's stage router in place.

**Prior phase:** [`../p0-compliance/`](../p0-compliance/)  
**Next phase:** [`../p2-stage-router/`](../p2-stage-router/)
