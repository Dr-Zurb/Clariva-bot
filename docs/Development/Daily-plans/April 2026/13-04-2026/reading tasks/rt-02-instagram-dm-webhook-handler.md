# RT-02 — `instagram-dm-webhook-handler.ts` (DM orchestration)

**Philosophy:** §3 (primary vs fallback), §4.2 (giant if-chains), §4.5 §4.8, RECEPTIONIST_BOT_DM_BRANCH_INVENTORY (if exists).

## Paths to read

- `backend/src/workers/instagram-dm-webhook-handler.ts` — imports, branch order comment, `effectiveAskedForConsent` / `effectiveAskedForConfirm` / `lastBotMessage*`, consent flow block, collection + `validateAndApplyExtracted`, reason-first gates
- `docs/Reference/RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md` (if present)

## What to verify

1. **Branch order:** Is the documented order still accurate? Any dead branches?
2. **Context helpers:** Are `lastPromptKind` and substring heuristics both used? Risk of drift?
3. **Keyword gates:** Count `regex` / `.test` / `includes` used for routing vs LLM; flag “case per case” additions.
4. **Patient experience:** Where could the bot ask for the same field twice (ignore thread)?

## Deliverable

Diagram or short note: **happy path** vs **known fragile branches**; list of **top 5** hardcoded branches to replace with structured LLM + `lastPromptKind`.
