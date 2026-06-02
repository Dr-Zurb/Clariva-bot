# Voice T5 — Reliability / safety (5 items, ~1 sprint)

## Multi-tab kick, crash-recovery rejoin, audible ringtone, browser push, QoS metrics

> **Roadmap reference:** [plan-00-voice-consult-roadmap.md](./plan-00-voice-consult-roadmap.md). T5 is the reliability / safety tier; **Deferred** — needed before "we ship to 100+ doctors", not before.
>
> **Foundation:** T1 + T2 must ship first. Plan 02 (recording governance) is the audit anchor for T5.33.

---

## Goal

Move the voice consult from "works for our pilot doctors" to "robust enough for production scale". This tier is mostly invisible to a happy-path user — its value is preventing the rare-but-bad failure modes from shipping bad data, kicking valid sessions, or losing audit trails.

- **Multi-tab kick** — prevent split sessions and feedback loops.
- **Crash-recovery rejoin** — browser tab crash should not lose the call.
- **Audible ringtone** — doctor hears a chime when patient connects (not staring at the screen).
- **Browser-push / desktop-notification** — same, when the doctor isn't on the page.
- **QoS metrics to ops** — Twilio `room.getStats()` periodically → `voice_call_quality` table → monthly QoS reports.

---

## Status

`Deferred` originally. **2026-04-28 selection update: all 5 items SELECTED** — pulled forward into the implementation batch tracked in [plan-voice-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md). The original "wait until ≥10 doctors/month" trigger was overridden by the explicit batch commitment.

---

## What's in scope (5 items)

> All 5 items below are marked **`[SELECTED 2026-04-28]`** — sequenced into sub-batch C of the combined batch plan.

| # | Item | Effort | Touch points |
|---|------|--------|--------------|
| **T5.29** | **`[SELECTED 2026-04-28]`** **Multi-tab / multi-device kick** — only one active session per user; opening a second tab kicks the first with a banner ("This consult was opened in another tab/device. [Make this tab active]"). | M (~3 days) | Supabase Realtime presence channel keyed on `appointments.id` + `userId`. |
| **T5.30** | **`[SELECTED 2026-04-28]`** **Crash-recovery rejoin** — if browser crashes, reopening the URL within N minutes seamlessly rejoins the same Twilio room without a fresh token exchange. | M (~3 days) | Frontend: localStorage-based token cache (HMAC + JWT TTL aware). Backend: idempotent rejoin path on `consultation-session-service.startConsultation`. |
| **T5.31** | **`[SELECTED 2026-04-28]`** **Audible ringtone when patient connects** (doctor side) — single chime + visual flash when remote participant joins. | XS (~2h) | `VoiceConsultRoom.tsx` doctor-side mount. |
| **T5.32** | **`[SELECTED 2026-04-28]`** **Browser-push / desktop-notification when remote joins** — fires when the page is in a background tab or when the OS supports it. | S (~2 days) | Web Notifications API + service worker (already exists for prescription delivery). |
| **T5.33** | **`[SELECTED 2026-04-28]`** **Health metrics surfaced to ops** — Twilio `room.getStats()` every 30s → posted to `voice_call_quality` table → monthly QoS reports for ops dashboard. | M (~3 days) | New backend table + ingest endpoint + dashboard query. |

---

## Why this tier exists

- **T5.29 multi-tab kick** — once doctors have ≥2 devices (phone + desktop is the common case), accidentally opening the same consult URL in two tabs is a real bug. Today both tabs join Twilio with the same identity — Twilio doesn't deduplicate, so the doctor hears their own voice echoed and the recording captures both audio streams. Multi-tab kick fixes the failure cleanly.
- **T5.30 crash recovery** — Twilio's 30s reconnect window covers ICE failures but NOT browser crashes (the WebSocket dies). Without crash recovery, a Chrome OOM mid-consult means starting over. The fix is small (cache the join params for the appointment's slot duration) but high-value when it fires.
- **T5.31 audible ringtone** — currently a doctor staring at their dashboard while waiting for a patient gets no signal when the patient joins. They have to look at the page. A simple chime is the lowest-effort doctor-experience win in this tier.
- **T5.32 push notifications** — the doctor isn't always on the consult page; they might be on the dashboard, settings, or a different tab. Push fires when the patient joins so the doctor doesn't miss the start.
- **T5.33 QoS metrics** — without it, when a doctor reports "audio was bad last week", we have no data. With it, we can answer "yes, packet loss spiked at 18:42" or "no, both sides looked clean — likely a perception issue" within a minute.

---

## Implementation contract per item

### T5.29 — Multi-tab / multi-device kick

```
Architecture: Supabase Realtime presence channel.

  Channel name: `voice-session:{appointmentId}:{userId}`
  Payload:      { tabId: string, openedAt: timestamp }

Flow:
  1. On VoiceConsultRoom mount, generate a tabId (uuid) and join the
     presence channel.
  2. Read other presences. If any peer presence exists with
     openedAt < this.openedAt:
       → THIS tab is the new one. Kick the older one by sending a
         broadcast "kick" event with the older tabId.
     If any peer presence exists with openedAt > this.openedAt:
       → THIS tab is the older one. Wait for the kick event.
  3. On receiving a "kick" matching our tabId: disconnect from Twilio
     and render a banner: "This consult was opened in another tab.
     [Make this tab active]" (clicking re-establishes presence + kicks
     the other side).
  4. On unmount: leave presence channel cleanly.

Recording continuity: kicked tab disconnects gracefully → Twilio
treats it as a participant departure, NOT a fresh join. Composition
unaffected.

Edge case: stale presence (browser killed without unmount). Supabase
presence handles this with a 60s timeout — old presence auto-clears.
Worst case is 60s of "ghost" presence that resolves on its own.
```

### T5.30 — Crash-recovery rejoin

```
Frontend:
  - On VoiceConsultRoom mount, cache to sessionStorage:
      voice-rejoin-{appointmentId} = {
        joinUrl: string,           // includes HMAC ?t=
        tokenIssuedAt: number,     // for TTL math
        sessionSid: string,        // Twilio room SID
        savedAt: number
      }
  - On VoiceConsultRoom unmount with NO disconnect reason captured:
      do NOT clear the cache. Browser likely crashed.
  - On VoiceConsultRoom mount, BEFORE making a fresh API call:
      check sessionStorage for an active rejoin entry < N min old.
      If present AND the appointment is still in the active slot:
        skip the consultation-session-service.startConsultation call
        and reuse the cached joinUrl/JWT directly.

Backend:
  - consultation-session-service.startConsultation is already
    idempotent (Plan 01 contract). T5.30 just leans on that contract;
    no new endpoint needed.

TTL constraints:
  - HMAC ?t= TTL: 10 min (existing).
  - JWT TTL: matches HMAC.
  - Twilio access-token TTL: 1h (existing).
  Crash-recovery window = min(HMAC TTL, JWT TTL) = 10 min.
  After 10 min the cache is stale and the regular page-level mint
  takes over (re-runs the HMAC → JWT exchange).
```

### T5.31 — Audible ringtone

```ts
// In VoiceConsultRoom.tsx (doctor side):
useEffect(() => {
  if (role !== 'doctor') return;
  if (!remoteParticipant) return;
  // Fire ONCE when the first remote participant arrives.
  const audio = new Audio('/audio/patient-joined-chime.mp3');
  audio.volume = 0.3;
  void audio.play().catch(() => {/* noop on autoplay block */});
  // Subtle title flash:
  const originalTitle = document.title;
  document.title = '🟢 Patient joined · ' + originalTitle;
  setTimeout(() => { document.title = originalTitle; }, 5000);
}, [role, remoteParticipant?.sid]);

// Asset: /public/audio/patient-joined-chime.mp3
//   - 0.5s soft chime (NOT a phone ringtone — Principle 8).
//   - Designed for clinic environment (not jarring).
```

### T5.32 — Browser-push / desktop-notification

```ts
// Reuse the existing service worker (already wired for prescription
// delivery push).
//
// New notification trigger: backend webhook from Twilio room
// `participant-connected` event → web-push to the doctor's
// subscribed clients with payload:
//   { title: 'Patient joined consult', body: '{patient name} is on the call',
//     data: { appointmentId, deepLink: '/c/voice/{sessionId}' } }

// Permission flow:
//   - At doctor onboarding, prompt for notification permission
//     (existing flow).
//   - If denied, T5.31 ringtone is the fallback.

// De-dup: T5.32 push fires at most once per appointment.
// If the doctor already has the consult page open (visibility = visible),
// the notification is suppressed (T5.31 ringtone covers that case).
```

### T5.33 — Health metrics

```sql
-- backend/migrations/NNN_voice_call_quality.sql (NEW)

CREATE TABLE voice_call_quality (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  session_sid text NOT NULL,
  participant_role text CHECK (participant_role IN ('doctor','patient','interpreter','observer')),
  captured_at timestamptz NOT NULL DEFAULT now(),
  -- Twilio room.getStats() flattened into columns we actually report on:
  packets_lost int,
  packets_received int,
  jitter_ms numeric(8,2),
  rtt_ms numeric(8,2),
  audio_level numeric(5,4),     -- 0..1 normalized
  network_quality_level int,    -- 0..5 from Twilio
  -- Raw stats blob for ad-hoc analysis:
  raw_stats jsonb
);

CREATE INDEX ON voice_call_quality(appointment_id, captured_at);
CREATE INDEX ON voice_call_quality(captured_at);  -- monthly reports
```

```ts
// frontend/lib/voice/quality-reporter.ts (NEW)
//
// In VoiceConsultRoom: every 30s, call room.getStats() → POST to
// /api/v1/voice-quality with the flattened payload.
// Endpoint is best-effort (200 on insert OR 204 on rate-limited);
// failures don't surface to user.

// backend/src/routes/api/v1/voice-quality.ts (NEW)
//   POST /api/v1/voice-quality
//     auth: any participant on the appointment
//     body: { appointmentId, sessionSid, role, ...stats, raw_stats }
//     effect: insert into voice_call_quality
//     rate limit: 1 req per 25s per (appointmentId, role) — denies abuse
//                 without dropping legitimate 30s cadence

// Ops dashboard (separate scope; out of T5):
//   monthly aggregations like:
//     "Median RTT by clinic this month",
//     "Sessions with >5% packet loss",
//     "Network-quality distribution by hour of day"
```

---

## Acceptance criteria

- [ ] **T5.29** — opening the same consult URL in two tabs (or two devices) deterministically kicks the older session within ≤2 s; banner CTA on the kicked tab successfully re-claims; no recording artifact corruption (single audio stream throughout).
- [ ] **T5.30** — killing the browser tab mid-consult and reopening the URL within 10 min rejoins the same Twilio room (same SID); recording Composition is continuous; user sees no extra modal.
- [ ] **T5.31** — chime fires within 500 ms of remote participant joining; volume is calibrated for clinic environments (not jarring); title flash clears within 5 s.
- [ ] **T5.32** — push fires only when doctor's tab is not visible; appears within 2 s of patient joining; clicking the notification deep-links to the consult page; permission-denied path falls back gracefully to T5.31.
- [ ] **T5.33** — `voice_call_quality` rows persist every 30 s during active calls; rate limiter prevents > 1 row per 25 s per (appointment, role); ops can run "median RTT by clinic this month" query in <1 s on a 1M-row table.
- [ ] No regression on existing voice flow.
- [ ] Backend + frontend type-check + lint clean.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/VoiceConsultRoom.tsx` (**extend**) — most items.
- `frontend/components/consultation/MultiTabKickBanner.tsx` (**new**, T5.29).
- `frontend/lib/voice/quality-reporter.ts` (**new**, T5.33).
- `frontend/public/audio/patient-joined-chime.mp3` (**new asset**, T5.31).
- Service worker (**extend**, T5.32) — push handler for `consult.participant_joined`.

**Backend:**

- `backend/src/routes/api/v1/voice-quality.ts` (**new**, T5.33).
- `backend/src/services/voice-call-quality-service.ts` (**new**, T5.33).
- Twilio webhook handler (**extend**, T5.32) — `participant-connected` → enqueue push.
- `backend/src/services/notification-service.ts` (**extend**, T5.32) — push to doctor on participant-connected.

**Schema:**

- `voice_call_quality` table (T5.33).

---

## Open questions / decisions for during implementation

1. **Multi-tab kick semantics** (T5.29) — newest wins (the user just opened a fresh tab and probably wants it active) vs oldest wins (don't disrupt an active call mid-stream). Recommendation: newest wins, but only AFTER explicit confirm — kicked tab shows "Open elsewhere — [Take over here] [Stay disconnected]". Avoids accidental kicks.
2. **Crash-recovery cache scope** (T5.30) — sessionStorage vs localStorage. Recommendation: sessionStorage (auto-cleared on tab close). For genuine crash recovery, the browser session is restored on relaunch which preserves sessionStorage (Chrome / Firefox default).
3. **Ringtone asset choice** (T5.31) — must NOT sound like a PSTN phone ringing (Principle 8). Recommendation: a 0.5 s "ding" with soft attack/decay. UX/audio designer review at PR time.
4. **Push notification fan-out scope** (T5.32) — patient-side too? Recommendation: NO for v1. Patients are usually the one initiating the join (they already opened the page); push complicates iOS Safari and adds permission-prompt fatigue.
5. **QoS sample cadence** (T5.33) — 30 s vs 10 s vs 60 s. Recommendation: 30 s as default; 10 s during the first minute (to catch onboarding issues) then back to 30 s. Costs ~120 rows per 30-min call; cheap.

---

## References

- [plan-00-voice-consult-roadmap.md](./plan-00-voice-consult-roadmap.md)
- [plan-t1-voice-quick-wins.md](./plan-t1-voice-quick-wins.md)
- [plan-t2-voice-real-polish.md](./plan-t2-voice-real-polish.md)
- [plan-05-voice-consultation-twilio.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-05-voice-consultation-twilio.md)
- Twilio Video JS SDK — `Room.getStats()`, `room.on('participantConnected')`.
- Supabase Realtime presence — used for T5.29.
- Web Notifications API + existing service worker — used for T5.32.

---

**Owner:** TBD  
**Created:** 2026-04-27  
**Status:** Drafted. **2026-04-28: all 5 items SELECTED**, sequenced into sub-batch C of [combined batch plan](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md). Original ≥10-doctors-per-month trigger overridden.
