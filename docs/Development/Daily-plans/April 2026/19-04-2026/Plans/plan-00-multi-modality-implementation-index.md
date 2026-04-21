# Plan 00 — Multi-modality consultations: implementation index

## Sequencing map for Plans 01–10 derived from the locked master plan

> **Master plan (source of truth):** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — all product decisions LOCKED 2026-04-19. The 10 derivative plans below carve the master's 55 tasks (Tasks 14–55) into shippable, ordered slices. **Read the master plan first** for the locked product doctrine; these plans are about delivery.

---

## Why ten plans (and in this order)

The master plan locked every product decision but is too big to execute as one PR series. Each plan below is a **shippable slice** with its own files, tests, and acceptance criteria. The order is **not arbitrary** — earlier plans are hard-blocking dependencies for later ones, and the order also matches the order in which a single doctor + patient pair would experience features going live.

**Sequencing rules used:**

1. **Schema and governance before delivery.** Plan 01 (sessions table) and Plan 02 (recording consent + audit + retention) ship first because every modality depends on them.
2. **Doctor surface before any new modality.** Plan 03 (the inline launcher on the appointment detail page) ships before text or voice so doctors actually have a place to click.
3. **Text before voice.** Text is the simpler delivery path (no Twilio room, no recording transcoding) and proves the lifecycle. Voice ships next reusing the same lifecycle.
4. **Recording read-side after recording write-side.** Plan 07 (replay player, mutual notifications, transcript PDF, post-consult chat) depends on Plans 04 + 05 actually producing artifacts to replay.
5. **Video escalation depends on baseline video infra.** Plan 08 (Decision 10's video-recording specifics) layers on top of the existing video room and Plan 02's consent doctrine.
6. **Mid-consult switching ships LAST.** Plan 09 (Decision 11) requires all three modality adapters operational because it switches between them mid-call.
7. **AI clinical assist is parked.** Plan 10 holds Phase D so the docs reference is preserved, but no work happens there until v1 delivery is proven (per Decision 6 LOCKED).

---

## The ten derivative plans (read in this order)

| # | Plan | Master-plan tasks pulled in | Hard dependencies | Shippable in isolation? |
|---|------|-----------------------------|-------------------|--------------------------|
| 01 | [Foundation: `consultation_sessions` schema + facade + fan-out helpers + IG phone capture](./plan-01-foundation-consultation-sessions.md) | 14, 15, 16, 35 | None (existing video room keeps working via lazy-write) | ✅ Yes |
| 02 | [Recording governance foundation: consent capture + audit + retention + deletion](./plan-02-recording-governance-foundation.md) | 27, 33, 34 | Plan 01 (`consultation_sessions.id` FK source) | ✅ Yes (consent capture works on existing video flow immediately) |
| 03 | [Doctor modality launcher on appointment detail page](./plan-03-doctor-modality-launcher.md) | 20 | Plan 01 | ✅ Yes (Text/Voice buttons stub-only until Plans 04 + 05 land) |
| 04 | [Text consultation modality (Supabase Realtime adapter + `<TextConsultRoom>` + IG-DM ping)](./plan-04-text-consultation-supabase.md) | 17, 18, 19, 21 | Plans 01 + 02 + 03 | ✅ Yes |
| 05 | [Voice consultation modality (Twilio Video audio-only + `<VoiceConsultRoom>` + transcription + booking copy)](./plan-05-voice-consultation-twilio.md) | 23, 25, 26 | Plans 01 + 02 + 03 (Plan 04 not strictly required, but ships after for risk reasons) | ✅ Yes |
| 06 | [Companion text channel for voice/video consults (Decision 9 delivery)](./plan-06-companion-text-channel.md) | 24, 36, 37, 38, 39 | Plans 04 + 05 (re-uses Plan 04's `consultation_messages` infra inside Plan 05's `<VoiceConsultRoom>` and the existing `<VideoRoom>`) | ✅ Yes |
| 07 | [Recording pause + replay + post-consult access (mutual notifications, transcript PDF, post-consult chat link)](./plan-07-recording-replay-and-history.md) | 28, 29, 30, 31, 32 | Plans 02 + 04 + 05 (needs both consent doctrine and actual artifacts to replay) | ✅ Yes |
| 08 | [Video recording escalation (Decision 10: audio-only-default + doctor-initiated video + patient consent + replay friction)](./plan-08-video-recording-escalation.md) | 40, 41, 42, 43, 44, 45 | Plans 02 + 07 (depends on baseline replay player to extend with "Show video" toggle) | ✅ Yes |
| 09 | [Mid-consult modality switching (Decision 11: state machine + Razorpay billing + 6 transitions)](./plan-09-mid-consult-modality-switching.md) | 46, 47, 48, 49, 50, 51, 52, 53, 54, 55 | Plans 04 + 05 + 06 + (existing video room) | ✅ Yes |
| 10 | [AI clinical assist (Phase D — explicitly deferred sequencing plan)](./plan-10-ai-clinical-assist-deferred.md) | (formerly Task 22, deferred per Decision 6) | All of Plans 01–09 + post-launch operational data | ⏸ Parked, no v1 work |

**Total pulled-in tasks across plans 01–09: 42 of the master plan's 55 (Tasks 14–55).** The remaining 13 (Tasks 1–13) were already shipped before the master plan was written — those landed via the service-catalog matcher routing v2 plan from earlier on 2026-04-19.

---

## Critical-path read

If you need to ship **just enough** to demo all three modalities live to one doctor + one patient and call it "v1 alpha", the critical-path subset is:

- **Plan 01** (foundation) — must ship
- **Plan 02** (consent + audit only — defer archival worker + retention table to post-alpha) — must ship at least the consent capture + audit-write path
- **Plan 03** (launcher UI) — must ship
- **Plan 04** (text modality, full)
- **Plan 05** (voice modality, full)
- **Companion text panel from Plan 06** — minimally `<VoiceConsultRoom>` + `<VideoRoom>` get the auto-opened chat panel reading from the same `consultation_messages` table

**Defer to post-alpha:**

- **Plan 06's recording-system messages** can ship later (Decision 9's "system messages auto-post to chat on consult-started/recording-paused" is nice-to-have, not blocking)
- **Plan 07** in full (replay surface + mutual notifications + PDF) — alpha doctors and patients can wait a week for replay; consent + audit must already be capturing.
- **Plan 08** (video escalation) — keep video baseline as audio-only-by-default per Decision 10 LOCKED, but the doctor-escalation flow can land in beta. Until then, video records audio only. **This must be communicated to alpha doctors so they don't attempt to use video for procedural documentation in alpha.**
- **Plan 09** (modality switching) — alpha doctors can end the consult and rebook for the new modality.
- **Plan 10** (AI assist) — Phase D was always parked.

This compresses to **roughly 6 plans for v1 alpha**, with **plans 06 (partial) + 07 + 08 + 09 forming the v1 GA scope** (and 10 being explicitly post-GA).

---

## Cross-plan dependency graph

```
                           ┌──────────────────┐
                           │  Plan 01         │
                           │  Foundation       │
                           │  (sessions)       │
                           └────────┬──────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                ▼                   ▼                   ▼
       ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
       │  Plan 02        │  │  Plan 03        │  │  (existing      │
       │  Consent +      │  │  Launcher UI    │  │   video room    │
       │  audit + ret.   │  │                 │  │   keeps working)│
       └────────┬────────┘  └────────┬────────┘  └─────────────────┘
                │                    │
                └──────────┬─────────┘
                           ▼
              ┌─────────────────────────────┐
              │  Plans 04 (text) + 05 (voice)│
              │  ship in parallel            │
              └────────────┬─────────────────┘
                           ▼
              ┌─────────────────────────────┐
              │  Plan 06 (companion chat)    │
              │  Plan 07 (replay + history)  │
              │  ship in parallel            │
              └────────────┬─────────────────┘
                           ▼
              ┌─────────────────────────────┐
              │  Plan 08 (video escalation)  │
              └────────────┬─────────────────┘
                           ▼
              ┌─────────────────────────────┐
              │  Plan 09 (modality switch)   │
              └────────────┬─────────────────┘
                           ▼
              ┌─────────────────────────────┐
              │  Plan 10 (AI assist) — DEFER │
              └─────────────────────────────┘
```

---

## How to use these plans

1. **Read [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md)** end-to-end first. That doc owns every product decision; the 10 derivative plans are pure delivery.
2. **Pick a plan to start.** Plan 01 is the only one with no dependencies — start there unless you have a specific reason to do otherwise.
3. **Each derivative plan lists its specific tasks pulled from the master plan with their original numbers preserved (Task 14, Task 15, …, Task 55).** When you create the per-task implementation file under `Tasks/`, use the master-plan numbering — e.g. `task-15-consultation-session-facade.md`.
4. **If a product question pops up mid-implementation** that the derivative plan doesn't answer, the master plan's Decision log is the authoritative source. If the master plan also doesn't answer it, that's a new open question — surface it before writing code.
5. **Status updates flow back to the master plan, not back here.** This index is a static sequencing doc; the master plan's "Status footer" + "Decision log" are where progress accumulates.

---

## Files expected to touch (by plan)

A flattened high-level view (each plan has its own detailed files-touched section):

| Plan | Backend services / workers / migrations | Frontend components |
|------|------------------------------------------|---------------------|
| 01 | `consultation-session-service.ts` (new), `notification-service.ts` (extend), `consultation-room-service.ts` (rename → `video-session-twilio.ts`), `consultation_sessions` migration, optional IG-bot phone capture audit/extension | (none in 01 directly) |
| 02 | `recording-consent-service.ts` (new), `recording-archival-worker.ts` (new), `account-deletion-worker.ts` (new/extend), `transcript-pdf-service.ts` foundation, several DB migrations | `RecordingConsentCheckbox.tsx`, `RecordingConsentRePitchModal.tsx`, `SessionStartBanner.tsx` |
| 03 | (none — consumes Plan 01 facade) | `ConsultationLauncher.tsx` (new), `LiveConsultPanel.tsx` (new wrapper), refactor `AppointmentConsultationActions.tsx` |
| 04 | `text-session-supabase.ts` (new), `consultation-message-service.ts` (new), `routes/api/v1/consultation.ts` (extend `/token`, new `/messages`), `dm-copy.ts` (extend), `consultation_messages` migration | `TextConsultRoom.tsx` (new) |
| 05 | `voice-session-twilio.ts` (new — thin wrapper over rename from Plan 01), `voice-transcription-service.ts` (new), `dm-copy.ts` (extend voice variants — Principle 8 link-not-call) | `VoiceConsultRoom.tsx` (new) |
| 06 | `consultation-session-service.ts` (extend `createSession()` lifecycle hook), system-message emitter, schema extension on `consultation_messages` for attachments | `VideoRoom.tsx` (extend with companion chat panel), `VoiceConsultRoom.tsx` (companion chat takes main canvas) |
| 07 | `recording-pause-service.ts` (new), `recording-access-service.ts` (new), DM copy extension for replay notifications | `RecordingControls.tsx` (new), `RecordingPausedIndicator.tsx` (new), `RecordingReplayPlayer.tsx` (new — audio-only baseline), `TextConsultRoom.tsx` (extend with `mode='readonly'` prop) |
| 08 | `recording-escalation-service.ts` (new), `recording-track-service.ts` (new — Twilio Recording Rules wrapper), `video-replay-otp-service.ts` (new), DB migration for `access_type` + `video_otp_window` | `VideoEscalationButton.tsx` (new), `VideoConsentModal.tsx` (new), `VideoRecordingIndicator.tsx` (new), `RecordingReplayPlayer.tsx` (extend with "Show video" toggle + warning + OTP prompt) |
| 09 | `consultation-session-service.ts#requestModalityChange()` (extend), `modality-transition-executor.ts` (new), `modality-billing-service.ts` (new), `modality-refund-retry-worker.ts` (new), `consultation_modality_history` migration | `ModalityUpgradeRequestModal.tsx`, `ModalityUpgradeApprovalModal.tsx`, `ModalityDowngradeModal.tsx`, `DoctorUpgradeInitiationModal.tsx`, `PatientUpgradeConsentModal.tsx`, `PatientDowngradeModal.tsx`, `ModalityChangeLauncher.tsx`, `ModalityHistoryTimeline.tsx` |
| 10 | `consultation-ai-brief.ts`, `consultation-ai-soap.ts`, `consultation-post-session-worker.ts` (all DEFERRED) | `ConsultationBriefPanel.tsx` (DEFERRED) |

---

## Status

- **Created:** 2026-04-19
- **Owner:** TBD
- **Master plan status:** All product decisions LOCKED.
- **This index status:** Sequencing complete, all 10 derivative plans drafted on 2026-04-19. Ready for owner review + Plan 01 implementation start.

---

**Last updated:** 2026-04-19
