# DM routing misroute playbook (support / on-call)

**Purpose:** When users report confusing replies in Instagram DM, use `instagram_dm_routing` logs (`branch` field) to narrow the cause. **Never paste patient message text** into public tickets; use correlation ID + branch only.

## Quick map: user sees X → check branch

| User perception | Likely `branch` values | What to check |
|-----------------|------------------------|---------------|
| “I only asked about money but it kept asking more questions” | `reason_first_triage_ask_more`, `reason_first_triage_confirm`, `reason_first_triage_ask_more_payment_bridge` | Clinical-led thread: reason-first triage defers full fee list until reasons are consolidated. Expected by policy. |
| “It said it can’t diagnose, then nothing about fees” | `medical_safety` then later `unknown` or other | Confirm a later turn actually asked fees; check `post_medical_payment_existence_ack` on vague pay-existence after deflection. |
| “It gave a big menu of prices when I had several symptoms” | `fee_deterministic_idle`, `fee_ambiguous_visit_type_staff` | Ambiguous visit type should route to **staff** (`fee_ambiguous_visit_type_staff`), not patient tier-picking. Escalate if patient saw competing fee tiers. |
| “Short reply after fee line didn’t work” | Not `fee_follow_up_anaphora_idle` / not `reason_first_triage_fee_narrow` | Check prior bot line contained fee/pricing cue; check classifier `fee_thread_continuation` + confidence in audit metadata if enabled. |
| “Booking started when I only asked price” | `booking_start_ai` vs `fee_book_misclassified_idle` | Misclassified `book_appointment` + fee shape should hit fee idle paths; file bug with intent + branch sequence. |

## Log fields (no PHI)

- `branch` — `DmHandlerBranch` (see `backend/src/types/dm-instrumentation.ts`)
- `intent`, `intent_topics`, `is_fee_question`
- `state_step_before`, `state_step_after`
- `correlationId`, `conversationId`, `doctorId`

## Escalation

- Persistently high `unknown` for a doctor after a deploy → engineering + routing regression corpus (`backend/tests/fixtures/dm-routing-golden/`).
- Suspected **wrong rupee amount** → billing / doctor settings, not routing (composer uses DB catalog only).

**Review cadence:** Weekly 30 min — sample routing mix per [OBSERVABILITY.md](../../../../docs/Reference/OBSERVABILITY.md) (DM routing section). **Owner:** team on-call rotation or product ops lead (set in your roster).
