# Scenario Alignment Plan — Code vs Spec Audit
> Generated 2026-04-14 from exhaustive code audit against
> `docs/Reference/all bot patient scenarios`.

---

## Status Summary

| # | Scenario | Status | Key Issue |
|---|----------|--------|-----------|
| 1 | Medical Query | PARTIALLY_MATCHES | No repeat-deflection cooldown; limited locale coverage |
| 2 | Emergency | PARTIALLY_MATCHES | Resume hint English-only; `lastMedicalDeflectionAt` not cleared |
| 3 | Greeting | **VIOLATES_SPEC** | Hardcoded English template; LLM bypassed |
| 4 | Fee Inquiry | **VIOLATES_SPEC** | Fee table always collapsed (no modality breakdown for fee inquiry) |
| 5 | Booking | PARTIALLY_MATCHES | Modality still set in chat via `consultation_channel_pick` |
| 6 | Fee → Booking | PARTIALLY_MATCHES | No dedicated "single price + pick modality on page" transition message |
| 7 | Book for Others | PARTIALLY_MATCHES | English-only strings; limited multi-person parsing |
| 8 | Status Check | PARTIALLY_MATCHES | Shows only next appointment, not all; no token number |
| 9 | Cancel | PARTIALLY_MATCHES | Hardcoded English; minor wording mismatches |
| 10 | Reschedule | PARTIALLY_MATCHES | Hardcoded English |
| 11 | Consent | PARTIALLY_MATCHES | `unclear` → proceeds instead of re-prompting |
| 12 | Revoke | MATCHES_SPEC | English-only strings (language issue only) |
| 13 | Paused | PARTIALLY_MATCHES | English-only pause message |
| 14 | Patient Match | PARTIALLY_MATCHES | Duplicate check only on book-for-others, not self-book |
| 15 | Staff Review | **VIOLATES_SPEC** | 30-min timeout NOT coded (stub/no-op) |
| 16 | Post-Booking | **VIOLATES_SPEC** | 1-hour abandoned booking reminder NOT coded |
| 17 | Payment | MATCHES_SPEC | Works correctly |
| 18 | Throttle | **VIOLATES_SPEC** | No "please wait" on first throttled turn |
| 19 | Conflict Recovery | PARTIALLY_MATCHES | Works but throttle skip applies here too |
| 20 | Unrecognised | PARTIALLY_MATCHES | Works; fallback is English-only |
| 21 | Non-text Messages | **VIOLATES_SPEC** | Silent ignore; no "text only" reply |
| 22 | Language Mirroring | **VIOLATES_SPEC** | 40+ hardcoded English strings across the codebase |

---

## Change Categories

### A — SPEC VIOLATIONS (must fix)

These are scenarios where the code directly contradicts the agreed spec.

---

### A1. Remove hardcoded greeting template → route through LLM
**Scenario:** 3 (Greeting)
**Current code:** `instagram-dm-webhook-handler.ts` ~1991–2007 — `greeting_template` branch with hardcoded English string and `greetingFastPath = true`. Also `ai-service.ts` ~1245–1246 — `isSimpleGreeting` bypasses LLM entirely.
**What to change:**
- Remove/disable the `greeting_template` branch and `greetingFastPath`.
- Route greeting intent through `generateResponse` (same as `ai_open_response`).
- System prompt already instructs language mirroring; LLM will handle any language.
- Remove `isSimpleGreeting` short-circuit in classifier (or keep for speed but still call LLM for the response).
**Effort:** Small
**Files:** `instagram-dm-webhook-handler.ts`, `ai-service.ts`

---

### A2. Context-aware fee display (modality breakdown for fee inquiry, collapsed for booking)
**Scenario:** 4 (Fee Inquiry), 6 (Fee → Booking)
**Current code:** `consultation-fees.ts` ~754–778 — `buildServiceCatalogFeeDmResultFromPick` always collapses to min–max range. No `showModalityBreakdown` flag exists.
**What to change:**
- Add a `showModalityBreakdown: boolean` parameter to `buildServiceCatalogFeeDmResultFromPick`.
- When `true` (fee inquiry paths): render per-modality lines — `**Text**: ₹X`, `**Voice**: ₹Y`, `**Video**: ₹Z`.
- When `false` (booking paths, fee→booking transition): keep current collapsed single price/range.
- Callers to update:
  - `composeIdleFeeQuoteDmWithMetaAsync` / idle fee → `true`
  - Reason-first fee narrow → `true`
  - Fee follow-up anaphora → `true`
  - Mid-collection fee → `true`
  - Booking paths → `false`
- `clinicalLedFeeThread` can coexist (it controls row selection, not formatting).
**Effort:** Medium
**Files:** `consultation-fees.ts`, `dm-reply-composer.ts`, `instagram-dm-webhook-handler.ts`

---

### A3. Non-text message acknowledgement
**Scenario:** 21 (Non-text Messages)
**Current code:** `instagram-dm-webhook-handler.ts` ~1038–1098 — non-parsable/blank messages silently ignored. `parseInstagramMessage` only reads `message.text`.
**What to change:**
- In `parseInstagramMessage`, detect when a webhook payload has `message.attachments` (or is a reaction/sticker) but no text.
- Return a new parse result type (e.g. `{ type: 'non_text', senderId, ... }`).
- Before the blank-message early return, add a branch: if non-text detected AND we have sender + page + token → send "I can only process text messages right now. Please type your request and I'll help you." via Instagram DM.
- Story replies with text: ensure `message.reply_to.story` payloads still extract text and process normally.
- Reactions (`message.reaction`): same "text only" reply.
**Effort:** Small–Medium
**Files:** `instagram-dm-webhook-handler.ts`, `webhook-controller.ts` (reconsider `message_edit`-only skip)

---

### A4. Staff review 30-minute timeout
**Scenario:** 15 (Staff Review Gate)
**Current code:** `service-staff-review-service.ts` ~698–712 — `runStaffReviewTimeoutJob` is a **stub** (returns zeros). `sla_deadline_at` is always `null`. Migration 042 explicitly says no auto-timeout.
**What to change:**
- Set `sla_deadline_at = now() + 30 min` when creating a staff review request.
- Implement `runStaffReviewTimeoutJob` to:
  1. Query pending reviews past their `sla_deadline_at`.
  2. For each: send patient DM "The clinic hasn't responded yet — we'll follow up."
  3. Re-notify staff (email/push/dashboard alert).
  4. Mark review as `sla_breached` (not auto-resolved — staff still needs to act).
- Wire cron to call this every 5 minutes.
**Effort:** Medium
**Files:** `service-staff-review-service.ts`, `cron.ts`, `notification-service.ts`, staff review migration

---

### A5. Abandoned booking reminder (1 hour)
**Scenario:** 16 (Post-Booking / Awaiting Slot Selection)
**Current code:** No implementation exists. Token TTL is 1 hour but that's unrelated.
**What to change:**
- Track `booking_link_sent_at` in conversation state or a separate table.
- New cron job: find conversations where `step = 'awaiting_slot_selection'` AND `booking_link_sent_at < now() - 1 hour` AND no payment received AND reminder not already sent.
- Send one DM: "Just checking in — your booking link is still active if you'd like to complete it."
- Mark reminder sent to prevent repeats.
**Effort:** Medium
**Files:** New cron handler, `instagram-dm-webhook-handler.ts` (track timestamp), `notification-service.ts`, conversation state type

---

### A6. Throttle "please wait" acknowledgement
**Scenario:** 18 (Throttle)
**Current code:** `webhook-dm-send.ts` ~46–141 — throttle skip sends nothing.
**What to change:**
- On first throttle skip in a burst: send a short DM "I see your messages — give me a moment" using a **separate send path** that doesn't consume the reply throttle.
- Use a Redis key like `throttle_ack:{pageId}:{senderId}` with a short TTL (e.g. 60s) so only **one** ack per burst.
- Subsequent throttle skips within the TTL window → silent (current behavior).
**Effort:** Small
**Files:** `webhook-dm-send.ts`, `instagram-dm-webhook-handler.ts`, `queue.ts` (new Redis key)

---

### A7. Language mirroring — replace hardcoded English strings
**Scenario:** 22 (Language Mirroring) — affects ALL scenarios
**Current code:** 40+ hardcoded English strings across the codebase (full inventory below).
**What to change:**
Two-phase approach:
1. **Phase 1 (LLM route):** For all deterministic template paths, replace the hardcoded string with an LLM call that generates the equivalent message in the patient's language. The system prompt already instructs mirroring. This is the simplest approach and cost is not a concern.
2. **Phase 2 (optimize later):** If any hot path needs to avoid LLM latency, add i18n templates for supported locales (en/hi/pa/ta at minimum).

**Hardcoded English strings inventory:**

| File | Line(s) | String / context |
|------|---------|-----------------|
| `instagram-dm-webhook-handler.ts` | 181 | `FALLBACK_REPLY` — "Thanks for your message..." |
| `instagram-dm-webhook-handler.ts` | 325–326 | `DEFAULT_INSTAGRAM_RECEPTIONIST_PAUSE_MESSAGE` |
| `instagram-dm-webhook-handler.ts` | 1402 | Cancel — "That appointment wasn't found..." |
| `instagram-dm-webhook-handler.ts` | 1410 | Cancel confirm — "Cancel appointment on ... Yes or No" |
| `instagram-dm-webhook-handler.ts` | 1421, 1516 | "Please reply 1, 2, or..." |
| `instagram-dm-webhook-handler.ts` | 1486 | "Please reply Yes to cancel..." |
| `instagram-dm-webhook-handler.ts` | 1501 | Reschedule not-found |
| `instagram-dm-webhook-handler.ts` | 1555–1556 | Teleconsult-only channel message |
| `instagram-dm-webhook-handler.ts` | 2000 | Greeting template (covered by A1) |
| `instagram-dm-webhook-handler.ts` | 2033–2034 | "You don't have any upcoming appointments..." |
| `instagram-dm-webhook-handler.ts` | 2040, 2044, 2048 | Status strings |
| `instagram-dm-webhook-handler.ts` | 2067, 2110 | No upcoming appointments (cancel/reschedule) |
| `instagram-dm-webhook-handler.ts` | 2074, 2089, 2131 | Cancel/reschedule prompts |
| `instagram-dm-webhook-handler.ts` | 2166, 2196 | Book for someone else prompts |
| `instagram-dm-webhook-handler.ts` | 2299–2300 | Match clarification |
| `instagram-dm-webhook-handler.ts` | 2548 | "Got it, just your ${relation}..." |
| `instagram-dm-webhook-handler.ts` | 2607–2612 | Collection fallback "Still need:" |
| `instagram-dm-webhook-handler.ts` | 2684, 2687 | Patient match prompts |
| `instagram-dm-webhook-handler.ts` | 2708, 2733, 2735 | Consent prompts |
| `instagram-dm-webhook-handler.ts` | 2787 | Post-booking acknowledgment |
| `instagram-dm-webhook-handler.ts` | 2964 | Book-for-relation prompt |
| `instagram-dm-webhook-handler.ts` | 3135–3138 | Booking start prompts |
| `ai-service.ts` | 433–435 | `FALLBACK_RESPONSE` |
| `booking-link-copy.ts` | 12–22, 33–62 | All booking/reschedule link copy |
| `safety-messages.ts` | 10–14 | EN defaults for medical + emergency |
| `reason-first-triage.ts` | 397–441, 559–666 | English bridge/confirm/ask-more templates |
| `staff-service-review-dm.ts` | 34–48 | Staff review DM copy |
| `consent-service.ts` | 128–129, 147–178 | Consent deny + revoke copy |
| `action-executor-service.ts` | 129–131, 140–141, 167–183 | Cancel confirmation copy |
| `notification-service.ts` | 177–180 | Payment confirmation DM |
| `post-medical-ack-copy.ts` | 7–10 | Post-medical fee ack |
| `dm-reply-composer.ts` | 109–149 | Fee CTA segments |
| `consultation-fees.ts` | 1183–1200 | `formatFeeBookingCtaForDm` |

**Effort:** Large (many files, many strings — but each change is small)
**Approach:** Tackle file-by-file, starting with the highest-traffic paths.

---

### B — PARTIAL MATCHES (should fix)

These scenarios mostly work but have gaps or edge cases that don't match spec.

---

### B1. Emergency: clear `lastMedicalDeflectionAt` + localize resume hint
**Scenario:** 2
**What to change:**
- In emergency branch, also clear `lastMedicalDeflectionAt` in state update.
- Replace English `resumeHint` string (~1841) with an LLM-generated hint (part of A7).
**Effort:** Small
**Files:** `instagram-dm-webhook-handler.ts`

---

### B2. Modality should NOT be set in chat
**Scenario:** 5 (Booking)
**Current code:** `consultation_channel_pick` branch ~1564–1596 sets `consultationModality` from user's text pick.
**What to change:**
- When the doctor is teleconsult-only and has multiple modalities, don't persist `consultationModality` from chat. The booking page is the source of truth.
- The channel pick branch should acknowledge the preference ("Got it, you can confirm your choice on the booking page") but NOT set `consultationModality`.
- If only one modality exists, it can be auto-set (no conflict).
**Effort:** Small
**Files:** `instagram-dm-webhook-handler.ts`

---

### B3. Fee → Booking: explicit transition message
**Scenario:** 6
**What to change:**
- When transitioning from `fee_quote` to booking: send a specific message: "Great, let's book. You'll choose your consultation mode on the booking page."
- Ensure `userExplicitlyWantsToBookNow` covers "okay book" / "let's go" (currently may not match those via regex — falls back to LLM intent which is fine, but regex coverage would be more reliable).
**Effort:** Small
**Files:** `consultation-fees.ts`, `instagram-dm-webhook-handler.ts`

---

### B4. Consent: re-prompt on unclear instead of proceeding
**Scenario:** 11
**Current code:** `unclear` consent result proceeds to slot link (same as `granted`).
**What to change:**
- When consent result is `unclear`, re-send consent prompt instead of proceeding.
- Keep step as `consent`.
**Effort:** Small
**Files:** `instagram-dm-webhook-handler.ts` ~2318–2320

---

### B5. Patient match: also check for self-booking duplicates
**Scenario:** 14
**Current code:** `findPossiblePatientMatches` only called in `confirm_details` when `bookingForSomeoneElse = true`.
**What to change:**
- Also run duplicate check for self-booking at `confirm_details`.
- If matches found, present same "Is this you?" flow before creating a new patient.
**Effort:** Medium
**Files:** `instagram-dm-webhook-handler.ts`

---

### B6. Status check: show all appointments + token number
**Scenario:** 8
**Current code:** Only shows next appointment; no token/queue number.
**What to change:**
- Show all upcoming appointments (loop through list, not just first).
- Join with `opd_queue` / token data if available.
- Use `Intl.DateTimeFormat` with patient's locale (detect from conversation), not hardcoded `en-US`.
**Effort:** Medium
**Files:** `instagram-dm-webhook-handler.ts`, `webhook-appointment-helpers.ts`

---

### B7. Post-consent corrections without full restart
**Scenario:** Gap G10
**Current code:** No mechanism to go back from consent to `confirm_details`.
**What to change:**
- If patient says something like "wait, my name is wrong" or "that's not right" during consent step, detect correction intent and re-enter `confirm_details` with the corrected field.
- Add a small regex/LLM check before the consent yes/no classifier.
**Effort:** Medium
**Files:** `instagram-dm-webhook-handler.ts`, `ai-service.ts`

---

### C — MATCHES SPEC (no changes needed)

| # | Scenario | Notes |
|---|----------|-------|
| 12 | Revoke Consent | Works correctly (language strings covered by A7) |
| 17 | Payment | `assignMrnAfterPayment` + idempotent + confirmation DM all correct |
| 19 | Conflict Recovery | Re-classify + AI response works (throttle issue covered by A6) |
| 20 | Unrecognised | `ai_open_response` fallthrough works (fallback string covered by A7) |

---

## Implementation Order (recommended)

### Sprint 1 — High-impact, smaller effort
| # | Change | Effort | Impact |
|---|--------|--------|--------|
| A1 | Greeting → LLM (remove hardcoded template) | Small | High — first thing patients see |
| A3 | Non-text "text only" reply | Small | High — currently silent/rude |
| B2 | Don't set modality in chat | Small | High — core booking UX |
| B4 | Consent: re-prompt on unclear | Small | Medium — prevents wrong advances |
| A6 | Throttle "please wait" | Small | Medium — patient experience |
| B1 | Emergency: clear deflection state + localize hint | Small | Low — edge case |

### Sprint 2 — Medium effort, high value
| # | Change | Effort | Impact |
|---|--------|--------|--------|
| A2 | Context-aware fee display (modality breakdown flag) | Medium | High — core fee UX |
| B3 | Fee → Booking transition message | Small | Medium — cleaner UX |
| B5 | Self-booking duplicate check | Medium | Medium — data quality |
| B6 | Status: show all appointments + token | Medium | Medium — patient info |

### Sprint 3 — New features
| # | Change | Effort | Impact |
|---|--------|--------|--------|
| A4 | Staff review 30-min timeout | Medium | High — patients stuck indefinitely |
| A5 | Abandoned booking reminder (1 hour) | Medium | High — conversion |
| B7 | Post-consent corrections | Medium | Medium — UX |

### Sprint 4 — Language mirroring (cross-cutting)
| # | Change | Effort | Impact |
|---|--------|--------|--------|
| A7 | Replace all hardcoded English strings | Large | High — universal rule |

> **Note on A7:** This can be done incrementally alongside Sprints 1–3.
> Each time you touch a file for another change, also replace the hardcoded
> English strings in that file with LLM-routed text. By the end of Sprint 3,
> most high-traffic paths will be covered. Sprint 4 mops up the rest.

---

## Files Most Affected

| File | Changes touching it |
|------|-------------------|
| `instagram-dm-webhook-handler.ts` | A1, A2, A3, A6, A7, B1, B2, B3, B4, B5, B6, B7 |
| `consultation-fees.ts` | A2, B3 |
| `ai-service.ts` | A1, A7, B7 |
| `webhook-dm-send.ts` | A6 |
| `service-staff-review-service.ts` | A4 |
| `notification-service.ts` | A4, A5, A7 |
| `booking-link-copy.ts` | A7 |
| `safety-messages.ts` | A7 |
| `reason-first-triage.ts` | A7 |
| `consent-service.ts` | A7 |
| `action-executor-service.ts` | A7 |
| `webhook-appointment-helpers.ts` | B6 |
| `cron.ts` | A4, A5 |
| `conversation.ts` (types) | A5 |
| `dm-reply-composer.ts` | A2, A7 |

---

## Testing Strategy

- **Unit tests:** Update `consultation-fees.test.ts` for A2 (modality breakdown flag).
- **Golden corpus:** Re-run after A1 (greeting change may shift golden responses).
- **Integration test:** Staff review timeout (A4) needs a time-mocked test.
- **Manual DM test:** Non-text messages (A3), throttle ack (A6), language mirroring (A7).
- **Type check:** `tsc --noEmit` after every change.
