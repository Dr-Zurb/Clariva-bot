# Receptionist re-architecture — Phase 0: compliance hardening — batch plan

> **Program charter (vision + DL-1..DL-12 + full phase ladder):** [`../plan-receptionist-rearchitecture-charter.md`](../plan-receptionist-rearchitecture-charter.md) — §5 Phase 0.
>
> **Why first:** PHI leak is a live compliance risk (DL-6); fix is isolated from the structural refactor.
>
> **Cost-aware model strategy:** [`../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p0-receptionist-compliance.md`](./Tasks/EXECUTION-ORDER-p0-receptionist-compliance.md).

---

## Scope (this phase)

| Task | Title | Status |
|---|---|---|
| [rcp-00](./Tasks/task-rcp-00-phi-redaction-i18n.md) | Harden `redactPhiForAI` for Indian phone formats | ✅ done |

**Deliverable:** no Indian patient phone number reaches OpenAI in plaintext; regression-tested across formats.

**Prior phase:** — (program start)  
**Next phase:** [`../p1-foundation/`](../p1-foundation/)
