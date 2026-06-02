# Receptionist re-architecture — Phase 6: per-doctor identity & consent — batch plan

> **Program charter:** [`../plan-receptionist-rearchitecture-charter.md`](../plan-receptionist-rearchitecture-charter.md) — §5 Phase 6.
>
> **Builds on Phase 5 ([p5-returning-memory](../p5-returning-memory/)).** Per-doctor `patients` rows so consent + identity are clinic-scoped (fixes global-row bug Phase 5 worked around).
>
> **Exec order + identity-migration playbook:** [`Tasks/EXECUTION-ORDER-p6-receptionist-identity.md`](./Tasks/EXECUTION-ORDER-p6-receptionist-identity.md).

---

## Scope (rcp-25..29)

| Task | Title | Status |
|---|---|---|
| rcp-25 | Per-doctor identity resolution seam (compat) | spec'd |
| rcp-26 | Per-doctor placeholder for new contacts | spec'd |
| rcp-27 | Doctor-scope global PSID readers | spec'd |
| rcp-28 | Per-doctor consent lifecycle (revoke/delete/merge) | spec'd |
| rcp-29 | Split shared rows + backfill; drop global index (closer) | spec'd |

**Prior:** [`../p5-returning-memory/`](../p5-returning-memory/) · **Next:** Phase 7+ (outlined in charter §5)
