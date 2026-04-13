# RT-03 — Collection, consent, patient match — findings & planned changes

**Review date:** 2026-04-13  
**Scope:** `collection-service.ts`, `consent-service.ts`, `extract-patient-fields.ts`, `booking-consent-context.ts`, `patient-matching-service.ts`, `patient-service.ts` (booking paths); `resolveConsentReplyForBooking` in `ai-service.ts`  
**Reference:** [AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md), [rt-03-collection-consent-patient.md](../reading%20tasks/rt-03-collection-consent-patient.md)

---

## 1. `validateAndApplyExtracted` ordering (AI-first)

**Actual order** (`collection-service.ts` ~L327–372):

1. **`extractPhoneAndEmail(text)`** — deterministic phone + email from raw text (before/parallel to AI).
2. If **`shouldTryAi`** (`missingFields.length > 0` && non-empty text):  
   - Build **`ExtractionContext`**: `lastBotMessage`, `missingFields`, `collectedSummary`, `relation`, **`recentTurns`** (last 6, redacted).  
   - **`extractFieldsWithAI`** → merge into `extracted`.  
   - **If AI returns no keys:** regex fallback fills **name, age, gender, reason_for_visit, email** from `extractFieldsFromMessage` (phone already seeded from step 1 or AI).
3. **Else** (nothing missing or empty text path): **`extractFieldsFromMessage(text)`** only (full regex pass), merged with initial phone/email from step 1.

**Verdict:** Matches **phone/email → AI → regex fallback** intent. Regex is **not** used as primary when slots remain and text is non-empty.

---

## 2. Merge guards (symptom / relation / gender)

**Location:** `validateAndApplyExtracted` ~L378–430.

| Guard | Role | Duplication vs NLU? |
|-------|------|---------------------|
| `isSymptomLike` | Block symptom lines as **name** | **Validation** — prevents bad writes; LLM can still mis-label rarely |
| `isRelationshipOrGenderLike` | Block relation/gender sentences as **name** or **reason** | Same |
| `isGenderOnly` | Block "male"/"female" as **name** | Same |
| `isMetaBookingOrFeeReasonText` (reason) | Skip fee/meta phrases as visit reason | Catalog alignment, not open-ended NLU |

**Verdict:** **Minimal validation**, not a second classifier. **Keep**; optionally log when a guard drops a field (metrics).

---

## 3. Consent: `parseConsentReply` vs semantic layer

| Layer | Where | When semantic runs |
|-------|--------|-------------------|
| **Keywords** | `consent-service.ts` `parseConsentReply` — `GRANT_KEYWORDS` / `DENY_KEYWORDS` | Always used **first** in DM via `resolveConsentReplyForBooking` |
| **Optional extras** | `booking-consent-context.ts` + `resolveConsentReplyForBooking` | If `isOptionalExtrasConsentPrompt(lastAssistantMessage)`: `isSkipExtrasReply` → **granted** without LLM; else fast grant → **granted**; else **semantic only** |
| **Default path** | `resolveConsentReplyForBooking` | `parseConsentReply` → if **not** `unclear`, return ( **semantic skipped** ); else `classifyConsentReplySemantic` |

**When semantic is skipped:** Clear keyword grant/deny match; optional-extras + skip-extras; optional-extras + keyword grant.

**Risk:** Keyword `DENY_KEYWORDS` includes **"no"** — **must not** run before optional-extras branch; **order** in `resolveConsentReplyForBooking` fixes this (§4.8 “context before keywords”).

---

## 4. Thread: `reason_for_visit` vs state

| Mechanism | Purpose |
|-----------|---------|
| **`seedCollectedReasonFromStateIfValid`** | Copies **`state.reasonForVisit`** (e.g. reason-first triage) into Redis `reason_for_visit` when collection starts |
| **`extractFieldsWithAI` context** | `recentTurns` + `lastBotMessage` so reason can be inferred across turns |
| **Webhook** | Calls `seedCollectedReasonFromStateIfValid` where booking enters collection with existing `reasonForVisit` (~L2870, ~L3105 in `instagram-dm-webhook-handler.ts`) |

**Gap:** If `reasonForVisit` is set but **seed** is not invoked on a code path, Redis may lack reason until next extract — **audit** new entry points to collection.

---

## 5. Deliverable — file risk table

| File | Risk (regex-heavy / OK) | Recommended direction |
|------|-------------------------|------------------------|
| **`collection-service.ts`** | **OK** core path (AI + guards). `parseMessageForField` / `tryRecoverAndSetFromMessages` use **regex** — recover path is **fallback**. | Keep guards; **recover** path: optional thin LLM later; ensure **seed** on all reason-first → collection transitions. |
| **`consent-service.ts`** | **`parseConsentReply`** — **keyword list** (medium drift for multilingual edge cases). | **Keep** as fast path; DM resolution already defers to semantic when `unclear`. Extend keywords only with tests. |
| **`extract-patient-fields.ts`** | **Regex-heavy** by design; file header says **fallback only**. | **Prompt / structured extraction first** per product; add regex only when PO asks for deterministic path. |
| **`booking-consent-context.ts`** | **Substring** for optional-extras prompt; **exact list** for skip extras. | **Keep** (philosophy §4.8); add integration tests when copy changes. |
| **`patient-matching-service.ts`** | **OK** — Levenshtein + DB, not regex NLU. | **Keep** algorithm; tune thresholds with data. |
| **`patient-service.ts`** (placeholder / `createPatientForBooking`) | **OK** — DB CRUD. | No philosophy conflict. |
| **`ai-service.ts`** `resolveConsentReplyForBooking` | **Orchestration** — not regex-heavy. | **Keep** ordering; document in one place (this plan + consent README if added). |

---

## 6. Planned changes (planning)

1. **Doc:** One-line diagram in `collection-service` header: **phone/email → AI → regex fallback** (already in comment ~L312–314; optional expand).
2. **Metrics:** Counter: `validateAndApplyExtracted` guard dropped field (symptom/relation/gender).
3. **Audit:** Grep `collecting_all` / `seedCollectedReasonFromStateIfValid` call sites for **parity** on reason-first handoff.
4. **Tests:** Consent: cases where user says **"no"** on optional extras vs **deny** (already implied by branch order — add regression if missing).

---

## 7. Handoff

| Next | Notes |
|------|--------|
| **RT-04+** | Intent routing / fees if in list |
| **Execution** | `tm-bot-audit-02` extraction thread — ties to `extractFieldsWithAI` + this file’s ordering |

---

## 8. Status

- [x] RT-03 read complete  
- [ ] Metrics / audit items when execution phase starts
