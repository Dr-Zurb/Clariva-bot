# All Bot ↔ Patient DM Scenarios
> Exhaustive map of every interaction path. Each scenario describes the trigger,
> expected bot behaviour, and edge cases.

## Universal Rule — Language Mirroring
> The bot MUST reply in the same language the patient is using.
> If the patient writes in Hindi, reply in Hindi. Tamil → Tamil. English → English.
> This applies to **every** scenario below — greetings, fee tables, safety messages,
> booking collection, confirmations, everything. No hardcoded English-only templates.
> The LLM handles language detection and generation natively.

---

## 1 — Medical Query (non-emergency)

**Trigger:** Patient asks a health/symptom question ("I have a headache", "what should I take for fever?")

**Bot behaviour:**
- Detect `medical_query` intent.
- Reply with a **medical deflection**: "I'm not qualified to give medical advice — please consult a doctor."
- Nudge toward booking: "I can help you book a teleconsultation though."
- If the message also hints at a clinical reason ("my knee hurts, how much is a consultation?"), seed `reasonFirstTriagePhase: ask_more` so triage is already started.

**Edge cases:**
- Patient sends multiple medical questions in a row → deflection window prevents spamming the same disclaimer every message.
- Patient sends a medical query mid-booking (while providing details) → suppressed if `inCollection` is true, bot continues collection. This is correct — interrupting booking with a disclaimer is disruptive. The patient is already on the path to see a doctor.

---

## 2 — Emergency

**Trigger:** Patient describes an emergency ("I'm having chest pain", "someone is unconscious", "can't breathe")

**Bot behaviour:**
- Detect via `isEmergencyUserMessage` or intent `emergency`.
- Immediately reply with **emergency safety message**: "Please call 112 / go to the nearest ER."
- Clear all triage/ack state — everything resets.
- Do NOT attempt booking.

**Edge cases:**
- Emergency detected mid-booking → collection is abandoned, safety message fires.
- Patient stabilises and comes back ("I'm fine now, can I book?") → `booking_resume_after_emergency` path resumes with a teleconsult nudge, no repeat 112 unless a new crisis is described.
- False positive (e.g., "I had chest pain last year but I'm fine") → Acceptable trade-off: always fire safety message on emergency keywords. A false positive (safe patient sees 112 message once) is far less dangerous than a false negative (real emergency gets a fee quote). No change needed.

---

## 3 — Greeting / Small Talk

**Trigger:** Patient says "Hi", "Hello", "Hey there", "Namaste", "Vanakkam", etc.

**Bot behaviour:**
- Always use the LLM — no hardcoded greeting template.
- LLM generates a warm, contextual welcome in the **patient's language**.
- Mention available actions: book a consultation, check fees, check appointment status.

**Edge cases:**
- Greeting after an ongoing conversation (step ≠ `responded`) → only triggers if conversation is idle.
- Mixed-language greeting ("Hi, mujhe appointment chahiye") → bot mirrors the dominant language.

---

## 4 — Fee Inquiry (the reason-first triage path)

**Trigger:** Patient asks about price/cost ("how much is a consultation?", "what are your fees?")

**Bot behaviour (current, post-today's changes):**
1. **Don't show fees immediately.** Enter reason-first triage.
2. Ask: "To give you the right price, could you tell me your reason for visit?"
3. Patient provides reason(s). Bot asks: "Anything else you'd like to discuss?"
4. Patient says "no" / "that's it" → skip redundant confirm, go straight to fee display.
5. **Fee display (fee-inquiry context):** Show matched service with **full modality + price breakdown** (Text: ₹X, Voice: ₹Y, Video: ₹Z) since the patient is asking about price, not booking yet.
6. Set `activeFlow: 'fee_quote'`.

**Edge cases:**
- Patient wants the **full fee list** ("show me all your prices") → `userWantsExplicitFullFeeList` escapes triage, shows everything.
- Ambiguous service match → staff review gate; bot says "let me check with the clinic."
- Patient asks fee **mid-booking** (already collecting details) → `fee_deterministic_mid_collection` answers inline without abandoning collection.
- Patient says "yes" to "anything else?" → bot asks "what else would you like to add?" (bare "yes" is ambiguous).
- Patient keeps asking fee-like questions after fee was shown → `fee_follow_up_anaphora_idle` handles thread continuation without re-entering triage.

---

## 5 — Booking (direct request)

**Trigger:** Patient says "I want to book", "book an appointment", "schedule a visit"

**Bot behaviour:**
1. If reason-first triage hasn't happened and is configured → enter triage first (Scenario 4 path), then return here.
2. Collect patient details: name, phone, age/DOB, gender (via `collecting_all` step or granular steps depending on `getInitialCollectionStep`).
3. Confirm details → `confirm_details` step.
4. Patient match check → if potential duplicate, ask "Is this you?" with numbered options.
5. Consent flow (if required by doctor settings).
6. Generate booking link → send to patient.
7. **Modality is chosen on the booking page**, not in chat.
8. In the booking link message: "Pick your slot and complete payment here."
9. Step moves to `awaiting_slot_selection`.

**Edge cases:**
- Patient says "book" right after seeing fees with modality breakdown → bot says "please select your preferred consultation mode on the booking page" (no modality re-ask in chat).
- Patient provides all details in one message ("Book for John, 30M, 9876543210") → extraction handles it in a single turn.
- Required fields missing → bot asks only for what's missing.
- Patient says "do it video" / "text please" after fees → recognised as `book_appointment` intent (not another fee query); proceeds to booking.

---

## 6 — Fee → Booking Transition

**Trigger:** Patient saw fees (Scenario 4 complete), then says "okay book" / "let's go with video" / "do it"

**Bot behaviour:**
- `userExplicitlyWantsToBookNow` detects booking intent.
- Transition from `fee_quote` to booking collection (Scenario 5).
- If multiple modalities exist, tell patient: "You'll choose your consultation mode (text/voice/video) on the booking page."
- Show single price (or note the range) — don't repeat the full modality table.
- Start collecting details.

**Edge cases:**
- Patient picks a specific modality in chat ("I want video") → acknowledge but still let them confirm on booking page (source of truth is the page).
- Patient says "do it" without specifying modality → fine, modality selection is on the page anyway.

---

## 7 — Book for Someone Else

**Trigger:** Patient says "I want to book for my mother" / "book for someone else"

**Bot behaviour:**
- `book_for_someone_else` intent.
- `parseMultiPersonBooking` determines if it's one other person or multiple.
- Collection starts for the *other* person's details.
- Booking link generated for that person.

**Edge cases:**
- Patient tries to book for themselves AND someone else in the same conversation.
- Patient provides their own details instead of the other person's → bot should clarify.
- Multi-person booking (e.g., "book for my parents" = 2 people) → handled via multi-person flow.

---

## 8 — Check Appointment Status

**Trigger:** "What's my appointment status?", "when is my appointment?"

**Bot behaviour:**
- Look up upcoming appointments for matched patient(s).
- Show date, time, status, token number if applicable.
- If no appointments found → "You don't have any upcoming appointments."

**Edge cases:**
- Multiple upcoming appointments → list all.
- Patient has appointments under different phone numbers → DB merge of related patients.
- Patient asks while mid-booking → currently status check takes priority; booking context preserved.

---

## 9 — Cancel Appointment

**Trigger:** "Cancel my appointment", "I want to cancel"

**Bot behaviour:**
1. Look up upcoming appointments.
2. **0 appointments** → "You don't have any upcoming appointments to cancel."
3. **1 appointment** → "Do you want to cancel your appointment on [date]? (Yes/No)" → `awaiting_cancel_confirmation`.
4. **Multiple** → numbered list → `awaiting_cancel_choice` → pick → confirm → execute.

**Edge cases:**
- Patient says "cancel" mid-booking → intent detected, switches to cancel flow.
- Patient changes mind after confirming → cancellation is already a two-step flow (pick → confirm), so "actually never mind" at the confirm step is handled by the "No" path. If they say "never mind" after execution, the appointment is already cancelled — they can rebook. No extra undo needed.
- Patient wants to cancel a past appointment → should be filtered out (only upcoming shown).

---

## 10 — Reschedule Appointment

**Trigger:** "Can I reschedule?", "change my appointment date"

**Bot behaviour:**
1. Look up upcoming appointments (same as cancel).
2. Show choice if multiple.
3. Generate a reschedule link → patient picks new slot on the page.
4. Step → `awaiting_reschedule_slot`.

**Edge cases:**
- Patient says "reschedule" but has no appointments → "Nothing to reschedule."
- After getting reschedule link, patient sends unrelated message → handled by general branches (greeting, fee, etc.). No dedicated nudge needed — the link stays valid and the patient can use it anytime. Over-nudging feels pushy.

---

## 11 — Consent / Privacy

**Trigger:** Bot asks for consent as part of booking flow (if doctor settings require it).

**Bot behaviour:**
- Present consent text.
- Patient says "yes" / "I agree" → proceed to booking link.
- Patient says "no" / "I don't agree" → booking abandoned, bot acknowledges.

**Edge cases:**
- Patient ignores consent prompt and sends an unrelated message → bot should re-prompt or clarify.
- Consent with optional extras (e.g., marketing consent) → `consent_optional_extras` prompt kind.

---

## 12 — Revoke Consent / Data Deletion

**Trigger:** Patient says "delete my data", "revoke consent", "forget me"

**Bot behaviour:**
- `revoke_consent` intent → `handleRevocation`.
- Clears triage/fee ack state.
- Acknowledges data handling per privacy policy.

**Edge cases:**
- Patient revokes mid-booking → collection abandoned.
- Patient comes back after revocation and wants to book → fresh start, no previous data.

---

## 13 — Receptionist Paused (clinic-side)

**Trigger:** Doctor/clinic has paused the Instagram receptionist bot.

**Bot behaviour:**
- Any incoming DM gets a "the automated assistant is currently unavailable" type message.
- No further processing.

**Edge cases:**
- Patient was mid-booking when bot was paused → next message gets the paused notice. When bot resumes, stale conversation state is acceptable — the AI context window + `responded` reset on next interaction handles it gracefully. No need to force-clear state on pause.

---

## 14 — Patient Match / Duplicate Detection

**Trigger:** During booking, patient details match an existing record.

**Bot behaviour:**
- "We found a patient with similar details. Is this you?" with numbered options.
- Yes → use existing record, skip redundant collection.
- No → create new patient.
- Staff review variant if match is ambiguous.

**Edge cases:**
- Multiple possible matches → numbered list.
- Patient says "that's someone else" → new record created.
- Existing patient already has MRN (from previous payment) → MRN stays; new patient gets no MRN until payment.

---

## 15 — Staff/Service Review Gate

**Trigger:** Service matcher can't confidently match patient's reason to a catalogue service.

**Bot behaviour:**
- "Let me check with the clinic team to find the right service for you."
- Step → `awaiting_staff_service_confirmation`.
- Staff gets notified.
- Patient messages while waiting → "Still waiting for the clinic to confirm."

**Edge cases:**
- Learning policy autobook → if staff has approved a similar match before, bot auto-resolves without waiting.
- Staff doesn't respond within 30 minutes → bot notifies patient: "The clinic hasn't responded yet — we'll follow up." Also re-notifies staff. No indefinite wait.

---

## 16 — Post-Booking / Awaiting Slot Selection

**Trigger:** Booking link has been sent, patient hasn't completed payment yet.

**Bot behaviour:**
- If patient sends a short acknowledgement ("thanks", "ok") → brief closing line.
- If patient sends a new intent (fee, cancel, reschedule, emergency) → handled by that scenario.
- Second booking leg (e.g., "book for someone else too") → handled.
- New link request → re-sent.

**Edge cases:**
- Patient completes payment → webhook fires, MRN assigned (Scenario 17), confirmation DM sent.
- Patient never completes payment → send **one** reminder DM ~1 hour after the link was sent: "Just checking in — your booking link is still active if you'd like to complete it." No further reminders after that.

---

## 17 — Payment Completed (webhook-driven, not patient-initiated)

**Trigger:** Stripe/payment webhook confirms successful payment.

**Bot behaviour:**
- `assignMrnAfterPayment` → patient gets P-xxxxx MRN assigned.
- Confirmation DM: "Payment received. Your appointment on [date] is confirmed. Your patient ID: P-xxxxx. Save this for future bookings."
- Reminder scheduled.

**Edge cases:**
- Patient already had MRN (returning patient) → existing MRN returned, not reassigned.
- Payment webhook arrives but appointment not found → error logged, no DM sent.
- Double webhook (duplicate payment event) → idempotent; MRN check prevents double-assign.

---

## 18 — Throttle / Rate Limiting

**Trigger:** Patient sends too many messages in a short window.

**Bot behaviour:**
- DM throttle fires → message is recorded in state but no reply DM is sent that turn.
- Next non-throttled message gets a normal reply.

**Edge cases:**
- Patient sends 10 messages rapidly → only some get replies. Send a brief "I see your messages — give me a moment" on the **first** throttled turn so the patient knows the bot isn't ignoring them. Subsequent throttled turns within the same burst stay silent.

---

## 19 — Conflict Recovery (concurrent messages)

**Trigger:** Two messages arrive simultaneously, causing a database conflict on conversation state.

**Bot behaviour:**
- Catch `ConflictError`.
- Re-classify intent on the latest message.
- Generate AI response with fresh context.
- Log as `conflict_recovery_ai`.

**Edge cases:**
- Very rapid back-to-back messages → lock not acquired → thrown for retry by the queue.

---

## 20 — Unrecognised / Open-ended Message

**Trigger:** No specific intent detected, no active flow, no step-based handler matches.

**Bot behaviour:**
- Falls through to `ai_open_response`.
- LLM generates a contextual reply based on conversation history.
- Typically nudges toward available actions (book, check fees, check status).

**Edge cases:**
- Patient sends gibberish → AI gives a polite "I didn't understand, here's what I can help with."

---

## 21 — Non-text Messages (images, stickers, shares, reactions, reel shares)

**Trigger:** Patient sends a photo, sticker, story reply, shared post, reel share, or reaction (❤️, 👍, etc.).

**Bot behaviour:**
- Any non-text input → reply: "I can only process text messages right now. Please type your request and I'll help you."
- This applies uniformly: images, stickers, reactions, reel shares — all get the same polite reply. No silent ignores.
- Story replies that contain text → extract and process the text portion normally; the "text only" reply is not sent.

**Future consideration:**
- Photo of a prescription/report → could be useful for clinical context (image-to-text) in a later phase.

---

## 22 — Language Mirroring (universal policy, not a separate scenario)

**Policy:** Bot always responds in the patient's language — see Universal Rule at the top.

**Implementation notes:**
- All LLM-routed paths already support this natively (the model mirrors language).
- Any hardcoded templates (greeting, safety, consent, confirmation) must be replaced with LLM-generated text or have multi-language variants.
- Structured data (fee tables, appointment details, booking links) can stay in English where values are numeric/URLs, but surrounding copy must be in the patient's language.
- Edge: patient switches language mid-conversation → bot follows the switch on the next reply.

---

# Flow Diagram (simplified)

```
Patient DM arrives
  │
  ├─ Blank / self-message → ignore
  ├─ Bot paused → "unavailable" message
  ├─ Revoke consent → handle + clear state
  │
  ├─ Active step?
  │   ├─ cancel choice/confirm → cancel flow (9)
  │   ├─ reschedule choice → reschedule flow (10)
  │   ├─ staff review pending → "still waiting" (15)
  │   ├─ match confirmation → patient match (14)
  │   ├─ consent → consent flow (11)
  │   ├─ confirm details → confirm flow (5.3)
  │   ├─ collecting → booking collection (5.2)
  │   └─ awaiting slot → post-booking (16)
  │
  ├─ Emergency? → safety message (2)
  ├─ Post-emergency resume? → booking resume (2b)
  ├─ Medical query? → deflection + triage seed (1)
  │
  ├─ Consultation channel pick? → channel flow (5/4)
  ├─ Reason-first triage active? → triage sub-flows (4)
  │
  ├─ Fee/pricing signal?
  │   ├─ Mid-collection → inline fee (4e)
  │   ├─ Idle + should defer → reason-first triage (4)
  │   └─ Idle + no defer → fee display (4)
  │
  ├─ Non-text message? → "text only" reply (21)
  ├─ Greeting? → LLM greeting in patient's language (3)
  ├─ Check status? → appointment status (8)
  ├─ Cancel? → cancel flow (9)
  ├─ Reschedule? → reschedule flow (10)
  ├─ Book for someone else? → multi-person (7)
  ├─ Book appointment?
  │   ├─ Should defer to triage → reason-first (4→5)
  │   ├─ Already in collection → continue (5)
  │   └─ New → start collection (5)
  │
  └─ None matched → AI open response (20)
```

---

# Decisions on Previously Identified Gaps

| # | Gap | Decision |
|---|-----|----------|
| G1 | Abandoned booking reminder | **Do it.** Send a single reminder DM ~1 hour after link sent if payment not received. No spam — one reminder only. |
| G2 | "Please wait" on throttled turns | **Do it.** One acknowledgement on the first throttled message in a burst. |
| G3 | Image/media acknowledgement | **Do it.** Reply "I can only process text messages right now." See Scenario 21. |
| G4 | Staff review timeout | **Do it.** Auto-escalate or notify patient after 30 min of no staff response: "The clinic hasn't responded yet — we'll follow up." |
| G5 | Multi-language greetings | **Resolved.** No hardcoded templates. LLM handles all languages. See Universal Rule. |
| G6 | Emergency false positive | **Won't fix.** False positives are safe; false negatives are dangerous. Current behaviour is correct. |
| G7 | Reschedule slot nudge | **Won't fix.** Link stays valid. No need to nag. |
| G8 | Clear state on bot pause | **Won't fix.** Stale state is handled gracefully on resume. |
| G9 | Reaction acknowledgement | **Merged with G3.** Reactions get the same "text only" reply as images/stickers. No silent ignores. |
| G10 | Corrections after consent | **Do it.** If patient says "wait, my name is wrong" after consent/confirm, re-enter `confirm_details` with the correction rather than forcing a full restart. |

# Implementation Priority (from the "Do it" items)

| Priority | Item | Effort |
|----------|------|--------|
| 1 | G5 — Remove hardcoded English templates, route greetings through LLM | Small |
| 2 | G3 — Non-text message acknowledgement | Small |
| 3 | G10 — Post-consent corrections without full restart | Medium |
| 4 | G4 — Staff review timeout (30 min) | Medium |
| 5 | G1 — Abandoned booking reminder (1 hour) | Medium |
| 6 | G2 — Throttle acknowledgement | Small |
