# rcp-00 · PHI redaction i18n — stop Indian phone numbers leaking to OpenAI

> **Phase 0** of [receptionist-rearchitecture](../plan-p0-receptionist-compliance-batch.md). Standalone compliance fix; independent of the structural refactor. Upholds **DL-6 (Privacy by construction)**.

| **Size** | S | **Model** | Auto + Opus close-gate | **Wave** | 0 | **Depends on** | — | **Blocks** | — |

---

## Why this task

`redactPhiForAI` is the **single shared redactor** before every model call — 10 call sites (`ai-service.ts`, `service-catalog-matcher.ts`, `collection-service.ts`, `dm-turn-context.ts`, `notification-service.ts`, `account-deletion-worker.ts`, `instagram-dm-webhook-handler.ts`, …). Its phone pattern is **US-formatted** (`3-3-4` grouping):

```451:464:backend/src/services/ai-service.ts
export function redactPhiForAI(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let out = text;
  // Email (simple pattern)
  out = out.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi,
    '[REDACTED_EMAIL]'
  );
  // US/international phone: digits with optional spaces/dots/dashes/parens
  out = out.replace(
    /(\+?1?[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    '[REDACTED_PHONE]'
  );
  return out;
}
```

This is an India-first product (₹, Hindi/Hinglish). An Indian mobile written the common way — `98765 43210` (5-5 spacing) or `+91 98765 43210` — falls **outside** the `3-3-4` group and reaches OpenAI **in plaintext**. That is a real PHI leak (DL-6). The 10-contiguous-digit form `9876543210` happens to match today; the spaced/country-coded forms do not.

---

## What to do

### 1. Add India-aware phone redaction in `backend/src/services/ai-service.ts`

Keep email redaction first (so digits inside an email local-part aren't mangled). Then add Indian-mobile + country-code coverage and a conservative long-digit catch-all. Indicative patterns — the **test matrix in step 3 is the contract**, tune the regexes to pass it:

```ts
// after the email replace, before returning:
// 1) +91 / 0 prefixed or 5-5 spaced/dashed Indian mobiles (start 6-9)
out = out.replace(
  /(?:\+?91[\s.-]?|0)?[6-9]\d{4}[\s.-]?\d{5}\b/g,
  '[REDACTED_PHONE]'
);
// 2) keep existing US/3-3-4 pattern (do not remove — covers other formats)
// 3) conservative catch-all: any run of >= 10 digits (ignores the age/qty/menu-pick case)
out = out.replace(/\b\d{10,}\b/g, '[REDACTED_PHONE]');
```

Order: **email → Indian mobile → existing US pattern → ≥10-digit catch-all**. Collapse double `[REDACTED_PHONE][REDACTED_PHONE]` if patterns overlap (or make patterns mutually exclusive).

### 2. CRITICAL — audit that redaction never feeds digit-parsing code

`redactPhiForAI` is shared. Field extraction (phone capture during `collecting_*`) must run on **raw** text, not redacted text — otherwise a more aggressive phone regex will break phone collection. Verify each of the 10 call sites only uses the redacted string for **model-bound prompts**, never for downstream parsing:

```bash
rg -n "redactPhiForAI" backend/src
```

Confirm specifically that `extract-patient-fields.ts` / `extractFieldsWithAI` deterministic extraction reads the **original** message, and `service-catalog-matcher` / `collection-service` only pass redacted text into the LLM call (not into a later digit parse).

### 3. Test matrix in `backend/tests/unit/services/ai-service.test.ts`

Add a `describe('redactPhiForAI — India formats')` covering at minimum:

```ts
// each LEFT must become '[REDACTED_PHONE]' (and not appear verbatim):
'9876543210'            // 10 contiguous
'98765 43210'           // 5-5 space   ← currently LEAKS
'98765-43210'           // 5-5 dash    ← currently LEAKS
'+91 98765 43210'       // country code + space ← currently LEAKS
'+919876543210'         // country code contiguous
'0091 98765 43210'      // 00-prefixed
'09876543210'           // leading 0
// must NOT be redacted (false-positive guards):
'I am 25'               // age
'option 2'              // menu pick
'2 pm'                  // time
// emails still redacted:
'me@x.com'  → '[REDACTED_EMAIL]'
```

Assert both directions: PHI forms are replaced; ages/picks/times survive. Run `cd backend && npm test -- ai-service`.

---

## Acceptance gate

- [x] All Indian mobile forms in the step-3 matrix (5-5 spaced/dashed, `+91`/`0091`/`0` prefixed, contiguous) redact to `[REDACTED_PHONE]`.
- [x] Ages, menu-picks, and times in the matrix are **not** redacted (no over-redaction of small numbers).
- [x] Email redaction unchanged; no `[REDACTED_PHONE][REDACTED_PHONE]` doubling.
- [x] Verified (step 2) that no call site relies on the redacted output retaining phone digits; phone **collection** still works on raw text.
- [x] New tests green; existing `ai-service.test.ts` still green; `cd backend && npx tsc --noEmit` clean. *(44/44 ai-service, 2026-05-30.)*

---

## Close-out (2026-05-30)

**Shipped.** India-aware phone patterns + ≥10-digit catch-all in `redactPhiForAI`; call-site audit confirmed raw-text parsing for phone collection.

---

## Anti-goals

- ❌ Don't attempt to redact patient **names** or symptom free-text in this task — names need a different (context-aware) approach; scope creep. Track separately if desired.
- ❌ Don't change any of the 10 call sites' behavior — this task only strengthens the redactor and verifies callers are safe.
- ❌ Don't lower the catch-all below 10 digits (would start eating ages, OTP-length codes, quantities).
- ❌ Don't redact inside already-`[REDACTED_*]` tokens.

---

## Risks (executor-facing)

- **Shared redactor, hidden coupling.** The single biggest risk: a caller that redacts *then* parses digits. Step 2's audit is mandatory, not optional. If any caller does this, fix the caller to parse raw text first.
- **Over-redaction of legitimate numbers.** A naive `\d{6,}` would eat order IDs, OTP lengths, ages-with-typos. The `\d{10,}` threshold + the explicit false-positive guards in the test matrix are the safety rail.
- **Regex overlap doubling.** Indian-mobile + catch-all can both fire on the same substring → `[REDACTED_PHONE][REDACTED_PHONE]`. Make patterns mutually exclusive or post-collapse repeats.
- **Unicode digits.** Devanagari numerals (०-९) are out of scope here but worth a follow-up note — patients rarely type them, but confirm with a quick corpus check before closing.
