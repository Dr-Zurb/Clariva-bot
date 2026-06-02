# Task voice-B2: Pre-call lobby (clinic branding + countdown)



## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch B (robust call) — **M item, ~5h**



---



## Model & execution guidance



**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).



---



## Task overview



Extends the bare pre-call mic-check screen from [task-voice-A6](./task-voice-A6-precall-mic-check.md) into a **proper waiting lobby**:



1. Clinic logo + practice name banner at top (decision §7: source = `clinic.branding.logoUrl`).

2. Countdown to scheduled appointment time ("Your consult starts in 02:34").

3. Existing mic-check section from A6 (preserved).

4. Reassuring copy: "Hold tight — Dr. Sharma will join shortly."



After scheduled time passes, countdown switches to "Waiting for Dr. Sharma to join…" with a soft pulse.



**Estimated time:** ~5h.



**Status:** Done (2026-05-20).



**Depends on:** [task-voice-A6](./task-voice-A6-precall-mic-check.md) — hard (extends).



**Source:** [T2 §T2.9](../../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md); [decision §7](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-b-starts).



---



## Acceptance criteria



### `frontend/lib/clinic/branding.ts`



- [x] **New module** exporting:

  - `getClinicBranding(doctorId): Promise<{ logoUrl?: string, practiceName: string, primaryColor?: string }>`.

  - Reads from existing `doctor_settings` table (already used elsewhere); fields `logo_url`, `practice_name`, `primary_color`.

  - Caches in-memory per page-mount; doesn't fetch on every render.

- [x] **Fall back to text-only** if `logoUrl` is missing or fails to load (decision §7: confirm field is populated for all current clinics; fall back if not).



### Extend `<VoiceConsultPreCall>` → `<VoiceConsultPreLobby>` (or extend in-place)



- [x] **Edit** `frontend/components/consultation/VoiceConsultPreCall.tsx` (or add `<VoiceConsultPreLobby>` wrapper that composes it):

  - Top section (new): clinic-branded header — logo + practice name + appointment date/time formatted in en-GB locale.

  - Below banner (new): countdown — "Your consult starts in 02:34" / "Starting now…" / "Waiting for Dr. Sharma to join…".

  - Existing mic-check section preserved (no behavior change).

- [x] **Doctor side** — branding is the doctor's own clinic; countdown is "Patient joining shortly" / "Patient hasn't joined yet (waited 02:34)".



### Countdown behavior



- [x] Computes from `scheduled_start_at` of the appointment.

- [x] Updates every second.

- [x] At T-0: switches to "Starting now…" for 30s, then to "Waiting for [counterparty] to join…".

- [x] If `scheduled_start_at` is in the past (>30 min late): switches to "Waiting…" immediately.



### Manual smoke



- [ ] Patient opens link 5 min before scheduled time → countdown shows.

- [ ] At scheduled time → flips to "Starting now…".

- [ ] Doctor joins → patient transitions to in-call.

- [ ] If logoUrl is missing → text-only practice name renders without console errors.

- [ ] Doctor side shows patient-joining variant.

- [ ] Mobile + desktop both render correctly.



### General



- [x] Type-check + lint clean.

- [x] Branding lookup is single-fetch (no fetch storm on countdown re-renders).



---



## Out of scope



- **Background music.** Out of scope (Principle 8: medical UX, not waiting-room muzak).

- **Live "doctor is on the way" Realtime presence.** Out of scope for v1; T-0 switchover is good enough.

- **Custom lobby per clinic** (different photos / videos). Out of scope.

- **Analytics on lobby skip rate.** Already covered by A6's telemetry.



---



## Files expected to touch



**Frontend:**



- `frontend/lib/clinic/branding.ts` — **new** (~50 LOC).

- `frontend/components/consultation/VoiceConsultPreCall.tsx` — **edit** (~60 LOC: add lobby header + countdown).

- `frontend/app/c/voice/[sessionId]/page.tsx` — **possibly edit** if lobby state needs page-level orchestration.



**Backend / migrations / tests:** none in this task.



---



## Notes / open decisions



1. **Decision §7** — `clinic.branding.logoUrl` confirmed at PR time. Fall back to text-only.

2. **Why extend A6, not replace** — A6's mic-check screen is the foundation; B2 just adds chrome. Keep the mic-check logic intact.

3. **Countdown source** — `scheduled_start_at` from the appointment row. Already fetched by the existing voice page (or fetched alongside the HMAC verify).

4. **No live-presence beacon** — would require Realtime; out of scope. Twilio's `participant-connected` event handles the actual switchover.

5. **Date locale** — en-GB per the deferred date-locale hydration sweep (consistent with text consult batch's day separators).



---



## References



- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch B](../Plans/plan-voice-consult-selected-features.md#sub-batch-b--robust-call-8-days)

- **Source item:** [T2 §T2.9](../../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md)

- **Decision:** [§7 — lobby branding source](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-b-starts)

- **Hard dep:** [task-voice-A6](./task-voice-A6-precall-mic-check.md).



---



**Owner:** TBD

**Created:** 2026-04-29

**Status:** Done (2026-05-20).


