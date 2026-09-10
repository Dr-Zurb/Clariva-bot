# EXECUTION ORDER — p1 recording-governance-v2 artifact registry

> Sibling document of [`plan-p1-recording-governance-v2-artifact-registry-batch.md`](../plan-p1-recording-governance-v2-artifact-registry-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## ⚠️ Before Wave 1 — a blocking unknown

`rec-01` **step 0** establishes how Twilio Compositions come into existence for this account. Nothing in this repository creates one (`rg` finds no `compositions.create` and no `CompositionHook` anywhere), so the answer lives in the Twilio console, not in the code.

It is a ~30-minute check and it is worth doing **before Wave 1 starts**, even though it is formally step 0 of a Wave 2 task. If the answer is "no Composition Hook is configured", then no compositions are produced at all, voice replay is broken in production as well as video, and the phase needs re-scoping — you would rather learn that before spending Wave 1's five Opus hours on a writer. See the batch plan's *"Surfaced during planning"* section.

---

## Wave plan (5 waves)

```
Wave 1 (Registry writer — ~5h, single lane sequential):
  Lane α  ──── rec-02 (L, Opus)

Wave 2 (Finalise trigger — ~5h, single lane sequential):
  Lane α  ──── rec-01 (L, Opus)

Wave 3 (Parity + replay — ~6h, single lane sequential):
  Lane α  ──── rec-03 (M, Sonnet) ──> rec-04 (M, Sonnet)

Wave 4 (Backfill — ~4h, single lane sequential):
  Lane α  ──── rec-05 (M, Sonnet)

Wave 5 (Close — ~2h, single lane sequential):
  Lane α  ──── rec-06 (S, Composer / Founder)
```

**Total wall-clock with parallelism:** ~22h.
**Total agent-time (sequential equivalent):** ~22h.

Every wave is single-lane, so the two numbers are equal. That is not an oversight — see below.

The bottleneck is **Wave 1** — `rec-02` is single-lane Opus because it is the keystone primitive and nothing else in the batch can be written against a contract that does not exist yet. Waves 1 and 2 are also each a single Opus task, which the ≤1-Opus-per-wave cap requires; collapsing them into one wave is not available.

**Why no parallel lanes anywhere.** Applying the §5 lane gate honestly, the batch is one dependency chain: `rec-02` (writer) → `rec-01` (the thing that calls it) → `rec-03` (parity, which needs both the writer and rec-01's step-0 answer) → `rec-04` (replay, whose video-404 fix is only demonstrable once rec-03 produces video rows) → `rec-05` (backfill, which writes through rec-02 and is only meaningful once rec-04 reads the index) → `rec-06` (verifies all of it). No pair passes "I could open this in a separate chat today and ignore the other lane completely." Drawing lanes here would be the phantom-parallelism anti-pattern.

---

## Lane-by-lane details

### Wave 1 — Registry writer (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-02 | L | **Opus** | `056_recording_artifact_index.sql` (whole file, UNIQUE at L89), `recording-access-service.ts` L264–323 + L371–385, `twilio-compositions.ts` L57–67/L109–120/L292–334, `storage-service.ts` L11–21/L46–74/L76–133, `recording-archival-worker.ts` L256–291 + L545–624 | The `storage_uri` convention (REC1-D1) is the decision. It must survive `extractCompositionSid` unmodified, and its archival-worker hazard must be written down (REC1-D7). Nothing calls the writer at the end of this wave — that is intentional. Hard stop on any migration. |

### Wave 2 — Finalise trigger (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-01 | L | **Opus** | rec-02 **as merged** (writer contract + recorded `storage_uri` convention), `routes/webhooks.ts` (whole file), `twilio-webhook-controller.ts` (whole file), `utils/webhook-verification.ts`, `webhook-controller.ts` L740–780 + L830–860, `index.ts` L248–253, `env.ts` L133–143 + L252, `voice-transcription-worker.ts` L133–135 + L142–187 | **Step 0 first, before any code.** No Twilio signature-verification precedent exists in this repo — the existing room-status webhook verifies nothing, and is the counter-example, not the template. The poll stays (REC1-D4). |

### Wave 3 — Parity + replay (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-03 | M | Sonnet | rec-01's **step-0 answer**, `voice-session-twilio.ts` L140–208, `consultation-session-service.ts` L115–166, `voice-transcription-service.ts` L126–176, `recording-track-service.ts` L741–820, `twilio-compositions.ts` L170–178 + L211–279 | Starts as an investigation. **"Video already inherits coverage — here is the proof" is a valid and complete outcome**; do not manufacture wiring. Video tracks are never transcribed. |
| 1 | rec-04 | M | Sonnet | `recording-access-service.ts` L244–323, L329–385, L716–810; `recording-track-service.ts` L741–820; rec-02's `storage_uri` convention | Runs after rec-03 so the video-404 fix is demonstrable rather than theoretical. Path B is retained behind a flag + comment (REC1-D5) — **not deleted.** Owns the phase's headline outcome. |

### Wave 4 — Backfill (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-05 | M | Sonnet | `backfill-perdoctor-patient-identity.ts` (whole file — the house pattern), `backend/package.json` scripts, `twilio-compositions.ts` L211–279, `recording-track-service.ts` L794–806, `recording-archival-worker.ts` L256–291 + L420–499, `env.ts` L573, `cron.ts` L463–502 | Dry-run **first**, output recorded, then the real run. The dry-run must report immediately-hide-eligible counts — the hide phase is not gated by the hard-delete flag. Every insert goes through rec-02's writer; no raw SQL. |

### Wave 5 — Close (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | rec-06 | S | Composer / Founder | Batch plan gate, charter §Success metrics, program README, all five siblings' **Done when** lines, rec-01 step-0 answer, rec-03 finding, rec-05 counts | Verifies; does not build. A failed gate routes back to the owning task. The founder replay of a real video consult is not delegable. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| rec-02 | L | **Opus** | Keystone primitive read by every later task and every later phase. Its `storage_uri` choice determines whether the archival worker can later record a deletion that did not happen — a compliance judgement, not wiring. |
| rec-01 | L | **Opus** | New internet-facing endpoint that mutates clinical-record state, with **no signature-verification precedent in the repo** to copy. Hard-rules adjacent per `00-agent-contract.mdc`. |
| rec-03 | M | Sonnet | Bounded investigation plus a small wiring change (possibly none), against contracts locked in Waves 1–2. |
| rec-04 | M | Sonnet | Bounded edits to one well-documented file; the risk is regression, which the acceptance criteria pin down. |
| rec-05 | M | Sonnet | Existing repo script pattern over a locked writer contract. Operational care, not architectural. |
| rec-06 | S | Composer / Founder | Command-running, doc sync and a manual smoke that needs a human. |

**Two Opus tasks in the batch — at the ≤2 cap, one per wave.** rec-01 is the expected one. rec-02 is the justified second: it is the single module the entire program depends on, and REC1-D7's false-deletion hazard is decided there. If a third task starts to feel like it needs Opus, the spec is too loose — tighten the task file instead.

---

## Acceptance gates per wave

**Wave 1**

- [ ] The `storage_uri` convention is chosen and **written into `rec-02`'s task file** as a stated outcome, with the archival-worker hazard recorded (REC1-D7).
- [ ] `extractCompositionSid` (`recording-access-service.ts:378–385`) recovers the SID from that convention **without that function being modified.**
- [ ] Registering the same composition SID twice produces exactly one row, and the second call reports "already existed" rather than an error.
- [ ] A round-trip test proves a row written by the writer resolves through `resolveAudioArtifact` Path A with `source: 'index'`.
- [ ] A non-`completed` composition is not registered.
- [ ] No migration, no RLS change, no new env var. `git diff --stat backend/migrations/` empty.
- [ ] Backend typecheck + lint + tests green.

**Wave 2**

- [ ] All Wave 1 gates still green.
- [ ] **rec-01 step 0 is answered in writing** — how Compositions are created, and what the callback URL was set to before and after.
- [ ] A verified composition-completed callback creates exactly one registry row end-to-end, with no poll run by hand.
- [ ] A tampered request and a missing-signature request are both **rejected**, and both emit an audit signal.
- [ ] Missing verification credentials fail closed.
- [ ] A duplicate delivery, and a webhook/poll race on the same SID, each still yield exactly one row.
- [ ] `voice-transcription-worker.ts` polling behaviour is unchanged (REC1-D4); only the L133–135 comment may have moved.
- [ ] No raw webhook payload appears in any log line. No PHI anywhere.
- [ ] Backend typecheck + lint + tests green.

**Wave 3**

- [ ] All Wave 2 gates still green.
- [ ] rec-03's investigation finding is written into its task file.
- [ ] An ended **video** consult has an `audio_composition` registry row (REC-D20).
- [ ] No video track is handed to a transcription provider anywhere in the diff.
- [ ] `resolveAudioArtifact` returns `source: 'index'` when a row exists; Path B still resolves sessions without one and its retirement condition is legible in the code (REC1-D5).
- [ ] `resolveVideoArtifact` consults the index before calling Twilio, and its L334–349 doc-comment no longer claims Twilio is the only source of truth.
- [ ] **The video-consult replay 404 is reproduced before the change and confirmed gone after.**
- [ ] Voice replay, the video OTP gate, the 90-day self-serve window, the revocation check and the access-audit rows are all unchanged.
- [ ] Backend typecheck + lint + tests green.

**Wave 4**

- [ ] All Wave 3 gates still green.
- [ ] Dry-run executed first and its output recorded in `rec-05`'s task file, including rows-by-kind, rows-by-modality, **immediately-hide-eligible count**, hard-delete-candidate count, and ended sessions still unresolvable after backfill.
- [ ] The real run completed; counts verified against the database and recorded.
- [ ] Re-running the script creates nothing.
- [ ] An interrupted run resumes without duplicating.
- [ ] Every insert went through rec-02's writer — no raw SQL against `recording_artifact_index`.
- [ ] The archival worker's next run reports a **non-zero candidate count** where it previously reported zero.
- [ ] `ARCHIVAL_HARD_DELETE_ENABLED` is still `false`.
- [ ] Backend typecheck + lint + tests green.

**Wave 5**

- [ ] All Wave 4 gates still green.
- [ ] Typecheck + lint + tests green in **both** workspaces.
- [ ] Migration diff empty; no RLS change; hard-delete flag still `false`.
- [ ] PHI sweep clean across every log line added in the phase.
- [ ] Charter metric #1 measured for historical **and** live consults, with the 0%-video baseline stated alongside, and any shortfall from 100% explained rather than rounded.
- [ ] Founder has replayed a real video consult as **both** doctor and patient; voice replay confirmed unregressed.
- [ ] Program README's phase table and **Runs** section updated with the numbers.
- [ ] Any contradiction with the charter recorded plainly rather than quietly reconciled.

---

## Cost estimate

| Wave | Tasks | Sonnet chats | Opus chats | Wall-clock |
|---|---|---|---|---|
| 1 | rec-02 | 0 | 1 | ~5h |
| 2 | rec-01 | 0 | 1 | ~5h |
| 3 | rec-03, rec-04 | 2 | 0 | ~6h |
| 4 | rec-05 | 1 | 0 | ~4h |
| 5 | rec-06 | 1 (Composer) + founder time | 0 | ~2h |

**Fresh chat per task.** Pre-load the task file + [charter](../../plan-recording-governance-v2-charter.md) + [batch plan](../plan-p1-recording-governance-v2-artifact-registry-batch.md) decision lock + the listed source files with their line ranges.

**Branch suggestion:** one branch per wave. Every wave is single-lane, so no worktrees are needed anywhere in this batch.

**Hard stops — surface, do not solve:**

- Any migration or any RLS policy change. This phase is migration-free (REC1-D8); needing one means the phase was mis-specced.
- Any PHI column.
- rec-01 step 0 returning "no Composition Hook is configured" — the charter's problem statement would need correcting first.
- Any task discovering that rec-02's Wave 1 contract does not survive contact with its caller.
- Any temptation to flip `ARCHIVAL_HARD_DELETE_ENABLED`.

---

## References

- [Batch plan](../plan-p1-recording-governance-v2-artifact-registry-batch.md)
- [Charter](../../plan-recording-governance-v2-charter.md) — REC-D1…REC-D25
- [Program index](../../README.md)
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md)
- [PHASED-PLANS-GUIDE.md](../../../../../../process/PHASED-PLANS-GUIDE.md)
- [TASK_TEMPLATE.md](../../../../../../process/TASK_TEMPLATE.md)
- Sibling exec-order precedent: [`p4 consult-room-checkin`](../../../../12-08-2026/consult-room-checkin/p4-realtime-and-channel-gaps/Tasks/EXECUTION-ORDER-p4-consult-room-checkin-realtime-and-channel-gaps.md)
