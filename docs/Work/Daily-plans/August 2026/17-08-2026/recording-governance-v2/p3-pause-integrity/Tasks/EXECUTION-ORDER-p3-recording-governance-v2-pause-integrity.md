# EXECUTION ORDER — p3 recording-governance-v2 pause integrity

> Sibling document of [`plan-p3-recording-governance-v2-pause-integrity-batch.md`](../plan-p3-recording-governance-v2-pause-integrity-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## ⚠️ Two unknowns that gate work inside this phase

Neither blocks Wave 1, and both are answered by a task that owns them — but knowing about them early changes how you read the waves.

**`rec-17` step 0 — which credential does the patient actually hold?** `POST /:sessionId/recording/pause` and `GET /:sessionId/recording/state` are both mounted with `authenticateToken` (`routes/api/v1/consultation.ts:189-203`), which verifies a Supabase access token. A bot patient's scoped consult JWT carries no `iss`, so it is routed to the remote `getUser` fallback (`utils/supabase-token-verifier.ts:203-205`), which has no `auth.users` row to resolve. If patients hold scoped JWTs, then **the patient cannot call the pause path or the state path today**, and rec-17 must mount its route from the existing bearer-discrimination patterns rather than reusing `authenticateToken`. rec-16's patient-side countdown depends on the same answer, which is why the two share a wave.

**`rec-18` step 0 — one composition per consult, or several?** REC3-D8's media-time arithmetic assumes the composition omits the paused window. `twilio-compositions.ts:165-169` says the opposite — that pause/resume "closes + reopens the audio-only leg," giving *N* audio compositions per room. If that is right, gaps are boundaries between artifacts, REC3-D8 needs amending, and there is a bigger finding attached: `resolveAudioArtifact` takes `.limit(1)` (`recording-access-service.ts:275-293`), so **a paused consult may currently replay only its final leg.** Multi-composition replay belongs to p5. rec-18 stops rather than building it.

Both answers get written into their task files and carried into rec-20's closing record.

---

## Wave plan (6 waves)

```
Wave 1 (Schema — ~2h, single lane sequential):
  Lane α  ──── rec-13 (S, Opus · mandatory)

Wave 2 (The defect fix — ~4h, single lane sequential):
  Lane α  ──── rec-14 (M, Opus)

Wave 3 (Reason codes — ~4h, single lane sequential):
  Lane α  ──── rec-15 (M, Sonnet)

Wave 4 (Bounded pauses + patient control — ~10h, 2 parallel lanes):
  Lane α  ──── rec-16 (L, Sonnet)        [worker + cron + countdown]
  Lane β  ──── rec-17 (M, Sonnet)        [authZ + patient control]

Wave 5 (Gap rendering — ~7h, 2 parallel lanes after rec-18's derivation lands):
  Lane α  ──── rec-18 (M, Sonnet)        [player]
  Lane β  ──── (waits on rec-18's gap read) ──> rec-19 (M, Sonnet)   [transcript]

Wave 6 (Worker + close — ~4h, single lane sequential):
  Lane α  ──── rec-20 (M, Sonnet / Founder)
```

**Total wall-clock with parallelism:** ~27h.
**Total agent-time (sequential equivalent):** ~31h.

The bottleneck is **Waves 1–3**, and it is a genuine chain rather than caution: rec-14 and rec-15 both rewrite `recording-pause-service.ts`, so running them together would collide in the same file on the same functions. rec-13 must land before either, because both write to columns it creates.

**Wave 4's lanes pass the gate.** rec-16 is a worker, a cron route and a countdown; rec-17 is a route mount, a service authorization branch and a patient control. They share one file (`recording-pause-service.ts`) in different places and one state shape. Sequence rec-17 second if you would rather stay single-threaded — the only coupling is that rec-16 §5.3 needs rec-17's step-0 answer, and rec-16 has a documented fallback that does not block on it.

**Wave 5's lanes are ordered, not parallel-from-zero.** rec-19 consumes rec-18's gap derivation and must not write a second one. Start rec-18, land the derivation and the read endpoint, then open rec-19 in its own chat against that contract. The two rendering surfaces are genuinely independent after that point — one is pdfkit, one is React.

---

## Lane-by-lane details

### Wave 1 — Schema (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-13 | S | **Opus · mandatory** | `064_consultation_recording_audit.sql` (whole file), `071_recording_audit_action_video_values.sql` (whole file), [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md), `recording-pause-service.ts` L92–136 + L273–333, `recording-track-service.ts` L191–330, `195_appointment_start_notify_stamp.sql` | **Re-derive the migration number from the live folder before writing.** Budget 197; head at planning was 195. The legacy free-text decision (REC3-D3) is the judgement call. Hard stop on RLS, on `action_by`'s type, or on a second migration. |

### Wave 2 — The defect fix (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-14 | M | **Opus** | `twilio-recording-rules.ts` (whole file), `recording-pause-service.ts` (whole file), `recording-track-service.ts` L1–110 + L332–356, both existing unit test files | Lives inside the Twilio rule state machine. Also lands the pause-state read p4's revert paths must consult (REC3-D6) — `setRecordingRulesToAudioOnly` (L388) does **not** short-circuit for a paused session because `modeFrom` classifies it `'other'`. Verify against Twilio's rules endpoint, not mocks. |

### Wave 3 — Reason codes (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-15 | M | Sonnet | rec-13 **as merged** (what it did to the reason CHECK), `recording-pause-service.ts` L216–354, `consultation-controller.ts` L1555–1590, `transcript-pdf-service.ts` L520–548, `RecordingControls.tsx` L205–236, `useRecordingState.ts` L95–102 | Runs after rec-14 to avoid a collision in the same service. Introduces the Zod schema the controller never had. The client-side reason regex must retire in the same PR as the copy change. |

### Wave 4 — Bounded pauses + patient control (2 parallel lanes)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-16 | L | Sonnet | `video-escalation-timeout-worker.ts` (whole file), `cron.ts` L549–580, `consultation-session-service.ts` L216–283, `useRecordingState.ts` (whole file), `recording-escalation.ts` L64–75 | Polling only — no `setTimeout` (REC3-D7). One stamp added inside `endSession`, best-effort and last; teardown untouched. Countdown from the server's absolute deadline. |
| 0 | rec-17 | M | Sonnet | `middleware/auth.ts` (whole file), `supabase-jwt-mint.ts` (whole file), `supabase-token-verifier.ts` L83–92 + L196–207, `consultation-controller.ts` L507–549 + L1957–1968 + L2689–2709, `VideoRecordingIndicator.tsx` (whole file) | **Step 0 first.** Compose authZ from existing patterns or stop — a new patient token type is an owner decision. Read the revoke call for its **UI** shape, not its auth. Also decides who may resume whose pause. |

### Wave 5 — Gap rendering (2 lanes, rec-19 after rec-18's read lands)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-18 | M | Sonnet | `RecordingReplayPlayer.tsx` (whole file, render block L557–619), `recording-access-service.ts` L244–385, `recording-track-service.ts` L741–820, `twilio-compositions.ts` L152–178, `consultation-controller.ts` L1949–1968 | **Step 0 first** — composition cardinality. Media time, not wall-clock; zero-width markers; a **two-pause** test is the one that catches the naive implementation. Native controls cannot be annotated, so markers sit beside the element and the textual list is the accessible primary. |
| 1 | rec-19 | M | Sonnet | rec-18's gap read **as merged**, `transcript-pdf-composer.ts` (whole file, `mergeByTimestamp` L293–319), `transcript-pdf-service.ts` L480–620, both existing test files | Wall-clock ordering here — do **not** carry rec-18's offset arithmetic across. Decides whether the pause system-message row is suppressed in favour of the gap marker (recommended: one representation). Output is patient-downloadable, so the no-free-text rule is absolute. |

### Wave 6 — Worker + close (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-20 | M | Sonnet / Founder | `064_…sql` L22–29 + L43–52 + L118–133, `video-escalation-timeout-worker.ts`, `cron.ts` L549–580, `twilio-recording-rules.ts` L248–371, all seven siblings' **Done when** lines, rec-17 + rec-18 step-0 answers, program README | Worker **observes and records** — never flips a rule, never re-drives an action; `indeterminate` is a valid outcome. Then verifies; a failed gate routes back to the owning task. Founder smoke is not delegable. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| rec-13 | S | **Opus · mandatory** | New migration on a live governance table plus a one-time destructive redaction. Hard-rules list per [`00-agent-contract.mdc`](../../../../../../../../.cursor/rules/00-agent-contract.mdc); the charter repeats it. Auto must not write this file. |
| rec-14 | M | **Opus** | Inside the Twilio recording-rule state machine, where a wrong merge reproduces the exact failure this phase exists to fix — ledger says one thing, Twilio does another, no error anywhere. The `'other'`-mode short-circuit collision is invisible until seen. |
| rec-15 | M | Sonnet | Closed enum across three layers against a locked schema, with a preset-code precedent already in the domain. |
| rec-16 | L | Sonnet | Large but well-precedented: worker, cron route, server-timestamp countdown, and an additive `endSession` side effect all exist in the repo. |
| rec-17 | M | Sonnet | Service-branch widening plus one control — **with a hard stop** if authZ cannot be composed from existing patterns. |
| rec-18 | M | Sonnet | Bounded frontend work plus one read endpoint; step 0 has a defined stop condition rather than an open design. |
| rec-19 | M | Sonnet | One well-factored merge function with existing tests to extend. |
| rec-20 | M | Sonnet / Founder | Third instance of the worker pattern, then command-running, measurement and a manual smoke that needs a human. |

**Two Opus tasks — at the ≤2 cap, one per wave.** rec-13 is mandatory (migration). rec-14 is the justified second: the rule state machine is the one place in this phase where a plausible-looking wrong answer ships silently, and it publishes the pause-state contract every p4 revert path will consult. Everything downstream runs on Auto against locked contracts. If a third task starts to feel like it needs Opus, tighten its task file instead.

---

## Acceptance gates per wave

**Wave 1**

- [ ] Migration applies clean and re-applies as a no-op; number re-derived from the live folder and recorded.
- [ ] Exactly five reason-code ENUM values, pinned by a test.
- [ ] New pauses can be required to carry a code without breaking a single historical row.
- [ ] Auto-resume deadline + extension count queryable by a polling job, with a supporting partial index.
- [ ] Patient actor surrogate chosen, documented in a column comment, and provably distinct from the system actor.
- [ ] Legacy free text gone, redaction stamped, affected-row count in Notes; actor / role / action / timestamp / correlation id unchanged.
- [ ] No RLS change. Exactly one migration. `action_by` type unchanged.

**Wave 2**

- [ ] All Wave 1 gates still green.
- [ ] Pausing a consult recording audio **and** video stops both — **verified against Twilio's rules endpoint**, not our ledger.
- [ ] Resume restores exactly the pre-pause kinds, and never restores video whose grant lapsed.
- [ ] A revert-to-audio-only call arriving during a pause cannot silently resume audio; regression test pins it.
- [ ] The pause-state contract for p4 is written into the service header.
- [ ] A partial failure writes a `failed` row and throws — never a half-pause reported as success.
- [ ] The stale `DEFAULT_KIND` comment is gone. Nothing in `recording-escalation-service.ts` or `video_escalation_audit` changed.

**Wave 3**

- [ ] All Wave 2 gates still green. (rec-14 5.2 live Twilio rules-endpoint smoke still founder)
- [x] The pause API rejects free text; only the five codes are accepted, validated by Zod in the controller.
- [x] No free-text reason in the audit row, the message body, or any pause-path log line. (`reason` stores the enumerated token because 064's 5–200 CHECK still stands; `pause_reason_code` is the home. 6.4 real PDF still founder.)
- [x] Doctor picker replaced the textarea with no free-text escape hatch; the client-side reason regex is gone.
- [x] Legacy rows render an explicit not-recorded state.
- [x] `rg` sweep recorded. No second migration.

**Wave 4**

- [ ] All Wave 3 gates still green.
- [x] A pause left alone auto-resumes at 5 minutes, durably across a pod restart, with no in-process timer anywhere. (7.2 live cron/Twilio smoke still founder)
- [x] Both parties saw a live countdown derived from the server's deadline; it survived a refresh and did not self-resume at zero. (Patient GET /state does not work today — rec-17; banner degrades without a deadline.)
- [x] The doctor extended exactly once; the second attempt was refused server-side.
- [ ] A consult ended while paused leaves **zero** open pause rows. (stamp shipped; 4.5 live query still founder)
- [x] Auto-resume is attributed to the system, not to the doctor who paused.
- [ ] A patient can pause directly with no doctor approval, and the row is permanently attributed to the patient.
- [x] rec-17's step-0 credential answer is written into its task file. (2026-08-19: video/voice/text patients hold a scoped consult JWT; dual-bearer mount shipped.)
- [ ] The resume rule (who may lift whose pause) is decided, recorded and pinned by tests.
- [ ] No new token type, no new claim, no auth change to the doctor path.

**Wave 5**

- [ ] All Wave 4 gates still green.
- [x] rec-18's step-0 composition-cardinality answer is written into its task file. (2026-08-19: one audio composition per room; pause splits recordings, not compositions.)
- [ ] A two-pause consult shows two markers at correct **media-time** positions on both the audio and the video artifact, each labelled with actor + reason code.
- [ ] A dangling pause renders to the end of the recording; a gap that cannot be positioned is still listed.
- [ ] The gap list is keyboard-reachable; a failed gap read leaves playback working and says so.
- [ ] The exported transcript shows both gaps inline, in timestamp order, with actor + code, and no free text.
- [ ] A gapless transcript is structurally unchanged; the existing merge tie-break contract is preserved.
- [ ] The OTP gate, the 90-day window, revocation, minting and the access-audit rows are all unchanged.

**Wave 6**

- [ ] All Wave 5 gates still green.
- [ ] An orphan `attempted` row older than the 5-minute SLA is reconciled against Twilio's current rule state and closed as completed, failed or indeterminate — never guessed.
- [ ] A test proves the worker makes no rule-flipping Twilio call.
- [ ] First real run's counts recorded; the stale "future task" comment is gone.
- [ ] Typecheck + lint + tests green in **both** workspaces; [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md) checklist run.
- [ ] `git diff --stat backend/migrations/` shows **exactly one** new file. No RLS change.
- [ ] Charter metric #4 measured on a two-pause consult across **both** surfaces, shortfalls explained, numbers in the program README's Runs section.
- [ ] Founder smoke complete end to end, including the Twilio-rules confirmation that pause stopped video.
- [ ] Every contradiction found is recorded rather than reconciled.

---

## Cost estimate

| Wave | Tasks | Sonnet chats | Opus chats | Wall-clock |
|---|---|---|---|---|
| 1 | rec-13 | 0 | 1 | ~2h |
| 2 | rec-14 | 0 | 1 | ~4h |
| 3 | rec-15 | 1 | 0 | ~4h |
| 4 | rec-16, rec-17 | 2 | 0 | ~6h (parallel) |
| 5 | rec-18, rec-19 | 2 | 0 | ~4h (rec-19 after rec-18's read) |
| 6 | rec-20 | 1 + founder time | 0 | ~4h |

**Fresh chat per task.** Pre-load the task file + [charter](../../plan-recording-governance-v2-charter.md) + [batch plan](../plan-p3-recording-governance-v2-pause-integrity-batch.md) decision lock + the listed source files with their line ranges.

**Branch suggestion:** one branch per wave. Wave 4's two lanes want separate worktrees because both touch `recording-pause-service.ts`; Wave 5's two lanes are in different workspaces and do not.

**Hard stops — surface, do not solve:**

- **A second migration anywhere in this phase** (REC3-D1). rec-13 spends the one.
- Any RLS policy change. `consultation_recording_audit` is service-role-only by design (064 §Safety).
- Any change to `action_by`'s column type.
- A new patient token type, claim or HMAC exchange (rec-17 §1.4).
- Any need to change grant state, attempt counters, cooldowns or the consent modal to make pause correct — that is the p4 boundary (REC3-D6).
- rec-18 step 0 returning several compositions per consult — REC3-D8 would need amending and multi-composition replay is p5's.
- Any PHI column.

---

## References

- [Batch plan](../plan-p3-recording-governance-v2-pause-integrity-batch.md)
- [Charter](../../plan-recording-governance-v2-charter.md) — REC-D1…REC-D25; this phase owns REC-D13…REC-D18
- [Program index](../../README.md)
- Downstream phase this one publishes a contract to: [`p4-video-escalation-control/`](../../p4-video-escalation-control/)
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md)
- [PHASED-PLANS-GUIDE.md](../../../../../../process/PHASED-PLANS-GUIDE.md)
- [TASK_TEMPLATE.md](../../../../../../process/TASK_TEMPLATE.md)
- Sibling exec-order precedents: [`p1 artifact-registry`](../../p1-artifact-registry/Tasks/EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md) · [`p4 consult-room-checkin`](../../../../12-08-2026/consult-room-checkin/p4-realtime-and-channel-gaps/Tasks/EXECUTION-ORDER-p4-consult-room-checkin-realtime-and-channel-gaps.md)
