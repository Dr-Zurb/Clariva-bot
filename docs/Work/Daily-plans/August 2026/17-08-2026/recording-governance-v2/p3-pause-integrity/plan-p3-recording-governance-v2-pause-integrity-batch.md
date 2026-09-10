# Plan p3 — Pause integrity

## 17 Aug 2026 — Batch `recording-governance-v2` / `p3-pause-integrity` (rec-13..20) — **L, ~4 dev-days**

> **Status:** rec-13…rec-20 code shipped 2026-08-19. **p3 not Closed** — founder smoke + metric #4 + first orphan-sweep counts still open.
> **Program:** [`../README.md`](../README.md) · Prefix `rec`
> **Charter:** [`../plan-recording-governance-v2-charter.md`](../plan-recording-governance-v2-charter.md) (REC-D1…REC-D25 — inherited, not re-litigated)
> **Owns:** REC-D13, REC-D14, REC-D15, REC-D16, REC-D17, REC-D18
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-recording-governance-v2-pause-integrity.md`](./Tasks/EXECUTION-ORDER-p3-recording-governance-v2-pause-integrity.md)

---

## Why this phase

Pause exists today and it works — `recording-pause-service.ts` has a double-row audit ledger, idempotency, a both-parties banner, and a merge-aware Twilio wrapper behind it. Plan 07 built it carefully. Then Plan 08 shipped video on top of it and nobody went back to the pause path.

Six things are wrong with it. Two are defects, four are gaps.

**DEFECT 1 — pause does not stop video.** `recording-pause-service.ts:100` hardcodes `DEFAULT_KIND = 'audio'`, with a comment saying `kind: 'video'` is a Plan 08 extension. Plan 08 shipped. So when video is being recorded and the doctor hits pause, the service excludes audio and **video keeps rolling** — the exact inverse of what the person pressing the button believes, in exactly the moments pause exists for (a body exam, an undressed patient, a third party walking in). This is a defect, not an enhancement. REC-D13.

**DEFECT 2 — the reason field captures the content the pause protects.** Pause requires 5–200 characters of free text (`REASON_MIN_LENGTH` / `REASON_MAX_LENGTH`, L92–93) and writes it to `consultation_recording_audit.reason`. A doctor pausing for a sensitive disclosure will type what the disclosure was. That writes the protected content into a governance table in plain text — and the pause system message embeds the same string in its body, which `transcript-pdf-service.loadChatMessages` picks up and renders into the exported transcript PDF. REC-D14 replaces free text with five preset codes: `patient_request`, `sensitive_disclosure`, `third_party_present`, `administrative`, `technical`.

**GAP 3 — no auto-resume.** Nothing ever un-pauses. A doctor who forgets leaves the remainder of the consult unrecorded and the artifact still looks complete — a partial record that reads as a whole one is the worst thing this system can produce. REC-D16: auto-resume after 5 minutes, visible countdown to both parties, one extension, and a consult that ends while paused stamps the dangling row.

**GAP 4 — the patient cannot pause.** `pauseRecording` throws `ForbiddenError` for anyone who is not `session.doctorId`. REC-D15 gives both parties a direct pause with the actor permanently attributed and no approval handshake. The rationale to encode in code review, not just here: under-disclosure is a worse clinical outcome than a gap in the tape, and a patient-initiated gap is *evidence that protects the doctor* — it is a documented, attributed, patient-authored decision, not a hole in the record.

**GAP 5 — gaps are invisible.** Twilio's composition simply omits the paused window. The player jumps with no marker; the transcript reads as an unbroken conversation. In a clinical record an un-annotated gap is not merely incomplete, it is actively misleading — a reader cannot tell the difference between "nothing was said" and "something was said and deliberately not captured." REC-D17 renders every gap on both surfaces, from the audit ledger, with actor and reason code.

**GAP 6 — orphan `attempted` rows.** The pause service's own header (L20–23) says a Twilio failure or process crash between the attempted-row write and the completed-row write leaves an orphan, and that "Plan 02's reconciliation worker (future task)" resolves these. That worker was never built — `backend/src/workers/` has no reconciliation job, and `consultation_recording_audit` is read by only three services. The `idx_recording_audit_attempted` partial index (Migration 064 §5) exists purely to make the sweep cheap and has never been used.

---

## Decision lock (phase-local — charter decisions are inherited above)

| ID | Phase decision |
|----|----------------|
| REC-D13…REC-D18 | Inherited from the charter. Do not re-litigate. |
| **REC3-D1** | **One migration only**, owned by rec-13. **Landed as `196_recording_pause_reason_codes_and_auto_resume_stamps.sql`.** Live head was `195_appointment_start_notify_stamp.sql`; charter budgeted 197 (196 for p2) but p2 had not landed, so rec-13 took the next sequential number. p2 must re-derive. A second migration anywhere in this phase is a STOP-and-surface. |
| **REC3-D2** | Reason codes are stored in a **new dedicated column** (`pause_reason_code`) as a Postgres ENUM, not as a widened CHECK on the existing free-text `reason`. Rationale: the read path must be able to distinguish "coded" from "legacy free text" forever, and a shared column cannot express that. |
| **REC3-D3** | Existing free-text `reason` values on `recording_paused` rows are **redacted in place and stamped**, not mapped to a guessed code and not relocated to a legacy column. Full justification in rec-13; the short form is that mapping fabricates a governance fact the doctor never asserted, and a legacy column keeps the exposure while doubling the surface that has to be defended. |
| **REC3-D4** | The pause actor for a patient-initiated pause needs an **identity decision**, because `consultation_recording_audit.action_by` is `UUID NOT NULL` while bot-patient JWT subs are synthetic non-UUID strings (`patient:{appointmentId}`). rec-13 decides the surrogate. Altering `action_by`'s column type is a STOP-and-surface. |
| **REC3-D5** | **Resume restores the pre-pause rule set**, not a fixed mode. The set of kinds excluded at pause time is recorded on the pause ledger row and replayed on resume. If a video grant has lapsed during the pause, resume restores audio only and leaves video excluded — resume never re-enables capture the patient is no longer consenting to. |
| **REC3-D6** | **Coordination boundary with p4:** p4 owns the video escalation request / consent / grant lifecycle. p3 owns pause. Where they meet — pausing while a video grant is active — **p3 defines the pause behaviour and p4 consumes it.** p3 must not touch grant state, attempt counters, cooldowns, or the consent modal. See §Coordination boundary below for the concrete collision. |
| **REC3-D7** | Auto-resume is driven by a **DB-polling job**, never an in-process timer. Precedent: `backend/src/workers/video-escalation-timeout-worker.ts` (its header documents exactly why a `setTimeout` loses the deadline on pod restart). |
| **REC3-D8** | Gap markers place themselves in **media time, not wall-clock time**. The composition omits the paused window, so a gap's position is its wall-clock offset from artifact start **minus the cumulative duration of all earlier gaps**, and each gap is a zero-width marker rather than a spanned region. Getting this wrong puts every marker after the first one in the wrong place. The omission itself is Twilio's documented behaviour, not something this repo observes — rec-18 measures it on a real artifact before writing the arithmetic, and a mismatch reopens this decision rather than being patched around. |
| **REC3-D9** | **No free text survives anywhere in the pause path** — not in the audit row, not in the system-message body, not in the transcript, not in logs. The reason code is an enumerated token; all human-readable copy is resolved at render time from that token. |
| **REC3-D10** | No hard cap on cumulative pause time (REC-D18). This phase ships **no** threshold, nudge, or session flag. Recording the data that a later phase could threshold on is in scope; acting on it is not. |

---

## Waves

| Wave | Task | Size / Model | Ships |
|------|------|--------------|-------|
| 1 | [`rec-13`](./Tasks/task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md) | S · **Opus** | Migration: `pause_reason_code` ENUM + column, auto-resume stamps, patient-actor identity, legacy free-text redaction |
| 2 | [`rec-14`](./Tasks/task-rec-14-pause-covers-every-active-recording-kind.md) | M · **Opus** | Pause covers every active kind; resume restores the pre-pause rule set (REC-D13) |
| 3 | [`rec-15`](./Tasks/task-rec-15-preset-pause-reason-codes.md) | M · Auto | Preset codes replace free text end-to-end: service, Zod schema, doctor picker, banner copy (REC-D14) |
| 4 | [`rec-16`](./Tasks/task-rec-16-auto-resume-countdown-and-dangling-pause.md) | L · Auto | Auto-resume after 5 min, countdown both sides, one extension, end-session stamps the dangling row (REC-D16) |
| 4 | [`rec-17`](./Tasks/task-rec-17-patient-initiated-pause.md) | M · Auto | Patient-initiated pause, actor attribution, patient authZ path (REC-D15) |
| 5 | [`rec-18`](./Tasks/task-rec-18-gap-markers-replay-player.md) | M · Auto | Gap markers on the replay timeline, audio + video artifacts (REC-D17) |
| 5 | [`rec-19`](./Tasks/task-rec-19-gap-markers-transcript.md) | M · Auto | Gap markers in the transcript PDF via `mergeByTimestamp` (REC-D17) |
| 6 | [`rec-20`](./Tasks/task-rec-20-orphan-row-reconciliation-and-close-gate.md) | M · Auto / Founder | Orphan `attempted`-row reconciliation worker + phase close gate |

Two Opus tasks (rec-13, rec-14), one per wave — at the cap. Everything else is Auto/Sonnet against a locked schema.

---

## Coordination boundary with p4 (read this before touching rule state)

p4 (`p4-video-escalation-control`) owns the video escalation grant lifecycle: request, consent, time-bounded grant, auto-revert on expiry, patient stop, attempt counters, cooldowns. p3 owns pause. They meet in exactly one place — **a pause that happens while a video grant is live** — and there is a concrete, shipped collision waiting there:

`twilio-recording-rules.setRecordingRulesToAudioOnly` (L388) short-circuits when `getCurrentRecordingMode` already reads `audio_only`. A paused session's rules are `exclude audio` (+ `exclude video` once rec-14 lands), which `modeFrom` classifies as `'other'`. So the short-circuit does **not** fire, and the function proceeds to re-include audio. Any p4 path that reverts to audio-only during a pause — grant expiry, patient stop, system fallback — will therefore **silently resume audio recording while the ledger still says paused.**

The split:

- **p3 defines** what "paused" means at the Twilio rule level, and publishes a single way to ask "is this session paused right now?" that p4's revert paths must consult before flipping rules.
- **p4 consumes** it. p4 does not re-derive pause state, and p3 does not read or write grant state, `video_escalation_audit`, attempt counters, or cooldowns.
- If a p3 task finds itself needing to change grant behaviour to make pause correct, that is the boundary being crossed — **stop and surface it** rather than reaching into p4's surface.

rec-14 owns landing the pause-state check and stating the contract; the same wording appears in that task file so an executor who only reads the task still gets it.

---

## Scope guard — DO NOT TOUCH

- **The artifact registry writer and the composition-finalised webhook** (`recording_artifact_index`, `recording-artifact` writer paths) — p1 owns these. p3 reads artifact metadata; it never writes registry rows.
- **Consent removal / the booking checkbox / the doctor attestation** — p2 owns these. `recording-consent-service.ts` and `RecordingConsentCheckbox.tsx` are untouched here.
- **The escalation request / consent / grant state machine** — p4. `recording-escalation-service.ts`, `video_escalation_audit`, `VideoConsentModal.tsx`, attempt counters, cooldowns, the 30-second debounce.
- **The doctor consult timeline and every deletion path** — p5. `recording-archival-worker.ts`, `archival_history`, Twilio-reaching delete, `EndedCard.tsx` restructuring.
- **The 90-day patient self-serve window** and its arithmetic (REC-D25).
- **The video-replay OTP gate** — `VideoReplayOtpModal.tsx`, `video-replay-otp` routes, the 30-day verification window.
- **Twilio room create / end** — `consultation-session-service.createSession`, `endSession`'s teardown, `video-session-twilio.ts`, `voice-session-twilio.ts`. rec-16 adds one stamp inside `endSession`; it changes nothing about how the room is torn down.
- **Any RLS policy.** `consultation_recording_audit` is service-role-only by design (Migration 064 §Safety). If a step appears to need an RLS change, **STOP** and surface it.
- **A second migration.** REC3-D1.

---

## Acceptance gate (phase)

- [ ] Pausing a consult that is recording audio **and** video stops both. Verified against Twilio's rules endpoint, not just against our ledger. — **code shipped (rec-14); Twilio-endpoint confirm is founder.**
- [ ] Resume restores exactly the kinds that were being captured before the pause — and does not restore video whose grant has lapsed. — **code shipped (rec-14); live grant-lapse confirm is founder.**
- [x] The pause API rejects free text. Every accepted pause carries one of the five preset codes, and `rg` finds no remaining 5–200-character free-text path into `consultation_recording_audit.reason`.
- [x] No pause reason string in the audit table, the system-message body, the transcript, or any log line contains anything a doctor typed. — **write path + render path closed (rec-15/19). `video_escalation_audit.reason` still free-text — p4, inbox.**
- [ ] A pause left alone auto-resumes at 5 minutes. Both parties saw a live countdown; the doctor could extend exactly once. — **code shipped (rec-16); live cron/UI confirm is founder.**
- [ ] A consult ended while paused leaves a stamped dangling row — not an open-ended pause. — **code shipped (rec-16); live confirm is founder.**
- [ ] A patient can pause directly, with no doctor approval, and the resulting ledger row is permanently attributed to the patient. — **code shipped (rec-17); live confirm is founder.**
- [ ] Replaying a consult that had two pauses shows two markers at the correct media-time positions, each labelled with actor + reason code, on both the audio and the video artifact. — **code shipped (rec-18); two-pause consult is founder.**
- [ ] The exported transcript PDF shows both gaps inline, in timestamp order, with actor + reason code. — **code shipped (rec-19); two-pause PDF is founder.**
- [x] An orphan `attempted` row older than the 5-minute SLA is reconciled against Twilio's current rule state and closed by the worker. — **worker + cron shipped (rec-20). First real-data counts still founder.**
- [ ] Charter success metric #4 (gap visibility) measured on a real consult and written into the program README. — **not measured. Runs section records the hole.**
- [ ] Founder smoke: one pause-during-video consult, end to end — pause, watch the countdown, extend once, let it auto-resume, end the consult, replay it, export the transcript.
- [x] Typecheck + lint + tests green in both workspaces. No PHI in logs. Exactly one new migration. No RLS shape change. — **backend p3 paths green. Full frontend `tsc` is red on unrelated cockpit/rx files (pre-existing; not this phase). Recording consultation tests green. One p3 migration: `196_…sql`. No RLS change.**

---

## Verified current state (so no task re-derives it)

| Fact | Where |
|---|---|
| Pause is hardcoded to audio | `backend/src/services/recording-pause-service.ts:100` |
| Free-text reason bounds | `recording-pause-service.ts:92-93`; DB CHECK in `backend/migrations/064_consultation_recording_audit.sql:104-116` |
| Doctor-only authZ on pause and resume | `recording-pause-service.ts:240-242`, `:377-379` |
| Double-row ledger + orphan-row note | `recording-pause-service.ts:9-23`; sibling writer `recording-track-service.ts:37-48` |
| Orphan-sweep index, unused | `064_consultation_recording_audit.sql:122-127` |
| ENUM widening precedent | `backend/migrations/071_recording_audit_action_video_values.sql` |
| `action_by_role` already permits `'patient'` | `064_…sql:97` — no ENUM or CHECK widening needed for patient attribution |
| `action_by` is `UUID NOT NULL` | `064_…sql:96` — this, not the role, is what makes patient attribution a decision |
| Rule merge semantics + mode helpers | `backend/src/services/twilio-recording-rules.ts:107-144`, `:290-337`, `:388-413` |
| Pause banner embeds the reason in its body | `recording-pause-service.ts:344`; parsed back out by regex in `frontend/hooks/useRecordingState.ts:95-102` |
| System messages reach the transcript PDF | `backend/src/services/transcript-pdf-service.ts:531-539` |
| Transcript merge point | `backend/src/services/transcript-pdf-composer.ts:293` |
| Replay player is a bare `<audio>` / `<video>`, no timeline | `frontend/components/consultation/RecordingReplayPlayer.tsx:557-619` |
| Canonical pinned-reason precedent (not free text) | `backend/src/services/recording-escalation-service.ts:1021-1025` |
| Polling-worker precedent for a deadline | `backend/src/workers/video-escalation-timeout-worker.ts` + `backend/src/routes/cron.ts:559-580` |

### Four places the codebase does not match the phase brief

1. **The pause reason does not reach `archival_history`.** `archival_history.deletion_reason` (Migration 057) is a policy string the archival worker composes (`retention_expired_country=IN_…`); nothing copies `consultation_recording_audit.reason` into it. The privacy defect is real, but its propagation path is the **system-message body → transcript PDF** (verified above), not the archival table. Tasks state the verified path.
2. **The pause controller has no Zod schema to replace.** `pauseRecordingHandler` (`consultation-controller.ts:1578-1579`) reads `req.body.reason` behind an inline `typeof` check. rec-15 therefore *introduces* the Zod enum where the agent contract already required one — it is a compliance fix, not a schema edit.
3. **Patient-actor pause needs no ENUM widening.** Migration 064's `action_by_role` CHECK (L97) already permits `'patient'`, and `recording-track-service.resolveActor` (L293–321) already attributes patient-role rows. What actually blocks patient attribution is `action_by UUID NOT NULL` (L96) against bot-patient JWT subs of the form `patient:{appointmentId}`, which are not UUIDs. rec-13 decides a surrogate; it does not widen a constraint.
4. **The composition-omits-the-pause premise is unverified in-repo.** Nothing here observes what Twilio does to an excluded span — the claim is Twilio's documented behaviour. Since REC3-D8's arithmetic inverts if the composition encodes silence instead, rec-18 measures one real artifact against its consult span first and stops if the numbers disagree.

---

## Migration (rec-13)

| Number | File | Task |
|---|---|---|
| **196** | [`backend/migrations/196_recording_pause_reason_codes_and_auto_resume_stamps.sql`](../../../../../../backend/migrations/196_recording_pause_reason_codes_and_auto_resume_stamps.sql) | rec-13 — pause reason ENUM + column, auto-resume stamps, `pause_closed_as` discriminator, legacy reason redaction |

**Created:** 2026-08-17.
**Migration number locked:** 2026-08-18 (196).
