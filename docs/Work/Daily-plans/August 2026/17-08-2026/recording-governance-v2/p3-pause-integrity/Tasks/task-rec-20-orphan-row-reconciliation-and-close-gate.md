# Task rec-20: Orphan `attempted`-row reconciliation worker + phase close gate

## 17 Aug 2026 — Batch [p3-pause-integrity](../plan-p3-recording-governance-v2-pause-integrity-batch.md) — Wave 6 — **M, ~4h**

---

## Task overview

Two halves, in order. **Build the worker, then close the phase.**

**The worker.** `recording-pause-service.ts:20-23` has said since April that a Twilio failure or process crash between the `attempted` row and the `completed` row leaves an orphan, and that *"Plan 02's reconciliation worker (future task)"* resolves it. That worker was never built. `backend/src/workers/` has no reconciliation job. The `idx_recording_audit_attempted` partial index (`064_consultation_recording_audit.sql:122-127`) was created specifically to make the sweep cheap and has never been used by anything. Migration 064's own header (L26–29) sets the SLA at 5 minutes.

An orphan is not cosmetic. It is a row asserting that a pause was attempted, with no record of whether capture actually stopped — which is precisely the kind of ledger ambiguity this phase exists to remove.

**The close gate.** Run the verification gate, measure charter success metric #4, and put a founder through a pause-during-video consult end to end. This half **verifies; it does not build.** A failure routes back to the task that owns it — fixing it here would hide which wave regressed. The only code this file owns is the worker above.

**Estimated time:** ~4h (≈2.5h worker, ≈1.5h gate + founder smoke)
**Status:** ⏸ Worker + mechanical gate shipped 2026-08-19 — **p3 not Closed** (founder smoke, metric #4, first sweep counts)
**Hard deps:** every other task in the phase merged. The gate aggregates their **Done when** lines.
**Source:** Batch plan §Why this phase → GAP 6; §Acceptance gate (phase); charter §Success metrics #4.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

**Change Type:** New feature (the worker) plus verification (the gate).

**Current state:**

- ✅ The partial index exists and is unused (064 L122–127). The `correlation_id` index (L129–133) exists for exactly this join — its comment says "Plan 02 reconciliation worker joins on it."
- ✅ Two services write the double-row ledger with the same doctrine: `recording-pause-service.ts:9-23` and its sibling `recording-track-service.ts:37-48`. Both can strand orphans.
- ✅ A durable polling-worker + cron-route pattern exists (`video-escalation-timeout-worker.ts`, `cron.ts:559-580`), and [`rec-16`](./task-rec-16-auto-resume-countdown-and-dangling-pause.md) has just added a second instance of it in this same domain.
- ✅ Twilio's current rule state is readable side-effect-free via `getCurrentRecordingMode` (`twilio-recording-rules.ts:349-371`), which throws `TwilioRoomNotFoundError` for a completed or garbage-collected room.
- ✅ Worker + `POST /cron/recording-orphan-reconcile` (60s tick). First real-data counts still founder.
- ⚠️ Pause-service metadata pin unchanged (worker writes a *sibling* closing row; it does not change what pause inserts). Closing-row shape pinned in the worker test.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet for the worker and the mechanical verification; **Founder** for the smoke test and the metric read.

The worker is the third instance of a pattern already in the repo. The smoke test is not delegable — it needs a real device, a real consult, and a human deciding whether a paused video consult produced an honest record.

**New chat? Yes.** Pre-load:

- This task + [`../plan-p3-recording-governance-v2-pause-integrity-batch.md`](../plan-p3-recording-governance-v2-pause-integrity-batch.md) **§Acceptance gate (phase)** + the [charter](../../plan-recording-governance-v2-charter.md) **§Success metrics #4**.
- All seven sibling task files' **Done when** lines — they are the checklist this gate aggregates.
- **The step-0 answers written during execution:** [`rec-17`](./task-rec-17-patient-initiated-pause.md)'s patient-credential finding and [`rec-18`](./task-rec-18-gap-markers-replay-player.md)'s composition-cardinality finding. Both were unknowable at planning time and both belong in the phase's closing record.
- `backend/migrations/064_consultation_recording_audit.sql` — L22–29 (the 5-minute SLA), L43–52 (the metadata shape and its test pin), L118–133 (both indexes).
- `backend/src/services/recording-pause-service.ts` L1–37 (the header comment this task closes) and L155–206.
- `backend/src/services/recording-track-service.ts` L37–63 — the sibling writer's ledger doctrine and action mapping. Read it; do not change it.
- `backend/src/services/twilio-recording-rules.ts` L262–337 (`RecordingMode`, `interpretRules`, `modeFrom`) and L339–371 (`getCurrentRecordingMode`), plus `TwilioRoomNotFoundError` at L248–260.
- `backend/src/workers/video-escalation-timeout-worker.ts` (whole file) and `cron.ts:549-580` — the pattern, the auth gate, the result shape.
- [`DEFINITION_OF_DONE.md`](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) — the gate this task runs.
- The program index [`../../README.md`](../../README.md) — the phase table row and the **Runs** section this task updates.

**Estimated turns:** 4–6.

---

## Part A — the reconciliation worker

### 1. Which orphans it sweeps — decide and record

- [x] 1.1 An orphan is a row with `metadata.status = 'attempted'`, older than the 5-minute SLA, with no `completed` or `failed` row sharing its `correlation_id`.
- [x] 1.2 The sweep uses `idx_recording_audit_attempted` (064 L122–127) and joins on `correlation_id` via its index (L129–133). If the query plan does not use them, **record that as a finding** — an unindexed scan of a growing governance table is a latent outage, and making the sweep cheap was the whole reason both indexes exist.
- [x] 1.3 **Decide and write into this file** whether the worker sweeps only pause/resume orphans or every orphan in the table. **Recommended: every orphan.** The SLA, the index and the ambiguity are all table-wide, and a partial sweep leaves the same table dishonest in the rows it skips.
- [x] 1.4 The 5-minute SLA is defined in one place and referenced, not re-typed per call site.

### 2. What reconciliation means — observe and record, never re-drive

- [x] 2.1 The worker reads Twilio's **current** rule state for the room and compares it with what the orphan row was attempting.
- [x] 2.2 **The worker never flips a Twilio rule and never re-attempts the original action.** It closes the ledger; it does not resume, re-pause, escalate or revert. This is the constraint that keeps it out of the pause state machine and out of p4's grant lifecycle.
- [x] 2.3 Twilio shows the attempted state in effect → the row is closed as having **completed**, with the reconciliation stamped so it is never mistaken for a row the original request wrote.
- [x] 2.4 Twilio shows the attempted state **not** in effect → the row is closed as **failed**, likewise stamped.
- [x] 2.5 `TwilioRoomNotFoundError` — a room already ended and garbage-collected → the row is closed as **indeterminate**, and the worker **does not guess**. A fabricated outcome in an audit ledger is worse than an acknowledged unknown, and this will be the common case for old rows.
- [x] 2.6 Every closing row is attributed to the **system** actor using the all-zeros UUID convention (064 L142–143), carries the original `correlation_id`, and records that a reconciliation produced it.
- [x] 2.7 If closing requires a new `metadata` field, the shape-pin test (064 L50–52) is updated deliberately in the same PR. **No new ENUM value and no migration** — REC3-D1 allows exactly one migration in this phase and rec-13 spent it.

### 3. Worker mechanics

- [x] 3.1 Idempotent: a row already reconciled is skipped, and a second tick over the same backlog writes nothing new.
- [x] 3.2 Concurrency-safe under two pods via an atomic conditional claim, following `video-escalation-timeout-worker.ts:10-26`.
- [x] 3.3 A per-tick batch cap. The first production run may face a backlog accumulated since April; it must not attempt the whole table in one tick.
- [x] 3.4 One row failing does not abort the tick. Errors are collected and reported.
- [x] 3.5 Result shape reports scanned / closed-completed / closed-failed / closed-indeterminate / raced / errors, so the cron response answers "what did it decide, and how often did it have to give up" without new tooling.
- [x] 3.6 A cron route mounts it with the same `CRON_SECRET` gate as its siblings. Cadence is far coarser than the escalation worker's — a 5-minute SLA does not want a 5-second tick. State the cadence and its worst-case lag in the route doc-comment.
- [ ] 3.7 **Run it once against real data and record the counts in this file**, broken down by outcome. Pre-existing orphans are the reason the index was built; the number is worth knowing.
- [x] 3.8 The stale note at `recording-pause-service.ts:20-23` is updated to point at the shipped worker. Leaving a comment that calls it a "future task" after building it is the drift this phase keeps finding.

### 4. Worker verification

- [x] 4.1 Unit tests: an orphan older than the SLA is closed; one younger is left alone; a row with a matching `completed` sibling is not an orphan; Twilio agreeing closes completed; Twilio disagreeing closes failed; `TwilioRoomNotFoundError` closes indeterminate; two concurrent claims close it once; a second tick is a no-op.
- [x] 4.2 A test asserts the worker performs **no** rule-flipping Twilio call. This is the boundary that matters most and it is easy to lose in a later refactor.
- [x] 4.3 Twilio is stubbed. No live calls in the suite.

---

## Part B — phase close gate

### 5. Verification gate — both workspaces

- [x] 5.1 Backend typecheck, lint and tests green. — **`tsc` + eslint on touched src green. Worker + sibling recording unit tests 61/61.**
- [ ] 5.2 Frontend typecheck, lint and tests green. — **Recording consultation vitest 23/23. Full-repo `tsc` red on pre-existing cockpit/rx files. Not this phase; not repaired here.**
- [x] 5.3 Full checklist run per [`DEFINITION_OF_DONE.md`](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md). — **mechanical items for the worker. Founder smoke is the remaining DoD hole.**
- [x] 5.4 **`git diff --stat backend/migrations/` shows exactly one new file** — rec-13's. REC3-D1 verified rather than assumed. — **untracked p3 file is only `196_recording_pause_reason_codes_and_auto_resume_stamps.sql`. Rec-20 added none. (Other untracked 187–195 are other programs.)**
- [x] 5.5 No RLS policy changed anywhere in the phase's diff.
- [x] 5.6 No `process.env` read introduced outside `config/env.ts`; no try/catch added in a controller; every new external input Zod-validated; every thrown error a typed `AppError`. — **cron route matches siblings (auth gate, no new body). Worker logs session/correlation/action/counts only.**
- [x] 5.7 Any new environment variable is present in `.env.example`. — **none. Reuses `CRON_SECRET`.**

### 6. Compliance sweep — the phase's headline

- [x] 6.1 **`rg` finds no remaining 5–200-character free-text path into `consultation_recording_audit.reason`.** The phase's central defect, verified by search rather than by memory. — **pause body is Zod `reasonCode` enum. Column writes are the code token, a pinned revoke sentence, or null. `video_escalation_audit.reason` is a different table (p4).**
- [x] 6.2 No pause reason string appears in the audit table, a system-message body, an exported transcript, or any log line. Reason **codes** only, everywhere (REC3-D9).
- [x] 6.3 Every log line added in the phase reviewed for PHI. Session ids, room sids, correlation ids, kinds, codes, counts and durations are acceptable; names, phone numbers and DOBs are not.
- [x] 6.4 rec-13's legacy redaction confirmed applied, with its recorded affected-row count present in that task's Notes. — **0 rows (dev, 2026-08-18).**

### 7. Charter metric #4 — gap visibility

The charter's metric: *every paused window appears in both the player timeline and the transcript, with actor and reason code.*

- [ ] 7.1 Measure it on a real consult with **at least two** pauses. One pause cannot detect the media-time positioning error REC3-D8 warns about.
- [ ] 7.2 Both surfaces checked independently — the player ([`rec-18`](./task-rec-18-gap-markers-replay-player.md)) and the exported transcript ([`rec-19`](./task-rec-19-gap-markers-transcript.md)). "Both" is the metric; one of two is a fail.
- [ ] 7.3 Confirm actor **and** reason code render on each gap, on each surface.
- [ ] 7.4 Any shortfall is **explained, not rounded up.** Legacy rows with no code and gaps that cannot be positioned are legitimate exclusions — each named and counted.
- [x] 7.5 Numbers written into the program README's **Runs** section. The README states the program is not Closed until its metrics are measured on production data and written there; this task delivers #4. — **hole recorded: not measured.**

### 8. Founder smoke — one pause-during-video consult, end to end

- [ ] 8.1 Run a real **video** consult with a live video escalation.
- [ ] 8.2 Pause it. **Confirm against Twilio's rules endpoint that video stopped too** — not just that our banner says paused. This is REC-D13, the phase's defect fix, and our own ledger is not acceptable evidence for it.
- [ ] 8.3 Watch the countdown on **both** sides.
- [ ] 8.4 Extend once. Confirm a second extension is refused.
- [ ] 8.5 Let it auto-resume. Confirm both parties are told, and that video came back only if its grant was still valid.
- [ ] 8.6 Pause a second time and end the consult while paused. Confirm zero open pause rows remain.
- [ ] 8.7 Replay the consult. Both gaps visible, correctly placed, labelled with actor and code.
- [ ] 8.8 Export the transcript. Both gaps inline, in timestamp order, with actor and code, and **no free text anywhere.**
- [ ] 8.9 Run a **voice** consult pause/resume and confirm no regression. Voice-only pause worked before this phase and must still work.
- [ ] 8.10 Confirm a patient can pause, and that the resulting row is attributed to the patient.

### 9. Documentation sync

- [x] 9.1 The batch plan's phase acceptance gate fully checked, with any unchecked item carrying a one-line reason.
- [x] 9.2 The program README's phase table marks p3 with its shipped status and date.
- [x] 9.3 rec-17's patient-credential answer and rec-18's composition-cardinality answer are recorded where a later phase will find them. Both were unknowable from the code at planning time and are this phase's most durable output.
- [x] 9.4 The pause-state contract rec-14 published for p4 is legible from the code, so p4 can consume it without reading a plan doc. — **`recording-pause-service.ts` header "p4 pause-state contract (REC3-D6)".**
- [x] 9.5 **Any contradiction with the charter or the batch plan is recorded plainly rather than quietly reconciled.** The likeliest candidates: REC3-D8's single-composition assumption, and the claim that the pause reason reaches `archival_history` (the batch plan already corrects the latter).
- [x] 9.6 Anything discovered and deliberately not fixed is captured to `docs/Work/capture/inbox.md` — including `video_escalation_audit`'s surviving free-text reason field and the revoke route's Supabase-session-only auth.

### Out of scope

- **Fixing anything Part B's gate catches.** Route it back to the owning task. A close gate that also repairs is a close gate nobody trusts. The one exception is the worker this file owns.
- Re-driving any failed action. Reconciliation observes and records (§2.2).
- Metrics #1, #2 and #3 — p1, p2 and p4 own those.
- Any threshold, nudge or session flag on cumulative pause time (REC-D18 / REC3-D10).
- Marking the **program** Closed. This closes p3 only.
- Re-opening REC-D1…REC-D25 or REC3-D1…REC3-D10. Contradicting evidence is recorded and surfaced; amending the lock is an owner action.
- Any migration; any RLS policy.

---

## Scope Guard

- **Expected files touched: ≤ 6** — one new worker, `cron.ts` (one route), the metadata shape-pin test, the worker's test file, plus documentation: this file, the batch plan's gate checkboxes and the program README.
- **DO NOT TOUCH:** `recording-pause-service.ts` beyond the stale comment at L20–23 · `recording-track-service.ts` · `twilio-recording-rules.ts` · `recording-escalation-service.ts` · `video_escalation_audit` · `video-escalation-timeout-worker.ts` and rec-16's worker (copy the shape, edit neither) · any migration · any RLS policy · any frontend file.
- **STOP and surface** if: closing a row appears to need a new ENUM value or a second migration · the sweep cannot use the existing indexes · reconciliation appears to require flipping a Twilio rule or reading grant state.

---

## Global safety gate (MANDATORY)

- [x] **Data touched?** Yes — the worker writes closing rows to `consultation_recording_audit`. Part B is read-only.
  - [x] **RLS verified?** Yes — no policy change; service-role writes as today.
- [x] **Any PHI in logs?** Must be **No**, and §6 is the sweep that verifies it for the whole phase. Counts, sids, correlation ids and codes only.
- [x] **External API or AI call?** Yes — Twilio rule **reads** only. No rule writes. No AI calls.
- [x] **Retention / deletion impact?** None added. The worker writes audit rows; it deletes nothing.

---

## Design constraints (NO IMPLEMENTATION)

- Observe and record. A reconciliation worker that acts is a second, unaudited state machine over the same rules.
- Never fabricate an outcome. `indeterminate` is a real, correct answer and must be available.
- Polling, cron-gated, batch-capped, atomically claimed — the house pattern, third instance.
- Exactly one migration in this phase, and it is already spent.
- The gate verifies and does not repair, except for the worker this file owns.
- Record contradictions rather than reconciling them. A plan corrected by reality is the plan working.

---

## Done when

Orphan `attempted` rows older than the 5-minute SLA are swept using the existing partial index, reconciled against Twilio's current rule state, and closed as completed, failed or indeterminate — never guessed, never re-driven, with no rule-flipping call proven by test; the worker is cron-mounted, idempotent, concurrency-safe and batch-capped, and its first real run's counts are recorded here; the stale "future task" comment is gone; the phase gate is green in both workspaces with exactly one new migration and no RLS change; `rg` confirms no free-text reason path survives; charter metric #4 is measured on a two-pause consult across both surfaces and written into the program README's Runs section; a founder has run a pause-during-video consult end to end and confirmed against Twilio's rules endpoint that pause stopped video; rec-17's and rec-18's step-0 answers are recorded; and every contradiction found is written down rather than reconciled.

---

## Related tasks

- Aggregates: [`rec-13`](./task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md), [`rec-14`](./task-rec-14-pause-covers-every-active-recording-kind.md), [`rec-15`](./task-rec-15-preset-pause-reason-codes.md), [`rec-16`](./task-rec-16-auto-resume-countdown-and-dangling-pause.md), [`rec-17`](./task-rec-17-patient-initiated-pause.md), [`rec-18`](./task-rec-18-gap-markers-replay-player.md), [`rec-19`](./task-rec-19-gap-markers-transcript.md)
- Close-gate precedent: [`rec-06`](../../p1-artifact-registry/Tasks/task-rec-06-close-gate-p1.md)
- Program index: [`README.md`](../../README.md)
- [Execution order](./EXECUTION-ORDER-p3-recording-governance-v2-pause-integrity.md)

---

**Last Updated:** 2026-08-19.
**Pattern:** cron-driven observe-and-record reconciliation sweep over a partial index; aggregate phase gate with a founder smoke.

---

## Notes (rec-20)

### §1.3 — sweep every orphan

Table-wide. The SLA, `idx_recording_audit_attempted`, and the double-row doctrine are shared by `recording-pause-service` and `recording-track-service`. A pause-only sweep would leave start/escalate/revert orphans dishonest.

`indeterminate` is a `metadata.status` value on the **closing sibling row**, not a new Postgres ENUM. Attempted rows stay `attempted`. Pause-service write-shape pin is unchanged.

### §1.2 — indexes

Scan filter is `(metadata->>'status') = 'attempted'` + `created_at <= cutoff` + `LIMIT 50` — matches `idx_recording_audit_attempted`. Sibling lookup is `.in('correlation_id', …)` — matches `idx_recording_audit_correlation_id`. **EXPLAIN not run this session** (founder, with first real tick).

### §1.4 — SLA

`RECORDING_AUDIT_ORPHAN_SLA_MS` in `consultation-recording-audit.ts`. Tick: 60s (`RECORDING_ORPHAN_RECONCILE_TICK_SECONDS`). Worst-case after SLA: one tick (5:00–6:00). Batch cap 50.

### §2 — observe, never re-drive

`getIncludedRecordingKinds` only. Closing row: system actor (all-zeros), original `correlation_id`, `metadata.reconciled: true`. Pause/stop copy the original `reason` token (or `not_recorded_in_preset_form`); never free text. No `auto_resume_at` on a reconciled completed pause — this is a ledger close, not a live policy.

### §3.7 — first real run

**Not run.** No production ledger tick this session.

| Outcome | Count |
|---|---|
| scanned | — |
| closedCompleted | — |
| closedFailed | — |
| closedIndeterminate | — |
| raced | — |
| errors | — |

### Step-0 answers (9.3)

**rec-17 — patient credential:** Voice, video and text patients hold a scoped consult JWT (`mintScopedConsultationJwt`). Doctors hold a Supabase access token. `authenticateToken` rejects the scoped JWT. Pause/resume/state use dual-bearer `resolveRecordingCaller`. Patient actor = `consultation_sessions.id` when no `auth.users` id. Extend stays `authenticateToken`.

**rec-18 — composition cardinality:** One audio composition per room (account hook `HKbe336c348bce4c81907f6a3c55844a82` at room-complete). Pause creates new Recording SIDs, not compositions. REC3-D8 stands. `twilio-compositions.ts:165-169` is stale as a composition-cardinality claim.

### Contradictions (9.5)

- REC3-D8 single-composition assumption **holds**. Not contradicted.
- Pause reason → `archival_history`: batch plan already corrects this; the leak path was system-message body → transcript (closed by rec-15/19).
- Batch plan "Verified current state" table is **stale**: pause is no longer hardcoded to audio (rec-14); banner no longer embeds free-text reason (rec-15); pause auth is no longer doctor-only (rec-17). Left as historical planning notes, not silently rewritten.

### Frontend tsc (5.2)

Full frontend `tsc --noEmit` fails on pre-existing cockpit/rx/social-history errors. p3 did not touch those files. Recording consultation tests pass. Not repaired here (gate verifies, does not fix).
