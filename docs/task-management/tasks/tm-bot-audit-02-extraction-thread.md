# tm-bot-audit-02 — Extraction & thread-aware reason epic

**Initiative:** [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../BOT_PHILOSOPHY_ELITE_AUDIT_2026.md)  
**Philosophy:** §4.6–4.7, extraction code map §7

---

## Objective

Ensure **visit reason** and **multi-field blobs** are understood via **LLM + thread context**; keep `extract-patient-fields` as **bounded fallback** only.

---

## Preconditions

- [ ] tm-bot-audit-00 complete
- [ ] Findings list regex-heavy paths in triage/collection

---

## Scope (to refine)

- `extractFieldsWithAI` prompts + context turns
- `validateAndApplyExtracted` merge policy
- `reason-first-triage` / consolidated reason snippet into prompts

---

## Out of scope

- Replacing phone/email normalization regex (§5 closed grammar)

**Execution (13-04-2026):** [e-task-phil-04](../../../Development/Daily-plans/April%202026/13-04-2026/execution/e-task-phil-04-collection-seed-extraction-metrics.md) — [README](../../../Development/Daily-plans/April%202026/13-04-2026/execution/README.md)

**Status:** ⏳ Ready for implementation
