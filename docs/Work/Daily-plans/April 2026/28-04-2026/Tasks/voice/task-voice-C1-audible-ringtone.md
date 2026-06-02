# Task voice-C1: Audible "patient joined" chime (doctor side)

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch C (production-grade) — **XS item, ~2h**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

When the patient connects to the call, the doctor's tab plays a 0.5s soft "ding" so the doctor doesn't have to stare at the screen waiting. **Decision §11 (Principle 8): the chime must NOT sound like a PSTN phone ring** — soft, single-shot, brief.

Cheapest item in Sub-batch C; ships first as a warm-up.

**Estimated time:** ~2h.

**Status:** Done (2026-05-20).

**Depends on:** nothing.

**Source:** [T5 §T5.31](../../../../Product%20plans/voice-consult/plan-t5-voice-reliability-safety.md); [decision §11](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-c-starts).

---

## Acceptance criteria

### Asset

- [x] **`frontend/public/audio/patient-joined-chime.mp3`** — Reused A6 `precall-test-chime.mp3` (soft in-app ding; same asset family per decision §11).
- [x] Filesize — **75 KB** (matches A6 source; under separate path for C1 contract; optional trim to <30 KB in a follow-up if bundle size matters).

### Wire into doctor-side participant-connected event

- [x] **`frontend/lib/audio/ringtone.ts`** — `playPatientJoinedChime()` + `isPatientTwilioIdentity()` + 5s debounce; autoplay failures swallowed.
- [x] **`<VoiceConsultRoom>`** — `onRemoteParticipantConnected` plays chime when `role === 'doctor'` and identity is `patient-*`; also handles patient already in room on doctor connect.
- [x] **Doctor side ONLY** — gated on `role === 'doctor'`.
- [x] **Don't double-play on reconnect** — 5s module debounce.

### Manual smoke

- [ ] Doctor opens call → patient joins → doctor hears soft chime within 1s.
- [ ] Doctor opens call → patient reconnects mid-call → doctor does NOT hear duplicate chime.
- [ ] Doctor leaves tab in background → chime still plays (no autoplay restriction since there's been prior interaction).
- [ ] Patient does NOT hear any chime when doctor joins.
- [ ] iOS Safari: chime plays after permission established.

### General

- [x] Vitest: `frontend/lib/audio/__tests__/ringtone.test.ts` (identity + debounce + autoplay swallow).
- [x] Lint clean on touched files.
- [x] No console errors on autoplay failure (`.catch(() => {})`).

---

## Out of scope

- **Patient-side chime when doctor joins.** Decision: NO. Patients on mobile don't need it.
- **Configurable chime sound.** Out of scope.
- **Volume control for the chime.** Out of scope; reuses OS volume.
- **Visual notification flash on doctor side** (in addition to chime). Out of scope.

---

## Files expected to touch

**Frontend:**

- `frontend/public/audio/patient-joined-chime.mp3` — **new asset** (or reuse from A6).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~15 LOC: chime trigger + debounce).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Decision §11** — Principle 8. The chime must feel like an in-app notification, NOT a PSTN ring. UX/audio designer signs off at PR time.
2. **Why doctor-only** — patient is the active waiter in most cases; doctor is the receiver. Asymmetric notification matches the role asymmetry.
3. **Debounce** — 5s window covers reconnect; if a real "patient left and came back" happens, the second chime is acceptable (it IS a fresh join).
4. **Autoplay restrictions** — typically defeated because the doctor has interacted with the page (clicked Join in the lobby). Silently swallow if browser refuses.
5. **Cross-modality consistency** — if video batch ships a chime later, reuse this asset.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch C](../Plans/plan-voice-consult-selected-features.md#sub-batch-c--production-grade-17-days)
- **Source item:** [T5 §T5.31](../../../../Product%20plans/voice-consult/plan-t5-voice-reliability-safety.md)
- **Decision:** [§11 — chime asset / Principle 8](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-c-starts).

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Done (2026-05-20).
