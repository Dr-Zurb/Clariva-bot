# tm-bot-audit-04 — Reason-first triage & fee routing epic

**Initiative:** [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../BOT_PHILOSOPHY_ELITE_AUDIT_2026.md)  
**Philosophy:** §4.1, §7 fee / triage rows

---

## Objective

**Classifier-led** fee and reason flows; **document** the single extension point for new visit types (prompt + tests, not new regex arms).

---

## Preconditions

- [ ] tm-bot-audit-00 complete
- [ ] Findings on `reason-first-triage.ts`, `consultation-fees.ts`, `dm-turn-context.ts`

---

## Scope (to refine)

- Intent + `fee_thread_continuation` policy alignment
- Idle fee quote composition — facts from DB only

---

## Out of scope

- Pricing product rules (business owner)

**Execution (13-04-2026):** [e-task-phil-06](../../../Development/Daily-plans/April%202026/13-04-2026/execution/e-task-phil-06-triage-fees-dm-context.md) — [README](../../../Development/Daily-plans/April%202026/13-04-2026/execution/README.md)

**Status:** ⏳ Ready for implementation
