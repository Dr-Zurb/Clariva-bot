# Instagram DM handler — branch inventory (RBH-17 / rcp-08)

**Purpose:** Map the stage router (`dm/stage-router.ts`) and `executeDmTurn` pipeline to routing branches and the **three layers** (Understand / Decide / Say).

**Code:** `backend/src/workers/instagram-dm-webhook-handler.ts` (Understand + persist/send) · `backend/src/workers/dm/handle-turn.ts` (Decide) · `backend/src/workers/dm/stages/*.ts` (branch bodies).

> **Generated from code (rcp-08).** Stage order matches `resolveStage()` in `stage-router.ts`.

---

## Pipeline shape (Phase 2 complete)

1. **Understand:** `classifyIntent` + post-classification policy (handler)
2. **Decide:** `executeDmTurn(turnCtx)` → head gates → emergency gate → `resolveStage` → stage `handle` → autobook → recording-consent detour
3. **Say:** stage returns `{ branch, reply, nextState }`; handler persists once (rcp-01 sink) and sends

**Conflict recovery:** `executeDmTurn(turnCtx, { conflictRecovery: true })` → `ai_open_response` body, branch label `conflict_recovery_ai`.

---

## Stage router order (`resolveStage`)

| Order | Stage | Predicate | Primary branches |
|------:|-------|-----------|------------------|
| — | *(head gates)* | `HEAD_CONTROL_GATES` | `revoke_consent`, `receptionist_paused` |
| — | *(emergency gate)* | `EMERGENCY_CONTROL_GATES` | `emergency_safety` |
| 1 | `cancel_reschedule_status` | `isCancelRescheduleStatusTurn` | `cancel_flow_*`, `reschedule_flow_*`, `check_appointment_status`, `post_booking_ack`, status intents |
| 2 | `service_match` | `isServiceMatchTurn` | `staff_service_review_pending`, `complaint_clarification_reply`, `patient_match_confirmation` |
| 3 | `booking_funnel` | `isBookingFunnelTurn` | `recording_consent_flow`, `consent_correction_back`, `consent_flow`, `booking_collection`, `confirm_details`, `confirm_details_complaint_clarify`, `slot_selection`, `recording_consent_injected` |
| 4 | `idle_fee_triage` | `isIdleFeeTriageTurn` | `medical_safety`, `fee_deterministic_idle`, `fee_deterministic_mid_collection`, `greeting_template`, `fee_book_misclassified_idle`, reason-first triage branches, `post_medical_payment_existence_ack`, `booking_resume_after_emergency`, local `fee_ambiguous_visit_type_staff` / `reason_first_triage_ask_more` outcomes |
| 5 | `booking_entry` | `isBookingEntryTurn` | `consultation_channel_pick`, `consultation_channel_pick_reason_first`, `book_for_someone_else`, `booking_start_ai`, `booking_continue_ai`, `booking_start_reason_first`, `book_responded`, `book_responded_reason_first`, `reason_first_triage_ask_more`, `fee_ambiguous_visit_type_staff` |
| 6 | `ai_open_response` | *(default — no predicate)* | `ai_open_response` |

**Post-stage hooks (all turns):** `learning_policy_autobook` (after stage, before persist) · `recording_consent_injected` detour (when transitioning to slot without prior recording answer).

---

## Seam: booking funnel vs booking entry (rcp-07 / rcp-08)

| Turn shape | Stage |
|---|---|
| In-flight `collecting_all` / `lastBotAskedForDetails` | `booking_funnel` |
| `isBookIntent && justStartingCollection` | `booking_entry` |
| `isBookIntent && inCollection` (non-`collecting_all` steps) | `booking_entry` (`booking_continue_ai`) |
| `isBookIntent && step === responded` | `booking_entry` (`book_responded`) |
| Channel pick reply | `booking_entry` |
| Everything else unclaimed | `ai_open_response` |

---

## Canonical sources of user-visible facts (single owner)

| Fact | Canonical producers | Notes |
|------|---------------------|--------|
| Consultation / booking **fee (₹)** | `formatConsultationFeesForDm` + `buildFeeQuoteDm`; `formatAppointmentFeeForAiContext` → `DoctorContext` | DM quote path is deterministic |
| **Booking page URL** | `buildBookingPageUrl` + `formatBookingLinkDm` | Never invent URL in model |
| **Reschedule URL** | `buildReschedulePageUrl` + reschedule formatters | cancel/reschedule stage |
| **Appointment date/status lines** | `formatAppointmentStatusLine` + DB reads | cancel/reschedule stage |
| **Practice name / hours / address** | `getDoctorContextFromSettings` → `buildResponseSystemPrompt` | From `doctor_settings` |

---

## Related

- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](./RECEPTIONIST_BOT_CONVERSATION_RULES.md)
- [Receptionist re-architecture program README](../../../Work/Daily-plans/May%202026/30-05-2026/receptionist-rearchitecture/README.md) — phase index (p0–p6)
- [EXECUTION-ORDER-p2-receptionist-stage-router.md](../../../Work/Daily-plans/May%202026/30-05-2026/receptionist-rearchitecture/p2-stage-router/Tasks/EXECUTION-ORDER-p2-receptionist-stage-router.md) — Phase 2 stage-router wave matrix
