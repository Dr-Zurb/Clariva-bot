# Task video-C1: Background-noise suppression (Krisp; sibling of voice T3.19)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch C (T3 clinical workflow) — **M item, ~3 days**

---

## Task overview

Doctor in a noisy clinic; patient at home with TV, kids, traffic. Background-noise suppression measurably improves audio clarity for both sides. **Same vendor decision as voice T3.19** — Twilio Krisp Audio Plugin, paid (~$0.005/min). Per-doctor opt-in, defaulted ON (decision §11).

If voice T3.19 has already shipped, this task is a 30-minute mount in `<VideoRoom>`. If not, this task includes the Krisp integration and the per-doctor opt-in toggle.

**Estimated time:** ~3 days (full integration); ~30 min if voice already shipped.

**Status:** **Deferred (2026-05-01) — vendor decision pending.** Three
hard blockers, all explicitly in the task acceptance criteria:

1. **Krisp budget sign-off (decision §11) is unsigned.** Sub-batch C
   close gate (`EXECUTION-ORDER-video.md`) requires the per-doctor
   opt-in default (ON or OFF) to be captured in the C1 PR. Until that
   decision lands, there's nothing to capture — and the integration
   locks in the per-minute cost exposure on every call.
2. **Twilio Krisp credentials not provisioned.** Acceptance §General
   requires `TWILIO_KRISP_API_KEY` to be present (env var, never
   committed). Manual smoke section requires real-hardware audio
   verification, which can't happen without the key.
3. **Voice sibling never shipped (full ~3-day path, not 30-min).**
   `task-voice-C9-noise-suppression.md` status is *"Drafted. BLOCKED
   on vendor decision §9."* — same blocker. Audited: no
   `frontend/lib/audio/noise-suppression.ts`, zero `Krisp` references
   in `frontend/`. So this would be the full integration: install
   `@twilio/krisp-audio-plugin`, write the lib module, add a
   `doctor_settings.noise_suppression_enabled` BOOLEAN migration
   (which the spec says to coordinate with the voice batch — i.e.
   either ship them together or accept a column-naming-collision
   risk), wire `<DoctorSettings>` toggle, mount in `<VideoRoom>`.

Modeled on the same defer-pattern the EXECUTION-ORDER doc uses for
C.8 (`task-video-C7` captions, blocked on Plan 10): *"Either ship a
stub UI now and back-fill … when Plan 10 lands, or skip C7 from this
batch entirely."* For C1, skip-pending-vendor was chosen on
2026-05-01 to keep Sub-batch C moving.

**To unblock:** (a) capture the per-doctor opt-in default decision
(ON or OFF) and the monthly cost cap, (b) provision the Twilio Krisp
add-on + API key, (c) coordinate the
`doctor_settings.noise_suppression_enabled` migration with whatever
state voice C9 is in (single column shared across modalities per
Note 4 below).

**Depends on:** voice [task-voice-C9-noise-suppression] (SOFT — reuse Krisp setup; voice C9 also blocked on the same vendor decision); Krisp budget sign-off (HARD); Twilio Krisp credentials (HARD).

**Source:** [T3 §T3.19](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md); [decision §11](../Plans/plan-video-consult-selected-features.md#before-sub-batch-c-starts).

---

## Acceptance criteria

### Krisp plugin integration

- [ ] **If voice has shipped:** import the existing Krisp setup helpers; mount the same code path in `<VideoRoom>`.
- [ ] **If voice hasn't shipped:**
  - Install `@twilio/krisp-audio-plugin` npm dep.
  - Create `frontend/lib/audio/noise-suppression.ts` with `applyKrispToTrack(localAudioTrack)` / `removeKrispFromTrack()`.
  - Provision Krisp credentials per Twilio docs.
- [ ] Apply Krisp to the local audio track on `<VideoRoom>` mount when the doctor's setting has noise-suppression ON.

### Per-doctor opt-in toggle

- [ ] **Doctor settings panel** — add a "Noise suppression" toggle (default ON). Persist to `doctor_settings.noise_suppression_enabled` BOOLEAN column (new; coordinate migration with voice batch if both ship simultaneously).
- [ ] **Patient side** — no toggle (patient inherits doctor's setting; clinic owns the audio quality decision).
- [ ] **In-call indicator** (optional v1) — small "Noise suppression: On" chip in the caller card; tap to toggle for THIS call (per-call override).

### Recording boundary

- [ ] Krisp processes BEFORE the audio leaves the device. Recording captures the suppressed audio (cleaner artifact for clinical review).
- [ ] Document: artifact post-processing isn't possible after Krisp (no original noisy version stored).

### Manual smoke

- [ ] Background TV + doctor speaking → patient hears clean voice with TV nearly silent.
- [ ] Toggle off mid-call → TV becomes audible again.
- [ ] Toggle on → TV fades again.
- [ ] CPU impact on mid-tier device: ~5-10% (acceptable).
- [ ] Voice consult (if both shipped) shares the same Krisp config.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] Krisp credentials NOT committed to repo (env var).

---

## Out of scope

- **Patient-facing toggle** for v1.
- **Per-clinic budget gating.** Out of scope; opt-in is per-doctor.
- **Open-source RNNoise alternative.** Voice batch decided Krisp; defer RNNoise pivot to follow-up.
- **Noise-suppression on RECEIVED audio.** Krisp processes outgoing only; received-audio cleanup is a different feature.

---

## Files expected to touch

**Frontend:**
- `frontend/lib/audio/noise-suppression.ts` — **reuse** if voice shipped, else **new** (~80 LOC).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~15 LOC: apply Krisp on mount; cleanup on unmount).
- `frontend/components/dashboard/DoctorSettings.tsx` (or wherever doctor settings live) — **edit** (~30 LOC: noise-suppression toggle).

**Backend:**
- (If first-shipper) `backend/migrations/0XX_doctor_settings_noise_suppression.sql` — **new** (one ALTER TABLE; coordinate with voice batch).

**Ops:**
- Krisp credentials in env (`TWILIO_KRISP_API_KEY` or per Twilio docs).
- Budget alert at 80% of monthly cap.

---

## Notes / open decisions

1. **Decision §11** — per-doctor opt-in defaulted ON; same as voice. Confirm budget shared across modalities.
2. **Plugin compatibility** — Krisp plugin works with Twilio Video JS SDK (verified). Same plugin works for voice and video.
3. **CPU on low-end devices** — auto-disable Krisp if device CPU is too low (defer detection logic to follow-up; v1 always ON for opt-in doctors).
4. **Cross-modality opt-in coordination** — if doctor opts in, applies to BOTH voice and video calls. Single column.
5. **Krisp + virtual background CPU stack (C2)** — running both on a mid-tier phone may exceed CPU budget; document and consider auto-disable at high CPU.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch C](../Plans/plan-video-consult-selected-features.md#sub-batch-c--clinical-workflow-10-days)
- **Source item:** [T3 §T3.19](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md)
- **Decision:** [§11 — Krisp budget sign-off](../Plans/plan-video-consult-selected-features.md#before-sub-batch-c-starts)
- **Sibling (voice):** voice T3.19
- **Vendor:** [`@twilio/krisp-audio-plugin`](https://www.twilio.com/docs/voice/sdks/krisp)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Deferred (2026-05-01) — vendor decision pending. See the §Status block at the top of this file for the unblock checklist.
