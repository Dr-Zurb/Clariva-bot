# Receptionist re-architecture — Phase 3: channel-agnostic core + adapters — batch plan

> **Program charter:** [`../plan-receptionist-rearchitecture-charter.md`](../plan-receptionist-rearchitecture-charter.md) — §5 Phase 3.
>
> **Builds on Phase 2 ([p2-stage-router](../p2-stage-router/)).** Formalize channel ports; pull Instagram I/O behind adapters (DL-10).
>
> **Exec order + adapter playbook:** [`Tasks/EXECUTION-ORDER-p3-receptionist-channels.md`](./Tasks/EXECUTION-ORDER-p3-receptionist-channels.md).

---

## Scope (rcp-09..13)

| Task | Title | Status |
|---|---|---|
| rcp-09 | Channel ports + registry (seam) | ✅ |
| rcp-10 | Instagram inbound adapter | ✅ |
| rcp-11 | Instagram outbound adapter | ✅ |
| rcp-12 | Channel-free `runConversationTurn` + thin worker | ✅ |
| rcp-13 | WhatsApp adapter stub + comment surface tag | ✅ |

**Prior:** [`../p2-stage-router/`](../p2-stage-router/) · **Next:** [`../p4-state/`](../p4-state/)
