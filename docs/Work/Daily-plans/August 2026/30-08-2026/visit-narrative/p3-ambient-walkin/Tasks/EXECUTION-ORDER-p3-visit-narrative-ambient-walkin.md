# p3 — visit-narrative · ambient walk-in capture — execution order

> Sibling document of [`plan-p3-visit-narrative-ambient-walkin-batch.md`](../plan-p3-visit-narrative-ambient-walkin-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.
>
> ⛔ **This batch is DRAFTED, NOT PROMOTED.** Wave 0 does not start until the plan's unblock conditions 1–4 have written answers (VNA-D1). Every task file opens with a §0 pre-flight that is expected to **STOP**. Do not open a chat against this doc to "get ahead" — there is no capture work that is safe to land early, including the upload route.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (6 waves)

```
⏸ [ unblock window — unbounded: L9 counsel answer + non-DRAFT policy version + VNA-Q1 + fork call ]

Wave 0 (Consent basis — ~6h, single lane sequential):
  Lane α  ──── **vna-01 (L, Opus)**                                        [compliance]

Wave 1 (Session identity — ~5h, single lane sequential):
  Lane α  ──── **vna-02 (L, Opus)**                                        [migrations]

Wave 2 (Capture + upload — ~8h, single lane sequential):
  Lane α  ──── **vna-03 (L, Opus)**                                        [frontend + backend]

Wave 3 (Transcription — ~6h, single lane sequential):
  Lane α  ──── **vna-04 (L, Opus)**                                        [backend]

Wave 4 (Spine reuse — ~4h, single lane sequential):
  Lane α  ──── **vna-05 (M, Opus)**                                        [frontend + backend]

Wave 5 (Gate — ~4h, single lane sequential):
  Lane α  ──── **vna-06 (M, Opus)**                                        [tests + docs]
```

**Total wall-clock with parallelism:** ~33h of engineering **plus an unbounded wait** on the unblock window. No parallelism credit — see below.
**Total agent-time (sequential equivalent):** ~33h.

**The bottleneck is the unblock window, not any wave** — it is wall-clock the team does not control, and no engineering wave can be pulled forward past it because the thing being gated is whether the audio may exist. Of the engineering waves, Wave 2 is the longest and the only one that creates new PHI.

**Every wave is single-lane on purpose.** Each of the six tasks either produces the primitive the next one consumes (consent record → session row → audio object → transcript row → chart proposal) or verifies the whole chain. There is no honest Lane β anywhere in this batch: the §5 gate fails at point 3 for every candidate split, and the two tasks that look parallelisable (`vna-03` frontend capture vs `vna-04` backend transcription) are separated exactly by the object-path convention that `vna-03` invents.

---

## Lane-by-lane details

### Wave 0 — Consent basis (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **vna-01** | L | **Opus** | `backend/src/constants/recording-attestation.ts`, migration `210` + its service/controller/route, the video-escalation consent flow (`070_video_escalation_audit_and_otp_window.sql` + patient consent modal), plan §Unblock, `tracks.md` L9 | **Expected to STOP at §0** if unblock condition 1 or 2 is `⟨fill⟩`. Produces the consent record + the arming precondition. Ships **no microphone**. |

**Branch suggestion:** `feat/vna-in-room-consent`.

### Wave 1 — Session identity (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **vna-02** | L | **Opus** | `049_consultation_sessions.sql`, `056_recording_artifact_index.sql`, `061_consultation_transcripts.sql`, `199_billing_usage_ledger.sql`, `223`/`224` (house pattern), MIGRATIONS_AND_CHANGE.md | Waits on Wave 0's gate. VNA-Q1 must be a real answer, not the plan's recommendation. **The pre-ALTER modality grep is a hard step before any SQL** — an ENUM value cannot be dropped. |

**Branch suggestion:** `feat/vna-walkin-session`.

### Wave 2 — Capture + upload (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **vna-03** | L | **Opus** | `068_consultation_transcripts_bucket.sql` + `184`/`212` (bucket pattern), `056_recording_artifact_index.sql`, `frontend/lib/audio/mic-meter.ts`, `VoiceConsultPreCall.tsx` (existing `getUserMedia` usage), `storage-service.ts` | The only task in the batch that creates new PHI. Its gate includes the three hard-stop tests (VNA-D3) and the `recording_artifact_index` registration (VNA-D4). If registration cannot be made to work, **STOP** — do not ship capture with a follow-up ticket for retention. |

**Branch suggestion:** `feat/vna-in-room-capture`.

### Wave 3 — Transcription (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **vna-04** | L | **Opus** | `voice-transcription-service.ts`, `voice-transcription-worker.ts`, `061_consultation_transcripts.sql`, `vna-03`'s object-path convention | Widens the **input** only. The Twilio composition branch is not re-plumbed (Scope Guard). VNA-Q3 (`UNIQUE (session, provider)` + `composition_sid NOT NULL`) is answered here, from the shipped schema. |

**Branch suggestion:** `feat/vna-nontwilio-transcription`.

### Wave 4 — Spine reuse (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **vna-05** | M | **Opus** | [`../../p2-transcript-amendment/`](../../p2-transcript-amendment/) — `vnt-02` extract route, `vnt-03` proposal, `vnt-04` `VisitNarrativeAmendment.tsx`, `vnt-01` provenance, `frontend/lib/telemetry/visit-describe.ts` | Mostly **proving** reuse. Any diff to the extract route's prompt, the proposal's trust model, or the apply path is a scope breach (VNA-D5 / VNT-D3 / VNT-D5). Answers VNA-Q2 against the shipped provenance table. |

**Branch suggestion:** `feat/vna-spine-reuse`.

### Wave 5 — Gate (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **vna-06** | M | **Opus** | The whole phase's diff, `backend/tests/unit/migrations/224-visit-narrative-provenance-erasure.test.ts` (the standing-test pattern to copy), `recording-erasure-service.ts`, `account-deletion-worker.ts` | Kind-of-work change: verify, don't build. Erasure + consent-absence are **standing** CI tests, so a later migration or refactor that loosens either fails the build. |

**Branch suggestion:** `chore/vna-phase-3-gate`.

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| vna-01 | L | **Opus** | Consent surface over PHI, new migration, and the phase's compliance gate. The correct output may be a refusal — that judgement is the task. |
| vna-02 | L | **Opus** | Migration touching a shipped ENUM used across the codebase. Irreversible. Blast radius is every modality branch. |
| vna-03 | L | **Opus** | New PHI intake path, new bucket + RLS, retention registration, and three safety invariants that must hold under navigation and unmount. |
| vna-04 | L | **Opus** | Widens a worker that writes PHI, against `NOT NULL` + unique constraints on a shipped table. |
| vna-05 | M | **Opus** | Cross-layer reuse where the failure mode is silent drift of Phase 2's trust model. Downgrade candidate if cost binds — **owner call**. |
| vna-06 | M | **Opus** | Close-gate review over consent + erasure. Downgrade candidate if cost binds — **owner call**. |

**Cap note:** §8 allows one Opus per wave (satisfied) and two per batch (**deliberately exceeded — 6**). Rationale in the plan's Tasks section. Every task touches consent, stored PHI, a migration, or a new audio path; there is no Sonnet-safe task in this batch.

---

## Acceptance gates per wave

**Unblock window (before Wave 0):**
- [ ] Plan unblock conditions 1–4 each have a written answer with a date. `⟨fill⟩` in any of the four = **do not start**.
- [ ] The counsel answer addresses all five numbered questions, not just "recording is fine".
- [ ] `RECORDING_ATTESTATION_POLICY_VERSION` is a non-DRAFT, owner-approved string.

**Wave 0 — vna-01:**
- [ ] All unblock-window boxes still green.
- [ ] A consent record exists per visit, referencing a non-DRAFT policy version, written before any capture is possible.
- [ ] The arming precondition is enforced **at the route**, not only in the UI — asserted by test.
- [ ] A decline is handled per the counsel answer (stored or not stored, as answered — not as guessed).
- [ ] No microphone code in this wave's diff. `rg -i "MediaRecorder|getUserMedia" <diff>` returns zero.
- [ ] Third-party-in-room handling matches the counsel answer in both mechanism and copy.
- [ ] Type-check + lint clean; new tests green.

**Wave 1 — vna-02:**
- [ ] All Wave 0 gates still green.
- [ ] VNA-Q1 recorded with a real answer; the migration matches it.
- [ ] **Pre-ALTER grep complete** — every modality branch in backend + frontend enumerated in the task file, with the walk-in case handled or explicitly deferred with a reason.
- [ ] A walk-in visit can be joined to `recording_artifact_index` and `consultation_transcripts` without either table being altered.
- [ ] Migration applies, re-applies as a no-op, documents its reverse in-file, and states plainly which parts are irreversible.
- [ ] No teleconsult regression: existing voice/video sessions behave identically. Existing suites green.

**Wave 2 — vna-03:**
- [ ] All Wave 1 gates still green.
- [ ] Mic is disarmed by default and cannot arm without a consent record (VNA-D2) — asserted by test.
- [ ] Non-dismissible live indicator; hiding it stops capture.
- [ ] Three hard-stop tests pass: navigate-away, visit-end, duration-cap (VNA-D3).
- [ ] A test proves audio armed under appointment A cannot be attached to appointment B.
- [ ] Every stored object registers in `recording_artifact_index` (VNA-D4). No new retention table, no new deletion worker — grepped.
- [ ] Declined / absent consent leaves no object and no partial upload.
- [ ] `use-speech-recognition.ts` is absent from the capture module's import graph (VNA-D7).
- [ ] New private bucket follows the `068`/`184`/`212` pattern; public = false; RLS proven closed to anon and authenticated.

**Wave 3 — vna-04:**
- [ ] All Wave 2 gates still green.
- [ ] A stored room-audio object produces a `consultation_transcripts` row with a valid provider, without altering that table.
- [ ] VNA-Q3 answered in writing; the multi-segment case is either supported or **explicitly rejected at the route** (no silent overwrite of a prior segment).
- [ ] The Twilio composition branch is byte-unchanged — diff reviewed.
- [ ] Failure path: a failed transcription leaves the audio object governed and the visit unblocked.
- [ ] Existing transcription suites green.

**Wave 4 — vna-05:**
- [ ] All Wave 3 gates still green.
- [ ] Zero new AI routes, prompts, or services (VNA-D5) — grepped against the Phase-2 inventory.
- [ ] The amendment surface, verbatim quote, per-item accept, no-bulk-accept, and provenance behave as Phase 2 shipped them.
- [ ] The timeline offer appears for a walk-in visit with a completed transcript, and never before.
- [ ] VNA-Q2 answered; telemetry stays counts-only (VN-DL-11) and Phase-1/2 event shapes are byte-identical.
- [ ] Phase-2 suites pass untouched.

**Wave 5 — vna-06:**
- [ ] All Wave 4 gates still green.
- [ ] **Standing** CI test: room audio + its transcript are removed by the existing DPDP erasure path.
- [ ] **Standing** CI test: consent-absent ⇒ capture impossible. Both tests fail the build if a later migration or refactor loosens them.
- [ ] Retention parity: room audio's archival timeline is the `rec-*` timeline, or the divergence is documented and owner-accepted.
- [ ] Batch plan, program README, product plan phase table, and `tracks.md` L9 updated with the outcome.
- [ ] Full backend + frontend suites: no new failures beyond the recorded pre-existing set.

---

## Cost estimate

| Wave | Tasks | Sonnet chats | Opus chats | Wall-clock |
|---|---|---|---|---|
| — unblock window | 0 | 0 | 0 | **unbounded** (counsel) |
| 0 — consent basis | 1 | 0 | 1 | ~6h |
| 1 — session identity | 1 | 0 | 1 | ~5h |
| 2 — capture + upload | 1 | 0 | 1 | ~8h |
| 3 — transcription | 1 | 0 | 1 | ~6h |
| 4 — spine reuse | 1 | 0 | 1 | ~4h |
| 5 — gate | 1 | 0 | 1 | ~4h |
| **Total** | **6** | **0** | **6** | **~33h + unbounded wait** |

Not counted: the new **per-minute audio spend** this phase introduces. Phases 1–2 rode transcription the platform already paid for; ambient capture of every walk-in is genuinely new recurring cost, and the duration cap (VNA-D3) is as much a cost control as a safety one.

---

## References

- Plan: [`plan-p3-visit-narrative-ambient-walkin-batch.md`](../plan-p3-visit-narrative-ambient-walkin-batch.md)
- Product plan: [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-DL-8, 9, 10, 11, 12
- Prior phase exec order: [`EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md`](../../p2-transcript-amendment/Tasks/EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md)
- Prior phase exec order: [`EXECUTION-ORDER-p1-visit-narrative-one-box.md`](../../p1-one-box/Tasks/EXECUTION-ORDER-p1-visit-narrative-one-box.md)
- Guidelines: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md)
- Business gate: `docs/Work/Business/tracks.md` L9

---

**Created:** 2026-08-31.
**Last Updated:** 2026-08-31 (drafted; not promoted)
