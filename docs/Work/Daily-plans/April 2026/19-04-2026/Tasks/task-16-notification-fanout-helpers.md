# Task 16: Multi-channel notification fan-out helpers (`sendConsultationReadyToPatient`, `sendPrescriptionReadyToPatient`)

## 19 April 2026 — Plan [Foundation: consultation_sessions schema + facade + fan-out + IG phone capture](../Plans/plan-01-foundation-consultation-sessions.md) — Phase A / E

---

## Task overview

Plans 04 (text consult) and 05 (voice consult) both need to fire a "your consult is ready, here's the link" notification at session-start time, and both need to fire a "your prescription is ready" notification at session-end time. Today's `notification-service.ts` has two related helpers but they don't quite fit the urgent-moment fan-out shape Plan 01 specifies:

- `sendConsultationLinkToPatient(appointmentId, patientJoinUrl, correlationId)` (line 220) — already does SMS → IG → email but with **video-only copy hard-coded** (`"Your video consultation with ... is ready"`) and a **best-effort cascade** that returns a single `boolean` (no per-channel telemetry).
- `sendPrescriptionToPatient(prescriptionId, correlationId, userId)` (line 456) — fans out IG (image-first then text) + email, returns a structured `SendPrescriptionResult` but is tightly coupled to the prescription delivery surface (image rendering, attachment branching).

This task lands two **new, urgent-moment-shaped helpers** modeled on those patterns but with:

1. **Modality-aware copy** built via `dm-copy.ts` so Plan 04 (text variant) and Plan 05 (voice — Principle 8 disambiguation) can plug their own copy in without forking the helper.
2. **Parallel fan-out semantics** (`Promise.allSettled`) — fire SMS + email + IG **in parallel** rather than cascade. Redundancy is the point for clinical urgent moments.
3. **Structured `FanOutResult` return** that records which channels succeeded and which failed so dashboards can spot patterns (e.g. SMS failing 30% in a region).
4. **No coupling to the existing helpers' internals** — the new helpers can call the same low-level senders (`sendSms`, `sendInstagramText`, etc.) but live as their own exports so the signatures are stable for Plans 04/05/07/08/09 to consume.

Both helpers are additive. Existing `sendConsultationLinkToPatient` and `sendPrescriptionToPatient` stay in place untouched (they're called from booking-time and prescription-controller paths that don't need to change in this task).

**Estimated time:** ~3 hours (actual: ~2.5h)

**Status:** Implementation complete (2026-04-19); pending PR + production smoke test of one urgent fan-out via the existing video flow.

**Depends on:** Soft-blocks on Task 15 — the new `sendConsultationReadyToPatient` accepts a `consultation_sessions.id` and reads from that table. Can be drafted in parallel with Task 15 (the schema is locked) and merged after.

**Plan:** [plan-01-foundation-consultation-sessions.md](../Plans/plan-01-foundation-consultation-sessions.md)

---

## Acceptance criteria

- [x] **`sendConsultationReadyToPatient` exists** with this exact signature:
  ```ts
  export async function sendConsultationReadyToPatient(input: {
    sessionId:     string;          // consultation_sessions.id
    correlationId: string;
  }): Promise<FanOutResult>;
  ```
  Reads `consultation_sessions` for `appointment_id` + `modality` + `provider_session_id`, then builds copy via `dm-copy.ts#buildConsultationReadyDm({ modality, ... })` (Plan 04 ships the text-modality builder; Plan 05 ships voice). Until Plans 04/05 ship, the video-modality branch must work end-to-end (it can call into the existing copy or a new shared builder — either is fine, as long as it's modality-aware).
- [x] **`sendPrescriptionReadyToPatient` exists** with this exact signature:
  ```ts
  export async function sendPrescriptionReadyToPatient(input: {
    prescriptionId: string;
    correlationId:  string;
  }): Promise<FanOutResult>;
  ```
  Sends a short "your prescription is ready" notification with a link to the prescription PDF. **This is the urgent-moment ping**, not the full prescription delivery (the existing `sendPrescriptionToPatient` does that). The two are complementary — the existing helper sends the actual content; this new helper is the redundant urgent-moment fan-out for "go check it".
- [x] **`FanOutResult` type defined and exported:**
  ```ts
  export type FanOutChannel = 'sms' | 'email' | 'instagram_dm';
  export type FanOutChannelOutcome =
    | { channel: FanOutChannel; status: 'sent';     providerMessageId?: string }
    | { channel: FanOutChannel; status: 'skipped';  reason: 'no_recipient' | 'channel_disabled' | 'patient_opted_out' }
    | { channel: FanOutChannel; status: 'failed';   error: string };
  export type FanOutResult = {
    sessionOrPrescriptionId: string;
    attemptedAt:             string;        // ISO timestamp
    channels:                FanOutChannelOutcome[];
    anySent:                 boolean;       // convenience: at least one channel succeeded
  };
  ```
- [x] **Parallel-not-cascade behavior:** Both helpers issue all three channel calls via `Promise.allSettled`. No channel waits on another. SMS failure does not skip email; IG rate-limit does not block SMS. Document this in code comments — it's the explicit difference vs the existing `sendConsultationLinkToPatient` cascade.
- [x] **Telemetry:** Each `FanOutResult` is logged at `info` level with the same fields as `notification-service.ts`'s existing logger pattern (correlationId, patient_id, modality, per-channel outcomes). No new dashboard built in this task — just log shape that the existing ops dashboard query can `GROUP BY channel, status`.
- [x] **Idempotency / dedup:** If called twice for the same `sessionId` within 60s, second call short-circuits with `FanOutResult { channels: [], anySent: false, attemptedAt: ..., reason: 'recent_duplicate' }` (add `reason` as optional top-level field). Implementation: lookup `consultation_sessions.last_ready_notification_at` (new nullable column in this task — see Schema bullet) and compare to `now() - interval '60s'`.
- [x] **Schema:** small additive migration `backend/migrations/050_consultation_sessions_ready_dedup.sql` (or next free number after Task 15's 049):
  ```sql
  ALTER TABLE consultation_sessions
    ADD COLUMN last_ready_notification_at TIMESTAMPTZ;
  ```
  Reverse migration drops the column.
- [x] **Tests:** `backend/tests/unit/services/notification-service-fanout.test.ts` covers:
  - happy path: all three channels fire in parallel, `FanOutResult` has 3 `'sent'` entries
  - patient has only IG (no phone, no email): SMS + email return `'skipped'` with `reason: 'no_recipient'`; IG returns `'sent'`; `anySent: true`
  - SMS fails (Twilio mock throws): SMS entry `'failed'` with error string; email + IG still fire
  - dedup: second call within 60s short-circuits with the documented reason
  - modality-aware copy: video session passes `modality: 'video'` through to the copy builder; mock copy builder verifies the call
- [x] **Type-check + lint clean.** No regressions on existing notification-service tests. Full backend suite: 85 suites / 1112 tests pass (up from 83 / 1097 — exactly the new fanout suite + dm-copy snapshot suite).

---

## Why two helpers instead of extending the existing ones

The existing `sendConsultationLinkToPatient` is video-only by hardcoded copy and runs at **booking-confirmation** time (when the patient first gets the join link emailed/SMS'd at booking, not at consult-start). The semantic difference is "you've booked, here's your link for later" vs "your consult starts NOW, here's the link" — different urgency, different copy, different timing. Mixing them risks regressing the booking-confirmation flow.

The existing `sendPrescriptionToPatient` is the **content delivery** helper: it sends the actual prescription as IG image / text + email. The new `sendPrescriptionReadyToPatient` is the **redundant urgent ping** that fires alongside (or just after) the content delivery — short copy, link only — to maximize the chance the patient notices their Rx is ready. They co-exist and run sequentially: content delivery first (existing), then urgent ping (new) ~30s later via the post-prescription worker.

Both new helpers can reuse the existing low-level senders (`sendSms`, `sendInstagramText`, `sendEmail`) — that's encouraged; don't re-implement Twilio / IG calls.

---

## Out of scope

- WhatsApp channel. Master plan locked WhatsApp deferral.
- Push notifications. No native app yet; fan-out is SMS + email + IG only in v1.
- Replacing or refactoring `sendConsultationLinkToPatient` or `sendPrescriptionToPatient`. Both stay.
- Building a new ops dashboard for fan-out telemetry. Log shape only; existing dashboard pipeline ingests.
- Per-region SMS provider routing (e.g. Exotel for India, Twilio elsewhere). Use existing `twilio-sms-service.ts` for v1; multi-provider can land in a follow-up.
- Modality-specific copy for `sendConsultationReadyToPatient` beyond the video-modality default. Plans 04 + 05 own their respective text/voice variants in `dm-copy.ts`.

---

## Files expected to touch

**Backend:**

- `backend/migrations/050_consultation_sessions_ready_dedup.sql` — new (additive `last_ready_notification_at` column)
- `backend/src/services/notification-service.ts` — add `sendConsultationReadyToPatient`, `sendPrescriptionReadyToPatient`, and `FanOutResult` / `FanOutChannelOutcome` types. Existing helpers untouched.
- `backend/src/utils/dm-copy.ts` — add `buildConsultationReadyDm({ modality: 'text' | 'voice' | 'video', ... })` shell with **video branch implemented** (text + voice branches throw `Error("ships in Plan 04/05")` until those plans wire them in). Add `buildPrescriptionReadyPingDm()` for the new urgent-moment ping (one-line copy, link only).
- `backend/src/types/notification.ts` — new file or existing types file: `FanOutChannel`, `FanOutChannelOutcome`, `FanOutResult` exports. Importable by Plans 04/05/07.
- `backend/src/workers/consultation-post-session-worker.ts` — light extension if it exists today; otherwise leave the worker wiring to Plans 04/05 (this task only ships the helpers, not the cron caller).

**Tests:**

- `backend/tests/unit/services/notification-service-fanout.test.ts` — new
- `backend/tests/unit/utils/dm-copy-consultation-ready.test.ts` — new (video branch fixture; text/voice branches assert thrown error)

---

## Reference: existing patterns to mirror (not modify)

```text
backend/src/services/notification-service.ts
  Line 220  sendConsultationLinkToPatient   ← cascade, video-only copy, returns boolean
  Line 456  sendPrescriptionToPatient        ← cascade, content-delivery, returns SendPrescriptionResult
```

Both are kept. The new helpers borrow the recipient-resolution pattern (lines 247–285 — phone/email/IG resolution from `appointments` + `patients` + `conversations`) but invert the cascade into `Promise.allSettled` parallel + return `FanOutResult` instead of boolean.

A copy-pasted recipient-resolution block is acceptable here. Refactoring the resolution into a shared helper (`resolvePatientNotificationChannels(appointmentId)`) is optional but encouraged — if you do, ship it as a small additional commit and have both old + new helpers consume it.

---

## Notes / open decisions

1. **Dedup window length:** 60s is the recommended starting value. Make it configurable via env var `CONSULTATION_READY_NOTIFY_DEDUP_SECONDS` defaulting to 60. Document in code. ✅ **Shipped** — env var added at the bottom of `env.ts` with default `60`. Setting `0` disables dedup (test override / debug only).
2. **`sendPrescriptionReadyToPatient` recipient ID:** uses `prescriptionId` so callers don't need to look up `appointmentId` themselves. Helper does the lookup. ✅ **Shipped** — helper queries `prescriptions` for `appointment_id`, then routes through the shared `resolvePatientNotificationChannels`.
3. **What happens if `consultation_sessions` row doesn't exist yet** (Task 15 lazy-write window edge case)? Recommendation: fall back to reading `appointments.consultation_room_*` for the join URL when modality is video and the session row is absent. Tests cover this fallback. ⚠️ **Reinterpreted during implementation.** The helper signature is locked to `{ sessionId }`, so a missing session row means the caller has no `sessionId` to begin with. The lazy-write fallback is moot for this signature. Implementation: if the session row is absent, return `FanOutResult { anySent: false, channels: [] }` and log a warning; the legacy `sendConsultationLinkToPatient` (which takes `appointmentId` + `patientJoinUrl` directly) is still the right helper for legacy in-flight rooms during the cutover window. **Test coverage:** `returns empty result when session row not found`. Documented in code comments above `sendConsultationReadyToPatient`.
4. **Modality-aware copy default:** until Plans 04 + 05 wire their text/voice variants, the helper must work for the video flow (which is the only modality producing sessions in v1 at this point). Throw clear errors for the un-implemented modality branches. ✅ **Shipped** — `buildConsultationReadyDm` throws explicit `"ships in Plan 04"` / `"ships in Plan 05"` errors for text/voice; the fan-out helper catches the throw and returns `anySent: false` with a logged warning rather than crashing the worker.
5. **`anySent` semantics:** true if at least one channel returned `'sent'`. `'skipped'` does not count as sent. Document. ✅ **Shipped** — documented in `FanOutResult` JSDoc on `backend/src/types/notification.ts`.

### New findings during implementation

6. **No prescription-view URL infra yet.** The task assumes `sendPrescriptionReadyToPatient` ships with "a link to the prescription PDF", but the codebase has no public prescription-view URL today (no PDF generation, no dedicated route). Implemented via a new optional env var `PRESCRIPTION_VIEW_BASE_URL`: when set, the ping reads `${PRESCRIPTION_VIEW_BASE_URL}/${prescriptionId}`; when unset, the ping is URL-less ("Your prescription from {practice} is ready — check your messages above"). Patient still has the prescription content — `sendPrescriptionToPatient` already delivered it via the cascade helper. **Follow-up:** Plan 02 / 07 own the actual PDF + view-route infra; once those land, populate the env var in production.
7. **`sendSms` boolean ambiguity carries forward.** `twilio-sms-service.ts#sendSms` returns `false` in two distinct cases: (a) Twilio not configured / recipient empty (deterministic skip) or (b) actual provider error. Without changing `sendSms`, the fan-out can't distinguish. Implementation gates "no recipient" upstream and returns `'skipped'` with `reason: 'no_recipient'`; any post-recipient `false` from `sendSms` becomes a `'failed'` outcome with `error: 'sms_send_returned_false'`. **Follow-up:** consider promoting `sendSms` to return a discriminated union in a future task — same shape as `FanOutChannelOutcome` — so the fan-out can surface the channel_disabled vs failed split. Out of scope for v1.
8. **Recipient-resolution refactor (encouraged in task body) was shipped as a private helper.** `resolvePatientNotificationChannels` lives at the bottom of `notification-service.ts` and is consumed by both new fan-out helpers. The legacy `sendConsultationLinkToPatient` and `sendPrescriptionToPatient` were intentionally NOT migrated to it — that's a separate refactor that risks regressing the cascade flow, and the task explicitly says "Both stay in place untouched". Follow-up could collapse all four helpers onto the shared resolver in a no-behavior-change PR.

---

## References

- **Plan:** [plan-01-foundation-consultation-sessions.md](../Plans/plan-01-foundation-consultation-sessions.md) — "Notification fan-out (Task 16 — implementation contract)" section
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 4 LOCKED notification fan-out doctrine ("fan-out for urgent events, cascade for non-urgent")
- **Existing cascade helper (do not modify):** `backend/src/services/notification-service.ts:220` (`sendConsultationLinkToPatient`)
- **Existing content-delivery helper (do not modify):** `backend/src/services/notification-service.ts:456` (`sendPrescriptionToPatient`)
- **Existing low-level senders (consume):** `sendSms` (twilio-sms-service.ts), `sendInstagramText`, email sender (existing in this file)
- **Plan 04 will extend:** `dm-copy.ts#buildConsultationReadyDm` text-modality branch
- **Plan 05 will extend:** `dm-copy.ts#buildConsultationReadyDm` voice-modality branch (Principle 8 disambiguation)

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Implementation complete (2026-04-19); pending PR + production smoke test of one urgent fan-out via the existing video flow.
