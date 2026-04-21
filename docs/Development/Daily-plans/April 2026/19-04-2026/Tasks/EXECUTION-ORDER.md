# Execution order — remaining tasks (22–55)

## Next-steps walkthrough for the v1 multi-modality rollout

> **This is the scroll-down-and-execute sheet.** Each row below is the next task to pick up. Tasks shown in the same row (`‖`) can ship in parallel. Tasks in later rows hard-depend on earlier rows. Master-plan task numbers are preserved — this index is the *order*, not a renumber.
>
> **Status as of 2026-04-19:** Tasks 1–21 complete; **Task 22 is deferred** (Plan 10, post-GA — per Decision 6 LOCKED). Everything below is remaining work.
>
> **Authoritative references:** [plan-00-multi-modality-implementation-index.md](../Plans/plan-00-multi-modality-implementation-index.md) + each task file's own "Depends on" block.

---

## Quick legend

- **‖** = ships in parallel within the same row
- **→** = sequential (right must wait for left to land)
- **🔑** = keystone task — unblocks many downstream files
- **⚠️** = payment-correctness / legal-review critical; owner-confirmed review before merge
- **Hard-block** = the next band cannot start until this task lands

---

## Band 1 — Recording governance keystone (START HERE)

**Unblocks:** every Plan 07 + Plan 08 task file currently carries a "hard-blocked on Plan 02 Task 27/33" flag. Landing these removes that flag from 11 downstream task files at once.

| Step | Task | Plan | File | Why now |
|------|------|------|------|---------|
| 1 | Task 27 🔑 | 02 | [task-27-recording-consent-capture-and-re-pitch.md](./task-27-recording-consent-capture-and-re-pitch.md) | Consent gate + capture UI; non-negotiable for any recording work |
| 1 ‖ | Task 33 🔑 | 02 | [task-33-recording-consent-audit-tables.md](./task-33-recording-consent-audit-tables.md) | Audit schema — hard-blocks Plan 07 Tasks 28/29/30/32 and Plan 08 Tasks 43/45 |
| 2 → | Task 34 | 02 | [task-34-regulatory-retention-policy-and-archival-worker.md](./task-34-regulatory-retention-policy-and-archival-worker.md) | Retention + archival + deletion — after 33's tables land |
| 1 ‖ | Task 35 | 01 | [task-35-drop-legacy-appointments-consultation-room-columns.md](./task-35-drop-legacy-appointments-consultation-room-columns.md) | Independent cleanup; can ship any spare PR slot |

**Suggested PR split:** two parallel PRs for 27 and 33; follow-up PR for 34; independent PR for 35.

---

## Band 2 — Voice modality (ships in parallel with Band 1 tail)

No hard-block on Band 1 since voice doesn't record anything new until Plan 07 replay lands. Can start as soon as Plan 01 facade is confirmed stable.

| Step | Task | Plan | File | Notes |
|------|------|------|------|-------|
| 3 ‖ | Task 23 | 05 | [task-23-voice-session-twilio-adapter.md](./task-23-voice-session-twilio-adapter.md) | Thin wrapper over Plan 01's video adapter (`audioOnly: true`) |
| 3 ‖ | Task 25 | 05 | [task-25-voice-transcription-pipeline.md](./task-25-voice-transcription-pipeline.md) | Transcription service + `consultation_transcripts` table |
| 3 ‖ | Task 26 | 05 | [task-26-voice-dm-and-booking-copy-principle-8.md](./task-26-voice-dm-and-booking-copy-principle-8.md) | Copy-only; Principle 8 "audio-only, no phone call" disambiguation |

**Suggested PR split:** three independent PRs; any order; all fork off Plan 01 facade.

---

## Band 3 — Companion chat + recording read-side

**Depends on:** Bands 1 (Task 33) + 2 (Task 23 + 25).

### Band 3a — Companion chat backend (schema → emitter → lifecycle)

| Step | Task | Plan | File | Why this order |
|------|------|------|------|----------------|
| 4 | Task 39 🔑 | 06 | [task-39-consultation-messages-attachments-and-system-rows.md](./task-39-consultation-messages-attachments-and-system-rows.md) | Schema additions for attachments + system rows; unblocks 37/36 |
| 5 → | Task 37 | 06 | [task-37-system-message-emitter.md](./task-37-system-message-emitter.md) | Central emitter with LRU dedup; reads Task 39's `system_event` column |
| 6 → | Task 36 | 06 | [task-36-companion-channel-lifecycle-hook.md](./task-36-companion-channel-lifecycle-hook.md) | Auto-provisions companion chat at `createSession` |

### Band 3b — Companion chat frontend (parallel with each other)

| Step | Task | Plan | File | Notes |
|------|------|------|------|-------|
| 7 ‖ | Task 38 | 06 | [task-38-video-room-companion-chat-panel.md](./task-38-video-room-companion-chat-panel.md) | Two-pane video layout + mobile tab switcher |
| 7 ‖ | Task 24 | 06 | [task-24-voice-consult-room-frontend.md](./task-24-voice-consult-room-frontend.md) | `<VoiceConsultRoom>` audio-only UI (**note:** the Plan 06 "companion chat mount" extension to this room is folded into this task) |

### Band 3c — Recording replay + history (depends on Band 1 audit tables + Band 2 transcription)

| Step | Task | Plan | File | Notes |
|------|------|------|------|-------|
| 8 | Task 28 🔑 | 07 | [task-28-recording-pause-resume-mid-consult.md](./task-28-recording-pause-resume-mid-consult.md) | Twilio Recording Rules adapter — shared with Plan 08 Task 43 |
| 9 → | Task 29 🔑 | 07 | [task-29-recording-replay-player-patient-self-serve.md](./task-29-recording-replay-player-patient-self-serve.md) | Needs Task 33's audit + Task 25's audio artifact |
| 10 → | Task 30 | 07 | [task-30-mutual-replay-notifications.md](./task-30-mutual-replay-notifications.md) | Adds `doctor_dashboard_events` table |
| 11 ‖ | Task 31 | 07 | [task-31-post-consult-chat-history-surface.md](./task-31-post-consult-chat-history-surface.md) | `<TextConsultRoom mode='readonly'>` |
| 12 ‖ | Task 32 ⚠️ | 07 | [task-32-transcript-pdf-export.md](./task-32-transcript-pdf-export.md) | **Introduces new PDF library** (`pdfkit` recommended); needs 25 + 33 |

**Suggested PR split:** Band 3a as three sequential PRs; Band 3b as two parallel PRs; Band 3c as 28 → 29 → 30 sequential, with 31 + 32 parallel at the end.

---

## Band 4 — Video recording escalation

**Depends on:** Bands 1 + 3 (needs audit tables + replay player to extend).

| Step | Task | Plan | File | Notes |
|------|------|------|------|-------|
| 13 ✅ | Task 45 | 08 | [task-45-video-recording-audit-extensions-migration.md](./task-45-video-recording-audit-extensions-migration.md) | Schema additions (`video_otp_window`, `video_escalation_audit`, `access_type`) — **shipped 2026-04-19** (migrations 069 + 070; types + query helpers + tests) |
| 14 → | Task 43 🔑 | 08 | [task-43-recording-track-service-twilio-rules-wrapper.md](./task-43-recording-track-service-twilio-rules-wrapper.md) | Twilio Recording Rules wrapper — **shared with Plan 07 Task 28**; coordinate ownership at PR-time |
| 15 ‖ | Task 40 | 08 | [task-40-doctor-video-escalation-button-and-reason-modal.md](./task-40-doctor-video-escalation-button-and-reason-modal.md) | Doctor UI (button + reason modal) |
| 15 ‖ | Task 41 ⚠️ | 08 | [task-41-patient-video-consent-modal-and-escalation-service.md](./task-41-patient-video-consent-modal-and-escalation-service.md) | **Legal review recommended**; 60s server-side consent timeout worker |
| 16 → | Task 42 | 08 | [task-42-video-recording-indicator-and-patient-revoke.md](./task-42-video-recording-indicator-and-patient-revoke.md) | Recording indicator + patient mid-call revoke; needs 41 |
| 17 ‖ | Task 44 ⚠️ | 08 | [task-44-recording-replay-player-video-toggle-and-otp.md](./task-44-recording-replay-player-video-toggle-and-otp.md) | **Legal review recommended**; SMS OTP + 30-day skip window; extends Task 29 |

**Suggested PR split:** 45 first (schema); 43 second (keystone wrapper); 40/41 parallel; 42 after 41; 44 independent of the 40-42 branch once 43 is merged.

---

## Band 5 — Mid-consult modality switching (ships LAST)

**Depends on:** Plans 04 + 05 + 06 + existing video room (per Plan 09 "ships last" doctrine).

### Band 5a — Backend core (Phase A)

| Step | Task | Plan | File | Notes |
|------|------|------|------|-------|
| 18 | Task 46 🔑 | 09 | [task-46-modality-history-schema-and-counters-migration.md](./task-46-modality-history-schema-and-counters-migration.md) | `consultation_modality_history` + counters; smallest task, ships first |
| 19 ‖ | Task 47 ⚠️ | 09 | [task-47-request-modality-change-state-machine.md](./task-47-request-modality-change-state-machine.md) | **v1's most critical state machine**; owner-confirmed payment ops review |
| 19 ‖ | Task 48 | 09 | [task-48-modality-transition-executor.md](./task-48-modality-transition-executor.md) | 6-transition executor; shared adapter with Plan 08 Task 43 |
| 20 → | Task 49 ⚠️ | 09 | [task-49-modality-billing-razorpay-capture-and-refund.md](./task-49-modality-billing-razorpay-capture-and-refund.md) | **Payment-correctness critical**; needs 47; introduces Razorpay Orders + Refunds API |

### Band 5b — Frontend UI (Phase B/C, parallel with each other)

| Step | Task | Plan | File | Notes |
|------|------|------|------|-------|
| 21 ‖ | Task 50 | 09 | [task-50-patient-modality-upgrade-request-modal.md](./task-50-patient-modality-upgrade-request-modal.md) | Patient 6-state FSM + Razorpay Checkout SDK |
| 21 ‖ | Task 51 | 09 | [task-51-doctor-modality-approval-downgrade-and-upgrade-initiation-modals.md](./task-51-doctor-modality-approval-downgrade-and-upgrade-initiation-modals.md) | Doctor 3-modal set |
| 21 ‖ | Task 52 | 09 | [task-52-patient-consent-and-self-downgrade-modals.md](./task-52-patient-consent-and-self-downgrade-modals.md) | Patient consent + self-downgrade |
| 21 ‖ | Task 54 | 09 | [task-54-modality-change-launcher-in-all-three-rooms.md](./task-54-modality-change-launcher-in-all-three-rooms.md) | Launcher buttons in all 3 rooms |

### Band 5c — System messages + post-consult timeline (last)

| Step | Task | Plan | File | Notes |
|------|------|------|------|-------|
| 22 → | Task 53 | 09 | [task-53-modality-switched-system-messages.md](./task-53-modality-switched-system-messages.md) | Ships after state machine is observable |
| 23 → | Task 55 | 09 | [task-55-post-consult-modality-history-timeline.md](./task-55-post-consult-modality-history-timeline.md) | Smallest UI; ships last |

---

## V1 alpha critical-path compression

If you need to ship a demo-able v1 alpha **fast** and defer the rest to beta, the minimum from this list is:

1. **Task 27** (consent capture) — non-negotiable
2. **Task 33** (consent audit) — non-negotiable
3. **Tasks 23, 25, 26** (voice modality, full)
4. **Tasks 39, 37, 36** (companion chat backend)
5. **Tasks 38, 24** (companion chat UI)

**That's 10 tasks to alpha-demo all three modalities live.** Everything in Band 3c, Band 4, and Band 5 becomes beta / GA scope.

---

## Risk hot-spots (pay extra attention)

| Task | Why it's high-risk |
|------|---------------------|
| Task 27 / 33 | Legal + regulatory foundation for every recording flow |
| Task 41 | Patient video consent — privacy-critical; **legal review** |
| Task 44 | Patient video replay OTP — **legal review** |
| Task 47 | v1's most critical state machine; bugs cause double-billing / stuck rooms |
| Task 49 | Payment-correctness; introduces Razorpay Orders + Refunds (novel for this codebase); **payment ops review** |
| Task 43 | Shared Twilio Recording Rules adapter with Task 28 — coordinate ownership |

---

## Recurring follow-ups (track in `docs/capture/inbox.md`)

These surfaced across task drafts and aren't owned by a single task:

- **Frontend test harness bootstrap** (jest + RTL + ts-jest) — blocks unit coverage for every frontend task from Band 3 onward
- **Bell-icon Realtime subscription UX** for `doctor_dashboard_events` (Plan 07 Task 30)
- **Admin dashboard UI** for `admin_payment_alerts` (Plan 09 Task 49)
- **PagerDuty / alerting pipeline** routing for refund-stuck + provider-failure metrics
- **`service_offerings_json` pricing schema probe** (Plan 09 Task 49 — resolves plan open question #7 at PR-time)
- **PDF library selection** (`pdfkit` recommended) — locked at Plan 07 Task 32 implementation time
- **Per-session transcript cache eviction** (Plan 07 Task 32)
- **CSS-vs-server-side watermark revisit trigger** (Plan 07 Task 29 + Plan 08 Task 44)
- **Razorpay orphan-order cleanup** via Razorpay order-expiry webhook (Plan 09 Task 50)

---

## How to read a task's dependencies quickly

Every task file has a `Depends on:` block near the top (under "Task overview"). The format:

- **hard** = must land before this task starts
- **soft** = prefer in place but work-aroundable

If you open a task and see `Depends on: Task 33 (hard)`, confirm Task 33 has merged before starting implementation.

---

**Created:** 2026-04-19  
**Owner:** TBD  
**Status:** Sequencing complete. Task 22 deferred. Remaining work = 33 tasks across 5 bands.
