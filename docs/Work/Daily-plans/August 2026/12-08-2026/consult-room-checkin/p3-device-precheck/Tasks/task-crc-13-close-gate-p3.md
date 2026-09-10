# Task crc-13: Close gate — p3 device pre-check

## 13 Aug 2026 — Batch [p3-device-precheck](../plan-p3-consult-room-checkin-device-precheck-batch.md) — Wave 4 — **S, ~1h**

---

## Task overview

Verify the phase acceptance gate end-to-end, mark the batch done, park follow-ups.

**Estimated time:** ~1h
**Status:** ✅ Automated gate done 2026-08-13 — founder smoke parked to capture inbox.
**Hard deps:** crc-10…crc-12 complete.

---

## Model & execution guidance

**Recommended model:** Composer / Founder smoke. The permission-matrix smoke is manual — agents cannot deny a camera permission for you.

**New chat?** Optional. Pre-load the batch plan acceptance gate + this file.

---

## Acceptance criteria

### Verification gate

- [x] Frontend: typecheck + lint + consult/OPD tests green (`DEFINITION_OF_DONE.md`). 2026-08-13: 147 tests / 24 files; lint clean; no tsc errors in p2/p3 files.
- [x] p3 added **no** backend files (frontend-only). Pre-existing dirty `backend/` tree is other in-progress work, not this phase.
- [x] p1 + p2 **automated** gates still green. crc-09 founder smoke was already parked (not re-run here).

### Founder / manual smoke — the zero-tap path

- [ ] Open a video join link **before** Start. Device check renders (preview + mic bars + dropdowns).
- [ ] Confirm **no** Twilio room SID and no video `consultation_sessions` row exists at this point.
- [ ] Complete the check. Doctor clicks Start. Patient lands in the call with the chosen camera/mic, **zero extra taps**. Time it — the charter's metric is ~0–5s.
- [ ] Open a link **after** Start. Confirm the pre-call gate still renders (CRC3-D3).

### Founder / manual smoke — degraded paths

- [ ] Deny camera only → join works, audio-only.
- [ ] Deny mic only → join works, mic hint shows.
- [ ] Deny both → retry affordance shows **and** the patient can still be pulled in on Start.
- [ ] Ignore the check entirely → still auto-connected on Start with browser defaults.
- [ ] Throttle the network → probe reports poor, Continue still works.
- [ ] Block the probe endpoint → nothing renders, no error.

### Founder / manual smoke — voice + presence

- [ ] Voice lobby shows the mic check before Start; cached mic reused on connect.
- [ ] Doctor board still shows **Waiting** throughout the device check on both video and voice (p2 heartbeat not disrupted).
- [ ] Lobby context copy matches `/my-visit` word-for-word for the same situation.

### Docs / program hygiene

- [x] Mark [`../plan-p3-consult-room-checkin-device-precheck-batch.md`](../plan-p3-consult-room-checkin-device-precheck-batch.md) status Code done 2026-08-13.
- [x] Update [`../../README.md`](../../README.md) phase table status for p3.
- [x] Capture inbox items for:
  - Doctor display name in patient-facing payloads (blocked CRC3-D6; needs a backend field).
  - Device readiness visible on the doctor board (deferred CRC3-D5).
  - Auto-suggest modality downgrade on a poor probe result.
  - Founder smoke checklist (zero-tap stopwatch + permission matrix) — agent cannot deny camera.

### Out of scope

- Implementing p4.

---

## Done when

- Phase acceptance gate in the batch plan is fully checked; the zero-tap path is confirmed by stopwatch, not by inspection; founder smoke passed or residual bugs filed to capture inbox with repro.
