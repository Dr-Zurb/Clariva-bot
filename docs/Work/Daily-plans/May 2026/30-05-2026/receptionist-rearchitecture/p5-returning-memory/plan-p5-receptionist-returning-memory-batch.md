# Receptionist re-architecture — Phase 5: returning-patient memory — batch plan

> **Program charter:** [`../plan-receptionist-rearchitecture-charter.md`](../plan-receptionist-rearchitecture-charter.md) — §5 Phase 5.
>
> **Builds on Phase 4 ([p4-state](../p4-state/)).** First **behavior-changing** phase — warm "welcome back" + skip re-collection (DL-12). Ships behind `RETURNING_PATIENT_MEMORY_ENABLED`.
>
> **Exec order + returning-memory playbook:** [`Tasks/EXECUTION-ORDER-p5-receptionist-returning-memory.md`](./Tasks/EXECUTION-ORDER-p5-receptionist-returning-memory.md).

---

## Scope (rcp-20..24)

| Task | Title | Status |
|---|---|---|
| rcp-20 | Returning-patient profile seam (dormant) | spec'd |
| rcp-21 | "Welcome back" greeting + structured hint | spec'd |
| rcp-22 | Skip re-collection for known + consented patient | spec'd |
| rcp-23 | Returning-aware triage / follow-up pre-fill (deferrable) | spec'd |
| rcp-24 | Privacy/isolation hardening + flag flip (closer) | spec'd |

**Prior:** [`../p4-state/`](../p4-state/) · **Next:** [`../p6-identity/`](../p6-identity/)
