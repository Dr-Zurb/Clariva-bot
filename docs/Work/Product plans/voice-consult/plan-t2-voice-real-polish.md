# Voice T2 — Real polish (9 items, ~3–4 days)

## Next-sprint clinical UX: pre-call lobby, caller card, hold, auto-extend, reconnection UX

> **Roadmap reference:** [plan-00-voice-consult-roadmap.md](./plan-00-voice-consult-roadmap.md). T2 is the second slice; user pre-approved a curated subset (items 15, 9, 10, 16, 12) during 2026-04-26 review and parked the rest as `T2-Later`.
>
> **Foundation:** [plan-05-voice-consultation-twilio.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-05-voice-consultation-twilio.md) + [plan-t1-voice-quick-wins.md](./plan-t1-voice-quick-wins.md) (T1 should ship first; T2 builds on T1's pre-call screen + system-message channel).

---

## Goal

Layer real telemed polish on top of T1's quick wins:

- A patient who taps the IG-DM link sees a **branded lobby** before the audio room loads, not a raw Twilio canvas.
- Both sides see a **caller card** with who-they're-talking-to context.
- The **reconnection** flow is no longer silent — countdown + retry + rejoin CTA.
- **Auto-extend** prevents awkward mid-sentence cutoffs at the end of a booked slot.
- **Disconnect reasons** distinguish "doctor ended" from "network failure" from "kicked".

The remaining T2 items (hold, volume slider, scratchpad, permission-denied recovery) are valuable but explicitly parked for after the curated subset ships.

---

## Status

`Drafted` — curated subset (items 15, 9, 10, 16, 12) pre-approved on 2026-04-26. **2026-04-28 selection update:** items **15, 9, 10, 16 SELECTED** and items **11, 13 SELECTED (promoted from T2-Later)**. Item **12 (auto-extend) NOT selected** in this batch. Items 14 + 17 remain `T2-Later`. See [combined batch plan](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md).

---

## What's in scope (curated subset, in priority order)

> Selection markers below reflect the 2026-04-28 batch. Items marked **`[SELECTED 2026-04-28]`** are committed; **`[NOT SELECTED 2026-04-28]`** items remain in scope for a future batch but are not in the current commitment.

| # | Item | Effort | Touch points |
|---|------|--------|--------------|
| **T2.15** | **`[SELECTED 2026-04-28]`** **Reconnection UX** — surface "Reconnecting… 25s left" countdown + manual "Try again" button when Twilio fires `reconnecting`. After the 30s window, offer "Rejoin call" CTA without a fresh token exchange (cached HMAC `?t=`). | M (~6h) | `VoiceConsultRoom.tsx` + new `frontend/hooks/useTwilioReconnectState.ts`. |
| **T2.9** | **`[SELECTED 2026-04-28]`** **Pre-call lobby** for patient (clinic name + doctor name + clinic logo + "Connecting in 3… 2… 1…"). Builds on T1.2's mic-check screen — same component, additional branding/countdown stage. | M (~5h) | `VoiceConsultPreCall.tsx` (extend from T1.2) + `frontend/lib/clinic/branding.ts` reader. |
| **T2.10** | **`[SELECTED 2026-04-28]`** **Caller-card header** — patient side: doctor avatar/initial + "Dr. X · Clariva Medical Center" + specialty. Doctor side: patient name + age + sex + MRN (if assigned) + booking reason. | S (~4h) | `VoiceConsultRoom.tsx` header replaces the current minimal pill; new `<CallerCardHeader />` component. |
| **T2.16** | **`[SELECTED 2026-04-28]`** **Disconnect reason** — "Doctor ended the call" vs. "Connection lost — please rejoin" vs. "Network error" vs. "Session ended (timed out)". Reuse the existing post-disconnect callback with a `reason` argument. | S (~3h) | `VoiceConsultRoom.tsx` + post-call surface. |
| **T2.12** | **`[NOT SELECTED 2026-04-28]`** **Auto-extend prompt** — at 5 min before booked-slot end, surface "5 minutes left in this slot. Extend?" with options: `+5 min` / `+15 min` / `End on time`. Backend extension hooks into the existing slot-billing logic. | M (~6h) | `VoiceConsultRoom.tsx` + extend `backend/src/services/appointment-service.ts` for slot extension API + `backend/src/utils/dm-copy.ts` for SMS/IG-DM "your consult was extended" notice. |

---

## T2-Later (parked but documented)

> **2026-04-28 update:** T2.11 and T2.13 promoted from `T2-Later` → **`[SELECTED 2026-04-28]`** in the implementation batch. T2.14 and T2.17 remain `T2-Later`.

| # | Item | Why parked | Trigger to revisit |
|---|------|------------|--------------------|
| T2.11 | **`[SELECTED 2026-04-28 — promoted from T2-Later]`** **Hold call** (both mics muted + "Call on hold — Dr. X stepped away" banner). | Useful but not lifecycle-critical; can pile-on after the curated subset ships. | Doctor-side feedback request OR ≥3 support tickets in a quarter. |
| T2.13 | **`[SELECTED 2026-04-28 — promoted from T2-Later]`** **Volume slider + amplitude boost** (×1.5 via WebAudio gainNode). | Browser native volume controls cover the common case in v1; amplitude boost is for older patients with quiet mics. | Telemetry showing audibility complaints OR pilot with a senior-citizen-heavy doctor. |
| T2.14 | **`[NOT SELECTED 2026-04-28]`** **Doctor-side scratchpad** (textarea autosaving to `appointment_notes` every 5s). | Companion chat covers note-taking for now; dedicated panel can come once Plan 10 (AI clinical assist) defines the SOAP-draft surface so we don't build twice. | Plan 10 lands OR doctor-side feedback. |
| T2.17 | **`[NOT SELECTED 2026-04-28]`** **Permission-denied recovery** UX (OS-specific instructions when `getUserMedia` returns `NotAllowedError`). | T1.2 pre-call mic check largely prevents this scenario; revisit if telemetry shows it still happens often. | Telemetry: ≥1% of session attempts hit `NotAllowedError`. |

---

## Implementation contract per item

### T2.15 — Reconnection UX

```ts
// frontend/hooks/useTwilioReconnectState.ts (NEW)
//
// Tracks Twilio room state with countdown + retry semantics.
// Replaces the current naive `state === 'reconnecting'` boolean with:
//
export type ReconnectState =
  | { phase: 'idle' }
  | { phase: 'reconnecting'; secondsLeft: number; attempt: number }
  | { phase: 'failed'; reason: 'timeout' | 'token_expired' | 'unknown' }
  | { phase: 'recovered' };
//
// Behavior:
//   - On `room.on('reconnecting', ...)` → start a 30s countdown, render
//     a banner: "Reconnecting… {secondsLeft}s · [Try now]"
//   - "Try now" forces a fresh ICE attempt via room.disconnect()+reconnect()
//     using the cached token (still in memory).
//   - At 30s if no `reconnected` event → phase = 'failed' with reason='timeout';
//     UI shows "Connection lost. [Rejoin call]" — Rejoin re-runs the
//     /c/voice/[sessionId]?t=... page-level reconnect which re-mints
//     the JWT from the HMAC.
//   - On recovery → brief "Connection restored" toast (3s); phase falls
//     back to 'idle'.
//
// Recording continuity: Twilio handles this transparently — the
// Composition continues across the reconnect window. No special handling
// needed in the client.

export function useTwilioReconnectState(room: Room | null): ReconnectState;
```

### T2.9 — Pre-call lobby

```
VoiceConsultPreCall.tsx (extend from T1.2)

Stages:
  1. branding-stage:    clinic logo + clinic name + doctor name/photo
                        + specialty + "Connecting you with Dr. X…"
                        — pulls from appointment + clinic + doctor data
                        already on the page (no new fetch).
  2. mic-check-stage:   T1.2 — permission, level meter, device picker.
  3. countdown-stage:   "Connecting in 3… 2… 1…" then auto-advances to room.

Stage transitions:
  - branding-stage shown for min 1.5s (so users actually see it),
    OR until the user taps "Continue" if they're a returning user.
  - mic-check-stage advances on "Continue" CTA only.
  - countdown is a clean 3-2-1 visual, then VoiceConsultRoom mounts.

Doctor side: same component, but doctor-branding (small "Connecting to
patient {name}…" header) — branding-stage shown for 1s only, then auto-
advances. Doctor's time matters more.

Skip path: a "Skip pre-call" link on the mic-check stage (telemetry-only;
goes straight to VoiceConsultRoom). Doctor side defaults to skip after
the first call to keep their workflow fast.
```

### T2.10 — Caller-card header

```tsx
// frontend/components/consultation/CallerCardHeader.tsx (NEW)
//
// Replaces the current minimal pill in VoiceConsultRoom header.
//
// Patient view (counterparty = doctor):
//   ┌─────────────────────────────────────────────────────┐
//   │ [Dr.] Dr. Sharma                            🟢 02:34 │
//   │       Cardiologist · Clariva Medical Center  ▮▮▮ 4/5 │
//   └─────────────────────────────────────────────────────┘
//
// Doctor view (counterparty = patient):
//   ┌─────────────────────────────────────────────────────┐
//   │ [👤] Abhishek Sahil · 45 · M · MRN-1234     🟢 02:34 │
//   │       Reason: fever, headache                ▮▮▮ 4/5 │
//   └─────────────────────────────────────────────────────┘
//
// PHI visibility on doctor side gated by Plan 02's RLS — if RLS denies
// the doctor demographic access, fields are masked client-side. Should
// never happen for an appointment they own, but defense in depth.
//
// Feeds: `appointment` already on the page; `doctor.profile`,
// `clinic.branding`, `patient.profile` joined into the page-level loader.
// No new DB queries.

export interface CallerCardHeaderProps {
  role: 'doctor' | 'patient';
  counterparty: {
    name: string;
    avatarUrl?: string;
    subtitle: string;     // "Cardiologist · Clariva Medical Center" or "45 · M · MRN-1234"
    extra?: string;       // patient view: nothing; doctor view: "Reason: ..."
  };
  duration: { connectedAtMs: number | null };
  network: { local: 0|1|2|3|4|5; remote: 0|1|2|3|4|5 };
}
```

### T2.16 — Disconnect reason

```ts
// In VoiceConsultRoom.tsx — disambiguate the disconnect cause:
type DisconnectReason =
  | 'local_ended'         // local user clicked End
  | 'remote_ended'        // remote participant disconnected
  | 'connection_lost'     // network failure beyond 30s reconnect window
  | 'session_timed_out'   // backend ended the room (slot expired without extension)
  | 'token_expired'       // JWT/HMAC expired
  | 'unknown';

const reason = useRef<DisconnectReason>('unknown');

// Hook into room.on('disconnected', (room, error) => { ... reason = ... })
// + RemoteParticipant.on('disconnected', () => { ... })
// + the local End button click handler explicitly sets reason='local_ended'.

// On disconnect, render a post-call splash with the appropriate copy:
//   local_ended:      "You ended the call."
//   remote_ended:     "{counterparty} ended the call."
//   connection_lost:  "Connection lost. [Rejoin]"
//   session_timed_out:"This consult slot has ended."
//   token_expired:    "Session expired. [Refresh]"
//   unknown:          "Call ended."
//
// Splash includes "[Back to home]" CTA for patient and routes to dashboard
// for doctor.
```

### T2.12 — Auto-extend prompt

```
Backend (small):
  - GET /api/v1/appointments/:id → already returns scheduled_start_at +
    duration_min. No change.
  - POST /api/v1/appointments/:id/extend
      body: { additionalMinutes: 5 | 15 }
      auth: doctor or patient on the appointment
      effect: updates appointments.extended_minutes; returns new
              effective end timestamp; emits a notification via
              dm-copy "consultation extended" variant.
  - Recording continues seamlessly (Twilio room is unbounded by our
    "slot end" — the slot is just a billing/UX construct).

Frontend (T2.12 main work):
  - In VoiceConsultRoom, schedule a useEffect-driven prompt at
    `slotEndAt - 5min`.
  - Prompt is a non-blocking banner inside the companion chat as a
    `system` message with subtype 'auto_extend_prompt' and inline
    action chips (+5 min / +15 min / End on time).
  - Either party can extend; both see confirmation. End-on-time just
    dismisses the prompt (and at slotEndAt the room ends gracefully
    via session_timed_out reason).

Billing:
  - Per-minute rate hooks into the existing consultation-fee logic.
    The +5 / +15 min figures are charged ONLY if the doctor is on a
    per-minute plan; flat-fee plans treat extensions as free. Decision
    encoded in the `consultation-fees.ts` util we already touched
    earlier.
```

---

## Acceptance criteria

- [ ] **T2.15** — `reconnecting` banner appears within 1 s of a simulated network drop; countdown ticks; "Try now" forces a reconnect; at 30 s without recovery, "Rejoin call" CTA appears; after rejoin, recording continuity verified.
- [ ] **T2.9** — patient sees branding stage for ≥1.5 s before mic check; doctor side compresses to ≤1 s; countdown 3-2-1 lands cleanly; skip path is telemetered.
- [ ] **T2.10** — caller card renders the right field set per role; PHI masking on RLS-deny works; design passes a 30-second eyeball test on mobile + desktop.
- [ ] **T2.16** — every disconnect path lands at the correct reason; copy is verified by fixture tests; no regression on the existing post-call callback contract (parent routing still works).
- [ ] **T2.12** — extend prompt fires at exactly `slotEndAt - 5min`; both parties can extend; backend writes the extended_minutes; "consultation extended" DM goes out; per-minute billing recomputes; flat-fee plans don't charge.
- [ ] No regression on T1 items (timer, mic check, network bars, mic meter, end confirm, speaker/output, mute notification).
- [ ] Backend + frontend type-check + lint clean.
- [ ] Manual smoke: doctor + patient on different devices for a ~30-min call exercises every T2-curated item without hitting a console error.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/VoiceConsultRoom.tsx` (**extend**) — every item touches this.
- `frontend/components/consultation/VoiceConsultPreCall.tsx` (**extend** from T1.2 → branding + countdown stages, T2.9).
- `frontend/components/consultation/CallerCardHeader.tsx` (**new**, T2.10).
- `frontend/components/consultation/VoicePostCallSplash.tsx` (**new**, T2.16) — disconnect-reason splash.
- `frontend/hooks/useTwilioReconnectState.ts` (**new**, T2.15).
- `frontend/lib/clinic/branding.ts` (**new**, T2.9) — clinic logo / name / specialty reader.

**Backend:**

- `backend/src/routes/api/v1/appointments.ts` (**extend**, T2.12) — `POST /extend` endpoint.
- `backend/src/services/appointment-service.ts` (**extend**, T2.12) — slot-extension business logic.
- `backend/src/utils/dm-copy.ts` (**extend**, T2.12) — "consult extended" copy variant.
- `backend/src/utils/consultation-fees.ts` (**extend**, T2.12) — per-minute extension billing branch.

**Plan 06 enum touch:**

- `consultation_messages.system_subtype` → add `'auto_extend_prompt'`. Owned formally by Plan 06; T2.12 is the consumer.

**Schema:**

- One additive column: `appointments.extended_minutes integer NOT NULL DEFAULT 0`. Migration in `backend/migrations/`. Nullable preferred; default 0 is fine.

---

## Open questions / decisions for during implementation

1. **Reconnection cached-token boundary.** Patient route mints JWT from HMAC `?t=`. If the patient closes and reopens the tab during reconnect, the HMAC is still valid for ~10 min — Rejoin re-runs the page-level mint and the room reconnects under the same SID. Verify token expiry tolerance vs Twilio room TTL at PR time.
2. **Lobby branding source of truth.** Clinic logo URL lives in `clinic.branding.logoUrl` (existing field). Confirm at PR time that the field is populated for all current clinics; fall back to text-only branding if not.
3. **Caller card avatar fallback.** Doctor avatars are inconsistent in the DB. Recommendation: SVG initials avatar generator if `avatarUrl` is null; same algorithm both sides.
4. **Extend-prompt time-zone correctness.** `slotEndAt - 5min` math must run in the appointment's clinic time zone, NOT the participant's. Re-use `consultation-fees.ts` clinic-tz helper.
5. **Per-minute extension billing rules.** Confirm with finance before shipping: are extensions billed at the same per-minute rate as the base slot, or at a 1.25× / 1.5× multiplier (some clinics charge more for over-time)? Recommendation: same rate for v1; multiplier as a doctor-settings opt-in for v2.

---

## References

- [plan-00-voice-consult-roadmap.md](./plan-00-voice-consult-roadmap.md)
- [plan-t1-voice-quick-wins.md](./plan-t1-voice-quick-wins.md) — T1 must ship first.
- [plan-05-voice-consultation-twilio.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-05-voice-consultation-twilio.md)
- [plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md) — system-message channel reused by T2.12 (and T1.8).
- Twilio Video JS SDK — `Room.on('reconnecting')`, `Room.on('reconnected')`, `Room.on('disconnected', error)`.

---

**Owner:** TBD  
**Created:** 2026-04-27  
**Status:** Drafted; **2026-04-28 SELECTED batch:** items 15 / 9 / 10 / 16 + items 11 / 13 (promoted from T2-Later). Item 12 (auto-extend) NOT selected. Items 14 / 17 remain `T2-Later`. See [combined batch plan](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md) for sequencing into sub-batch A (T2.10 + T2.16) and sub-batch B (T2.15 + T2.9 + T2.11 + T2.13).
