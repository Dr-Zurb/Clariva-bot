# Instagram DM handler — branch inventory (RBH-17)

**Purpose:** Map `instagram-dm-webhook-handler.ts` main `if / else if` chain to the **three layers** (Understand / Decide / Say) and to **canonical code paths** for user-visible facts.

**Code:** `backend/src/workers/instagram-dm-webhook-handler.ts` (inside `try` after `classifyIntent`).

---

## Decision order (must stay consistent)

1. **Compliance / account:** `revoke_consent` → template + service  
2. **Ops:** `instagram_receptionist_paused` → handoff copy  
3. **Step gates (numeric / yes-no):** cancel choice, cancel confirm, reschedule choice, reschedule slot (if applicable)  
4. **Safety:** `isEmergencyUserMessage` / `emergency` intent → `resolveSafetyMessage('emergency')`  
5. **Medical deflection (idle):** `medical_query` && !`inCollection` → `resolveSafetyMessage('medical_query')`  
6. **Fee quote (idle):** pricing keyword path && !`inCollection` && responded → `buildFeeQuoteDm`  
7. **Greeting fast path:** `greeting` && idle → English template (regex-fast in classifier)  
8. **Transactional:** `check_appointment_status`, `cancel_appointment`, `reschedule_appointment`, `book_for_someone_else`, match confirmation, consent, `collecting_all`, …  
9. **Default:** `generateResponse` / `generateResponseWithActions` (LLM **Say** + injected **facts** in system prompt)

---

## Branch table (approximate top-to-bottom order)

| # | Condition / step | Understand | Decide | Say (primary) |
|---|------------------|------------|--------|----------------|
| 0 | (before branch) | `classifyIntent` + `applyIntentPostClassificationPolicy` | — | — |
| 1 | `revoke_consent` | intent | handler | `handleRevocation` |
| 2 | Receptionist paused | intent | handler | `resolveInstagramReceptionistPauseMessage` |
| 3 | `awaiting_cancel_choice` | optional | numeric parse | template |
| 4 | `awaiting_cancel_confirmation` | intent | regex yes/no or `executeAction` / tool | template or AI+tool |
| 5 | `awaiting_reschedule_choice` | — | numeric parse | template + `buildReschedulePageUrl` when single |
| 6 | Emergency | pattern / intent | handler | `resolveSafetyMessage('emergency')` |
| 7 | `medical_query` !collection | intent | handler | `resolveSafetyMessage('medical_query')` |
| 8 | Pricing & idle | regex + intent | handler | `buildFeeQuoteDm` (server fee block) |
| 9 | Greeting & idle | regex / intent | handler | greeting template |
| 10 | `check_appointment_status` | intent | DB | template from `formatAppointmentStatusLine` + appointments |
| 11 | `cancel_appointment` | intent | DB + state | templates |
| 12 | `reschedule_appointment` | intent | DB + state | `formatRescheduleLinkDm` / choice list |
| 13 | `book_for_someone_else` (idle/slot) | intent | state | intake template |
| 14 | Match confirmation | parsed reply | DB / create patient | `formatBookingLinkDm` |
| 15 | Consent | `parseConsentReply` | persist + DB | `formatBookingLinkDm` or AI |
| 16 | `collecting_all` / details | intent + extraction | collection service | **mostly AI** + extraction |
| 17 | Rest / book / availability | intent | state machine | **AI** (`generateResponse`) |

Rows are **guidance**; inner branches may call AI for ambiguous cancel consent.

---

## Canonical sources of user-visible facts (single owner)

Keep these in sync when changing product behavior.

| Fact | Canonical producers | Notes |
|------|---------------------|--------|
| Consultation / booking **fee (₹)** | `formatConsultationFeesForDm` + `buildFeeQuoteDm`; `formatAppointmentFeeForAiContext` → `DoctorContext` → `buildResponseSystemPrompt` | DM quote path is deterministic; LLM path must not contradict AUTHORITATIVE block |
| **Booking page URL** | `buildBookingPageUrl` + `formatBookingLinkDm` | Never invent URL in model |
| **Reschedule URL** | `buildReschedulePageUrl` + `formatRescheduleChoiceLinkDm` / `formatRescheduleLinkDm` | — |
| **Appointment date/status lines** | `formatAppointmentStatusLine` + DB reads | — |
| **Practice name / hours / address** | `getDoctorContextFromSettings` → `buildResponseSystemPrompt` | From `doctor_settings` |

---

## Related

- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](./RECEPTIONIST_BOT_CONVERSATION_RULES.md) — principles and intent map  
- Task [RBH-17](../Development/Daily-plans/March%202026/2026-03-25/Receptionist%20Bot%20improvements/Tasks/e-task-rbh-17-receptionist-architecture-llm-vs-system-actions.md)

**Last updated:** 2026-03-28 (RBH-17 implementation)
