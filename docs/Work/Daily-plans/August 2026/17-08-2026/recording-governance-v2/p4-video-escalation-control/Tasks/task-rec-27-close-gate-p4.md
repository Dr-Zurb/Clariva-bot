# Task rec-27: Close gate — p4 video escalation control

## 17 Aug 2026 — Batch [p4-video-escalation-control](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) — Wave 5 — **S, ~1.5h**

---

## Task overview

Verify the phase gate, **measure** charter success metric #3 rather than asserting it, run the founder smoke that exercises the defect this phase exists to fix, and hand the two consequences p4 deliberately created to p5.

The smoke is not a formality here. **allow → stop → re-request in the same consult** is precisely the sequence that is broken today (`deriveState` locks the doctor out after one consensual stop) and precisely the sequence rec-23 rewrites. If that path is not walked by a human on a real consult, the phase has not been verified — the unit tests only prove the arithmetic, not that a doctor can actually ask again.

**Estimated time:** ~1.5h
**Status:** ⏸ Automated gate recorded 2026-08-20. **p4 is not Closed** — founder smoke, metric #3, and the smoke composition count are still open.
**Hard deps:** rec-21 … rec-26 complete.

---

## Model & execution guidance

**Recommended model:** Sonnet (Auto) for the automated gate + founder for the smoke and the timing runs.

Consider **one Opus review of the full p4 diff** if — and only if — the two Opus slots (rec-21, rec-23) came in cleanly and cheaply. The efficiency guide puts close-gate review of state-machine and migration work on Opus, and p4 rewrote a locked derivation. This is a *judgement call for the founder*, not an automatic third Opus task: the phase budget is two, and spending a third here is a deliberate decision, not a default. If skipped, say so in the Notes.

**New chat?** **Yes.** Pre-load:

- This file + the [batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) §Acceptance gate + the [charter](../../plan-recording-governance-v2-charter.md) §Success metrics.
- `docs/Work/process/DEFINITION_OF_DONE.md`.
- The `Notes` / `Implementation` sections of rec-21 … rec-26 as landed — the gate checks what was actually built, not what was planned.

**Estimated turns:** 2–4 for the automated gate.

**Global safety gate**

- Data touched? **No.**
- PHI in logs? **No** — and one gate item below explicitly greps for it.
- External API or AI call? **No.**
- Retention / deletion impact? **No.**

---

## Acceptance criteria

### 1. Verification gate

- [x] 1.1 Backend and frontend: typecheck, lint, tests green per `DEFINITION_OF_DONE.md`. Record which suites ran. Pre-existing full-tree frontend `tsc` errors outside this program are noted, not fixed.
  - Backend `tsc --noEmit` green. Full-tree `eslint src` is red on **unrelated** files (webhook/collection/conversation/fees — none p4). p4-touched eslint (`recording-escalation-service.ts`, `video-grant-expiry-worker.ts`, `consultation-message-service.ts`, `recording-track-service.ts`) green, `--max-warnings 0`.
  - Recording-family Jest **18 suites / 223 tests** green (escalation + grant + offer + pause + expiry worker + 197 content-sanity + p1 artifact/archival + p3 pause/gap/orphan/auto-resume + consent).
  - Frontend p4 vitest **6 files / 59 tests** green. p4 component eslint green. Full-repo frontend `tsc` not re-run — pre-existing cockpit/rx reds (same note as rec-06 / rec-20).
- [x] 1.2 p1, p2 and p3 automated gates still green. Any parked founder smoke from an earlier phase stays parked — do not silently re-run and re-mark it.
  - p1 rec-06 and p3 rec-20 stay **not Closed**; founder smokes not re-run. Their unit suites are in the 223 above. p2 remains blocked on REC-D2 — no close-gate to re-mark.
- [x] 1.3 `ls backend/migrations | sort -V | tail` — **exactly one** new numbered file attributable to p4, and it is rec-21's. Record its number. A second p4 migration is a gate failure, not a rounding error.
  - Number consumed: **197** (`197_video_escalation_grant_bounds_and_pause.sql`). Head after p3 is `196_recording_pause_reason_codes_and_auto_resume_stamps.sql`. No `198_`. `_inspection_consultation_rls.sql` is unnumbered and not p4.
- [x] 1.4 The p4 migration is additive only: no `DROP`, no `NOT NULL` on an existing populated column without a default, no `CREATE POLICY` / `ALTER POLICY` / `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Confirm by reading the file, not by trusting the task notes.
  - Executable SQL: four `ADD COLUMN IF NOT EXISTS` (three nullable stamps; `initiated_by TEXT NOT NULL DEFAULT 'doctor'` — new column, defaulted); `DROP CONSTRAINT IF EXISTS` / `ADD CONSTRAINT` only for `initiated_by` CHECK and widened `revoke_reason` CHECK. Reverse-section `DROP COLUMN` is comments only. No RLS verbs. Content-sanity test pins this.
- [x] 1.5 The `revoke_reason` CHECK still rejects an unknown value and still accepts every value that was legal before rec-21 widened it.
  - IN list: `patient_revoked` | `doctor_revert` | `system_error_fallback` | `grant_expired`. Unknown values fail the CHECK. rec-21 §3.3 live illegal-row probe was **not** re-run here (file + unit test only).
- [x] 1.6 No PHI in any log line added by p4. Grep the diff for logger calls and confirm every one carries ids, codes and durations only — no reason free text, no patient name, no phone.
  - Escalation / grant-expiry / pause / offer / extend logs: `sessionId`, `requestId`, `doctorId`, `patientId` (UUID), `correlationId`, `presetReasonCode`, `attemptsUsed`, `grantCount`, `grantExpiresAt`, Twilio error codes, counts. No `reason` free text, no name, no phone.
- [x] 1.7 No in-memory timer was introduced for grant expiry. Confirm rec-22 runs on the durable DB-polling worker pattern and survives a restart.
  - `POST /cron/video-grant-expiry` → `video-grant-expiry-worker.ts`. Header rejects `setTimeout`. Service `setTimeout` is only the pre-existing Twilio-retry `sleep()`. Worker keys off `grant_expires_at <= cutoff`; a restart retries unstamped rows. **Deploy still needs the 5s cron scheduled** (inbox).
- [x] 1.8 Rate-limit arithmetic: a consensual stop costs no attempt and starts no cooldown; a decline and a timeout are unchanged from the pre-p4 behaviour. Confirm the regression tests asserting the *unchanged* half exist — that half is what protects the doctrine.
  - `recording-escalation-derive-state.test.ts` rows 6–7 (timeout 5 min from `requested_at`) and decline fixtures; client `deriveVideoEscalationState.test.ts` mirrors them. Stop → `attemptsUsed: 0`, `lastOutcome: 'stopped'`, 30s from `revoked_at`.

### 2. Charter metric #3 — measure it

The metric: **video capture stops within 250 ms of the patient's confirm, independent of the server round-trip.**

"Independent of the server round-trip" is the whole point. The ledger flip at Twilio will take 1–3 s and that is acceptable; what must be under 250 ms is the moment the patient's camera stops producing frames. Measure the client, not the API.

- [ ] 2.1 **Primary measurement — client marks.** Take a timestamp in the confirm handler at the very first line, before any state update or network call, and a second one the moment the local video track reports itself disabled. Report the delta. Do this on **at least 5 runs**, and record every number — not the best one, and not an average that hides a tail.
- [ ] 2.2 Report **max**, not mean. A 250 ms budget that is met on average and missed on one in five runs is not met.
- [ ] 2.3 Run it on the patient's real target: a mid-range Android phone on mobile data, not only a desktop Chrome tab. Record the device and network for each run.
- [ ] 2.4 **Independent confirmation — outside observer.** Screen-record the *doctor's* view of the patient tile at a known frame rate while the patient confirms, and count frames from the visible confirm to the last frame with live video. At 60 fps, 250 ms is ~15 frames. This catches the case where the local track reports disabled but frames are still in flight.
- [ ] 2.5 Confirm the same measurement for **pause**, not only stop. Both go through the instant local halt (REC-D11) and both must meet the budget.
- [ ] 2.6 Confirm the halt still happens when the **server call fails**. Kill the network, confirm stop: local video must stop within budget and the UI must say the recording state could not be confirmed. This is the acceptance criterion that proves the local halt is genuinely independent.
- [ ] 2.7 Record all numbers in the program README. **If the metric is not met, file the gap with the measured numbers rather than closing the phase on an assertion.**

### 3. Founder smoke — the defect scenario

Walk these on a real consult. Each is a scenario this phase changed.

- [ ] 3.1 **allow → stop → re-request in the same consult.** Doctor requests, patient allows, video records, patient stops, doctor requests again ~1 min later, patient allows again. The second request must be *possible* — no attempts-exhausted, no cooldown message. This is DEFECT 1; if it fails, rec-23 did not land.
- [ ] 3.2 A **third** allow-then-stop cycle in the same consult still works. The debounce delays a re-request by seconds, it does not cap the count.
- [ ] 3.3 **Decline still costs an attempt and still cools down.** Two declines exhaust the doctor's attempts exactly as before. Confirm from the doctor's UI, not from a DB row.
- [ ] 3.4 **Timeout still costs an attempt.** Let the 60 s window lapse untouched; the worker marks it and the cooldown starts.
- [ ] 3.5 **Grant expiry.** Allow, then leave it alone. The countdown runs down, video auto-reverts to audio-only, both parties see it, and the consult continues on audio without interruption.
- [ ] 3.6 **Extension.** Doctor extends once; the countdown extends. A second extension is refused with an intelligible message.
- [ ] 3.7 **Pause and resume.** Patient pauses; local video stops; no consent modal appears on resume; the grant is still alive; the countdown behaves as rec-22 specified. Resume brings video back.
- [ ] 3.8 **Pause then let the grant expire while paused.** The grant ends. Resume is refused and the patient is told why, in words.
- [ ] 3.9 **Patient offer.** Patient offers video with no doctor request pending; recording starts; no modal is shown to the patient; the doctor's two attempts are still both available afterwards.
- [ ] 3.10 **Comprehension check on the copy.** Ask one person who has never seen the product to read the consent modal and say, in their own words, what happens if they allow and what happens if they decline. If they do not distinguish "the doctor can already see me" from "it will be saved", the copy failed regardless of what the tests say.
- [ ] 3.11 **The status surface.** With video stopped, confirm the surface still visibly shows audio recording. This is charter metric #2.
- [ ] 3.12 Nothing in any patient-facing string implies deletion (REC-D10).

### 4. Consequences handed forward

- [ ] 4.1 **Multiple video compositions per consult** is now the normal case, not an edge case: pause/resume and expire/re-request each close one composition and open another. `getRecordingArtifactsForSession` already returns `videoCompositions` as an array so the data shape holds, but `RecordingReplayPlayer` still picks one. **File this to p5 with the actual count observed in the smoke** — a real number from a real consult is worth more to p5 than a warning.
- [ ] 4.2 Record in the program README how many compositions the smoke consult produced, so p5 sizes the player work against reality.
- [x] 4.3 Re-state the p3 boundary in the README as landed: which side ended up owning pause-while-video-granted, and whether p3's implementation matched what rec-24 assumed. If p3 shipped after p4, note any drift.

### 5. Escalate — the unconsented video path

- [x] 5.1 Confirm the finding in the batch plan §"A finding outside this phase's scope" is still true in `main`: the `voice → video` modality transition calls the video escalation recording start **directly**, with no `video_escalation_audit` row and therefore no consent, no attempt accounting, no grant bound, and — after rec-22 — **no auto-revert**, because the worker keys off a row that was never created.
  - Still true. `executeVoiceToVideo` in `backend/src/services/modality-transition-executor.ts` (~L465–480) calls `escalateToFullVideoRecording` with `escalationRequestId: \`modality_change:${correlationId}\``. Comment at L459–463: no matching audit row; Plan 09 writes `consultation_modality_history` instead. Worker `maybeLogUngrantedVideoAnomaly` warns and does **not** revert.
- [x] 5.2 Surface it to the founder explicitly at close, with the file and the call site. Do not fix it in this task and do not fix it quietly in p4: it is a consent-boundary question, and rec-22 makes it strictly worse by comparison rather than better.
- [x] 5.3 File it to the capture inbox with a one-line statement of the risk.

### 6. Docs / program hygiene

- [x] 6.1 Mark [`../plan-p4-recording-governance-v2-video-escalation-control-batch.md`](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) status with the date, distinguishing *code done* from *founder smoke done*.
- [x] 6.2 Update [`../../README.md`](../../README.md): p4 phase status, the migration number consumed, the remaining migration budget, and the measured metric #3 numbers.
  - Metric #3 numbers are **not measured**. Hole recorded; do not close on an assertion.
- [x] 6.3 Record REC-D6 (no specialty gate) in the program README as a **decision with its reasoning**, not just a line item. It was never built, so there is nothing to remove — the record exists so nobody re-proposes it in three months. Include the review signal that replaces it: escalation rate per doctor.
- [x] 6.4 Capture-inbox everything p4 deliberately left:
  - Multi-composition replay (→ p5, with the observed count).
  - The unconsented modality-transition video path (§5).
  - Making the doctor's escalation reason free text optional alongside the presets (REC-D25 direction; not built here).
  - Escalation-rate-per-doctor review signal (REC-D6's replacement; no dashboard built).
  - Any threshold logging rec-22 or rec-23 recommended and did not add.
  - Grant-volume ≥4 **was** added (`GRANT_VOLUME_SIGNAL_THRESHOLD`). REC4-D9 free-text optional already inbox'd 2026-08-18 — not duplicated. New: metric-mark defect; missing doctor-extend UI; founder close walk.
- [x] 6.5 Do **not** mark the program closed. p5 is outstanding, and the charter forbids closing a phase or program on an assertion.

### Out of scope

- Fixing anything the gate finds. File it; a close gate reports, it does not repair.
- Starting p5.
- Re-running earlier phases' parked founder smokes.
- Any deletion, retention, or replay work.

---

## Scope Guard

- Expected files touched: **≤ 4 docs** — this file, the batch plan status line, the program README, `docs/Work/capture/inbox.md`.
- **No source changes in this task.** If the gate finds a defect, it becomes a new task with a number, not an edit here.
- **DO NOT** mark the program closed.
- **DO NOT** fix the modality-transition finding.

---

## Done when

Every automated gate item is checked with evidence; exactly one p4 migration exists and its number is recorded; metric #3 is measured across at least 5 runs on a real device with max reported and the numbers written into the README, or the gap is filed with those numbers; the founder smoke covering allow → stop → re-request has been walked on a real consult and passed; the composition count from that consult is recorded and handed to p5; the unconsented modality-transition path has been surfaced to the founder and inbox'd; REC-D6 is recorded with its reasoning; the batch plan and program README are updated; the program is **not** marked closed.

---

## Notes

**Migration consumed:** **197** (`197_video_escalation_grant_bounds_and_pause.sql`). Charter budgeted 198; rec-21 re-derived from live head 196. No second p4 file.

**Opus close-gate review:** **not spent.** rec-21 and rec-23 already used the two planned Opus slots. A third is a founder call; skipped.

**Metric #3:** *not measured on a device.* Marks were split 2026-08-20 (rec-27 follow-up): confirm at the first line of the indicator handler (`markGrantHaltConfirm`); halt after `LocalVideoTrack.disable()` in `VideoRoom.haltLocalVideoForRecording` (`markGrantHaltDone`). Measure name unchanged: `rec24-confirm-to-halt-pause|stop`. Founder still records ≥5 real-phone numbers.

**Doctor extend UI:** shipped 2026-08-20 — `DoctorVideoGrantExtendButton` on the status surface (`Add 2 minutes` / `Already extended`). Server still refuses a second spend. Founder smoke 3.6 still needed.

**Composition count:** *pending founder smoke.*

**p3 boundary (landed):** p3 shipped 2026-08-19. rec-24 (2026-08-20) did **not** call `pauseRecording()` — that would halt audio (REC-D13). Video pause is grant-scoped (`video_paused_at` on the existing row). `recording-pause-service.ts` untouched. No drift that required a p3 edit.

**197 applied** (founder, 2026-08-20). In-process 5s poll `startVideoEscalationPollWorker` wakes timeout + grant-expiry with the API (off in test; safe next to HTTP `/cron/video-*`). Restart `npm run dev` to pick it up.

**Unconsented path:** `modality-transition-executor.ts` `executeVoiceToVideo` ~L474. Surfaced; not fixed.

**Founder walk (3.1–3.12) — do this on a real consult after 197 + the 5s cron:**

1. allow → stop → re-request ~1 min later (DEFECT 1). Then a third cycle (3.2).
2. Two declines exhaust attempts (3.3). One timeout costs an attempt (3.4).
3. Grant expiry unattended (3.5). Extend once via **Add 2 minutes**; second tap is disabled / refused (3.6).
4. Pause / resume, no modal (3.7). Pause then let grant expire; resume refused in words (3.8).
5. Patient offer: no modal; doctor still has two attempts (3.9).
6. Ask a first-time reader what allow vs decline does (3.10). Status surface still shows audio after video stop (3.11). No deletion language (3.12).
7. After a pause-heavy consult, count video compositions and write the number into the program README.

---

## Related tasks

- [`task-rec-23-derive-state-counter-split.md`](./task-rec-23-derive-state-counter-split.md) — what §3.1 verifies
- [`task-rec-24-patient-video-pause-instant-kill.md`](./task-rec-24-patient-video-pause-instant-kill.md) — what §2 measures
- [Charter](../../plan-recording-governance-v2-charter.md) · [Program README](../../README.md) · [Batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) · [Execution order](./EXECUTION-ORDER-p4-recording-governance-v2-video-escalation-control.md)
- [`DEFINITION_OF_DONE.md`](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)
