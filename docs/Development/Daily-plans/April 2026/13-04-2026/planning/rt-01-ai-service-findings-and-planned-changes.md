# RT-01 — `ai-service.ts` findings & planned changes

**Review date:** 2026-04-13  
**Scope:** `backend/src/services/ai-service.ts`, `backend/src/types/ai.ts`  
**Reference:** [AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md), [rt-01-ai-service-intent-classification.md](../reading%20tasks/rt-01-ai-service-intent-classification.md)

---

## 1. Executive summary

`ai-service.ts` is **mostly aligned** with the philosophy: **structured JSON** for intent, extraction, visit-reason snippets, consent/confirm turns; **thread context** injected into intent classification; **DB/facts** emphasized in response prompts; **post-policies** correct common model errors (fee thread → `ask_question`, emergency → `medical_query` after escalation).

The main **gaps** are (a) a **large deterministic pre-classifier** (greetings, book-for-else, check-status, emergency) plus an **expandable kin-term regex** that will keep growing, (b) **duplicate fee signals** via `intentSignalsFeeOrPricing` → keyword fallback, (c) **intent cache** keyed only on redacted text when context is absent, and (d) **regex helpers** on extraction/confirm fast paths that duplicate “understanding” the model should own.

---

## 2. Aligned behaviors (keep)

| Area | Evidence | Philosophy |
|------|----------|------------|
| Intent JSON | `SYSTEM_PROMPT` + `buildIntentClassificationUserContent` with `recentTurns`, `conversationGoal`, emergency follow-up hints | §2–3 LLM-first, thread grounding |
| Context bypasses cache | `skipIntentCache = classifyIntentUsesContext(ctx)` when turns/goal present | §4.5 avoids stale singleton-text cache |
| Fee / pricing sub-signals | `pricing_signal`, `fee_thread_continuation`, `reason_first_done_adding` from model JSON | Structured fields, not regex lists |
| Post-classification | `applyIntentPostClassificationPolicy`, `applyEmergencyIntentPostPolicy` | Deterministic **fixes** on model output, not parallel NLU |
| Extraction | `extractFieldsWithAI` + `EXTRACTION_SYSTEM_PROMPT` + `ExtractionContext` (missing fields, recent turns) | §4.6–4.7 |
| Consent / confirm | `resolveConsentReplyForBooking` + `booking-consent-context`; semantic prompts for optional extras | §4.8 |
| Visit reasons | `VISIT_REASON_SNIPPET_SYSTEM` + JSON `reasons[]` | LLM primary |
| Patient replies | `RESPONSE_SYSTEM_PROMPT_BASE` — fees/hours from injected blocks only | §2 facts from DB |
| Booking relation LLM | `resolveBookingTargetRelationForDm` when `BOOKING_RELATION_LLM_ENABLED` | Escape hatch beyond kin regex |

---

## 3. Gaps & risks

| ID | Severity | Issue | Location (approx.) |
|----|----------|--------|---------------------|
| G1 | **P2** | **Kin / multi-person regex** (`BOOKING_RELATION_KIN`, `MULTI_PERSON_BOOKING_REGEX`, `BOOK_FOR_SOMEONE_ELSE_REGEX`) — unbounded growth risk; every new term is maintenance | L135–152, 176–179 |
| G2 | **P2** | **Deterministic shortcuts** before LLM: `isSimpleGreeting`, `isBookForSomeoneElse`, `isCheckAppointmentStatus`, `isEmergencyUserMessage` — correct for §5 latency/safety, but **overlap** with what the model could do; document as **explicit fast-path allowlist** | L1220–1232 |
| G3 | **P2** | **`intentSignalsFeeOrPricing`** falls back to `isPricingInquiryMessage(messageText)` when classifier omits fee flags — **second signal path** (§4.5) | L554–561 + `consultation-fees.ts` |
| G4 | **P3** | **Intent cache** (`INTENT_CACHE_KEY_PREFIX`, redacted text only) — safe when `skipIntentCache` true; without context, identical text in different threads could share cache **if** both hit no-context path | L72–102, 1234–1238 |
| G5 | **P3** | **`confirmDetailsDeterministic`** regex chain before semantic confirm — fast but another pattern file inside service | ~L1477–1485 |
| G6 | **P3** | **Name post-filter** in `extractFieldsWithAI`: `/^\s*(i\s+have|i\s+took|...)/` on model output | ~L679–681 |
| G7 | **P3** | **`userSignalsReasonFirstWrapUp`** combines `parseNothingElseOrSameOnly` (regex) **or** classifier — document as intentional hybrid | L546–548 |

---

## 4. Planned changes (RT-01 scope — `ai-service` / types only)

These are **planning** items; implement in execution epics with tests.

### 4.1 Documentation & guardrails (low risk)

1. **Add an inline module comment** above “Deterministic Intent Rules” listing: which shortcuts are **intentional §5** (emergency, greeting latency) vs **product** (book-for-else, payment-status), and pointing to `resolveBookingTargetRelationForDm` for OOV phrasing.
2. **Document cache contract** in file header or next to `INTENT_CACHE_KEY_PREFIX`: cache applies only when `skipIntentCache === false`; bump prefix when JSON schema changes (already noted).

### 4.2 Reduce regex sprawl (medium — needs design sign-off)

3. **Kin list strategy:** Move `BOOKING_RELATION_KIN` to a **single data module** (e.g. `booking-relation-terms.ts`) with **unit tests** that snapshot allowed terms; add process: “new kin term → prefer LLM relation resolver first, add regex only if product requires zero-latency.”
4. **`intentSignalsFeeOrPricing`:** When `result.confidence` is high and topics exist, **avoid** keyword fallback; log once when fallback used (metrics) to measure classifier gaps. Optional: remove fallback behind env flag after corpus proves classifier coverage.

### 4.3 Future (out of RT-01 single-file scope)

5. **Cache key v2:** Include `hash(conversationGoal + lastAssistantTurn)` when available — only if metrics show cross-thread cache pollution.
6. **Unified booking-turn JSON:** Single schema `{ dialog_act, consent?, confirm_details?, intent? }` — large refactor; ties to webhook + state machine (**RT-02**).

---

## 5. `types/ai.ts` notes

- **Single source** for `Intent`, `INTENT_VALUES`, `IntentTopic`, `PricingSignalKind` — **aligned** with §2.
- No change required for RT-01 unless execution adds new structured fields (e.g. `dialog_act`).

---

## 6. Handoff

| Next | Owner |
|------|--------|
| **RT-02** | Map **duplicate** intent/fee/`yes` logic in `instagram-dm-webhook-handler.ts` vs `ai-service` |
| **Execution** | `tm-bot-audit-02-extraction-thread.md` + parts of `tm-bot-audit-01` for kin/fee fallback |

---

## 7. Status

- [x] RT-01 read complete  
- [ ] Code changes (when execution phase starts)  
- [ ] Re-run unit tests (`ai-service.test.ts`, `booking-turn-classifiers.test.ts`)
