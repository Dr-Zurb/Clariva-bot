# Plan — Multi-modality consultations (text + voice on top of existing video)

## 19 April 2026

> **Status: DRAFT — living document.** Sections marked _(open)_ are decisions still being discussed; sections marked _(locked)_ are settled.
>
> **Update protocol:** as decisions are made in chat, move bullets from _(open)_ → _(locked)_, append rationale to **Decision log**, and timestamp the change. Do **not** delete original _(open)_ wording — strike it through so the trail is preserved for future-us.
>
> **🎯 ALL PRODUCT DECISIONS LOCKED (2026-04-19).** No open decisions remaining. Plan is ready for task breakdown and sequencing.
>
> **Locked decisions:** Decision 1 (text surface = IG DM ping + branded Supabase-Realtime web chat), Decision 2 (voice = WebRTC-only via Twilio Video audio mode, no PSTN in v1), Decision 3 (resolved-by-Decision-2 — no PSTN flow style needed), Decision 4 (recording-on-by-default global doctrine: no global doctor opt-out, per-session pause/resume with audit + reason + patient-visible indicator, patient consent at booking with soft re-pitch on decline, 90-day patient self-serve TTL, mutual access notifications, indefinite for regulatory retention + doctor dashboard), Decision 5 (text consults = live-only sync for v1, messaging-mode async deferred to v2+ as additive `mode` column on `consultation_sessions`), Decision 6 (AI clinical assist deferred until delivery layer is solid), Decision 7 (all three modality launchers on the appointment detail page), Decision 8 (one `consultation_sessions` table for all three modalities, modality enum + generic provider + provider_session_id, adapters carry provider knowledge, downstream is modality-blind), Decision 9 (companion text channel always-on for voice + video, auto-opened, attachments live as `consultation_messages` rows, chat is a free affordance with no extra billing), Decision 10 (video recording = audio-only by default during video consults; full-video = doctor-initiated escalation with reason capture + just-in-time patient consent modal + 60s timeout = decline; patient self-serve video replay allowed with audio-only-default player + "Show video" toggle + warning + light SMS OTP on first video replay per 30 days; mutual notifications differentiate audio vs video access), **Decision 11 (mid-consult modality switching — all 6 transitions in v1; symmetric "initiator absorbs the cost" billing doctrine: patient-initiated upgrades pay-after-approval with doctor paid/free choice default paid, doctor-initiated upgrades always free, patient-initiated downgrades no refund, doctor-initiated downgrades always auto-refund difference; max 1 upgrade + 1 downgrade per consult; full delta regardless of timing within slot)**, Decision 12 (voice recording inherits Decision 4 — no fork), text-chat-history sub-decision (both parties indefinite read access, patient via post-consult DM link to read-only `<TextConsultRoom>`, transcript PDF export), notification fan-out for clinical urgent moments, WhatsApp deferred indefinitely, **product principle: "code global, start India"**, voice booking copy must say "link, not phone call". See **Decision log** for full rationale and timestamps.

---

## Goal

Today the catalog already supports `text | voice | video` per-service in `serviceModalitiesSchema`, the matcher already emits `suggestedModality`, and **video is fully shipped end-to-end** on Twilio Programmable Video (`consultation-room-service.ts` + `consultation-verification-service.ts` + `<VideoRoom>`). What is missing is the **delivery layer** for the other two modalities — when an appointment with `consultation_type === 'text'` or `'voice'` arrives at its slot time, no infrastructure connects doctor and patient.

This plan ships **text** (Supabase Realtime branded web chat — Decision 1) and **voice** (Twilio Video audio-only WebRTC — Decision 2) consults. Both reuse infrastructure already in stack: text rides Supabase patterns from `prescription_attachments`, voice rides the existing Twilio Video + auth + webhook stack from `consultation-room-service.ts`. After delivery is solid, an **AI clinical assist pipeline** (pre-consult brief, post-consult SOAP + Rx draft) bolts onto all three modalities — Phase D, deferred per Decision 6.

Architecture is **global-day-one capable** per Principle 2 — every modality delivers via signed link, no per-country phone numbers, no per-country telco KYC. India is the first market for ops-easy reasons; a doctor anywhere on Earth can sign up tomorrow and use the same flow.

---

## Why this matters now

- **Revenue lift on existing bookings:** the catalog already advertises text + voice with prices; we just don't deliver them. Closing this loop converts existing complete bookings into actual consultations.
- **AI-first differentiator:** without the AI clinical assist layer (Phase D), we ship "another telemedicine app". With it, the bot's "AI receptionist + AI clinical assistant" story becomes felt by doctors on day one.
- **Global-day-one posture (Principle 2 — "code global, start India"):** every modality is delivered via a one-time signed link the patient taps from any browser, anywhere on Earth. No per-country phone-number provisioning, no per-country telco KYC, no per-country carrier rates. India is the first market because operationally it's the easiest path (existing IG-DM patient surface, Razorpay, DPDP-compliant Supabase Mumbai region, existing doctor cohort), but a doctor in São Paulo can sign up tomorrow and run the same consult flow without any infra change. Voice via WebRTC (Decision 2) is the keystone enabling this.
- **Two-pillar tech posture:** Twilio (Video + SMS — and Video doubles as audio-only voice) plus Supabase (Postgres + Realtime + Storage). New providers require explicit Decision-log justification.

---

## What's already in place (audit — 19 April 2026)

| Layer | Status | Location |
|---|---|---|
| Per-service modality schema (`text | voice | video` × `enabled` × `price_minor` × per-modality `followup_policy`) | ✅ shipped | `backend/src/utils/service-catalog-schema.ts` — `serviceModalitiesSchema`, `modalitySlotSchema` |
| `appointments.consultation_type` DB column (`'text' \| 'voice' \| 'video' \| 'in_clinic'`) | ✅ shipped | `backend/src/types/database.ts:115` |
| Booking flow modality selection + DM channel parser | ✅ shipped | `backend/src/utils/dm-consultation-channel.ts`, `backend/src/types/conversation.ts:190` (`consultationModality`) |
| Doctor-settings free-form `consultation_types` → booleans | ✅ shipped | `backend/src/utils/consultation-types.ts` (`deriveAllowedModalitiesFromConsultationTypes`) |
| Patient-facing modality labels (text/voice/video/in_clinic → "Text consult" etc.) | ✅ shipped | `backend/src/utils/dm-copy.ts` — `appointmentConsultationTypeToLabel` |
| Matcher returns `suggestedModality` | ✅ shipped | `backend/src/services/service-catalog-matcher.ts` |
| Payment flow carries `quoteMetadata.modality` into Razorpay notes | ✅ shipped | `backend/src/services/payment-service.ts:51` |
| **Twilio Video room creation** | ✅ shipped | `backend/src/services/consultation-room-service.ts` — `createTwilioRoom`, `generateVideoAccessToken`, `isTwilioVideoConfigured` |
| **Twilio Video webhooks (participant connect / disconnect / room ended)** | ✅ shipped | `backend/src/services/consultation-verification-service.ts` — `handleParticipantConnected/Disconnected/RoomEnded`, `tryMarkVerified`, `handleTwilioStatusCallback` |
| **Doctor + patient join routes** | ✅ shipped | `backend/src/routes/api/v1/consultation.ts` — `POST /consultation/start`, `GET /consultation/token` |
| **Frontend video room UI** | ✅ shipped | `frontend/components/consultation/VideoRoom.tsx` (visible in user-supplied screenshot — doctor + patient tiles, leave-call, patient join link) |
| Prescription CRUD (medicines, attachments, ownership-checked) | ✅ shipped | `backend/src/services/prescription-service.ts`, `prescription-attachment-service.ts`, `controllers/prescription-controller.ts` |
| Reminder cron pattern (e.g. abandoned-booking) | ✅ shipped, reusable | `backend/src/services/abandoned-booking-reminder.ts` |

**Conclusion of audit:** the configuration, booking, payment, and video-delivery paths are all production-ready. Voice and text are pure greenfield. The same Twilio account, the same webhook controller, and the same `tryMarkVerified` participant-join lifecycle can be extended to cover them — no new provider procurement needed for v1.

---

## Architecture target

```
┌────────────────────────────────────────────────────────────────┐
│  appointments  +  consultation_sessions (NEW)                  │
│    appointment_id, modality, provider, provider_session_id,    │
│    state {scheduled|active|ended|no_show|cancelled},           │
│    actual_start, actual_end, recording_url, transcript_url,    │
│    pre_consult_brief_md, post_consult_soap_md,                 │
│    post_consult_rx_md, no_show_party                            │
└──────────────────────────┬─────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────┐
│  consultation-session-service.ts (NEW — modality-agnostic)     │
│    createSessionForAppointment(appointmentId)                  │
│      → routes to provider adapter based on consultation_type   │
│    startSession / endSession / markNoShow                      │
│    attachRecording / attachTranscript                          │
└──────────────────────────┬─────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐  ┌────────────────┐  ┌────────────────────────┐
│ video-session│  │ voice-session  │  │ text-session-supabase  │
│ -twilio.ts   │  │ -twilio.ts     │  │ .ts (NEW — Supabase    │
│ (existing —  │  │ (NEW — Twilio  │  │ Realtime + Postgres,   │
│ consultation │  │ Video audio-   │  │ branded web chat URL,  │
│ -room-svc    │  │ only WebRTC,   │  │ valid only during slot │
│ rebadged)    │  │ Decision 2)    │  │ window — Decision 1)   │
└──────┬───────┘  └────────┬───────┘  └────────────┬───────────┘
       │                   │                       │
       └───────────────────┴───────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────┐
│  consultation-verification-service.ts (REUSED across all 3)    │
│    tryMarkVerified — both parties present → mark verified      │
│    handleTwilioStatusCallback — webhook normalization layer    │
└──────────────────────────┬─────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────┐
│  AI clinical assist pipeline (NEW — runs for ALL modalities)   │
│    Pre-consult: intake → LLM brief → doctor sees on join       │
│    Mid-consult (text/voice): rolling transcript → red-flag     │
│      detection → banner alert in doctor UI                     │
│    Post-consult: transcript → SOAP draft → Rx draft (feeds     │
│      existing prescription-service.ts) → follow-up nudge       │
└────────────────────────────────────────────────────────────────┘
```

---

## Principles (non-negotiable)

1. **One session abstraction across all three modalities.** Same `consultation_sessions` table, same lifecycle states, same reminder cron, same AI pipeline (when D ships). Provider-specific work lives behind thin adapters. Resist the temptation to per-modality-table.
2. **Code global, start India (LOCKED 2026-04-19).** Every architectural choice must be **global-day-one capable** — no per-country phone numbers, no India-only providers in the hot path, no INR-only assumptions baked into core schemas. India is the **first market** because it's operationally easiest (existing IG-DM patient surface, Razorpay payments, DPDP-compliant Mumbai-region Supabase, existing doctor cohort), but every adapter, every notification helper, every piece of copy must work the same way for a doctor in São Paulo or Lagos. Currency / payment / language i18n is a separate plan, but voice/text/video delivery cannot be the rate-limiter for global expansion.
3. **WebRTC over PSTN for voice (Decision 2 LOCKED).** Voice consults use Twilio Video in audio-only mode, **not** real phone calls. Patient gets a join link, same as text and video. No per-country phone number provisioning, no per-country telecom KYC, no per-country carrier rates. PSTN is a possible v2+ fallback only if real patient feedback demands it.
4. **Reuse what's already in stack.** Twilio (Video + SMS) and Supabase (Postgres + Realtime + Storage) are the two pillars. New providers require explicit justification + a Decision-log entry.
5. **No silent dual-write.** Existing video data must continue to work unchanged when the abstraction lands. The `consultation-room-service.ts` rename + facade refactor is a behavior-preserving change.
6. **Patient surface is branded and time-windowed.** All three modalities deliver via one-time signed URLs valid only during the slot window. No persistent surfaces, no "join anytime" links.
7. **Recording with consent at booking** (proposed — see Decision log entries 4, 10, 12). Once the patient consents at booking time we don't ask again per-session.
8. **Booking copy must explicitly set the link expectation for voice (Decision 2 implication).** Patient must be told at booking time: *"Your voice consult will happen on a private link we send you, not on a phone call."* Avoids "but the doctor never called me" support tickets.
9. **AI-first product positioning (with delivery-first sequencing).** AI clinical assist (Phase D) is the moat, but ships **after** the delivery layer is solid (Decision 6). No modality ships AI assist before its own delivery is proven.

---

## Open product decisions (need to lock before building)

> Move each item to **Decision log** below as it's settled. Each line should end with the user's choice + timestamp.

1. ✅ **(LOCKED 2026-04-19) Text consult surface — Path 4 (hybrid): IG DM ping + branded web chat room backed by Supabase Realtime + Postgres.**
   - **Patient flow:** at slot start, IG DM message *"Dr. Sharma is ready — tap to start your text consult: clariva.app/consult/<one-time-token>"*. Tap opens branded mobile-optimized chat in IG's in-app browser. Real chat UI, photos, "Dr. is typing", Rx PDF inline at end. After consult: separate IG DM ping with link to Rx (so patients with dead web sessions still get notified).
   - **Doctor flow:** "Live consultations" panel inline on the existing appointment detail page (Decision 7 still open but leans this way). Real clinical UI with patient name, intake summary side panel, AI brief at top, chat in middle, Rx draft button at bottom.
   - **Backbone:** Supabase Realtime + Postgres (`consultation_messages` table; `postgres_changes` subscription per `appointment_id`; attachments in Supabase Storage scoped by `appointment_id`, RLS-policied identically to `prescription_attachments`).
   - **Why Supabase, not Twilio Conversations:** (1) we OWN the transcript in Postgres → AI clinical assist pipeline (Phase D) reads it via `SELECT`, no webhook-mirror system to maintain; (2) DPDP / India data residency is clean (Supabase Mumbai region we already use; Twilio Conversations does not yet have an India region GA); (3) cost is essentially zero at our scale vs Twilio MAU pricing that punishes success ($0 vs ~$500/mo at 10k MAU, ~$5k/mo at 100k); (4) RLS reuse of existing patient-and-doctor-on-this-appointment patterns; (5) no new vendor / no new on-call surface; (6) no vendor lock-in. Cost: ~3 extra days of build vs Twilio Conversations to get typing indicators / read receipts / reconnection — acceptable trade for the above.
   - **Why not pure IG DM (Option b):** IG's 24h Standard Messaging window collides with scheduled consults that drift; plain text only (no Rx tables, no PDF inline); attachments stuck in IG inbox not EHR; bot-vs-doctor identity unclear; thread soup mixes bookings + consults + follow-ups; PHI on Meta with no BAA / DPDP cover; multi-party impossible; bot-suppression mode-switching logic is deceptively expensive.
   - **Why not WhatsApp (Option c):** 2–4 week onboarding (Business Manager verification, number registration, template approval); per-conversation pricing (~₹0.30–0.80 each); WA Business is per-business-number not per-doctor; same Meta-residency problem as IG DM. **Deferred indefinitely** — adapter interface (`text-session-*.ts`) is generic enough that a `text-session-whatsapp.ts` can plug in later if real demand appears, but no schema or build work in v1.
   - **Why not Twilio Conversations (Option a as originally written):** see "Why Supabase, not Twilio Conversations" above. Original recommendation reversed after deeper review of AI-pipeline integration cost, India data residency, and Twilio MAU pricing scaling.
   - **Decision flow visualization:**
     ```
     Patient (already in IG DM)
            │
            │  T-0  bot DM: "Dr. is ready — tap to join: clariva.app/consult/<token>"
            ▼
     ┌────────────────────────────────────┐
     │ Branded web chat room (Supabase)   │     ◄── Doctor (dashboard)
     │ • messages = consultation_messages │         live consult panel
     │ • presence = Realtime channel      │         on appointment page
     │ • attachments = Supabase Storage   │
     │ • valid only during slot window    │
     └────────────────────────────────────┘
            │
            │  T-end  bot DM: "Your prescription is ready: clariva.app/rx/<id>"
            ▼
     Patient (back in IG DM)
     ```
2. ✅ **(LOCKED 2026-04-19) Voice = WebRTC-only via Twilio Video in audio-only mode. NO PSTN in v1.**
   - **What this means in plain English:** voice consults are not real phone calls. Patient gets a one-time signed URL via DM/SMS/email at slot start (same pattern as text and video). They tap it, the browser becomes the phone (mic + speaker, no camera). Doctor uses the same join URL pattern from the appointment detail page.
   - **Provider:** Twilio Video SDK with `audioOnly: true`. **Same SDK, same auth tokens, same webhooks, same `consultation-room-service.ts`** that already powers video. The voice adapter is essentially "video room with the camera UI hidden + a different layout".
   - **Why not PSTN (Programmable Voice / Exotel / Plivo / Vonage / Telnyx etc.):**
     - **Global scaling cost is essentially $0 with WebRTC.** Same SDK works in India, US, UAE, Nigeria, Brazil. PSTN forces per-country phone-number rental ($1–$15/mo each), per-country KYC (India TRAI, US FCC, UAE local, etc.), and per-country carrier rates that vary 30×.
     - **Same SDK as video.** ~150 lines of adapter code vs ~600+ for a PSTN integration with conferences, masked numbers, recording webhooks.
     - **Same recording + transcription pipeline as video.** Whatever Decisions 10 + 12 land on for recording, voice inherits for free.
     - **Same join-URL UX as text and video.** Patient mental model is consistent: "I get a link, I tap it, I'm in."
     - **Cost comparison at 1k voice consults/month, 15min each:** WebRTC ≈ $120/mo (flat worldwide). PSTN India alone ≈ ~₹50k (~$600). Each new country adds similar PSTN cost; WebRTC adds zero.
   - **Why not Daily.co / LiveKit / Agora (alternative WebRTC providers):** zero new vendor wins for v1 — Twilio Video is in stack, doctors are already trained on the video UX, recording pipeline is built. Revisit only if monthly Twilio Video bill exceeds ~$1k or features are missing.
   - **Trade-off accepted:** patient must keep the browser tab open with screen on (no graceful "phone rings, I answer" experience). Older / less tech-savvy patients may be confused by "tap link to talk" instead of "doctor calls my phone". **Mitigation:** booking copy explicitly tells patient *"your voice consult happens on a private link we send you, not on a phone call"* — Principle 8.
   - **Reversible later:** the `voice-session-twilio.ts` adapter exposes a provider-agnostic interface — `createVoiceSession(appointmentId)` → `{ providerSessionId, joinUrl, recordingUrl }`. A future `voice-session-twilio-pstn.ts` (or Plivo/Exotel) can plug in behind a router by `doctor.country` or by per-call patient preference, without touching upstream code. **Decision 2 is reversible per-region in 3-day adapter scope.**

3. ✅ **(RESOLVED-BY-DECISION-2 2026-04-19) Voice flow style.**
   - Decision 2 picked WebRTC, which makes this question moot — there's no phone number to mask and no doctor-phone to click-to-call from. Both parties join a WebRTC room from a signed URL.
   - If/when PSTN fallback is added in v2+, this decision returns: at that point the recommendation is **(a) masked-number-only** (Twilio Proxy or equivalent — privacy + auditability + recording all happen automatically), not (b) doctor-initiated click-to-call which exposes doctor's personal number.
4. ✅ **(LOCKED 2026-04-19) Recording defaults — global doctrine for all modalities (audio of voice + audio-track of video; full-video specifics still pending Decision 10).**
   - **Default state:** recording **on by default** for every consult (voice, video, text).
     - For voice: the audio stream is recorded.
     - For video: defer the audio-vs-full-video specifics to Decision 10. Audio recording is the v1 floor; full video is the v1 ceiling pending Decision 10.
     - For text: the entire `consultation_messages` log + attachments **is** the recording (see chat-history access sub-decision below).
   - **Doctor controls:**
     - ❌ **No global "I never record" toggle in doctor settings.** Reasons: recordings *protect* the doctor in malpractice claims; "I forgot to turn it back on" silently loses audit trail; cross-doctor inconsistency hurts B2B sales to clinics. Acceptable filter — doctors who philosophically refuse recording can't use Clariva.
     - ✅ **Per-session pause / resume by doctor, mid-consult, with audit trail.** Doctor clicks "Pause recording" → system message appears in chat / call ("Recording paused at HH:MM by Dr. Sharma") → doctor must enter a brief reason (free text, ≥5 chars, ≤200 chars) → audit log captures `{ session_id, doctor_id, paused_at, reason, resumed_at }`. Resume clears the banner.
     - **Patient-visible pause indicator** (transparency — never covert recording-off). System message in chat; "Recording paused" badge in voice/video UI.
     - **Audit-log analyzability** — pause-reason free text is queryable; supports future abuse detection (a doctor who pauses every consult triggers review).
   - **Patient consent:**
     - Captured **at booking time** (one place, not per-session). Checkbox: *"I understand this consultation will be recorded for clinical and quality purposes. The recording is encrypted, accessible only to me and Dr. {name}, and retained per medical-record law."*
     - **If patient declines:** soft re-pitch — bot shows a "Why we record" explainer (recording protects you too in case of dispute; helps doctor remember details for follow-up) → asks again. About 5% decline industry-baseline; soft re-pitch usually recovers most.
     - **Still declines after re-pitch:** consult runs **without recording**. Doctor sees a banner at session start: *"This consult is not being recorded — patient declined. Use clinical notes."* Phase D AI SOAP/Rx pipeline cannot fire for this consult (no transcript input). Booking is **not** blocked.
     - **No mid-consult patient toggle.** Consent is captured upfront for state cleanliness; revoking mid-stream is a different (much harder) consent model.
   - **Access:**
     - **Doctor:** indefinite access via dashboard (regulatory medical-record retention requirements drive this — India typically 3–10 years depending on state and specialty).
     - **Patient:** self-serve replay enabled with friction.
       - **Stream only, no download** (reduces re-share / weaponization risk).
       - **Watermark in playback UI:** patient name + consult date + *"Confidential — for personal use only"*.
       - **TTL on patient self-serve access: 90 days from consult.** After 90 days the recording is archived (still in storage for the regulatory retention period; just hidden from the patient self-serve UI). Patient can re-request via support after 90 days.
       - **Audit-logged on every access** by either party.
       - **Mutual access notifications:** when doctor replays, patient gets a system DM ("Dr. Sharma reviewed your consult on {date}"). When patient replays, doctor gets a dashboard notification. Builds trust both ways and serves audit transparency.
       - **Note for full-video specifically:** patient self-serve replay vs doctor-only is **deferred to Decision 10** because video raises additional weaponization concerns (visible body parts in derm/uro/gyn). Audio + transcripts are fine for self-serve everywhere; full video may end up doctor-only-with-patient-request flow per Decision 10.
   - **Retention vs access — separate clocks (important):**
     - **Regulatory retention** (medical records): India 3–10 years per state/specialty. **Cannot delete before this even if patient requests.** Bound by `doctor.country` + `service.specialty` rules.
     - **Patient self-serve UI access:** 90 days (proposed above).
     - **Patient-via-support access:** for as long as the record is retained.
     - **Right to erasure (DPDP / GDPR):** exists but with medical-record carve-outs; we honor where legally possible, withhold deletion where regulator requires.
   - **Account deletion** (separate doctrine, capture for completeness):
     - Patient deletes their Clariva account → record stays in doctor's EHR (regulatory requirement) but patient-side access is severed (no replay, no view).
     - PII may be redacted from operational logs; clinical content retained.
     - This is the standard medical-record posture and matches DPDP carve-outs.

   - **Text chat history — sub-decision under Decision 1, locked here as part of the access doctrine:**
     - Both parties have **indefinite read access** to the chat transcript + attachments (subject to the same regulatory retention vs self-serve TTL clocks).
     - Doctor: chat transcript view inside the existing appointment detail page.
     - **Patient access surface = post-consult DM link to read-only `<TextConsultRoom>` (Option b).** After consult ends, bot sends *"View your consultation: clariva.app/consult/{id}"* via the same DM/email/SMS fan-out as Rx-ready. Opens the same chat UI in **read-only mode** (no new messages, no edits, no deletions). No new patient-portal infrastructure needed.
     - **Transcript PDF export** available to both parties — useful for second-opinion sharing, insurance claims.
     - **Attachments same access pattern** — both parties can re-download via RLS-enforced signed URLs.
     - Same TTL: 90 days self-serve patient access; indefinite via support after; doctor indefinite via dashboard.
     - Audit-logged on every access by either party.
     - **Why text gets indefinite both-party access while video may not (Decision 10):** text is fundamentally different from video — patient can screenshot anyway (no DRM possible), text *is* the consultation rather than a record OF it, storage is trivial, and weaponization risk is lower (no body parts). Withholding text post-consult is theater, not security.
5. ✅ **(LOCKED 2026-04-19) Text consults are live-only (sync) for v1. Messaging-mode (async) is deferred to v2+ as a cleanly additive surface — no schema rewrite required.**
   - **v1 shape:** text consults follow the same lifecycle as voice/video — booked slot, both parties online during the slot window, branded web chat room opens only during the slot, ends at the slot's `expected_end`. Doctor's calendar stays simple (one `availability` model across all three modalities). What Decision 1 + Phase C already assume.
   - **v2+ extension path (when demand signal appears):** `consultation_sessions` table grows a `mode: 'live' | 'messaging'` column. Messaging-mode adds: doctor inbox/queue UI, SLA timer (e.g. 24h reply), partial-reply states, different pricing per the doctor's `service.pricing` (already supports per-modality tiers in schema). No new tables, no rewrite of `consultation_messages`, no rewrite of `text-session-supabase.ts` adapter — just new UI surfaces and lifecycle states. **Estimated v2 cost: ~3-5 days.**
   - **Why defer:** messaging-mode is a different product (different doctor habit, different patient expectation, different pricing, different SLA enforcement). Shipping it alongside live-mode in v1 doubles the doctor-onboarding cognitive load ("which mode do I configure?") for zero proven demand. Cleanly additive later beats prematurely-bundled now.
   - **Trigger to revisit:** real signal from doctors ("can patients message me follow-up questions?") or from patients ("I just need a quick lab report read, do I really need a slot?"). Most likely first appearance is for follow-up consults and derm rashes / lab report reviews.
6. ✅ **(LOCKED 2026-04-19) Live mid-consult AI red-flag detection — DEFERRED beyond v1 entirely. AI clinical assist (Phase D) is also explicitly de-prioritized vs the core delivery layer.**
   - Original recommendation was "v2 for live AI, v1 for pre/post-consult AI brief". User direction is **stronger than that**: get the core text + voice consultation systems working end-to-end first; AI assistance (pre-consult brief, post-consult SOAP/Rx, live red-flag detection) is an **additive layer on top**, shipped only after the delivery layer is proven.
   - **Implication for sequencing:** Phase D moves from "ships alongside Phase A" to "ships after Phase C is solid". Phases A → C → B → D → E. Re-prioritization captured below in Suggested sequencing.
   - **Why this is the right call:** AI clinical assist is a multiplier, not a foundation. If the chat room itself is buggy/slow/unreliable, the best AI brief in the world doesn't save the consult. Build the rails first, the smarts second.
7. ✅ **(LOCKED 2026-04-19) Doctor "live consult" surface = inline on the Appointment detail page (today's appointment profile page) with all three modality launchers (Text / Voice / Video) rendered as buttons there.**
   - User direction: "all text, voice, video buttons to appear on the profile page of that day's appointment".
   - **What this looks like:** the appointment detail page already renders `<VideoRoom>` for video consults. Generalize that area into a `<ConsultationLauncher>` that shows the right CTA based on `appointment.consultation_type`:
     - `'text'` → "Open chat with patient" → renders `<TextConsultRoom>` inline.
     - `'voice'` → "Start voice consult" → triggers Twilio Conference dial flow + renders `<VoiceConsultRoom>` (mute/hold/end widget).
     - `'video'` → "Join video room" → renders existing `<VideoRoom>` (unchanged).
   - All three buttons may be visible depending on what was booked + (later, see Decision 11) on whether mid-consult modality switching is enabled. Doctor-facing copy makes the booked modality the primary CTA; alternates are secondary.
   - No dedicated "Live consultations" tab in v1. Same nav, no new top-level entry. If doctor cohort grows past managing live sessions inline (e.g. 5+ concurrent consults common), revisit.
8. ✅ **(LOCKED 2026-04-19) Schema shape → ONE `consultation_sessions` table for all three modalities. Provider-specific bits collapse into a generic `provider` + `provider_session_id` pair. Adapters carry the provider knowledge; everything downstream (AI, recording, audit, RLS, dashboards) is modality-blind.**
   - **Why:** all three modalities share the **identical lifecycle** — booked → patient joins → doctor joins → recording starts → consult happens → consult ends → transcript generated → AI SOAP generated → Rx sent → no-show handled. The only thing that varies is *which provider holds the live session* (Twilio Video room SID for video, Twilio Video audio-only room SID for voice, Supabase Realtime channel ID for text). That difference belongs in the **adapter layer** (`video-session-twilio.ts`, `voice-session-twilio.ts`, `text-session-supabase.ts`), not in the schema.
   - **Schema (target shape, finalized in Task 15 migration):**
     ```sql
     consultation_sessions
     ├── id (PK uuid)
     ├── appointment_id (FK → appointments)
     ├── modality enum ('video' | 'voice' | 'text')
     ├── status enum ('scheduled' | 'active' | 'ended' | 'no_show' | 'cancelled')
     ├── doctor_joined_at timestamptz
     ├── patient_joined_at timestamptz
     ├── started_at timestamptz
     ├── ended_at timestamptz
     ├── duration_seconds int
     ├── verified_at timestamptz                          -- payout eligibility
     ├── recording_url text
     ├── recording_consent_decision  -- inherits from appointments per Decision 4
     ├── transcript_url text
     ├── pre_consult_brief_md text                        -- Phase D (deferred)
     ├── post_consult_soap_md text                        -- Phase D (deferred)
     ├── provider text                                    -- 'twilio_video' | 'twilio_video_audio' | 'supabase_realtime'
     ├── provider_session_id text                         -- the actual Twilio room SID / Supabase channel ID
     ├── created_at, updated_at
     ```
   - **Why each rejected option was rejected:**
     - **Option A (keep adding columns to `appointments`):** rejected. Becomes a 50-column wide-table where ~75% of any row is NULL. Adding modalities or providers means another `ALTER TABLE`. RLS policies have to know about modality-specific columns.
     - **Option C (three separate tables `video_sessions`, `voice_sessions`, `text_sessions`):** rejected. Cross-modality queries become 3-way `UNION ALL`. Phase D AI pipeline has to fan out three queries to find the transcript. Mid-consult modality switching (Decision 11) becomes "delete-from-one-table-insert-into-another" which destroys session continuity. Adding a fourth modality later means a fourth table + column-shape duplication. Implies different shapes when the shapes are actually identical.
   - **Concrete benefits unlocked:**
     1. **Phase A is exactly this refactor** with lazy-write strategy (any consult started after migration writes to `consultation_sessions`; existing in-flight video rooms keep using `appointments` columns until end-of-call). No back-fill needed on day one.
     2. **Decision 11 (mid-consult modality switching, if locked yes) is dramatically simpler** — same `consultation_session_id` keeps existing, only `modality` flips and a `consultation_modality_history` child table logs the switch. Recording continuity is one row, not a row-destruction-and-recreation event.
     3. **Phase D AI pipeline is `SELECT pre_consult_brief_md FROM consultation_sessions WHERE id = ?`** — same query for all three modalities. No modality-aware code anywhere downstream of the adapters.
     4. **RLS policies write once.** "Doctor can read own consultation_sessions; patient can read own consultation_sessions" — one policy applies to all three modalities.
     5. **Decision 4 recording doctrine applies uniformly.** `consultation_recording_audit`, `recording_access_audit`, retention TTL job all key off `consultation_session_id` regardless of modality.
     6. **Adding a fourth modality later (e.g. live group consult, in-clinic visit logged in EHR) = adding an enum value + a new adapter file. No schema migration.**
   - **Existing video-on-`appointments` columns:** Phase A migration is **lazy-write**, not back-fill. New columns on `appointments` (Migration 021) stay in place for in-flight rooms; new sessions write to `consultation_sessions`. Old columns can be dropped in a post-cutover migration after all video sessions have ended (typically ~14 days after Phase A ships).
   - **Secondary tables stay separate:** `consultation_messages` (text content), `consultation_recording_audit` (Decision 4 pause/resume log), `recording_access_audit` (Decision 4 replay log), `consultation_modality_history` (if Decision 11 lands as switching-allowed). All FK back to `consultation_sessions.id`.

9. _(open — user-raised 2026-04-19)_ **Companion text channel during voice (and video) consults.**
   - **User's clinical observation:** "voice alone won't be enough for most cases" — patient may need to send a photo of a rash, a pic of a medication strip they're holding, a lab report PDF, an old prescription, an X-ray they have on their phone. A pure phone call has no surface for any of this.
   - **Note: same problem exists for video.** A doctor may need a PDF lab report that can't be read clearly on camera, or wants the patient to send a high-res photo while still talking.
   - **Options:**
     - (a) **Always-on companion text channel for voice + video.** Every voice/video consult auto-creates a text room too; patient gets the chat link via SMS/IG DM at slot start; doctor can request "send me a photo" mid-call. Cost is essentially $0 because we already build the text room for Phase C — enabling it for the other two is free.
     - (b) **Optional / on-demand text channel.** Doctor clicks "Open chat with patient" mid-consult, patient gets a link. Lighter UX, less overhead, but adds friction at the moment doctor needs it most.
     - (c) **Async asset upload only.** A one-way "send me a photo" link (like a Dropbox file request), no full chat. Minimal version.
     - (d) **None.** Voice is voice. Photos go through the post-consult Rx attachment flow.
   - ✅ **(LOCKED 2026-04-19) Companion text channel = always-on for both voice and video. Same `consultation_session_id` so chat + transcript + recording all unify in one EHR row.**
   - **What this means concretely:** every voice and video consult auto-creates a companion text channel at session start (no doctor action needed). Patient gets the chat link via the standard consult-ready DM (modality-aware copy still says "voice consult" or "video consult", with a note "you can also send photos and files in the call"). Doctor sees the chat panel rendered alongside `<VoiceConsultRoom>` / `<VideoRoom>`.
   - **Sub-questions answered:**
     1. ✅ **Chat panel auto-opens, not collapsed.** Both for video (right-side panel, video stream takes ~70% width, chat ~30%) and voice (chat fills the main canvas since there's no video to look at — chat IS the visible surface of the consult). Doctor can collapse if they want, but the default is open. Patient also gets it auto-opened.
     2. ✅ **Attachments live as `consultation_messages` rows** (with `attachment_url` + `attachment_mime_type` columns). No separate `consultation_attachments` surface. **Why:** unified EHR row, single transcript ordering by timestamp, AI pipeline (Phase D) reads one stream not two, RLS rules write once, transcript PDF export is one query. The `consultation_messages` table needs to support text-only rows AND attachment rows AND system rows (recording paused/resumed, modality switch events) — one row shape with nullable `body_text` + nullable `attachment_url` covers all cases.
     3. ✅ **Billed as voice or video only — chat is a free affordance.** Doctor's `service.pricing` for the booked modality is what gets charged. No "voice + text" SKU. Chat is plumbing, not product.
   - **Lifecycle hook:** `consultation-session-service.ts#createSession()` always provisions the Supabase Realtime channel + `consultation_messages` rows for system messages, regardless of `modality`. For text consults, the channel IS the consult. For voice/video, the channel is the companion. Same code path, same table, same RLS.
   - **System messages on the chat thread (auto-posted to the unified transcript):**
     - "Voice consult started at HH:MM" / "Video consult started at HH:MM"
     - "Recording paused by Dr. {name} at HH:MM — reason: {reason}" (per Decision 4)
     - "Recording resumed at HH:MM"
     - "Patient joined" / "Doctor joined"
     - "Consult ended at HH:MM — duration {N} min"
   - **Implication for Decision 11 (mid-consult modality switching):** "switch to text mid-call" is **no longer a switching problem** — the text panel is already open, doctor or patient just types. Only voice↔video switching remains a real switching question for Decision 11.
   - **Implication for Phase D (AI clinical assist, deferred):** post-consult SOAP gets a unified transcript composed of: (audio transcript of the voice/video stream) merged-by-timestamp with (text messages from the chat panel) merged-by-timestamp with (attachment captions / OCR'd PDF text where available). One coherent narrative for the LLM, not three disjoint streams.
   - **Storage cost note:** essentially zero marginal cost — the text room infrastructure exists for Phase C anyway; using it for voice/video is a UI affordance with no new backend.

10. ✅ **(LOCKED 2026-04-19) Video recording → audio-only by default during video consults; full-video recording is a doctor-initiated, on-demand escalation that requires just-in-time patient consent. Patient self-serve video replay allowed but with extra friction beyond audio (audio-only default in player + "Show video" toggle + warning + light SMS OTP friction on first video replay per 30 days). Mutual access notifications inherit Decision 4 with audio-vs-video differentiation in the notification copy.**

    - **Default state for video consults:**
      - Audio recording: **on by default** per Decision 4 (booking-time consent already covered).
      - Video recording: **off by default**. Storage cost stays linear with audio (~7 MB / 15 min) until and unless doctor escalates.

    - **Doctor-initiated video escalation flow (the core of this decision):**
      ```
      Doctor in <VideoRoom> → "Start video recording" button in controls bar
        ↓ click
      Modal: "Why are you recording video?" → preset reasons OR free-text (≥5 chars)
        Presets: "Documenting visible symptom (rash, swelling, etc.)"
                 "Procedural documentation (demonstrating a stretch, etc.)"
                 "Patient request"
                 "Other (please elaborate)"
        ↓ submit
      System posts to companion chat (Decision 9 always-on panel, both parties see):
        "🎥 Dr. Sharma has requested to record video for: {reason}. Awaiting patient approval."
      System sends modal prompt to patient (interrupts their video screen — must respond):
        "Dr. Sharma wants to record video of this part of the consult.
         The recording is encrypted and only you and Dr. Sharma can access it.
         [Allow] [Decline]"
        ↓ patient picks
      Allow:
        Video recording starts. Both sides see persistent "🔴 Recording video" indicator.
        Patient sees a "Stop video recording" button next to the indicator (revoke any time).
      Decline:
        Modal closes, audio-only continues, doctor sees banner:
        "Patient declined video recording — describe in clinical notes instead."
        Doctor can re-request later (rate-limited to once per 5 min).
      No response in 60s:
        Treated as decline. Same as above.
      ```

    - **Patient mid-call revocation:**
      - When video recording is active, patient sees a "Stop video recording" button next to the 🔴 indicator.
      - Click → video recording stops immediately. Audio continues per Decision 4.
      - System posts to chat: "Patient stopped video recording at HH:MM."
      - Doctor sees the change reflected in their UI; can re-request later.

    - **Pause/resume for video recording:**
      - Inherits Decision 4 doctrine.
      - **v1: combined audio+video pause** — one "Pause recording" button pauses both streams together. Reason capture, patient-visible indicator, audit log — all per Decision 4.
      - Separate "pause just video" capability deferred. Combined is simpler and covers 95% of the legitimate "I need to pause" cases.

    - **Patient self-serve replay of video recordings (the trickier sub-decision):**
      - **Allowed**, not denied — paternalistic blocking of patient's own recording breaks trust.
      - **Player loads in audio-only mode by default** with a visible "Show video" toggle.
      - **Clicking "Show video" pops a warning modal:**
        > "This recording contains video footage of you. It will play with a watermark and cannot be downloaded. Consider where you're viewing it before continuing."
        > [Cancel] [Show video]
      - **Light SMS OTP friction on first video replay per 30-day rolling window** — reduces casual-sharing risk if someone else has access to the patient's logged-in browser. Subsequent video replays within 30 days don't re-prompt OTP (avoid annoyance).
      - **Watermark, no-download, audit-log on every replay** — same as audio per Decision 4.
      - **90-day patient self-serve TTL** — same as audio.
      - **Indefinite via support after 90 days** — same as audio.
      - Doctor dashboard access: **unrestricted from a permission standpoint** (subject to regulatory retention), but every access still triggers mutual notification (see below).

    - **Mutual access notifications — inherit Decision 4 + audio/video differentiation in copy:**
      - Audit log table (`recording_access_audit` per Task 29) gains `access_type` column: `'audio_only' | 'full_video'`.
      - Notification copy reads from `access_type` and differentiates:

        | Action | Other party gets notified |
        |---|---|
        | Doctor replays audio-only | "Dr. Sharma reviewed the audio of your consult from {date}." |
        | Doctor replays full video | "Dr. Sharma reviewed the **video** of your consult from {date}." (🎥 indicator) |
        | Patient replays audio-only | "Patient {name} reviewed the audio of their consult from {date}." (doctor dashboard) |
        | Patient toggles "Show video" + replays | "Patient {name} reviewed the **video** of their consult from {date}." (🎥 indicator on doctor dashboard) |
      - **Why differentiate:** video carries higher privacy stakes; if a doctor is going back specifically to view video (e.g. consulting a colleague about a rash), the patient deserves to know *that*, not just "your consult was reviewed". Same the other way — repeated patient video replays may be a wellness signal worth the doctor noticing.
      - Implementation cost is essentially zero — audit log already needs `access_type` for compliance; notification template just reads that field.

    - **Storage cost reality (revised under this design):**
      - Realistic video usage: 1–3 minute segments documenting a clinical finding (not full 15-min recordings).
      - ~25–75 MB per video segment.
      - At 1k consults/month with ~10–20% having a video segment: ~3–15 GB/month new.
      - Supabase Storage ~$0.021/GB/mo → effectively zero (~$0.30/mo at 1k consults).
      - At 10k consults/month, 20% video: ~150 GB/month, ~$3/mo.
      - Storage cost is a non-issue under this design. The expensive scenario (full-call video by default) is exactly what we're avoiding.

    - **Specialty-aware behavior — DEFERRED to v2.** v1 is "doctor-initiated only, no auto-prompt, no specialty defaults." Same flow for everyone. Once usage data is real, v2 can add: derm/peds/surgery follow-up auto-prompt at session start; psychiatry/sexual health/uro/gyn never auto-prompt + extra-prominent "stop recording" button for patient. Tracked in v2 backlog.

    - **Patient-visible "access history" page — DEFERRED to v1.1.** Real-time mutual notifications cover transparency for v1; a "review past activity" surface is nice-to-have, not must-have. Add only if real users ask.

    - **What gets stored when patient declines video at escalation:**
      - Audio recording continues per Decision 4.
      - Doctor's clinical notes describe what they observed (which they were going to write anyway).
      - **No snapshots** — single-frame intimate images are arguably worse than streaming video for consent reasons. Skip entirely.

    - **Sub-questions answered in this lock:**
      1. ✅ Doctor-initiated escalation flow with patient consent modal — locked.
      2. ✅ 60-second patient consent timeout = decline — locked (gives doctor a way to move on; can re-request).
      3. ✅ Combined audio+video pause for v1 — locked. Separate-pause deferred.
      4. ✅ Doctor reason capture (preset + free-text fallback) — locked. Same audit pattern as pause/resume reason.
      5. ✅ Patient self-serve replay = audio-only default + "Show video" toggle + warning + light SMS OTP friction on first video replay per 30 days — locked.
      6. ✅ Mutual access notifications inherit Decision 4 with audio-vs-video differentiation in copy — locked.
      7. ✅ Same 90-day self-serve TTL + indefinite regulatory retention + watermark + no-download + audit log as Decision 4 — locked.
      8. ⏭ Specialty-aware defaults — deferred to v2.
      9. ⏭ Patient-visible access history page — deferred to v1.1.

11. ✅ **(LOCKED 2026-04-19) Mid-consult modality switching → all 6 transitions supported in v1 (text↔voice↔video in both directions, patient-initiated AND doctor-initiated). Billing doctrine = "initiator absorbs the cost" (symmetric, removes doctor gaming incentive).**

    - **The clean doctrine (memorize this — it governs every scenario):**

      | Direction | Who initiates | Billing |
      |---|---|---|
      | **UPGRADE** (text→voice→video) | Patient | Patient pays difference. Doctor decides paid (default) vs free-as-goodwill. Payment processed only **after** doctor approves. |
      | **UPGRADE** | Doctor | **Always free** (doctor took the booking knowing modality; if they need more, they absorb it). Patient still must consent to the modality change. |
      | **DOWNGRADE** (video→voice→text) | Patient | No refund. (Patient's own choice to use less of what they bought.) |
      | **DOWNGRADE** | Doctor | **Always refund the difference automatically.** No doctor toggle. (Patient paid for higher tier, didn't get it.) |

      **Why this is symmetric and elegant:**
      - Whoever initiates the change absorbs the cost.
      - Doctor-initiated changes **never benefit doctor financially** — removes the gaming incentive entirely. Doctor can't upgrade for extra revenue or downgrade without refunding.
      - No "clinical necessity vs preference" classification needed — doctor would always game that. Doctor simply decides whether to charge patient-initiated upgrades.
      - Easy to explain to both doctor and patient; no room for "I feel scammed" on either side.

    - **v1 scope: ALL 6 transitions ship in v1 (Option C).** Full matrix, both directions, both initiators. User direction: "don't defer anything, we gotta make all at once, I will give more time."

      | Transition | Technical implementation |
      |---|---|
      | text → voice | Provision new Twilio Video audio-only room mid-consult; add audio recording artifact |
      | text → video | Provision new Twilio Video full room; add audio + video recording artifacts |
      | voice → video | Same Twilio Video room, enable camera track (trivial — Decision 2 payoff) |
      | video → voice | Same Twilio Video room, disable camera track |
      | voice → text | Disconnect Twilio room; keep Supabase Realtime channel running until `expected_end` |
      | video → text | Disconnect Twilio room; keep chat running |

    - **Patient-initiated upgrade flow (no payment upfront — payment only after doctor approves):**
      ```
      Patient in current-modality room clicks "Request upgrade to {voice|video}"
        ↓
      Modal: "Request upgrade to {voice|video}. {voice|video} is normally ₹X more than text.
              Dr. Sharma may charge this difference or grant the upgrade for free.
              [Cancel] [Send Request]"
        ↓ send (NO payment yet)
      System posts to companion chat:
        "🎙/🎥 Patient requests upgrade to {modality}. Standard difference: ₹X."
      Doctor sees modal with three buttons:
        [Accept (charge ₹X)]   ← DEFAULT
        [Accept (free)]
        [Decline (reason required)]
      
      Doctor accepts + charge:
        → Patient modal: "Dr. Sharma approved. ₹X to confirm. [Cancel] [Pay & Join]"
        → Patient pays via Razorpay → upgrade happens
        → Patient cancels at Razorpay step → upgrade cancelled, consult stays at current modality
      Doctor accepts + free:
        → Upgrade happens immediately (no payment touched)
      Doctor declines:
        → Reason posted to chat, consult continues, patient can re-request once more
      Doctor doesn't respond in 90s:
        → Auto-decline, patient gets option to re-request once
      ```

    - **Doctor-initiated upgrade flow (always free):**
      ```
      Doctor in current-modality room clicks "Upgrade to {voice|video}"
        ↓
      Modal: "Upgrade to {voice|video}? This will be at no extra cost to the patient.
              [Why?] reason capture (preset + free-text, ≥5 chars)
              Presets: "Need to see visible symptom" / "Need to hear voice" / 
                       "Patient request" / "Other (elaborate)"
              [Cancel] [Request Upgrade]"
        ↓ submit
      Patient gets modal: "Dr. Sharma is upgrading to {modality} consult (no extra charge).
                          [Decline] [Allow]"
      Patient allows → upgrade happens (Twilio room adjusts)
      Patient declines → consult stays, doctor sees banner with reason-prompt option to re-request
      Patient doesn't respond in 60s → treated as decline (same model as Decision 10)
      ```
      **No billing UI for doctor.** No charge toggle. Clean and simple.

    - **Patient-initiated downgrade flow (no refund, simple notification):**
      ```
      Patient clicks "Switch to {voice|text}"
        ↓
      Modal: "This will switch to {modality} for the remainder of the consult. 
              No refund will be issued. [Cancel] [Switch]"
      Confirm → backend disables track / disconnects room
      System message posts to chat: "Patient switched to {modality}."
      ```
      No doctor approval needed — patient is moving to LESS service, no impact on doctor's work.

    - **Doctor-initiated downgrade flow (always refund, auto-processed):**
      ```
      Doctor clicks "Downgrade to {voice|text}"
        ↓
      Modal: "Downgrade to {voice|text}? Patient will be refunded ₹X (difference) automatically.
              [Why?] reason capture (preset + free-text, ≥5 chars)
              Presets: "My network/equipment issue" / "Case doesn't need current modality" /
                       "Patient's environment" / "Other (elaborate)"
              [Cancel] [Downgrade]"
        ↓ submit
      Backend:
        - Disables camera track / disconnects Twilio room per transition
        - Initiates Razorpay refund for ₹X
        - Posts system message: "Dr. Sharma switched to {modality}. ₹X refunded to patient."
      Patient gets refund confirmation DM + chat system message
      ```
      **No "should I refund" toggle.** It's not a choice — it's the rule.

    - **Rate limits & audit:**
      - **Max 1 upgrade + 1 downgrade per consult** (total 2 transitions). Prevents thrashing + billing complexity. If doctor/patient hits the limit and needs another change, they end the consult and book a follow-up.
      - **Re-request after decline:** 1 retry per direction per session, rate-limited to once per 5 minutes (same as Decision 10 video escalation).
      - **Every switch logged** to `consultation_modality_history` child table: `(session_id, from_modality, to_modality, initiated_by, billing_action, amount, razorpay_ref, reason, occurred_at)`.
      - **System message posted to companion chat** on every switch for unified narrative: "Switched from voice to video at HH:MM by Dr. Sharma. {Patient charged ₹300 / Free upgrade / ₹400 refunded}."

    - **Timing & pricing:**
      - **Full delta regardless of when in slot the switch happens** (locked per Scenario 8). Modality affects what was offered, not duration. Prevents gaming ("I'll wait until 30s before end to upgrade so I pay less").
      - Slot `expected_end` does not change on switch. A text consult that upgrades to video at minute 5 still ends at the original expected end.

    - **Razorpay friction in v1:** accepted (~30-60s for OTP). Stored payment method for frictionless mid-consult micropayments is v2+ work. UX mitigation: both patient and doctor see a "Processing payment..." indicator in the chat panel while Razorpay completes.

    - **Provider lifecycle for each transition (technical specifics):**
      - **voice↔video:** same Twilio Video room, toggle camera track via Twilio Recording Rules API (already needed for Decision 10). No new room SID. Recording continuity preserved.
      - **text→voice/video:** backend `consultation-session-service.ts#upgradeFromText()` provisions a new Twilio Video room, updates `consultation_sessions.provider_session_id`, appends history row. Supabase Realtime channel for chat continues unchanged.
      - **voice/video→text:** backend `consultation-session-service.ts#downgradeToText()` disconnects Twilio room, finalizes recording artifact, appends history row. Supabase Realtime channel continues.
      - **Recording artifacts across transitions:** one artifact per modality segment. Phase D AI pipeline (when it ships) reads all artifacts + chat transcript merged by timestamp into one coherent narrative.

    - **Reason capture pattern (consistent with Decision 4 pause/resume + Decision 10 video escalation):**
      - Preset reasons per transition type + free-text fallback (≥5 chars, ≤200 chars)
      - Required for all doctor-initiated switches (both directions)
      - Required for patient-initiated downgrades (optional for patient-initiated upgrades since the request itself is the reason)
      - Logged to `consultation_modality_history.reason` for abuse-detection + support-dispute purposes

    - **What happens when doctor declines a patient-initiated upgrade:** doctor must provide a reason (same pattern as everything else). Reason posted to chat so patient knows why. Patient gets one free retry (rate-limited 5 min). If doctor declines again, no more retries in this consult — patient can book a follow-up.

    - **What happens when patient declines a doctor-initiated upgrade:** no charge to anyone (upgrade was free anyway). Doctor sees banner with patient's reason (if provided). Doctor can re-request once more (rate-limited 5 min) — e.g. "I really do need to see this; are you sure?"

    - **Sub-questions answered in this lock:**
      1. ✅ v1 scope = all 6 transitions (user direction: "don't defer anything, we gotta make all at once").
      2. ✅ Patient-initiated upgrade billing: doctor decides paid/free (default paid), payment processed only after doctor approves.
      3. ✅ Doctor-initiated upgrade billing: always free.
      4. ✅ Patient-initiated downgrade: no refund.
      5. ✅ Doctor-initiated downgrade: always refund difference automatically, no toggle.
      6. ✅ Max 1 upgrade + 1 downgrade per consult.
      7. ✅ Full delta regardless of timing within slot.
      8. ✅ Razorpay friction accepted in v1; stored payment method is v2.
      9. ✅ 90-second doctor approval timeout for patient-initiated upgrade requests → auto-decline.
      10. ✅ 60-second patient consent timeout for doctor-initiated upgrades → treated as decline (consistent with Decision 10).
      11. ✅ Reason capture pattern consistent with Decision 4 / Decision 10 (preset + free-text, logged to `consultation_modality_history`).

12. ✅ **(LOCKED 2026-04-19) Voice recording — inherits Decision 4's global doctrine. No fork.**
    - All four sub-questions answered by Decision 4's global doctrine:
      - **Storage TTL:** 90 days self-serve patient access; indefinite for regulatory retention; doctor indefinite via dashboard.
      - **Cold storage tier after 30 days:** _(deferred — operational optimization, not a product decision; revisit when monthly storage bill becomes meaningful)._
      - **Patient replay rights:** ✅ self-serve replay enabled (audio-only, low weaponization risk). Stream-only, watermarked, audit-logged, mutual-access notifications.
      - **Doctor-side delete + per-session "do not record" override:** doctor cannot globally disable; doctor *can* pause/resume per-session with audit + reason capture; patient can decline at booking with soft re-pitch (declined = run without recording, doctor sees banner).
    - **Audio stream specifics for voice (Decision 2 LOCKED → WebRTC audio-only):** Twilio Video Recording with audio-track filter is the implementation path. ~7 MB per 15-min consult. Whisper / Deepgram-Indic transcription pipeline (Phase B.4) consumes the same audio stream.
    - **One recording-policy doctrine across the product** confirmed: text, voice, audio-of-video all share Decision 4's rules. Full-video specifics (which may carry doctor-only access by default) is the only thing still open under Decision 10.

---

## Phases

### Phase A — Generalize the existing video scaffolding (refactor, no new behavior)

**Goal:** the existing video flow keeps working byte-for-byte; future voice + text adapters plug in without copy-paste.

**Deliverables:**
- New `consultation-session-service.ts` — modality-agnostic facade. One signature: `createSessionForAppointment(appointmentId)` → `{ doctorJoinUrl, patientJoinUrl, providerSessionId, modality }`. Routes to the right provider adapter based on `appointment.consultation_type`.
- Rename **internally** — `consultation-room-service.ts` → `video-session-twilio.ts` (provider adapter). Public exports unchanged so `consultation-controller.ts` doesn't churn.
- New table `consultation_sessions` (FK `appointment_id`, `modality`, `provider`, `provider_session_id`, `state`, `actual_start`, `actual_end`, `recording_url`, `transcript_url`, `pre_consult_brief_md`, `post_consult_soap_md`, `post_consult_rx_md`, `no_show_party`, timestamps). Migration only — backfill existing video rooms is _(open — Decision log)_; likely lazy-write on next start.
- `consultation-verification-service.ts` adapted to read/write the new table without changing its existing semantics for video.

**Exit criteria:** all 1076+ existing backend tests pass; existing video flow demonstrably unchanged in dev (open the screenshot-visible room, two parties join, end call, verification stamps as before).

**Estimated time:** 4–6 hours.

---

### Phase B — Voice consult (Twilio Video audio-only WebRTC — Decision 2 LOCKED)

**Depends on:** Phase A (session abstraction). **Decision 2 LOCKED — Twilio Video audio-only WebRTC, NOT PSTN.** Decision 4 (recording default) still pending but doesn't block adapter scaffolding. Decision 12 (voice recording details) inherits from Decision 10 once locked.

**Why this phase is small:** voice is "video with the camera off". The existing `consultation-room-service.ts` already creates Twilio Video rooms, mints Access Tokens, and handles participant-connect/disconnect/room-ended webhooks via `consultation-verification-service.ts`. The voice adapter reuses **all of that infrastructure** — only the join UX differs.

**Deliverables:**

**B.1 — Backend adapter `voice-session-twilio.ts`**
- Thin wrapper around the existing `createTwilioRoom` / `generateVideoAccessToken` flow with `audioOnly: true` set on the room creation options. Same `provider_session_id` pattern. Same webhook lifecycle into `tryMarkVerified`.
- One-time signed `patient_join_token` (HMAC over `appointment_id + slot_window + nonce`), valid only during slot window — same shape as Phase C's text adapter. Doctor join uses dashboard auth.
- Recording: defer to whatever Decisions 10 + 12 lock for the global recording doctrine. Audio-track-only recording is straightforward via Twilio Video Recording with track filter.

**B.2 — Frontend `<VoiceConsultRoom>`**
- Mobile-first audio-only UI: large doctor avatar in center, mute / speaker / end buttons, "connecting…" / "connected" / "Dr. is muted" state indicators. **No camera tile, no video controls.**
- Reuses `@twilio/video` SDK already in the project (don't add a new dependency).
- Companion text panel attached if Decision 9 lands as (a) (always-on text channel) — collapsible side panel showing the same `<TextConsultRoom>` chat surface.

**B.3 — Doctor-side dialer**
- Same `<ConsultationLauncher>` (Decision 7) renders a "Start voice consult" button when `consultation_type === 'voice'`. Click → joins the Twilio Video room with audio-only constraints, shows mute / speaker / end + patient name + intake brief + Rx draft (when D ships).

**B.4 — Transcription path**
- Twilio Video Recording webhook → Whisper / Deepgram job → store transcript_url. **Whisper** for English-default markets (cheap, multilingual); **Deepgram Nova / Indic** for Hindi/Hinglish-heavy India consults. Provider choice is per-doctor or per-language-detected; not a global lock yet.

**B.5 — DM copy (modality-aware)**
- Extend `buildConsultationReadyDm` from Phase C: voice variant explicitly sets the link expectation per Principle 8 — *"Your voice consult with Dr. {name} is ready. Tap to join (audio only, no phone call): {joinUrl}"*. The "no phone call" disambiguation matters because patients in India default-expect a phone call when they hear "voice consult".
- Booking confirmation copy (extension of `buildPaymentConfirmationMessage`) likewise sets expectation at booking time, not slot time.

**Exit criteria:** doctor + patient can complete a voice consult end-to-end in dev (patient joins via signed URL on mobile browser, audio works both ways, mute/end work, recording lands in storage, verification stamps via the same `tryMarkVerified` path video uses, prescription flow works post-call).

**Estimated time:** 4–6 hours (was 8–12h when scoped as PSTN; WebRTC is ~half that because we reuse the entire existing video stack).

---

### Phase C — Text consult (Supabase Realtime + Postgres + branded web room)

**Depends on:** Phase A (session abstraction). **Decision 1 LOCKED — Supabase Realtime, not Twilio Conversations** (see Decision log entry 2026-04-19).

**Deliverables:**

**C.1 — Schema**
- New migration: table `consultation_messages` (FKs `appointment_id` + `consultation_session_id`, `sender_role` ∈ `'patient'|'doctor'|'system'`, `sender_user_id`, `body`, `attachments_json` array, `created_at`, `seen_at`, `deleted_at`).
- RLS policies: only the doctor on `appointments.doctor_id` and the patient on `appointments.patient_id` (or guest-token holder for the slot window) can SELECT/INSERT.
- Supabase Storage bucket `consultation-attachments` with RLS scoped by `appointment_id`, mirroring `prescription-attachment-service.ts` patterns.
- Optional: `consultation_typing_state` ephemeral via Realtime broadcast channel (no persisted table).

**C.2 — Backend adapter `text-session-supabase.ts`**
- On payment success (and again at T-15min via reminder cron in case of edits), create the `consultation_session` row and pre-mint a one-time signed `patient_join_token` (HMAC over `appointment_id + slot_window_start + slot_window_end + nonce`). Doctor join uses existing dashboard auth (no token).
- `sendMessage(sessionId, senderRole, body, attachments)` → INSERT into `consultation_messages`. Realtime auto-broadcasts to subscribers.
- `startSession` / `endSession` lifecycle hooks → stamp `actual_start` / `actual_end` on the session, kick off Phase D.2 post-consult pipeline.
- `verify` participant join: when both doctor and patient have inserted at least one message (or pinged a presence channel), call into existing `tryMarkVerified` shape.

**C.3 — Frontend `<TextConsultRoom>` (mobile-optimized, opens in IG in-app browser)**
- Mobile-first chat UI: message list (virtualized), composer with attach button, "doctor is typing" indicator, read receipts via `seen_at` UPDATE, image previews inline, PDF attachments rendered with download CTA.
- Subscribes to `postgres_changes` on `consultation_messages` filtered by `appointment_id`.
- Subscribes to a Realtime broadcast channel for typing indicators (ephemeral).
- Subscribes to a Realtime presence channel so each side sees "Dr. online / patient online".
- Local optimistic-send + retry-on-reconnect (small store, ~half day).
- Ends-of-slot UX: read-only mode with "Consult ended — your prescription is below" + inline Rx PDF.

**C.4 — Doctor-side panel**
- New `<LiveConsultPanel>` rendered inline on the appointment detail page (Decision 7 leans inline). Same `<TextConsultRoom>` chat surface plus a side panel for AI brief (Phase D.1) + Rx draft button (Phase D.2).

**C.5 — IG DM ping copy** (extends `dm-copy.ts`)
- `buildConsultationReadyDm({ modality: 'text', joinUrl, doctorName })` → *"Dr. {name} is ready for your text consult — tap to join: {joinUrl}"*.
- `buildPrescriptionReadyDm({ rxUrl, doctorName })` → *"Your prescription from Dr. {name} is ready — tap to view: {rxUrl}"*.
- Modality-aware variant of payment confirmation already covered in Phase B notes.

**Exit criteria:** doctor + patient can complete a synchronous text consult end-to-end in dev (patient joins via signed URL on mobile browser, both can send messages + images, typing indicators work, transcript queryable in Postgres, Rx draft generated post-end, IG DM ping fires for both consult-start and Rx-ready).

**Estimated time:** ~12–16 hours (chat UI is the bulk; backend adapter is small thanks to Realtime + RLS).

---

### Phase D — AI clinical assist pipeline (the differentiator)

**Depends on:** Phase A (session abstraction). **Should ship _alongside_ Phase A** for the existing video flow, then auto-extends to voice (Phase B) and text (Phase C) for free because they share the session abstraction.

**Deliverables:**

**D.1 — Pre-consult brief (cheap, high-leverage, ship first)**
- T-15min cron (or doctor-opens-session trigger): LLM call from patient intake fields + prior episodes (`care-episode-service.ts`) → 5-line summary + 3 suggested questions, written to `consultation_sessions.pre_consult_brief_md`.
- Doctor opens consult, immediately sees brief in a side panel of the video / voice / text surface.
- Reuses LLM client + audit logging pattern from `service-catalog-ai-suggest.ts`.

**D.2 — Post-consult SOAP + Rx draft pipeline**
- Auto-fires on session end (`actual_end` stamped):
  1. Transcript (text log for text; ASR transcript for voice; for video v1, doctor-recorded notes since we don't ASR video sessions yet) → SOAP note (markdown) → `post_consult_soap_md`.
  2. SOAP → Rx draft → feeds existing `prescription-service.ts#createPrescription` as a doctor-reviewable draft.
  3. SOAP → follow-up suggestion (uses existing `followup_policy` per-modality logic) → DM with booking link if eligible.
- Doctor reviews/edits/signs/sends; patient receives prescription PDF in DM.

**D.3 — _(deferred to v2 per Decision 6)_ Live mid-consult red-flag detection.**

**Exit criteria for D.1:** every consult session created (any modality) gets a `pre_consult_brief_md` populated within 60s of session creation; doctor sees it on session join.

**Exit criteria for D.2:** every ended session (any modality with a transcript) results in (a) a saved SOAP draft, (b) an Rx draft attached to the appointment, both editable by the doctor before send.

**Estimated time:** D.1 = 6–8h; D.2 = 12–18h.

---

### Phase E — Cross-cutting glue

**Deliverables:**
- Reminder cron — modality-aware copy at T-24h / T-1h / T-15min, with the right join surface per modality (video link / voice link with "audio only, no phone call" disambiguation per Principle 8 / chat URL).
- **Recording consent capture at booking (Decision 4 LOCKED).** New checkbox in the booking flow + soft re-pitch flow if patient declines. Persisted to `appointments.recording_consent_at` (timestamp) + `appointments.recording_consent_decision` (`'consented'|'declined_after_pitch'`). Bot copy explainer for "Why we record". If declined, doctor sees session-start banner + Phase D AI pipeline gracefully skips.
- **Doctor pause/resume mid-consult (Decision 4 LOCKED).** UI in `<VoiceConsultRoom>`, `<VideoRoom>`, and `<LiveConsultPanel>`: "Pause recording" button → reason modal (≥5 chars, ≤200 chars) → audit log write → patient-visible system message + indicator badge → "Resume" button. Audit table `consultation_recording_audit` with `{ session_id, doctor_id, action, reason, occurred_at }`.
- **Patient self-serve replay surface (Decision 4 + Decision 10 LOCKED).** Long-lived signed URL `clariva.app/consult/{id}/replay?token=…` opens a stream-only player (no download) with watermark overlay (patient name + date + "Confidential — for personal use only"). **Audio-only loaded by default; "Show video" toggle visible when a video track exists for the recording; toggle click triggers a warning modal + (on first video replay per 30-day rolling window) light SMS OTP friction.** 90-day TTL on patient-side; archived (still in storage) after. Audit log write on every play with `access_type: 'audio_only' | 'full_video'`.
- **Mutual access notifications (Decision 4 + Decision 10 LOCKED).** When doctor replays, patient gets DM; when patient replays, doctor gets dashboard notification. **Notification copy reads from `access_type` and differentiates audio vs video access** ("reviewed the audio of your consult" vs "reviewed the **video** of your consult" with 🎥 indicator). Built atop existing notification fan-out helpers.
- **Doctor video-recording escalation flow (Decision 10 LOCKED).** Backend `recording-escalation-service.ts` handles the full escalation lifecycle: doctor request → reason capture → patient consent modal (60s timeout = decline) → backend starts video track via Twilio Recording Rules API → patient mid-call revoke → doctor rate-limited re-request (once per 5 min per session). All escalation events post system messages to the companion chat (Decision 9) for unified narrative.
- **Twilio Recording Rules track-toggle (Decision 10 LOCKED).** Backend `recording-track-service.ts` toggles audio-only vs audio+video at the Twilio Video room level via Recording Rules — same room SID throughout, just different rules at different moments. Output: separate audio + video Composition recordings keyed by `consultation_session_id`, allowing the replay player to load audio first and lazy-load video only when "Show video" is toggled.
- **Post-consult chat-history surface (Decision 1 sub-decision LOCKED).** Bot sends *"View your consultation: clariva.app/consult/{id}"* via DM/email/SMS fan-out after consult ends. Opens `<TextConsultRoom>` in **read-only mode**. Long-lived signed token (re-mintable). Same 90-day patient-side TTL as recordings.
- **Transcript PDF export (Decision 1 sub-decision LOCKED).** Doctor + patient can download a transcript PDF of the chat (text + attachment thumbnails + timestamps + participants). Server-side render via existing PDF stack (whatever `prescription-service.ts` uses for Rx PDFs).
- **Account deletion / patient data severing (Decision 4 LOCKED).** When patient deletes account: clinical record stays in doctor's EHR (regulatory) + patient self-serve access is severed (signed-URL revocation list). PII redacted from operational logs; clinical content retained.
- **Regulatory retention enforcement (Decision 4 LOCKED).** Per-country / per-specialty retention policy table — TTL job hides from patient self-serve at 90 days but **never deletes** until regulatory retention expires (3–10 years India, varies elsewhere). Right-of-erasure requests handled with medical-record carve-out.
- No-show + late-join policy + auto-refund/reschedule rails (one party fails to show).
- Post-consult survey DM.
- Prescription DM delivery hook on session end (already partially via `prescription-service.ts`; needs the auto-send hook).
- **Multi-channel notification fan-out (LOCKED 2026-04-19).**
  - **Existing infra (verified):** SMS via Twilio (`twilio-sms-service.ts`), email via `config/email.ts#sendEmail`, IG DM via `instagram-service.ts#sendInstagramMessage`. SMS is **already implemented**; not a new build.
  - **New helper `sendConsultationReadyToPatient(appointmentId, joinUrl, correlationId)`** — fan-out (parallel, all channels), modeled on `sendPrescriptionToPatient` not on `sendConsultationLinkToPatient`'s cascade. Returns `{ channels: { sms, email, instagram } }`. Used at slot start across all three modalities (video / voice / text join URL).
  - **New helper `sendPrescriptionReadyToPatient(prescriptionId, rxUrl, correlationId)`** — fan-out, sends IG DM ping + email + SMS in parallel. Replaces / augments the existing `sendPrescriptionToPatient` for the post-consult Rx-ready notification (existing helper still used for full Rx text+image delivery in IG DM; new helper is the "your Rx is ready, tap here" nudge).
  - **Rule of thumb:** fan-out for *clinically time-sensitive* events (consult-starting-now, Rx-ready). Cascade (existing `sendConsultationLinkToPatient`) for non-urgent events (booking confirmation, T-24h reminder) where 3 buzzes for a 24h-out reminder is annoying.
  - **Patient-phone capture verification** (Phase A.0 task) — `appointment.patient_phone` exists and is set at booking; need to verify the IG-bot booking flow actually asks for it before the SMS path can fan out reliably for IG-originated patients. Without phone, fan-out gracefully degrades to email + IG DM.
  - **Future v2 knob:** `doctor_settings.notification_priority: 'aggressive' | 'standard'` if doctors complain about over-notification; defer until real signal.

---

## Suggested sequencing

> _(open — needs user pick)_ — my recommendation, modify in place as decisions land:

**Updated 2026-04-19** to reflect Decision 6 lock (AI clinical assist deferred until delivery layer is solid):

0. **Phase A.0 — pre-flight verification (≤2h).** Confirm IG-bot booking flow captures `patient_phone` for IG-originated patients (so SMS fan-out fires). If not, add a one-step phone-collection nudge in the booking flow.
1. **Phase A — generalize video scaffolding into modality-agnostic facade.** Behavior-preserving refactor; existing video flow keeps working. Multi-channel notification fan-out helpers ship here too (so video benefits immediately).
2. **Phase C — text consult (Supabase Realtime).** The new modality. Cheaper to build than voice (no telco ops), strong India demand. **Most product-shaping work happens here.**
3. **Phase B — voice consult (Twilio Video audio-only WebRTC, Decision 2 LOCKED).** Smaller scope than originally planned (~4-6h vs 8-12h) because we reuse the entire video stack — voice is "video with the camera off". Same SDK, same auth, same webhooks, same recording pipeline. **No PSTN, no per-country phone numbers, no telco KYC** — global-day-one capable per Principle 2.
4. **Phase E — cross-cutting glue.** Reminders, no-show policy, consent disclosures, post-consult survey, prescription auto-send hook. Interleaved with B/C as needed.
5. **Phase D — AI clinical assist (deferred per Decision 6).** Pre-consult brief, post-consult SOAP/Rx. Ships only after the delivery layer (A + C + B + E) is proven in production. AI is a multiplier, not a foundation. Live mid-consult red-flag detection (D.3) is deferred even further.

---

## Tasks

> Each task gets a separate `task-NN-...md` file under `docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/`. **All product decisions are locked as of 2026-04-19.** Task list is complete pending owner review + sequencing confirmation.

| # | Phase | Title | Status | Notes |
|---|-------|-------|--------|-------|
| 14 | A.0 | Verify IG-bot booking flow captures `patient_phone` (for SMS fan-out) | 📋 To create | ≤2h. Audit `instagram-dm-webhook-handler.ts` + booking-state machine. If gap, add one-step phone nudge after slot pick. |
| 15 | A | Generalize video scaffolding into `consultation-session-service.ts` facade + `consultation_sessions` table (Decision 8 LOCKED schema) | 📋 To create | Behavior-preserving refactor. Lazy-write for in-flight rooms. Schema per Decision 8 (modality enum + provider + provider_session_id). Old `appointments` consultation columns from Migration 021 stay until post-cutover drop migration ~14 days after Phase A ships. ~4–6h. |
| 16 | A / E | Multi-channel notification fan-out helpers (`sendConsultationReadyToPatient`, `sendPrescriptionReadyToPatient`) | 📋 To create | Parallel SMS + email + IG, modeled on `sendPrescriptionToPatient`. Ships inside Phase A so video benefits too. ~3h. |
| 17 | C.1 | DB migration — `consultation_messages` table + RLS + Storage bucket policies | 📋 To create | Mirrors `prescription_attachments` RLS shape. ~2h. |
| 18 | C.2 | Backend `text-session-supabase.ts` adapter (sendMessage, lifecycle, signed-token URL) | 📋 To create | ~4h. |
| 19 | C.3 | Frontend `<TextConsultRoom>` mobile chat UI (Realtime subscriptions, typing/presence, attachments, optimistic send) | 📋 To create | ~6–8h. The bulk of Phase C. |
| 20 | C.4 | Doctor-side `<LiveConsultPanel>` + `<ConsultationLauncher>` inline on appointment detail page (all 3 modality buttons per Decision 7) | 📋 To create | Reuses `<TextConsultRoom>` plus AI brief side panel. ~2-3h. |
| 21 | C.5 | DM copy builders for consult-ready + Rx-ready (modality-aware, Principle 8 link-not-call disambiguation for voice) | 📋 To create | Extends `dm-copy.ts`. ~1h. |
| ~~22~~ | ~~D.1~~ | ~~Pre-consult AI brief — applied first to existing video flow~~ | ⏸ DEFERRED per Decision 6 | Phase D (all of AI clinical assist) is paused until delivery layer is solid. Will be reintroduced as task-NN after Phases A + C + B + E ship. |
| 23 | B.1 | Backend `voice-session-twilio.ts` adapter (Twilio Video audio-only wrapper, Decision 2 LOCKED) | 📋 To create | ~2h. Thin wrapper around existing `consultation-room-service.ts` flow with `audioOnly: true`. |
| 24 | B.2 | Frontend `<VoiceConsultRoom>` audio-only UI (mute/speaker/end + companion text panel auto-opened, fills main canvas per Decision 9 LOCKED) | 📋 To create | ~2-3h. Reuses `@twilio/video` SDK. Embeds `<TextConsultRoom mode='live'>` as the main visible surface (no video to look at). |
| 25 | B.4 | Voice transcription path — Whisper for English, Deepgram Indic for Hindi/Hinglish | 📋 To create | ~2h. Webhook → job queue → store transcript_url. Provider selection per-doctor or per-language-detected. |
| 26 | B.5 / C.5 | Voice-specific "audio only, no phone call" booking + DM disambiguation copy (Principle 8) | 📋 To create | ~1h. Extends `dm-copy.ts` + booking confirmation copy. Critical for setting patient expectation in India where "voice consult" defaults to "phone call". |
| 27 | E (Decision 4) | Recording consent capture at booking + soft re-pitch flow + decline handling | 📋 To create | ~3h. New checkbox in booking flow, `appointments.recording_consent_at` + `recording_consent_decision` columns, "Why we record" explainer, doctor session-start banner when declined, Phase D pipeline graceful skip. |
| 28 | E (Decision 4) | Doctor pause/resume mid-consult + reason audit log | 📋 To create | ~3h. New `consultation_recording_audit` table; pause button with reason modal in `<VoiceConsultRoom>` + `<VideoRoom>` + `<LiveConsultPanel>`; patient-visible system message + indicator badge; resume button. |
| 29 | E (Decision 4 + 10) | Patient self-serve replay surface (stream-only, watermarked, audit-logged) — handles both audio + video with the Decision-10 video-friction layer | 📋 To create | ~5h (was 4h, +1h for video-mode toggle + warning modal). Signed-URL replay player at `clariva.app/consult/{id}/replay`; no download; watermark overlay (patient name + date + "Confidential"); audio-only loaded by default; "Show video" toggle with warning modal per Decision 10; 90-day TTL on patient-side; archive (not delete) after; audit-log every play with `access_type: 'audio_only' \| 'full_video'`. |
| 30 | E (Decision 4 + 10) | Mutual access notifications (doctor↔patient on every recording replay) with audio-vs-video differentiation in copy | 📋 To create | ~3h (was 2h, +1h for differentiated copy + 🎥 indicator). Hook into Task 29 audit log; fan-out helper reads `access_type` and selects copy: "reviewed the audio" vs "reviewed the **video**" with 🎥 indicator. Both parties; both directions. |
| 31 | E (Decision 1 sub) | Post-consult chat-history surface (DM link → read-only `<TextConsultRoom>`) | 📋 To create | ~2h. Re-mintable signed token; `<TextConsultRoom>` `mode='readonly'` prop; bot DM/email/SMS fan-out post-consult-end. |
| 32 | E (Decision 1 sub) | Transcript PDF export for both parties | 📋 To create | ~3h. Server-side PDF render of chat transcript + attachment thumbnails + timestamps + participants. Reuses `prescription-service.ts` PDF stack. Doctor + patient download buttons. |
| 33 | E (Decision 4) | Account deletion → patient-side access severance + signed-URL revocation list | 📋 To create | ~3h. On patient account-delete, write to revocation table, all signed URLs check revocation on mint, doctor-side EHR retention preserved per regulatory rule. |
| 34 | E (Decision 4) | Per-country / per-specialty regulatory retention policy table + TTL job | 📋 To create | ~4h. New `regulatory_retention_policy` table keyed by `(country, specialty)`; nightly job archives recordings from patient self-serve UI at 90 days but never deletes until regulatory retention expires (3–10 years India default; per-country overrides configurable). |
| 35 | A (Decision 8 follow-up) | Post-cutover drop migration — remove obsolete consultation columns from `appointments` (~14 days after Task 15 ships) | 📋 To create | ~1h. After all in-flight video rooms have ended on the old code path, drop `consultation_room_sid`, `consultation_started_at`, `doctor_joined_at`, `patient_joined_at`, `consultation_ended_at`, `consultation_duration_seconds`, `verified_at` from `appointments` (per Migration 021). All future reads come from `consultation_sessions`. Keep `consultation_type` (booking-time field, not session-time). |
| 36 | A (Decision 9) | Lifecycle hook — auto-provision companion text channel for every voice/video session at `createSession()` | 📋 To create | ~2h. Extend `consultation-session-service.ts#createSession()` to always provision Supabase Realtime channel + open `consultation_messages` for system messages, regardless of `modality`. For text consults the channel IS the consult; for voice/video it's the companion. Same code path. Patient gets the chat URL via the same DM as the modality join link. |
| 37 | A (Decision 9) | Auto-emit system messages to companion chat (consult-started, recording-paused/resumed, party-joined, consult-ended) | 📋 To create | ~2h. New helper `consultation-system-message-service.ts` posts `consultation_messages` rows with `kind='system'` whenever lifecycle events fire. Builds on Decision 4 audit log writes (Task 28) so pause/resume system messages are auto-broadcast to the chat panel. |
| 38 | B / Decision 9 | Extend existing `<VideoRoom>` with companion chat panel (auto-opened, ~30% width side panel) | 📋 To create | ~2-3h. Reuses `<TextConsultRoom mode='live'>`. Doctor can collapse but default is open. Patient also auto-opened. Resizable / collapsible. Mobile: tab switcher (video / chat) since side-by-side doesn't fit. |
| 39 | C (Decision 9) | Extend `consultation_messages` schema with `attachment_url`, `attachment_mime_type`, `kind` enum (`'text'\|'attachment'\|'system'`) | 📋 To create | ~1h. Folded into Task 17 migration if not yet shipped; otherwise additive migration. RLS unchanged. AI pipeline (Phase D) reads one unified stream. |
| 40 | B / Decision 10 | Doctor "Start video recording" button + reason-capture modal in `<VideoRoom>` controls | 📋 To create | ~2h. Preset reasons (visible symptom, procedural, patient request, other) + free-text fallback (≥5 chars). Submit → server-side `recording-escalation-service.ts#requestVideoEscalation()` writes audit row + posts to companion chat. |
| 41 | B / Decision 10 | Patient consent modal for video escalation + 60s timeout + decline handling + rate-limited re-request | 📋 To create | ~3h. Modal interrupts patient's video screen; [Allow] [Decline]; 60s timeout = decline; on Allow → backend starts video track recording in same Twilio Video room; on Decline → doctor banner "describe in clinical notes"; doctor re-request rate-limited to once per 5 min per session. |
| 42 | B / Decision 10 | Persistent "🔴 Recording video" indicator + patient "Stop video recording" revoke button mid-call | 📋 To create | ~1.5h. Both parties see indicator while video recording active; patient sees revoke button next to indicator; click → backend stops video track recording + posts "Patient stopped video recording at HH:MM" to companion chat. |
| 43 | B / Decision 10 | Twilio Video Recording — toggle audio-only vs audio+video tracks via Recording Rules API | 📋 To create | ~2h. Backend `recording-track-service.ts` wraps Twilio Recording Rules: starts audio-only at session start; on doctor-escalate-approved, switches to include video track; on patient-revoke or doctor-pause, drops back to audio-only; on resume, re-includes video. Output: separate audio + video Composition recordings keyed by `consultation_session_id`. |
| 44 | E (Decision 10) | "Show video" toggle + warning modal in `<RecordingReplayPlayer>` + light SMS OTP friction on first video replay per 30-day rolling window | 📋 To create | ~3h. Player loads in audio-only mode; "Show video" toggle visible; click → warning modal with [Cancel] [Show video]; on first video replay per 30-day window, prompt SMS OTP; subsequent replays in window don't re-prompt. Audit `access_type='full_video'` writes only when video stream actually plays. |
| 45 | E (Decision 10) | DB migration — add `access_type` enum column to `recording_access_audit` table; add `video_otp_window` table for 30-day OTP-skip tracking | 📋 To create | ~1h. `access_type 'audio_only' \| 'full_video' NOT NULL DEFAULT 'audio_only'`. `video_otp_window (user_id, last_otp_verified_at)` keyed unique on user_id, drives the "skip OTP if last verified within 30 days" check. |
| 46 | A (Decision 11) | DB migration — `consultation_modality_history` child table + `consultation_sessions.current_modality` column + modality-switch rate-limit columns | 📋 To create | ~1.5h. `consultation_modality_history (id, session_id FK, from_modality, to_modality, initiated_by 'patient'\|'doctor', billing_action 'paid_upgrade'\|'free_upgrade'\|'no_refund_downgrade'\|'auto_refund_downgrade', amount_paise INT, razorpay_payment_id, razorpay_refund_id, reason TEXT, occurred_at)`. On `consultation_sessions`: add `current_modality`, `upgrade_count INT DEFAULT 0`, `downgrade_count INT DEFAULT 0`. RLS: both parties of the session can read; only backend service role writes. |
| 47 | A (Decision 11) | Backend `consultation-session-service.ts#requestModalityChange()` — handles all 6 transitions through a single state machine | 📋 To create | ~6h. Single entry point. Params: `session_id, requested_modality, initiated_by, reason?`. Computes: is-upgrade-or-downgrade, applies rate limits (1+1 max, 5min retry cooldown), routes to patient-initiated-upgrade / doctor-initiated-upgrade / patient-downgrade / doctor-downgrade handler. Emits Supabase Realtime events to drive UI modals on both sides. Transactional — all DB writes + provider calls in one atomic block or rollback. |
| 48 | A (Decision 11) | Backend `modality-transition-executor.ts` — provider-level switching (text→voice/video room provision, voice↔video camera toggle, voice/video→text disconnect) | 📋 To create | ~4h. Wraps Twilio Video room lifecycle + Recording Rules track toggles. Interface: `transitionTo(session, to_modality): Promise<{ provider_session_id, recording_artifact_id? }>`. Composes with existing `consultation-session-service.ts` adapters from Task 15. Crucially: preserves `consultation_session_id` across transitions (single session row, multiple modality segments). |
| 49 | A (Decision 11) | Backend billing integration — Razorpay mid-consult payment capture + auto-refund for modality transitions | 📋 To create | ~4h. `modality-billing-service.ts`: `captureUpgradePayment(session, amount_paise)` creates Razorpay order, returns checkout URL/token for patient app. `autoRefundDowngrade(session, amount_paise)` uses Razorpay Refunds API against original `appointments.razorpay_payment_id`. Handles partial-refund idempotency. Writes results to `consultation_modality_history` and posts system messages to companion chat. |
| 50 | B/C (Decision 11) | Frontend patient `<ModalityUpgradeRequestModal>` — initiate upgrade request + await doctor approval + Razorpay checkout on approval | 📋 To create | ~3h. Shown in `<TextConsultRoom>`, `<VoiceConsultRoom>`, `<VideoRoom>`. States: (1) request form with informational price (not yet charged), (2) awaiting doctor approval (90s countdown shown), (3) doctor-approved-paid → Razorpay checkout pop, (4) doctor-approved-free → auto-join higher modality, (5) doctor-declined → show reason + "Try once more" button (rate-limited), (6) timeout → auto-decline + retry. |
| 51 | B/C (Decision 11) | Frontend doctor `<ModalityUpgradeApprovalModal>` + `<ModalityDowngradeModal>` — doctor decision UI | 📋 To create | ~3h. Upgrade approval modal: three buttons `[Accept + Charge ₹X]` (default, highlighted) / `[Accept + Free]` / `[Decline]` + reason field on decline. Doctor-initiated upgrade modal: modality choice + reason capture (preset + free-text ≥5). Doctor-initiated downgrade modal: modality choice + reason capture + "₹X will be refunded to patient automatically" notice. All modals render in whichever consult room is active. |
| 52 | B/C (Decision 11) | Frontend patient consent modal for doctor-initiated upgrades + patient self-downgrade modal | 📋 To create | ~2h. Patient consent modal (60s timeout, same pattern as Decision 10): shows doctor's reason, `[Decline] [Allow]`. Patient self-downgrade modal: confirms "no refund" posture. Both wire to `consultation-session-service.ts#requestModalityChange()`. |
| 53 | A/E (Decision 11) | Auto-emit system messages to companion chat on every modality transition (unified narrative across modality segments) | 📋 To create | ~1.5h. Hook into Task 47 state machine: on every successful transition, emit a typed `kind='system'` row into `consultation_messages` with canonical copy: "Switched from voice to video at HH:MM by Dr. Sharma. Patient charged ₹300." / "Dr. Sharma downgraded to voice. ₹400 refunded to patient." / etc. Drives Decision 9's unified in-chat timeline regardless of where doctor/patient were looking when switch happened. |
| 54 | B/C (Decision 11) | "Request modality change" launcher buttons in all three consult rooms (patient + doctor views) | 📋 To create | ~2h. Render as small inline button in chat/call controls. Patient side: only allows upgrade → shows "Request upgrade" + target-modality picker. Doctor side: shows both "Upgrade" + "Downgrade". Buttons grey out when `upgrade_count >= 1` or `downgrade_count >= 1` respectively, with tooltip explaining the rate limit. |
| 55 | E (Decision 11) | Post-consult modality-history display on appointment detail page (doctor + patient) — shows every switch, reason, and billing action | 📋 To create | ~2h. Below the recording artifacts, show a compact timeline of modality transitions with timestamps, initiator, reason, and billing line item (₹X paid / free / ₹X refunded). Doctors see this for their own billing sanity-check; patients see this for receipt clarity. Pulls from `consultation_modality_history`. |

---

## Non-goals (this plan)

- Building our own WebRTC stack (Twilio is the abstraction).
- Replacing Razorpay / payment surface.
- Replacing Instagram DM as the primary patient-bot surface — patient still books in DM, just _delivers_ the consult on a branded chat URL / phone bridge / video room.
- ICD-10 coding, structured medical-record data extraction (post-consult AI ships markdown SOAP, not coded structured fields). Future plan.
- HIPAA / GDPR-grade compliance hardening (separate plan; Twilio Voice / Conversations both have BAAs available — opt in when needed).

---

## Open risks

| Risk | Mitigation |
|------|-----------|
| Patient expects a phone call for "voice consult" but gets a link instead | Principle 8: booking copy + DM copy explicitly says *"audio only, no phone call — tap link to join"*. Doctor-side dashboard surfaces "patient hasn't joined" with one-tap "resend link" via SMS+email. If real patient cohort feedback shows confusion at meaningful rates, add PSTN fallback in v2 behind the same `voice-session-*.ts` adapter interface (Decision 2 is reversible per-region in ~3 days adapter scope). |
| WebRTC voice quality on poor mobile networks (rural India, 3G) | Twilio Video already adapts bitrate. Audio-only mode is dramatically more forgiving than video on the same network. If real telemetry shows >5% call-quality complaints in a region, that's the trigger for revisiting Decision 2 PSTN-fallback per region. |
| Browser tab backgrounding kills the WebRTC audio mid-call (iOS Safari, Android Chrome) | Standard WebRTC issue. Mitigations: (1) keep-screen-awake API call when in active consult; (2) on-disconnect retry with reconnection toast; (3) doctor-side "patient dropped" alert with one-tap re-invite. |
| Supabase Realtime concurrent-connection limits hit at scale | Realtime tier sizing already covers projected v1–v2 consult volume (Mumbai region project). Re-evaluate at 200+ concurrent active consults. Fallback: graceful degradation to short-poll on `consultation_messages` if WebSocket drops. |
| Building chat UX (typing, read receipts, reconnect) ourselves takes longer than buying it from Twilio Conversations | Accepted ~3 extra build days vs Conversations to gain data ownership for AI pipeline + DPDP residency + zero MAU cost (see Decision 1 rationale). |
| Patient drops the IG → web-chat handoff (in-app browser quirks, blocked links, etc.) | Mitigations: (1) test the IG in-app browser path explicitly per OS; (2) fallback IG DM message says "if the link doesn't open, copy to Chrome/Safari"; (3) doctor-side surface shows "patient hasn't joined" with one-tap "resend link" that re-fans-out via SMS+email. |
| AI assist (Phase D) inflates LLM bill | D.1 is per-session (cheap, predictable). D.2 fires on session end (one call per session, slightly larger context). D.3 is the expensive one and is deferred to v2. |
| Doctors don't like reading AI-generated SOAP / Rx | Both ship as **drafts** that the doctor reviews/edits/signs. Never auto-send to the patient without doctor approval. |
| Migrating existing video sessions into the new `consultation_sessions` table breaks live calls | Phase A migration is **lazy-write** on next session creation; existing in-flight rooms keep using current code path until end-of-call. No back-fill on day one. |
| Recording storage cost balloons | Decision 4 LOCKED: 90-day patient self-serve TTL but full retention for regulatory window (3–10 yr India). Audio + transcript scale linearly (~7 MB / 15 min consult); video specifics still pending Decision 10. Operational cold-storage tier swap after 30 days deferred until storage bill becomes meaningful. |
| Doctor pauses recording silently mid-consult to hide behavior | Decision 4 LOCKED: pause requires reason capture (≥5 chars), patient-visible "Recording paused" indicator, audit log queryable for abuse-detection job. Future: doctors with pause-rate >X% trigger admin review. |
| Patient claims they didn't consent to recording | Decision 4 LOCKED: explicit booking-time checkbox + soft re-pitch + decline-runs-without-recording flow; consent timestamp + decision persisted to `appointments` row. Auditable per-appointment. |
| Patient demands deletion of recording before regulatory retention expires | Decision 4 LOCKED: medical-record carve-out under DPDP / GDPR — we honor where legally possible, withhold where regulator requires. Per-country `regulatory_retention_policy` table drives the rule. Patient receives an explainer DM citing the legal basis. |
| Mid-consult Razorpay checkout friction causes patient to drop the upgrade | Decision 11 LOCKED: accepted friction in v1 with UX mitigation ("Processing payment…" indicator in chat). Telemetry target: measure % of approved upgrades that actually complete payment. If <70% completion, prioritize stored-payment-method work for v2. |
| Doctor games doctor-initiated upgrade as free-to-them tax-deductible service-hours | Decision 11 LOCKED: doctor-initiated upgrades are free, so no financial gaming incentive exists. Reason capture required + logged to `consultation_modality_history` for audit. Abuse-detection job flags doctors with doctor-initiated-upgrade rate >X%. |
| Doctor downgrades aggressively to avoid work / shift duration, refund becomes cost-of-doing-business to them | Decision 11 LOCKED: doctor-initiated downgrade auto-refund is non-toggleable, so the doctor *always* loses revenue — creates natural disincentive. Reason capture required. Abuse-detection job flags doctors with high doctor-initiated-downgrade rates for admin review. |
| Patient spam-requests upgrades to harass doctor | Decision 11 LOCKED: rate-limited to 1 upgrade per consult + 1 retry per decline (5-min cooldown). After second decline, patient cannot re-request for that consult. |
| Modality transitions leave orphaned Twilio rooms / un-closed Recording artifacts | Decision 11 LOCKED: Task 48 `modality-transition-executor.ts` wraps state transitions in atomic DB-tx + explicit Twilio room teardown. Task 47 state machine is transactional — partial failures roll back the session to pre-transition modality. Reconciliation job at session-end verifies no orphaned provider resources. |
| Refund to patient fails (Razorpay error) during doctor-initiated downgrade | Decision 11 LOCKED: downgrade proceeds immediately (patient isn't held hostage by payment-processor issues); refund enters retry queue with exponential backoff; if still fails after 24h, flagged for manual ops intervention with admin dashboard surface. Patient sees "Refund of ₹X processing — expect within 3 business days" in chat system message. |

---

## Decision log

> Append entries as decisions land. Format: `- YYYY-MM-DD HH:MM — <decision> — <rationale> — <user/assistant>`.

- **2026-04-19 — Decision 1 (Text consult surface) → Path 4 hybrid: IG DM ping + branded web chat room (NOT pure IG DM, NOT pure web, NOT WhatsApp).**
  Rationale: gives patient zero-friction notification (already in IG DM), gives doctor real clinical UI, keeps PHI in our infra (avoiding Meta's 24h window, lack of BAA, plain-text limits, thread soup). One extra tap from patient is the only cost. Reuses existing IG send-API plumbing for the ping; only ~1h marginal IG-side code.
  — agreed by user.
- **2026-04-19 — Decision 1 sub-decision (chat backbone) → Supabase Realtime + Postgres (NOT Twilio Conversations).**
  Rationale: (1) transcript = direct SQL → AI clinical assist pipeline (Phase D) is a `SELECT` not a webhook-mirror system; (2) DPDP-clean — Supabase Mumbai region; Twilio Conversations has no India region GA; (3) cost is ~$0 vs Twilio MAU pricing (~$500/mo at 10k MAU, ~$5k/mo at 100k); (4) RLS reuse with existing prescription-attachment patterns; (5) no new vendor, no new auth, no new on-call surface; (6) zero vendor lock-in. Trade-off accepted: ~3 extra build days for typing indicators / read receipts / reconnection vs Twilio's batteries-included SDK. Twilio scope shrinks cleanly to its specialties (Video + Voice + SMS); each Twilio product for what it's uniquely good at, no conflation.
  — agreed by user.
- **2026-04-19 — WhatsApp deferred indefinitely.**
  Rationale: 2–4 week onboarding (Business Manager verification, number registration, template approval); per-conversation pricing; per-business-number model wrong for multi-doctor practices; Meta data-residency same as IG. Adapter interface kept generic (`text-session-*.ts`) so a `text-session-whatsapp.ts` can plug in later if real demand appears, but no schema or build work in v1.
  — agreed by user.
- **2026-04-19 — Notification fan-out for clinical urgent moments; cascade for everything else.**
  Rationale: consult-starting-now and Rx-ready are time-sensitive enough that 3 buzzes (SMS + email + IG DM) is correct; redundancy beats silent IG-failure. Booking confirmation / 24h reminder stay on the existing cascade pattern (`sendConsultationLinkToPatient`) where over-notification is annoying. SMS infra (`twilio-sms-service.ts`) already exists — verified by reading the codebase; not a new build. New helpers `sendConsultationReadyToPatient` and `sendPrescriptionReadyToPatient` modeled on `sendPrescriptionToPatient`'s parallel-fanout shape.
  — agreed by user.
- **2026-04-19 — Both PDF inline in chat room AND IG DM Rx-ready ping at end of consult.**
  Rationale: PDF in the room covers the "patient still on tab" case; IG DM ping covers the "patient closed the tab / lost the session" case. Belt-and-suspenders is correct for prescription delivery — we can't afford to silently fail to deliver an Rx.
  — agreed by user.
- **2026-04-19 — Decision 6 (AI clinical assist sequencing) → DEFERRED beyond v1 entirely.**
  Original recommendation was "v2 for live red-flag detection, v1 for pre/post AI brief". User direction is stronger: get core text + voice delivery layer working first, AI assist (all of Phase D) is an additive layer shipped after Phases A + C + B + E are proven. AI is a multiplier, not a foundation. Sequencing updated; Phase D moved from concurrent-with-Phase-A to last-after-everything. Task 22 (pre-consult brief) moved to deferred state.
  — directed by user.
- **2026-04-19 — Decision 7 (doctor surface placement) → inline on Appointment detail page, with all three modality launchers (Text / Voice / Video) rendered as buttons there.**
  User direction: "all text, voice, video buttons to appear on the profile page of that day's appointment". Generalize the existing video-room-renders-here area into a `<ConsultationLauncher>` that shows the right CTA per `appointment.consultation_type`, with alternates as secondary buttons (relevant once Decision 11 — mid-consult switching — lands). No dedicated "Live consultations" tab in v1. Same nav, no new top-level entry.
  — directed by user.
- **2026-04-19 — Decision 5 reworded for clarity (sync vs async terminology was opaque).** No change in recommendation; live-only for v1, messaging-mode is cleanly additive later.
- **2026-04-19 — Decision 5 (Live vs messaging text consults) LOCKED → live-only (sync) for v1; messaging-mode (async) deferred to v2+ as cleanly additive `mode: 'live' | 'messaging'` column on `consultation_sessions`.**
  Rationale: messaging-mode is a different product (different doctor habit, different patient expectation, different SLA enforcement, different pricing tier). Shipping it alongside live-mode in v1 would double doctor-onboarding cognitive load for zero proven demand. Cleanly additive later (no schema rewrite, no `consultation_messages` rewrite, no `text-session-supabase.ts` rewrite — just new UI surfaces and lifecycle states; ~3-5 days v2 cost). Trigger to revisit: real signal from doctors ("can patients message me follow-up questions?") or patients ("I just need a quick lab report read"). Most likely first appearance is follow-up consults + derm rashes + lab report reviews.
  — agreed by user.
- **2026-04-19 — Decision 8 (Schema shape) LOCKED → ONE `consultation_sessions` table for all three modalities. Generic `provider` + `provider_session_id` collapse Twilio Video room SID / Twilio Video audio-only room SID / Supabase Realtime channel ID into uniform shape. Adapters carry the provider knowledge; downstream is modality-blind.**
  Rationale: all three modalities share the **identical lifecycle** (booked → joined → started → ended → recorded → transcripted → AI-processed → no-show-handled). Only the live-session backend differs, which belongs in the adapter layer not the schema. Rejected Option A (keep adding columns to `appointments`) — becomes a 50-column wide-table with ~75% NULL; every modality + provider needs `ALTER TABLE`. Rejected Option C (three per-modality tables `video_sessions` / `voice_sessions` / `text_sessions`) — cross-modality queries become 3-way `UNION ALL`; Phase D AI pipeline has to fan out three queries; mid-consult modality switching (Decision 11) becomes destroy-and-recreate; adding a fourth modality means a fourth table + duplicated migrations. Concrete benefits unlocked: Phase A is exactly this refactor with lazy-write strategy; Decision 11 simplification; Phase D = same SQL across modalities; RLS policies write once; Decision 4 recording doctrine applies uniformly via `consultation_session_id` keying; adding a future modality = enum value + new adapter file. Existing video columns on `appointments` (Migration 021) stay during cutover and get dropped ~14 days post-Phase-A by Task 35. Secondary tables (`consultation_messages`, `consultation_recording_audit`, `recording_access_audit`, `consultation_modality_history`) FK back to `consultation_sessions.id`. Schema fully spec'd in the Decision 8 entry above (target shape finalized in Task 15 migration).
  — agreed by user.
- **2026-04-19 — Decision 9 (Companion text channel during voice/video) LOCKED → always-on for both voice and video; auto-opened (not collapsed); attachments live as `consultation_messages` rows; chat is a free affordance billed only as the booked modality.**
  Rationale: text room infrastructure is a sunk cost from Phase C; enabling it for voice/video is purely a UI affordance with zero new backend. Voice has no video to look at — chat IS the visible surface, so it must auto-open and fill the canvas. Video gets a side panel (~30% width on desktop, tab switcher on mobile). Attachments unified into `consultation_messages` (with nullable `attachment_url` + `attachment_mime_type` + `kind` enum) gives one EHR row, single timestamp ordering for transcript, AI pipeline reads one stream not two, RLS rules write once, transcript PDF export is one query. System messages (consult-started, recording-paused/resumed, party-joined, consult-ended) post to the same chat thread for unified narrative. Lifecycle hook in `consultation-session-service.ts#createSession()` always provisions the chat channel regardless of modality. **Cascading effect on Decision 11:** "switch to text mid-call" is no longer a switching problem (panel is already open); only voice↔video switching remains as a real Decision 11 question. **Cascading effect on Phase D (AI clinical assist):** post-consult SOAP gets a single timestamped narrative composed of audio transcript merged with chat messages and attachment captions — coherent input for the LLM, not three disjoint streams.
  Sub-questions answered: (1) ✅ chat panel auto-opens (not collapsed) for both video and voice; doctor can collapse manually. (2) ✅ attachments are `consultation_messages` rows, no separate `consultation_attachments` surface. (3) ✅ chat is a free affordance, billed only as voice/video; no "voice + text" SKU.
  — agreed by user.
- **2026-04-19 — Decision 11 (Mid-consult modality switching) substantially collapsed by Decision 9 LOCK; entry rewritten in place.** Text-during-voice/video is no longer a switch (companion panel always-on per Decision 9). Only voice↔video remains a real switching question, and it's trivially cheap thanks to Decision 2 (voice = video-with-camera-off → switch is "enable camera track on existing Twilio Video room"; same SID, no recreation, recording continuous). Lock for the remaining voice↔video question still pending discussion.
- **2026-04-19 — New open questions raised by user: 9 (companion text channel during voice/video), 10 (video recording policy + storage cost reality), 11 (mid-consult modality switching), 12 (voice recording details parallel to 10).** All added as _(open)_ entries in Open product decisions. To be discussed one by one. Rationale numbers, options, and concrete trade-offs (storage cost in MB/GB per consult, industry baselines) captured inline in each entry so the discussion can start from a shared baseline.
- **2026-04-19 — New Principle 2 LOCKED: "code global, start India".**
  Direction from user: "I am planning to make this a global product day 1, anyone around the world any doc can start using it, but yeah India first because it's gonna be easier for me. Code like global, start India." Implication: every architectural choice must be **global-day-one capable** — no per-country phone numbers in hot path, no India-only providers in core flow, no INR-only assumptions baked into core schemas. India is the first market for ops-easy reasons (existing IG-DM patient surface, Razorpay, DPDP-compliant Mumbai-region Supabase, existing doctor cohort). Currency / payment / language i18n is a **separate plan** but voice/text/video delivery cannot be the rate-limiter for global expansion. This principle directly drove the Decision 2 lock.
  — directed by user.
- **2026-04-19 — Decision 2 (Voice provider for v1) → WebRTC-only via Twilio Video in audio-only mode. NO PSTN. Decision 3 (voice flow style) RESOLVED-BY-DECISION-2 — moot since there's no phone number to mask.**
  Original recommendation was "(a) Twilio Programmable Voice for v1 with India cost-watch". Reversed after user's "global day one" framing surfaced PSTN's per-country ops tax (phone-number rental + KYC + carrier rates per country). WebRTC sidesteps **all** of that — same SDK works in India, US, UAE, Nigeria, Brazil at flat per-minute cost. Concrete cost data: WebRTC ≈ $120/mo at 1k consults; Twilio India PSTN alone ≈ ~₹50k (~$600). Each new country adds zero WebRTC cost vs $300-1000+ PSTN cost. Voice adapter is now ~150 lines reusing `consultation-room-service.ts` instead of a 600+-line PSTN integration. Phase B estimate dropped 8-12h → 4-6h. Trade-off accepted: patient must keep browser tab open with screen on; mitigation = booking + DM copy explicitly says "audio only, no phone call — tap link to join" (Principle 8, new). Adapter interface is provider-agnostic — PSTN fallback can be added per-region in v2+ behind the same `voice-session-*.ts` interface in ~3 days.
  — directed by user.
- **2026-04-19 — New Principle 8 LOCKED: voice booking copy must explicitly set the link expectation.**
  Direction from user: "when someone books a voice appointment we can clearly mention the call won't be on phone number but a link will be provided." Avoids "but the doctor never called me" support tickets in markets where "voice consult" defaults to "phone call" (especially India). Captured in Principle 8 + Phase B.5 deliverable + Task 26.
  — directed by user.
- **2026-04-19 — Decision 4 (Recording defaults — global doctrine across all modalities) LOCKED.**
  - **Default state:** recording **on by default** for every consult. Audio for voice; audio-track-of-video for video (full-video specifics still open under Decision 10); the chat log itself for text.
  - **Doctor controls:** ❌ no global "I never record" toggle (recordings protect doctor in malpractice; "I forgot to turn it back on" silently loses audit trail; B2B clinic sales need consistency). ✅ per-session pause/resume mid-consult **with reason capture (≥5 chars, ≤200 chars) + audit log + patient-visible "Recording paused" indicator + system message**. Audit table `consultation_recording_audit` with `{ session_id, doctor_id, action, reason, occurred_at }`. Pause-reason free text supports future abuse-detection.
  - **Patient consent:** captured at booking time (one place), soft re-pitch on decline ("Why we record" explainer), declined-after-pitch runs **without** recording (doctor sees session-start banner, Phase D AI pipeline gracefully skips). Booking is **not** blocked. No mid-consult patient toggle (state cleanliness).
  - **Access:** doctor indefinite via dashboard (regulatory retention drives this — India 3–10 yr per state/specialty). Patient self-serve replay enabled with friction — **stream-only no download, watermark overlay (patient name + date + "Confidential — for personal use only"), 90-day TTL on patient-side after which archived (still in storage) but hidden from self-serve UI**, audit-logged on every play, **mutual access notifications** (doctor replays → patient gets DM; patient replays → doctor gets dashboard notification). Builds trust + audit transparency. Note: patient self-serve for full-video may end up doctor-only-with-request per Decision 10; audio + transcripts are fine for self-serve everywhere.
  - **Retention vs access (separate clocks):** regulatory retention 3–10 yr India per state/specialty (cannot delete pre-expiry even on patient request, medical-record carve-out under DPDP/GDPR); patient self-serve UI access 90 days; patient via support for the full retention window; right-to-erasure honored where legally possible.
  - **Account deletion:** clinical record stays in doctor EHR (regulatory), patient-side access severed (signed-URL revocation list), PII redacted from operational logs.
  - **Why no global doctor opt-out:** philosophical-refusers can't use Clariva; acceptable filter. Recordings are a doctor *protection*, not a doctor *cost*.
  Decision sub-questions answered:
    1. ✅ pause/resume should be there (per-session, with audit + reason).
    2. ✅ run without recording on patient decline + soft re-pitch + doctor banner.
    3. ✅ recommendation accepted: indefinite-doctor + 90-day-patient-self-serve + indefinite-via-support + audit + mutual notifications.
    4. ✅ mutual access (both doctor and patient access recordings; same applies to text chat history).
    5. _(deferred to Decision 10 discussion — full-video patient-access specifics)._
    6. ✅ recommendation accepted (separate retention vs access clocks; per-country regulatory policy table; account-deletion severance pattern).
  — directed by user.
- **2026-04-19 — Decision 12 (Voice recording details) LOCKED → inherits Decision 4. No fork.**
  All four sub-questions answered by Decision 4's global doctrine: 90-day self-serve TTL, indefinite for regulatory + doctor dashboard, cold-storage-after-30-days deferred (operational, not product), patient replay rights ✅ (audio is low weaponization risk), per-session pause/resume but no global doctor opt-out, patient consent at booking with soft re-pitch. One recording-policy doctrine across the product. Implementation path: Twilio Video Recording with audio-track filter (~7 MB per 15-min consult), feeds Whisper / Deepgram-Indic transcription pipeline (Phase B.4).
  — directed by user.
- **2026-04-19 — Decision 1 sub-decision (text chat post-consult access) LOCKED.**
  Both parties indefinite read access (subject to regulatory retention vs 90-day self-serve TTL clocks). Doctor: chat transcript view inside appointment detail page. Patient: post-consult DM link → `<TextConsultRoom>` in **read-only mode** (no new messages, no edits, no deletions) — Option (b), reuses the same UI surface with a `mode='readonly'` prop, no new patient-portal infrastructure needed. Transcript PDF export available to both (useful for second opinions, insurance claims). Attachments same access pattern via RLS-enforced signed URLs. Same TTL doctrine as recordings (90-day self-serve, indefinite via support, doctor indefinite). Audit-logged every access. Rationale for indefinite both-party text access (vs potentially restricted full-video): patient can screenshot anyway (no DRM possible for text), text *is* the consultation rather than a record OF it, storage trivial, weaponization risk low (no body parts). Withholding text post-consult is theater, not security.
  — directed by user.
- **2026-04-19 — Decision 10 (Video recording specifics) LOCKED → audio-only by default during video consults; full-video = doctor-initiated escalation flow with reason capture + just-in-time patient consent modal (60s timeout = decline) + patient mid-call revoke + rate-limited doctor re-request. Patient self-serve video replay allowed with audio-only-default player + "Show video" toggle + warning modal + light SMS OTP on first video replay per 30-day rolling window. Mutual access notifications inherit Decision 4 + differentiate audio vs video access in copy ("reviewed the audio" vs "reviewed the **video**" + 🎥 indicator).**
  Rationale: industry baseline (Practo / 1mg / Apollo / MFine) records audio + transcript by default, full video opt-in for procedural documentation — locks us in line with where the market is. Storage cost stays in the noise (~3-15 GB/month new at 1k consults, ~$0.30/mo) instead of the 340 GB/month worst case. PHI risk surface stays minimal — no full-call video by default means the derm/uro/gyn nudity concern almost never produces a stored artifact. Doctor still has the procedural-documentation use case via on-demand escalation. Patient self-serve video replay is **allowed** (denying access to the patient's own recording is paternalistic) but with extra friction beyond audio because the screenshot/share concern is real for video in a way it isn't for audio. SMS OTP on first video replay per 30-day rolling window is the right level of friction — meaningful for the casual-share scenario (someone with access to patient's logged-in browser), trivial annoyance for the patient who genuinely wants to review their own consult. Mutual notification differentiation is essentially free (audit log already needs `access_type` for compliance; notification template just reads the field) and gives a real wellness signal both ways. Implementation path: Twilio Video Recording Rules API toggles audio-only vs audio+video tracks at the same room SID throughout the consult — same room, different rules at different moments. Output: separate audio + video Composition recordings keyed by `consultation_session_id` so the replay player loads audio first and lazy-loads video only when "Show video" is toggled. Combined audio+video pause for v1 (separate-pause overkill). Specialty-aware defaults DEFERRED to v2; patient-visible access history page DEFERRED to v1.1. v1 is doctor-initiated only, no auto-prompt, no specialty defaults — same flow for everyone.
  Sub-questions answered: (1) ✅ doctor-initiated escalation flow with reason capture + patient consent modal. (2) ✅ 60s patient consent timeout = decline. (3) ✅ combined audio+video pause for v1. (4) ✅ doctor reason capture (preset + free-text fallback) — same audit pattern as Decision 4 pause/resume. (5) ✅ patient self-serve replay = audio-only default + "Show video" toggle + warning + SMS OTP on first video replay per 30 days. (6) ✅ mutual notifications inherit Decision 4 + differentiate audio vs video copy. (7) ✅ same TTL + watermark + no-download + audit log doctrine as Decision 4. (8) ⏭ specialty-aware defaults deferred to v2. (9) ⏭ patient-visible access history page deferred to v1.1. (10) ✅ no snapshots stored when patient declines video escalation — single-frame intimate images are arguably worse than streaming video for consent reasons.
  — agreed by user.
- **2026-04-19 — Decision 11 (Mid-consult modality switching) LOCKED → all 6 transitions supported in v1 (text↔voice↔video both directions, both initiators). Symmetric "initiator absorbs the cost" billing doctrine.**
  - **v1 scope:** Option C — full transition matrix. User direction: "don't defer anything, we gotta make all at once, I will give more time."
  - **Billing doctrine (memorize):** patient-initiated upgrades → doctor decides paid (default) vs free, payment processed only **after** doctor approves; doctor-initiated upgrades → always free; patient-initiated downgrades → no refund; doctor-initiated downgrades → always auto-refund difference (no toggle). Whoever initiates absorbs the cost. Doctor-initiated changes **never benefit doctor financially**, removing gaming incentive.
  - **Rate limits:** max 1 upgrade + 1 downgrade per consult; 1 retry per decline with 5-min cooldown; after second decline no more requests in session.
  - **Timing:** full delta regardless of timing within slot; slot `expected_end` unchanged by transitions.
  - **Technical implementation:** single `consultation_session_id` preserved across all transitions; `current_modality` field on session + `consultation_modality_history` child table logs every switch. voice↔video reuses same Twilio Video room via camera-track toggle (trivial — Decision 2 payoff). text↔voice/video provisions/disconnects Twilio rooms while Supabase Realtime chat channel continues unchanged. One recording artifact per modality segment; Phase D (when it ships) merges all artifacts + chat transcript by timestamp into one narrative. State machine lives in `consultation-session-service.ts#requestModalityChange()` with atomic DB-tx + provider teardown/provision.
  - **Razorpay friction:** accepted in v1 (~30-60s for OTP) with "Processing payment…" UX indicator; stored payment method for frictionless micropayments is explicit v2 work.
  - **Timeouts:** 90s doctor approval timeout on patient-initiated upgrade → auto-decline with retry option; 60s patient consent timeout on doctor-initiated upgrade → treated as decline (consistent with Decision 10).
  - **Reason capture:** preset + free-text (≥5 chars, ≤200 chars); required for all doctor-initiated switches (both directions) + patient-initiated downgrades; optional for patient-initiated upgrades (the request itself is the reason); logged to `consultation_modality_history.reason` for abuse-detection + support-dispute purposes — same audit pattern as Decision 4 pause/resume + Decision 10 video escalation.
  - **System messages:** every switch auto-posts to companion chat with canonical copy ("Switched from voice to video at HH:MM by Dr. Sharma. Patient charged ₹300.") for unified narrative across modality segments (leverages Decision 9 always-on chat).
  - **Refund resilience:** doctor-initiated downgrade proceeds immediately even if refund fails; refund enters retry queue with 24h exponential backoff; patient sees "Refund of ₹X processing — expect within 3 business days" in chat.
  Sub-questions answered: (1) ✅ v1 scope = all 6 transitions (Option C per user direction). (2) ✅ patient-initiated upgrade: doctor decides paid/free (default paid), payment only after approval. (3) ✅ doctor-initiated upgrade: always free, no billing UI. (4) ✅ patient-initiated downgrade: no refund. (5) ✅ doctor-initiated downgrade: always auto-refund, no toggle. (6) ✅ max 1 upgrade + 1 downgrade per consult. (7) ✅ full delta regardless of timing. (8) ✅ accept Razorpay friction in v1, stored payment method v2. (9) ✅ 90s doctor approval timeout. (10) ✅ 60s patient consent timeout (matches Decision 10). (11) ✅ reason capture pattern consistent with Decision 4 + Decision 10.
  — agreed by user.
- **2026-04-19 — 🎯 ALL PRODUCT DECISIONS LOCKED.** With Decision 11 locked, this plan has zero open decisions. Plan transitions from "in-discussion" to "ready for task breakdown + sequencing + implementation". 55 tasks defined across Phases A / B / C / D / E, all grounded in locked product decisions. Next operational step: owner review of task sequencing, identify v1-critical-path subset, create `task-NN-*.md` files per repo convention (Tasks 14-55 are currently table-entries only).

---

## Files expected to touch (high-level — refines per task)

**Phase A.0 (verification):**
- `backend/src/workers/instagram-dm-webhook-handler.ts` (audit only — confirm phone capture in booking states)
- Possibly: `backend/src/utils/dm-copy.ts` + booking state machine to add a `collectPhoneForSms` step if missing

**Phase A:**
- `backend/src/services/consultation-room-service.ts` → renamed `video-session-twilio.ts`
- `backend/src/services/consultation-session-service.ts` (new — modality-agnostic facade)
- `backend/src/services/consultation-verification-service.ts` (extend to read/write new table)
- `backend/src/services/notification-service.ts` (new fan-out helpers `sendConsultationReadyToPatient`, `sendPrescriptionReadyToPatient`)
- `backend/src/types/consultation-session.ts` (new)
- DB migration — new `consultation_sessions` table

**Phase B (LOCKED — Twilio Video audio-only WebRTC, Decision 2):**
- `backend/src/services/voice-session-twilio.ts` (new — thin wrapper around existing `consultation-room-service.ts` with `audioOnly: true`)
- `backend/src/controllers/twilio-webhook-controller.ts` (no extension needed for v1 — Video webhooks already cover audio-only rooms; only needed if/when PSTN fallback is added in v2)
- `frontend/components/consultation/VoiceConsultRoom.tsx` (new audio-only UI — mute/speaker/end + companion text panel per Decision 9)
- `backend/src/utils/dm-copy.ts` (extend `buildConsultationReadyDm` voice variant with explicit "audio only, no phone call" disambiguation per Principle 8; extend `buildPaymentConfirmationMessage` similarly for booking-time expectation-setting)
- `backend/src/services/voice-transcription-service.ts` (new — Whisper / Deepgram Indic job runner triggered by Twilio Video Recording webhook)

**Phase C (LOCKED — Supabase Realtime):**
- DB migration — new `consultation_messages` table + RLS + Storage bucket policies
- `backend/src/services/text-session-supabase.ts` (new — Realtime adapter; sendMessage, lifecycle, signed-token URL)
- `backend/src/services/consultation-message-service.ts` (new — RLS-safe CRUD; mirrors `prescription-attachment-service.ts` patterns)
- `backend/src/routes/api/v1/consultation.ts` (extend `/token` for chat-scope tokens; new `/messages` and `/attachments` endpoints OR direct-Supabase-client with RLS)
- `frontend/components/consultation/TextConsultRoom.tsx` (new — mobile chat UI on `@supabase/supabase-js` Realtime)
- `frontend/components/consultation/LiveConsultPanel.tsx` (new — doctor-side wrapper with AI brief + Rx draft)
- `backend/src/utils/dm-copy.ts` (extend with `buildConsultationReadyDm`, `buildPrescriptionReadyDm`)

**Phase D:**
- `backend/src/services/consultation-ai-brief.ts` (new — pre-consult brief)
- `backend/src/services/consultation-ai-soap.ts` (new — post-consult SOAP + Rx)
- `backend/src/workers/consultation-post-session-worker.ts` (new — auto-fires on session end)
- `frontend/components/consultation/ConsultationBriefPanel.tsx` (new — side panel during session)
- Hook into existing `prescription-service.ts#createPrescription` for Rx draft.

**Phase E (Decision 4 + Decision 1 sub-decision LOCKED — recording + chat access doctrine):**
- DB migration — `appointments.recording_consent_at` + `appointments.recording_consent_decision` columns
- DB migration — new `consultation_recording_audit` table (`session_id`, `doctor_id`, `action`, `reason`, `occurred_at`)
- DB migration — new `recording_access_audit` table (`recording_id`, `accessed_by_user_id`, `accessor_role`, `accessed_at`)
- DB migration — new `signed_url_revocation` table (driven by patient account-delete)
- DB migration — new `regulatory_retention_policy` table keyed by `(country, specialty)`
- `backend/src/services/recording-consent-service.ts` (new — handles booking-time consent capture + soft re-pitch state machine)
- `backend/src/services/recording-access-service.ts` (new — mints stream-only signed URLs, enforces 90-day patient-side TTL, writes audit, fans out mutual-access notification, checks revocation list)
- `backend/src/services/recording-pause-service.ts` (new — handles doctor pause/resume mid-consult, writes to `consultation_recording_audit`, broadcasts patient-visible system message via Realtime)
- `backend/src/workers/recording-archival-worker.ts` (new — nightly job hides recordings from patient self-serve at 90 days; never deletes until regulatory retention expires per `regulatory_retention_policy`)
- `backend/src/workers/account-deletion-worker.ts` (new or extend — on patient delete, write to `signed_url_revocation`, redact PII from operational logs, preserve clinical content)
- `backend/src/services/transcript-pdf-service.ts` (new — server-side PDF render of chat transcript; reuses `prescription-service.ts` PDF stack)
- `backend/src/utils/dm-copy.ts` (extend — `buildPostConsultChatLinkDm`, `buildRecordingReplayedNotificationDm`)
- `frontend/components/consultation/TextConsultRoom.tsx` (extend — `mode: 'live' | 'readonly'` prop)
- `frontend/components/consultation/RecordingControls.tsx` (new — pause/resume button + reason modal, embedded in `<VoiceConsultRoom>` + `<VideoRoom>` + `<LiveConsultPanel>`)
- `frontend/components/consultation/RecordingPausedIndicator.tsx` (new — patient-visible badge + system message)
- `frontend/components/consultation/RecordingReplayPlayer.tsx` (new — stream-only player with watermark overlay; handles 404 on revoked/expired URLs)
- `frontend/components/booking/RecordingConsentCheckbox.tsx` + `RecordingConsentRePitchModal.tsx` (new — booking-flow consent capture)
- `frontend/components/consultation/SessionStartBanner.tsx` (new — shows "patient declined recording, use clinical notes" when applicable)

**Phase E (Decision 10 LOCKED — video-recording escalation + replay friction):**
- DB migration — extend `recording_access_audit` with `access_type enum('audio_only', 'full_video') NOT NULL DEFAULT 'audio_only'`
- DB migration — new `video_otp_window` table (`user_id`, `last_otp_verified_at`) for 30-day OTP-skip tracking
- DB migration — new `video_escalation_audit` table (`session_id`, `doctor_id`, `requested_at`, `reason`, `patient_response: 'allow' | 'decline' | 'timeout'`, `responded_at`)
- `backend/src/services/recording-escalation-service.ts` (new — handles doctor video-escalation request flow, patient consent prompt, 60s timeout, rate-limited re-request, audit writes, system-message broadcasts to companion chat per Decision 9)
- `backend/src/services/recording-track-service.ts` (new — wraps Twilio Video Recording Rules API to toggle audio-only vs audio+video tracks at the same room SID throughout the consult; keys output Compositions by `consultation_session_id`)
- `backend/src/services/video-replay-otp-service.ts` (new — checks `video_otp_window` table on first video replay per 30-day rolling window, prompts SMS OTP via existing `twilio-sms-service.ts`)
- `backend/src/utils/dm-copy.ts` (extend — `buildRecordingAccessNotificationDm` reads `access_type` and selects audio vs video copy with 🎥 indicator)
- `frontend/components/consultation/RecordingReplayPlayer.tsx` (extend — audio-only mode by default, "Show video" toggle only renders when video Composition exists, warning modal on toggle, OTP prompt flow)
- `frontend/components/consultation/VideoEscalationButton.tsx` (new — "Start video recording" button + reason-capture modal in `<VideoRoom>` controls)
- `frontend/components/consultation/VideoConsentModal.tsx` (new — patient-facing consent prompt with [Allow]/[Decline]; 60s timeout countdown indicator)
- `frontend/components/consultation/VideoRecordingIndicator.tsx` (new — persistent "🔴 Recording video" badge for both parties + patient "Stop video recording" revoke button)

**Phase A/B/C/E (Decision 11 LOCKED — mid-consult modality switching):**
- DB migration — new `consultation_modality_history` child table (`id`, `session_id FK`, `from_modality`, `to_modality`, `initiated_by`, `billing_action`, `amount_paise`, `razorpay_payment_id`, `razorpay_refund_id`, `reason`, `occurred_at`)
- DB migration — extend `consultation_sessions` with `current_modality`, `upgrade_count INT DEFAULT 0`, `downgrade_count INT DEFAULT 0`
- `backend/src/services/consultation-session-service.ts` (extend — `requestModalityChange()` single-entry state machine; routes to patient/doctor + upgrade/downgrade handlers; enforces rate limits; transactional)
- `backend/src/services/modality-transition-executor.ts` (new — provider-level switching: text→voice/video provision, voice↔video camera-track toggle via Twilio Recording Rules API composition, voice/video→text disconnect; preserves `consultation_session_id` across all transitions)
- `backend/src/services/modality-billing-service.ts` (new — Razorpay mid-consult capture for patient-initiated paid upgrades; Razorpay Refunds API for doctor-initiated downgrade auto-refund; partial-refund idempotency; retry queue for failed refunds with 24h exponential backoff)
- `backend/src/workers/modality-refund-retry-worker.ts` (new — processes stuck refunds; admin dashboard surface for >24h failures)
- `backend/src/utils/dm-copy.ts` (extend — `buildModalityUpgradeRequestDm`, `buildModalityDowngradeRefundDm`, `buildRefundProcessingDm`)
- `frontend/components/consultation/ModalityUpgradeRequestModal.tsx` (new — patient-side: request form → awaiting-approval with 90s countdown → Razorpay checkout on paid-approval → join-higher-modality on free-approval → retry-on-decline)
- `frontend/components/consultation/ModalityUpgradeApprovalModal.tsx` (new — doctor-side: three-button decision [Accept+Charge₹X] [Accept+Free] [Decline+Reason])
- `frontend/components/consultation/ModalityDowngradeModal.tsx` (new — doctor-side: modality picker + reason capture + "₹X will be refunded automatically" notice)
- `frontend/components/consultation/DoctorUpgradeInitiationModal.tsx` (new — doctor-side: free-upgrade modality picker + reason capture)
- `frontend/components/consultation/PatientUpgradeConsentModal.tsx` (new — patient-side: 60s consent timer for doctor-initiated upgrade, shows doctor's reason)
- `frontend/components/consultation/PatientDowngradeModal.tsx` (new — patient-side: "no refund" confirmation on self-downgrade)
- `frontend/components/consultation/ModalityChangeLauncher.tsx` (new — inline button in chat/call controls; grey-outs with tooltip when rate limit hit)
- `frontend/components/consultation/ModalityHistoryTimeline.tsx` (new — post-consult compact timeline on appointment detail page for doctor + patient; pulls from `consultation_modality_history`)

---

## Status footer

- **Created:** 2026-04-19
- **Last updated:** 2026-04-19 (ninth pass) — 🎯 **Decision 11 (Mid-consult modality switching) LOCKED. ALL PRODUCT DECISIONS NOW LOCKED.** Option C scope: all 6 transitions (text↔voice↔video, both directions, both initiators) ship in v1 per explicit user direction ("don't defer anything, we gotta make all at once, I will give more time"). Billing doctrine is cleanly symmetric — initiator absorbs the cost: patient-initiated upgrades are paid-after-approval with doctor-choice paid(default)/free, doctor-initiated upgrades are always free (no billing UI), patient-initiated downgrades = no refund, doctor-initiated downgrades = always auto-refund difference (no toggle). Rate-limited to 1 upgrade + 1 downgrade per consult. Full delta regardless of timing within slot. Razorpay friction accepted in v1 with stored-payment-method deferred to v2. 90s doctor approval timeout + 60s patient consent timeout. Reason capture required for all doctor-initiated switches + patient-initiated downgrades (preset + free-text ≥5 chars, same audit pattern as Decision 4/10). System messages auto-post to companion chat for unified narrative. Single `consultation_session_id` preserved across all transitions with `consultation_modality_history` child table. voice↔video reuses same Twilio Video room via camera-track toggle (Decision 2 payoff). Tasks 46-55 added (modality-history schema, state machine, transition executor, billing integration, patient/doctor upgrade+downgrade modals, launcher buttons, post-consult history timeline). Open-risks table expanded with 6 Decision-11-specific entries (Razorpay drop-off, doctor gaming, patient spam, orphaned Twilio rooms, refund failure resilience). Files-to-touch gained a Decision 11 block (~13 new files / 2 migrations). Decision log entry added + milestone "ALL PRODUCT DECISIONS LOCKED" entry. Plan has transitioned from in-discussion to **ready for task breakdown and sequencing** — 55 tasks all grounded in locked product decisions.
- **Owner:** TBD
- **Status:** ✅ **PRODUCT DECISIONS COMPLETE.** Next operational step = owner review of task sequencing, identify v1-critical-path subset, create `task-NN-*.md` files for Tasks 14-55.
