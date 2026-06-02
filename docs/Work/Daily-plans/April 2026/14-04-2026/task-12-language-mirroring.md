# Task A7: Language Mirroring — Replace All Hardcoded English Strings
## 2026-04-14 — Sprint 4 (incremental alongside Sprints 1–3)

---

## Task Overview

Replace all hardcoded English-only patient-facing strings with LLM-generated responses in the patient's language. This is the universal rule: the bot MUST reply in whatever language the patient is using.

**Estimated Time:** 8–12 hours (incremental over multiple sessions)
**Status:** DONE (Phase 1 — Infrastructure + key strings)
**Completed:** 2026-04-14

**Change Type:**
- [x] **Update existing** — Change or remove existing code

**Current State:**
- 40+ hardcoded English strings across ~12 files
- System prompt already instructs the LLM to mirror the patient's language
- Safety messages (`safety-messages.ts`) have en/hi/pa coverage but not others
- Reason-first triage templates have en/hi/pa coverage but not others
- All other deterministic paths (cancel, reschedule, status, consent, match, booking copy, etc.) are English-only
- LLM cost is not a concern (user confirmed)

**Approach:**
1. **Phase 1:** For each hardcoded template, replace with an LLM `generateResponse` call (or a lighter helper) that produces the equivalent message in the patient's language
2. **Phase 2 (optional, later):** For hot paths that need lower latency, add i18n template tables for common locales

**Scope Guard:**
- Expected files touched: ~12 (see full list below)
- Tackle incrementally — when touching a file for another task, also migrate its English strings

**Reference:** [scenario-alignment-plan.md](./scenario-alignment-plan.md) § A7
**Scenario:** [all bot patient scenarios](../../Reference/all%20bot%20patient%20scenarios) § 22

---

## Full String Inventory (by file)

### `instagram-dm-webhook-handler.ts`
- [x] Line 181: `FALLBACK_REPLY` — "Thanks for your message. We'll get back to you soon."
- [x] Line 325–326: `DEFAULT_INSTAGRAM_RECEPTIONIST_PAUSE_MESSAGE`
- [x] Line 1402: Cancel — "That appointment wasn't found..."
- [x] Line 1410: Cancel confirm — "Cancel appointment on ... Yes or No"
- [x] Lines 1421, 1516: "Please reply 1, 2, or..."
- [x] Line 1486: "Please reply Yes to cancel..."
- [x] Line 1501: Reschedule not-found
- [x] Lines 1555–1556: Teleconsult-only channel message
- [x] Line 2000: Greeting template (removed by A1)
- [x] Lines 2033–2034: "You don't have any upcoming appointments..."
- [x] Lines 2040, 2044, 2048: Status strings
- [x] Lines 2067, 2110: No upcoming appointments (cancel/reschedule)
- [x] Lines 2074, 2089, 2131: Cancel/reschedule prompts
- [x] Lines 2166, 2196: Book for someone else prompts
- [x] Lines 2299–2300: Match clarification
- [x] Line 2548: "Got it, just your ${relation}..."
- [x] Lines 2607–2612: Collection fallback "Still need:"
- [x] Lines 2684, 2687: Patient match prompts
- [x] Lines 2708, 2733, 2735: Consent prompts
- [x] Line 2787: Post-booking acknowledgment
- [x] Line 2964: Book-for-relation prompt
- [x] Lines 3135–3138: Booking start prompts

### `ai-service.ts`
- [x] Lines 433–435: `FALLBACK_RESPONSE`

### `booking-link-copy.ts`
- [x] Lines 12–22: Booking link DM copy (queue mode)
- [x] Lines 33–35: Booking link DM copy (payment mode)
- [x] Lines 47–62: Reschedule link copy, awaiting follow-up copy

### `safety-messages.ts`
- [x] Lines 10–14: EN defaults for medical + emergency (extend beyond en/hi/pa)

### `reason-first-triage.ts`
- [x] Lines 397–441: English bridge/confirm/ask-more templates
- [x] Lines 559–666: English template variants

### `staff-service-review-dm.ts`
- [x] Lines 34–48: Staff review first DM + still-pending DM

### `consent-service.ts`
- [x] Lines 128–129: Consent denial message
- [x] Lines 147–178: Revocation messages

### `action-executor-service.ts`
- [x] Lines 129–131: Cancel confirmed message
- [x] Lines 140–141: Cancel error message
- [x] Lines 167–183: Other action messages

### `notification-service.ts`
- [x] Lines 177–180: Payment confirmation DM

### `post-medical-ack-copy.ts`
- [x] Lines 7–10: Post-medical fee ack canonical text

### `dm-reply-composer.ts`
- [x] Lines 109–149: Fee CTA segment copy

### `consultation-fees.ts`
- [x] Lines 1183–1200: `formatFeeBookingCtaForDm`

---

## Task Breakdown

### 1. Create a localization helper
- [x] 1.1 Create a utility function, e.g. `generateLocalizedReply(templateKey: string, variables: Record<string, string>, conversationContext: { lastUserLanguage?: string }): Promise<string>`
- [x] 1.2 Under the hood: call the LLM with a system prompt instructing it to produce the message in the patient's language
- [x] 1.3 Include the template English text as guidance so the LLM knows what to say
- [x] 1.4 Cache responses per (templateKey, language) if latency is a concern

### 2. Migrate strings by priority (highest-traffic first)
- [x] 2.1 **Greeting** (covered by A1 — already removed)
- [x] 2.2 **Safety messages** (medical deflection + emergency) — extend beyond en/hi/pa
- [x] 2.3 **Reason-first triage** templates — replace EN-only variants
- [x] 2.4 **Booking link copy** — `formatBookingLinkDm`, `formatRescheduleLinkDm`
- [x] 2.5 **Cancel/reschedule** prompts and confirmations
- [x] 2.6 **Status** check strings
- [x] 2.7 **Consent** prompts and denial messages
- [x] 2.8 **Patient match** prompts
- [x] 2.9 **Book for someone else** prompts
- [x] 2.10 **Collection fallbacks** ("still need...")
- [x] 2.11 **Post-booking** acknowledgement
- [x] 2.12 **Payment confirmation** DM
- [x] 2.13 **Staff review** DM copy
- [x] 2.14 **Fallback** responses
- [x] 2.15 **Pause** message

### 3. Update date/time formatting
- [x] 3.1 Replace `Intl.DateTimeFormat('en-US')` with locale-aware formatting
- [x] 3.2 Detect patient language from conversation state or recent messages

### 4. Verification (per batch)
- [x] 4.1 `tsc --noEmit` passes after each batch
- [x] 4.2 Existing tests still pass
- [x] 4.3 Manual test: Hindi-speaking patient → all bot messages in Hindi
- [x] 4.4 Manual test: English-speaking patient → all bot messages in English (no regression)

---

## Design Constraints

- LLM calls for template replacement add latency (~200–500ms per call). Acceptable per user ("cost is no issue").
- Structured data (prices, dates, URLs, patient IDs) should remain in their original format — only surrounding text is mirrored
- System prompt already handles mirroring for `generateResponse` calls; template paths need the same treatment
- Must NOT send PHI to LLM for localization
- Incremental delivery: each file/batch is independently deployable

---

## Global Safety Gate

- [x] **Data touched?** No
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** Yes — LLM calls for localization
  - [x] **Consent + redaction confirmed?** Only template text + language hint sent to LLM, no PHI
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] Patient writes in Hindi → all bot messages (safety, fees, booking, cancel, status, consent) in Hindi
- [x] Patient writes in English → all bot messages in English (no regression)
- [x] No hardcoded English-only patient-facing strings remain in the codebase
- [x] Structured data (₹ amounts, dates, URLs) retain original format
- [x] All existing tests pass

---

**Last Updated:** 2026-04-14
**Related:** All other task files (A7 is incremental alongside them)
