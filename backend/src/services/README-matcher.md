# Service catalog matcher (ARM-04)

## Where “policy” lives

- **Post-classification routing policy** (intent tweaks, fee signals, reason-first triage, etc.) is implemented in **`ai-service.ts`** (`applyIntentPostClassificationPolicy`, `intentSignalsFeeOrPricing`, …). There is **no** `intent-routing-policy.ts` module.
- Unit tests that exercise routing policy are named **`intent-routing-policy.test.ts`** — they import from **`ai-service`**, not a separate policy file.

## Matcher pipeline (`service-catalog-matcher.ts`)

1. **Stage A — deterministic:** `runDeterministicServiceCatalogMatchStageA` in `service-catalog-deterministic-match.ts` (rules over `service_offerings_json`).
2. **Stage B — LLM assist:** optional OpenAI completion when Stage A is ambiguous; patient text is passed through **`redactPhiForAI`** before any model call (see file header ARM-04).

Data contract for learning / inbox labels is documented in **`docs/Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md`**, with implementation anchored in **`service-catalog-matcher.ts`** (candidate labels, reason codes, staff review).
