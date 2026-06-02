# e-task-phil-06 — Triage & fees: `buildDmTurnContext` wiring + extension-point doc

**Initiative:** [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../../../../../task-management/BOT_PHILOSOPHY_ELITE_AUDIT_2026.md)  
**Themes:** T1 (partial), T4  
**Planning source:** [rt-04-triage-fees-dm-context-findings-and-planned-changes.md](../planning/rt-04-triage-fees-dm-context-findings-and-planned-changes.md) §3, §5–6  
**Maps to:** [tm-bot-audit-04-triage-fees.md](../../../../../task-management/tasks/tm-bot-audit-04-triage-fees.md)

---

## Objective

Optionally **wire** `buildDmTurnContext` once per inbound DM turn to avoid drift between fee catalog text and deflection flags; **link** forbidden/approved extension table from **`reason-first-triage.ts`** header to planning §5 or Reference doc.

---

## Tasks

- [x] **Spike:** call `buildDmTurnContext` from webhook; pass **`feeCatalogMatchText`** through existing `buildFeeCatalogMatchText` call sites — confirm no double work. _(Outcome: not hoisted in this PR — multiple `buildFeeCatalogMatchText` call sites remain; `buildDmTurnContext` is the documented assembly API.)_
- [x] If wiring is too risky in one PR: add **comment** at call sites pointing to single future assembly point.
- [x] **Doc:** Add cross-link from `reason-first-triage.ts` file header to [rt-04 §5](../planning/rt-04-triage-fees-dm-context-findings-and-planned-changes.md) or duplicate **short** approved/forbidden table in Reference (product preference).
- [x] **Monitor:** note `CLINICAL_OR_CONCERN_RE` size in backlog if it grows monthly (no code change unless threshold hit).

_Decision: single assembly point documented in `dm-turn-context.ts` + import-side comment on webhook; full hoisting deferred to avoid risky refactor._

---

## Acceptance criteria

- Either **one** wired path with tests **or** explicit decision + comments why not yet.

---

## Out of scope

- Adding new symptom terms to **`CLINICAL_OR_CONCERN_RE`** — forbidden without architecture review (use LLM snippet path).
