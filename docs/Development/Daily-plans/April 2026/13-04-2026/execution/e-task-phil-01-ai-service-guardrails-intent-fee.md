# e-task-phil-01 — AI service: guardrails, intent cache doc, fee fallback metrics

**Initiative:** [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../../../../../task-management/BOT_PHILOSOPHY_ELITE_AUDIT_2026.md)  
**Themes:** T1 (partial)  
**Planning source:** [rt-01-ai-service-findings-and-planned-changes.md](../planning/rt-01-ai-service-findings-and-planned-changes.md) §4.1–4.2  
**Maps to:** [tm-bot-audit-01-routing-context.md](../../../../../task-management/tasks/tm-bot-audit-01-routing-context.md) (supporting)

---

## Objective

Document **deterministic fast paths** vs product shortcuts in `ai-service.ts`, clarify **intent cache** contract, and add **observability** when `intentSignalsFeeOrPricing` uses **keyword fallback** (classifier gap signal).

---

## Preconditions

- [x] RT-01 complete ([findings-log.md](../planning/findings-log.md))

---

## Tasks

- [x] **4.1** Add **module comment** above deterministic intent rules: which shortcuts are intentional §5 (emergency, greeting latency) vs product (book-for-else, check-status); pointer to `resolveBookingTargetRelationForDm` for OOV kin phrasing.
- [x] **4.1** Document **`INTENT_CACHE_KEY_PREFIX`** contract next to cache: applies when `skipIntentCache === false`; bump prefix on JSON schema change (note if already present — extend if thin).
- [x] **4.2** **Metrics:** log once (structured) when `intentSignalsFeeOrPricing` uses **`isPricingInquiryMessage`** fallback while classifier omitted fee flags — include confidence/topics if available.
- [x] **4.2** Optional (flag-gated): reduce keyword fallback when classifier high-confidence — **only** after metrics review with product.

_Deferred by design until metrics review._

---

## Acceptance criteria

- New engineers can read **one** comment block and know what must not grow without design review.
- Logs or metrics allow counting **fee fallback** hits per week.

---

## Out of scope

- **Cache key v2** (hash assistant turn) — separate future task unless metrics prove pollution.
- **Unified booking-turn JSON** — cross-cutting; coordinate with e-task-phil-03.

---

## Verification

- `backend/tests/unit/services/ai-service.test.ts` still green; add test for new log line if cheap.
