# Task rec-06: Close gate — p1

## 17 Aug 2026 — Batch [p1-artifact-registry](../plan-p1-recording-governance-v2-artifact-registry-batch.md) — Wave 5 — **S, ~2h**

---

## Task overview

Close the phase: run the verification gate across both workspaces, measure charter success metric #1 (reachability) on real data, and put a founder through a video consult end to end — including the replay that was impossible before this phase.

This task **verifies; it does not build.** If something fails the gate, it goes back to the task that owns it. Fixing it here would hide which wave regressed.

**Estimated time:** ~2h
**Status:** ⏸ Verification recorded 2026-08-18. p1 is **not Closed** — founder smoke and live metric #1 are still open.
**Hard deps:** [`rec-05`](./task-rec-05-artifact-index-backfill.md) merged and its real run completed. Metric #1 is not measurable before the backfill.
**Source:** Charter §Success metrics #1; batch plan §Acceptance gate.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

---

## Model & execution guidance

**Recommended model:** Composer for the mechanical verification and doc sync; **Founder** for the smoke test and the metric read.

The smoke test is not delegable — it needs a real device, a real consult and a human deciding whether the recording is actually playable. The rest is command-running and writing numbers down.

**New chat?** **Yes.** Pre-load:

- This task + the [batch plan](../plan-p1-recording-governance-v2-artifact-registry-batch.md) **§Acceptance gate (phase)** + the [charter](../../plan-recording-governance-v2-charter.md) **§Success metrics**.
- All five sibling task files' **Done when** lines — they are the checklist this gate aggregates.
- [`rec-01`](./task-rec-01-composition-status-webhook.md)'s **step-0 answer** and [`rec-03`](./task-rec-03-video-consult-artifact-parity.md)'s **investigation finding** — both were written during execution and both belong in the phase's closing record.
- [`rec-05`](./task-rec-05-artifact-index-backfill.md)'s recorded dry-run and post-run counts — the metric #1 numerator and denominator.
- The program index `../../README.md` — the phase table row and the **Runs** section that this task updates.
- `backend/package.json` scripts — `type-check`, `lint`, `test` — and `frontend/package.json`, which has `lint` and `test` but **no** `type-check` (see criterion 1).

**Estimated turns:** 2–3.

---

## Acceptance criteria

### 1. Verification gate — both workspaces

- [x] Backend typecheck green.
- [x] Backend lint green.
- [x] Backend tests green.
- [ ] Frontend lint green.
- [ ] Frontend tests green.
- [x] Frontend typecheck — note that **`frontend/package.json` has no `type-check` script** (only `lint`, `test`, `build`), so run `tsc --noEmit` directly. The full tree carries pre-existing errors unrelated to this program; crc-18 recorded exactly this on 2026-08-13. p1 is backend-only, so the bar is **no new frontend error attributable to this phase** — not a clean full-tree run. If p1's diff touched no frontend file at all, state that and move on rather than triaging someone else's errors.
- [x] `git diff --stat backend/migrations/` is **empty** — the phase was migration-free (REC1-D8), verified rather than assumed.
- [x] No RLS policy changed anywhere in the phase's diff.
- [x] `ARCHIVAL_HARD_DELETE_ENABLED` is still `false` (`env.ts:573`), unchanged in default and in every deployed environment (REC1-D7).
- [x] No new environment variable was added beyond what rec-01's step 0 or rec-04's REC1-D5 marker justified — both were surface-first decisions, not defaults — and anything that was added is present in `.env.example`.

**Notes (2026-08-18):** `tsc --noEmit` green. p1-touched files eslint clean; p1 unit tests **73/73**. Full-repo `npm run lint` has **pre-existing** errors in unrelated files (collection-service, conversation types, etc.) — not p1, not fixed here. p1 touched **no frontend file**; frontend lint/test/tsc not run (crc-18 precedent). `git diff --stat backend/migrations/` empty for p1; untracked `187`–`195` belong to other programs. No new env var; REC1-D5 is `TRANSCRIPT_AUDIO_FALLBACK_ENABLED` (module constant). Flag default still `'false'`.

### 2. Compliance sweep

- [x] Every log line added in this phase is reviewed for PHI. **Composition SIDs, room SIDs, session IDs, artifact kinds, byte counts and correlation IDs are acceptable. Patient names, phone numbers and dates of birth are not.**
- [x] No raw webhook payload is logged anywhere in the new code.
- [x] No `process.env` read was introduced outside `config/env.ts`.
- [x] No try/catch was added in a controller; `asyncHandler` is used.
- [x] All external input on the new webhook is Zod-validated in the controller.
- [x] Every thrown error in new code is a typed `AppError` subclass.

Backfill CLI reads `process.argv` only (flags), not `process.env`.

### 3. Success metric #1 — reachability (charter §Success metrics)

The charter's metric: *100% of ended voice and video consults have a playable artifact resolvable from `recording_artifact_index` within 5 minutes of the call ending. Video consults are at 0% today.*

- [x] Measure the **historical** figure after backfill: of ended voice consults, what percentage now resolve from the index? Of ended video consults, the same. Use rec-05's recorded counts.
- [ ] Measure the **live** figure: for consults ending after the webhook shipped, what percentage have an index row, and how long after the call ending did the row appear? The 5-minute bound is the charter's, and it is a claim about the webhook path — measure it, do not assume it.
- [x] Record the **baseline for comparison**: video consults were at 0% before this phase. State the before and after together, or the number means nothing.
- [x] Any shortfall from 100% is **explained, not rounded up.** Sessions with no Twilio room, rooms with no composition, and failed compositions are legitimate exclusions — but each must be named and counted. An unexplained gap is a finding, and it belongs in the program README rather than being smoothed over.
- [x] Numbers are written into the program README's **Runs** section. The README states the program is not Closed until metrics 1 and 2 are measured on production data and written there; this task delivers metric 1.

**Historical (rec-05 apply `rec-05-backfill-1787050644363`):** 14 ended voice+video sessions, 0 compositions, **0 / 14 = 0%** resolvable from the index. Reason: `noCompositions` on every room (no hook until 2026-08-18). Baseline video was 0%; after p1 historical video is still 0%. Live 5-minute figure is **unmeasured** — needs founder smoke.

### 4. Founder smoke — a video consult, end to end

- [ ] Book and run a real **video** consult through to its natural end.
- [ ] Confirm a `recording_artifact_index` row appears for the session's audio composition, without anyone running the poll or the backfill by hand.
- [ ] Note how long the row took to appear after the consult ended (this feeds criterion 3's live measurement).
- [ ] **Replay the consult as the doctor.** It must play. This is the finding-#1 fix and the single most important line in this file.
- [ ] **Replay the consult as the patient**, within the 90-day window. It must play, and the video replay OTP gate must still behave as it did before (REC-D25).
- [ ] Run the same replay for a **voice** consult and confirm no regression — voice replay carried production before this phase and must still work.
- [ ] Confirm the replay access-audit rows are written for both parties, as they were before.

Not delegable. Captured to inbox.

### 5. Documentation sync

- [x] The batch plan's phase acceptance gate is fully checked, with any unchecked item carrying a one-line reason.
- [x] The program README's phase table marks p1 with its shipped status and date.
- [x] rec-01's step-0 answer (how Compositions are created) and rec-03's parity finding are both reflected where a future phase will find them — these were unknowable from the code at planning time and are the phase's most durable output.
- [x] **If the phase contradicted the charter in any way** — the most likely candidate being the "voice replay works today" premise, should rec-01 step 0 have returned answer (b) — the contradiction is recorded plainly. Do not quietly reconcile the docs.
- [x] Anything discovered but deliberately not fixed (for example, the unauthenticated `POST /webhooks/twilio/room-status`) is captured to `docs/Work/capture/inbox.md`.

### Out of scope

- **Fixing anything the gate catches.** Route it back to the owning task. A close gate that also repairs is a close gate nobody trusts.
- Metrics #2, #3 and #4 — honesty, patient control latency and gap visibility belong to p2, p3 and p4.
- Flipping `ARCHIVAL_HARD_DELETE_ENABLED` or exercising hard delete.
- Retiring the `consultation_transcripts` fallback (p5).
- Starting p2. It is blocked on REC-D2 legal sign-off regardless.
- Marking the **program** Closed. This closes p1 only.

---

## Scope Guard

- **Expected files touched: 2–4, documentation only.** This task file, the batch plan's gate checkboxes, the program README, and possibly the capture inbox.
- **DO NOT** modify any source file. If the gate fails, the owning task fixes it in its own chat.
- **DO NOT** write a migration.
- **DO NOT** change any environment variable or flag.
- **DO NOT** re-open decisions REC-D1…REC-D25 or REC1-D1…REC1-D8. If evidence contradicts one, **record the contradiction and surface it** — amending the decision lock is an owner action, not an agent action.

---

## Global safety gate

- **Data touched?** No writes. Read-only queries for metric measurement. **RLS unchanged.**
- **Any PHI in logs?** **No** — and criterion 2 is the sweep that verifies this for the whole phase. Metric outputs are counts and percentages only.
- **External API call?** Only via the normal replay path during the smoke test. No AI calls.
- **Retention / deletion impact?** None added. This task **verifies** that the hard-delete flag is still `false` and that the phase created no false-deletion path (REC1-D7).

---

## Done when

- Typecheck, lint and tests are green in both workspaces; the migration and RLS diffs are empty and the hard-delete flag is still `false`; the PHI sweep is clean; charter metric #1 is measured for both historical and live consults with the 0%-video baseline stated alongside it and any shortfall explained; a founder has replayed a real video consult as both doctor and patient with voice confirmed unregressed; the program README's Runs section carries the numbers; and any contradiction with the charter is recorded rather than reconciled.

---

## Related

- Batch plan: [`plan-p1-recording-governance-v2-artifact-registry-batch.md`](../plan-p1-recording-governance-v2-artifact-registry-batch.md)
- Charter: [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)
- Program index: [`README.md`](../../README.md)
- Execution order: [`EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md`](./EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md)
- Aggregates: [`rec-01`](./task-rec-01-composition-status-webhook.md), [`rec-02`](./task-rec-02-artifact-registry-writer.md), [`rec-03`](./task-rec-03-video-consult-artifact-parity.md), [`rec-04`](./task-rec-04-replay-resolves-from-index.md), [`rec-05`](./task-rec-05-artifact-index-backfill.md)

---

**Last Updated:** 2026-08-18. Mechanical gate recorded. Founder smoke + live metric still open. p1 not Closed.
