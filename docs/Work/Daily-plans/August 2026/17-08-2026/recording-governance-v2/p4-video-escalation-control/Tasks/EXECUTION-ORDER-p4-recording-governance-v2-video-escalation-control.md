# EXECUTION ORDER — p4 recording-governance-v2 video escalation control

> Sibling document of [`plan-p4-recording-governance-v2-video-escalation-control-batch.md`](../plan-p4-recording-governance-v2-video-escalation-control-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (5 waves)

```
Wave 1 (Schema — ~1.5h, single lane sequential):
  Lane α  ──── **rec-21** (S, Opus)

Wave 2 (Counter split — ~4h, single lane sequential):
  Lane α  ──── **rec-23** (M, Opus)

Wave 3 (Server-side grant lifecycle — ~7h, single lane sequential):
  Lane α  ──── rec-22 (M, Sonnet) ──> rec-25 (M, Sonnet)

Wave 4 (Patient control surface — ~7.5h, single lane sequential):
  Lane α  ──── rec-24 (M, Sonnet) ──> rec-26 (M, Sonnet)

Wave 5 (Close — ~1.5h, single lane sequential):
  Lane α  ──── rec-27 (S, Composer / Founder)
```

**Total wall-clock with parallelism:** ~21.5h.
**Total agent-time (sequential equivalent):** ~21.5h.

The bottleneck is Wave 2 — `rec-23` is single-lane Opus because the attempt/cooldown derivation is duplicated in three places (the request-time rate limiter, the server's `deriveState`, and the client hook's `deriveStateFromRow`) and getting them out of sync produces no type error, only a doctor locked out mid-consult or handed unlimited attempts.

**Every wave is Shape A.** There are no parallel lanes anywhere in this batch, and that is deliberate rather than lazy: six of the seven tasks touch `backend/src/services/recording-escalation-service.ts`, `frontend/components/consultation/VideoRoom.tsx`, or both. Two lanes would fail the §5 disjoint-files gate on the first check. The one plausible split — backend grant lifecycle (rec-22) against frontend patient controls (rec-24) — fails gate 3, because rec-24's pause path consumes the grant-state contract rec-22 lands.

---

## Lane-by-lane details

### Wave 1 — Schema (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-21 | S | **Opus** | `migrations/070_video_escalation_audit_and_otp_window.sql`, `073_video_escalation_audit_revoked_and_dashboard_event_widen.sql`, `195_appointment_start_notify_stamp.sql` (header style), `MIGRATIONS_AND_CHANGE.md`, charter §Migration budget | Re-derive the number from `ls backend/migrations/ \| sort \| tail`. Budget is 198; do not trust it. Widening 073's `revoke_reason` CHECK belongs in **this** file. Any RLS need, or a second file, is a hard stop. |

### Wave 2 — Counter split (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-23 | M | **Opus** | `recording-escalation-service.ts` whole file, `frontend/hooks/useVideoEscalationState.ts:100-202`, `frontend/lib/api/recording-escalation.ts:77-113`, migration 073 header, charter §Reversals | Three derivation sites plus three prose docs must move together. The before/after matrix in the task file is the spec — implement to the matrix, not to the prose. |

### Wave 3 — Server-side grant lifecycle (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-22 | M | Sonnet | `video-escalation-timeout-worker.ts` whole file, `recording-escalation-service.ts:1-64,258-266,566-718`, `recording-track-service.ts:575-704`, `routes/cron.ts:550-590`, rec-21's landed columns | Follow the durable-worker pattern exactly. No `setTimeout` anywhere in the grant path. |
| 1 | rec-25 | M | Sonnet | `recording-escalation-service.ts:347-543`, `consultation-controller.ts:2431-2660`, `routes/api/v1/consultation.ts:270-310`, rec-23's chargeable-row rule | Runs after rec-22 so the offer creates a grant with the same bounds a doctor request does. |

### Wave 4 — Patient control surface (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-24 | M | Sonnet | `VideoRecordingIndicator.tsx` whole file, `VideoRoom.tsx:751-775,1936-1948,3540-3575,4977-5185`, `recording-track-service.ts:451-704`, rec-22's grant contract | Consumes the grant contract from Wave 3. Pause must not touch `recording-pause-service.ts` — see the plan's coordination boundary. |
| 1 | rec-26 | M | Sonnet | `VideoConsentModal.tsx` whole file, `RecordingPausedIndicator.tsx`, `RecordingControls.tsx`, rec-24's control surface | Runs last of the build tasks so it can unify three real controls instead of two real ones and a placeholder. |

### Wave 5 — Close (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-27 | S | Sonnet / Founder | Batch plan gate, charter §Success metrics, program README | Measures metric #3 client-side across ≥5 runs on a real phone, reporting the max. Records the video-composition count for p5. Surfaces the unconsented modality-transition path to the founder. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| [rec-21](./task-rec-21-migration-video-grant-bounds.md) | S | **Opus** | New migration — agent hard-rules list. Touches a table with four interlocking CHECK constraints; one of them must be widened without breaking the other three. |
| [rec-22](./task-rec-22-grant-expiry-auto-revert.md) | M | Sonnet | Well-spec'd against an existing durable-worker precedent that reads as a template. |
| [rec-23](./task-rec-23-derive-state-counter-split.md) | M | **Opus** | Rewrites a locked state-machine derivation duplicated across three files, documented in three prose headers, with a silent failure mode. |
| [rec-24](./task-rec-24-patient-video-pause-instant-kill.md) | M | Sonnet | Bounded client work plus one server endpoint, against contracts Waves 1–3 locked. |
| [rec-25](./task-rec-25-patient-video-offer.md) | M | Sonnet | Additive path through an existing service function shape. |
| [rec-26](./task-rec-26-recording-status-surface.md) | M | Sonnet | Copy and component composition; no new state machine. |
| [rec-27](./task-rec-27-close-gate-p4.md) | S | Sonnet / Founder | Verification, measurement, doc sync, manual smoke. |

**Two Opus tasks in the batch — at the ≤2 cap. One per wave — within the ≤1-per-wave cap.**

`rec-27` names an *optional* third Opus run: a single close-gate review of the whole p4 diff, which the efficiency guide recommends for state-machine and migration work. That would put the batch at three Opus runs, so it is a founder call at close time rather than a planned slot. If the two planned Opus tasks land cleanly, skip it and record that decision.

---

## Acceptance gates per wave

**Wave 1**

- [ ] Migration number re-derived from the live folder and recorded in the task file; it is the head + 1.
- [ ] Grant-bound, extension-stamp and video-pause-state columns exist, all nullable, no backfill needed.
- [ ] `video_escalation_audit`'s existing revoke-shape, revoke-requires-allow and response-shape CHECKs still hold; the widened `revoke_reason` CHECK accepts the auto-revert reason and still rejects unknown values.
- [ ] Re-running the migration is a no-op (idempotent) and the reverse is documented in-file.
- [ ] No RLS policy added, dropped or altered. Exactly one migration file in the diff.
- [ ] Backend typecheck green; row types updated; content-sanity migration test green.

**Wave 2**

- [x] All Wave 1 gates still green.
- [x] Every row of the before/after matrix in `rec-23` is covered by a unit test, including the two-row combinations.
- [x] Decline and timeout arithmetic is byte-for-byte unchanged — the existing tests for them pass without edits.
- [x] An allow-then-stop row consumes no attempt and yields a 30 s debounce anchored to `revoked_at`.
- [x] The client hook derives the same state as the server for every matrix row (assert against the same fixtures).
- [x] The service header, the hook's comment block, and the migration 073 rationale no longer describe the retired rule.
- [x] `rg "rows.length as 1 \| 2" backend/src` returns nothing.

**Wave 3**

- [x] All Wave 2 gates still green.
- [x] A grant with no interaction auto-reverts at expiry; the audit row and the Twilio ledger both record it; the system message fires once.
- [x] Killing the API process mid-grant and restarting still auto-reverts on the next worker tick.
- [x] `rg "setTimeout" backend/src/services/recording-escalation-service.ts` returns only the pre-existing retry-jitter sleep.
- [x] The doctor can extend once; the second extension attempt is refused by the server, not just hidden by the UI.
- [ ] A patient offer creates an active grant with no modal shown and no doctor attempt consumed; the audit row marks the patient as initiator.
- [x] Backend typecheck, lint and unit tests green.

**Wave 4**

- [ ] All Wave 3 gates still green.
- [ ] Patient pause halts video, keeps the grant, keeps the indicator visible in a paused state, and resumes with **no** consent modal.
- [ ] A pause/resume cycle inserts **zero** new `video_escalation_audit` rows (assert by row count before and after).
- [ ] Local video halts before the server call resolves on both pause and stop — asserted by call order in a component test.
- [ ] After a stop, the camera control stays blocked until the server confirms audio-only; a forced server failure leaves an honest "confirming" surface, not a silent resume.
- [ ] One surface shows audio and video state independently; stopping video visibly leaves audio recording.
- [ ] `recording-pause-service.ts` is not in the diff.
- [ ] Frontend typecheck, lint and tests green.

**Wave 5**

- [ ] All Wave 4 gates still green.
- [ ] Phase acceptance gate in the batch plan fully checked.
- [ ] Charter metric #3 measured: video capture halts within 250 ms of patient confirm, independent of the server round-trip. ≥5 runs on a real mid-range phone, **max** reported not mean, method and every number written into the task file.
- [ ] Founder smoke run end to end: allow → stop → re-request in the **same** consult.
- [ ] Video-composition count from a pause-heavy consult recorded and handed to p5.
- [ ] The unconsented `voice → video` modality-transition path surfaced to the founder and filed to the capture inbox.
- [ ] REC-D6 (no specialty gate) recorded in the program README with its reasoning, so it is not re-proposed.
- [ ] Program README's p4 row updated; charter migration table reconciled with the number actually used. The **program is not marked closed** — p5 is outstanding.

---

## Cost estimate

| Wave | Tasks | Sonnet chats | Opus chats | Wall-clock |
|---|---|---|---|---|
| 1 | rec-21 | 0 | 1 | ~1.5h |
| 2 | rec-23 | 0 | 1 | ~4h |
| 3 | rec-22, rec-25 | 2 | 0 | ~7h |
| 4 | rec-24, rec-26 | 2 | 0 | ~7.5h |
| 5 | rec-27 | 1 | 0 (optional close-gate review) | ~1.5h |

**Fresh chat per task.** Pre-load the task file + [charter](../../plan-recording-governance-v2-charter.md) + [batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) decision lock + the source files listed in that task's `Model & execution guidance`.

**Branch suggestion:** one branch per wave (single lane throughout).

**Hard stops:** a second migration · any RLS policy change · any edit to `recording-pause-service.ts` · any change to the replay player's composition selection · any change to `EXPIRY_SECONDS` (the 60 s consent window) or the `MAX_ATTEMPTS = 2` ceiling.

---

## References

- [Batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md)
- [Charter](../../plan-recording-governance-v2-charter.md) — REC-D6…REC-D12 are this phase's
- [Program README](../../README.md) — phase table, migration budget
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md)
- [PHASED-PLANS-GUIDE.md](../../../../../../process/PHASED-PLANS-GUIDE.md) — §3 naming, §7 link depths
- Prior-day precedent for this doc's shape: [`crc` p4 exec order](../../../../12-08-2026/consult-room-checkin/p4-realtime-and-channel-gaps/Tasks/EXECUTION-ORDER-p4-consult-room-checkin-realtime-and-channel-gaps.md)
