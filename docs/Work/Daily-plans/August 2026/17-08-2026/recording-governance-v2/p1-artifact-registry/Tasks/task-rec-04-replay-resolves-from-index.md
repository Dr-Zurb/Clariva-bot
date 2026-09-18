# Task rec-04: Replay resolves from the index

## 17 Aug 2026 — Batch [p1-artifact-registry](../plan-p1-recording-governance-v2-artifact-registry-batch.md) — Wave 3 — **M, ~3h**

---

## Task overview

REC-D19 makes `recording_artifact_index` the canonical registry. Waves 1–2 gave it a writer and a finalise trigger, and [`rec-03`](./task-rec-03-video-consult-artifact-parity.md) — this wave's first step — gave video consults parity. This task points replay at it.

Two changes:

1. `resolveAudioArtifact` (`recording-access-service.ts:264–323`) already tries the index first at L275–293 — but the index has always been empty, so Path B has silently carried every replay in production. Now that Path A can succeed, the preference becomes real, and the `consultation_transcripts` fallback is retained behind an explicit flag and comment until [`rec-05`](./task-rec-05-artifact-index-backfill.md)'s backfill completes (REC1-D5).
2. `resolveVideoArtifact` (`recording-access-service.ts:350–369`) consults **no index at all** — it goes straight to a live Twilio call via `getRecordingArtifactsForSession`. It should check the index first.

**Read this next paragraph before you start, or you will hunt for a change that does not exist.** Finding #1 is that a video consult's **audio** cannot be found, and Path A already prefers the index today, unmodified. What was missing was rows — which Waves 1–3 supply. So the mechanical repair of the 404 lands in rec-02, rec-01 and rec-03; **this task owns the two changes above and owns proving the fix.** Expect the audio path to need little or no new resolution logic. If you find yourself rewriting Path A, stop and re-read — that is a signal the earlier waves did not deliver what they promised, which is worth surfacing rather than patching here.

**The phase does not close unless a video consult is replayable**, and this is the task that demonstrates it (criterion 4). Reproduce the 404 first, then confirm it is gone.

**Estimated time:** ~3h
**Status:** ✅ Implemented 2026-08-18 — index first for audio and video; Path B flagged (REC1-D5). Live founder replay still open.
**Hard deps:** [`rec-03`](./task-rec-03-video-consult-artifact-parity.md) — video sessions must be producing registry rows before "replay prefers the index" can fix anything for video.
**Source:** REC-D19, REC-D25, REC1-D5.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet.

Bounded edits to one well-documented file, against contracts already locked by rec-02, rec-01 and rec-03. The risk is regression rather than design, so the no-regression criteria matter more than the new behaviour.

**New chat?** **Yes.** Pre-load:

- This task + the [batch plan](../plan-p1-recording-governance-v2-artifact-registry-batch.md) + [`rec-02`](./task-rec-02-artifact-registry-writer.md)'s recorded `storage_uri` convention.
- `backend/src/services/recording-access-service.ts` — the primary file. Specifically:
  - **L244–252** — `ResolvedAudioArtifact`, including the `source: 'index' | 'transcript'` hint.
  - **L254–323** — `resolveAudioArtifact`. Path A L275–293, Path B L297–320. Note the `CJ`-prefix guard at **L313** and the comment at L314–317 explaining that `RM…` values are unresolved placeholders.
  - **L329–369** — `resolveVideoArtifact` and its doc-comment, which states outright that video "has only one source of truth: the live Twilio Compositions API". **That premise is what this task changes** — update the comment, not just the code.
  - **L371–385** — `extractCompositionSid`. Confirm rec-02's convention survives it; if it does not, that is rec-02's bug to fix, not this file's.
  - **L716–810+** — `mintReplayUrl`, so you can see where resolution sits in the pipeline: policy checks, then the video OTP gate at **L784–806**, then revocation and artifact readiness.
- `backend/src/services/recording-track-service.ts` — **L741–820**, `getRecordingArtifactsForSession`, including the 60s cache at L769–775 and the completed-status filtering the video path depends on.
- `backend/migrations/056_recording_artifact_index.sql` — **L48–90**, the columns Path A reads (`hard_deleted_at`, `patient_self_serve_visible`).
- `backend/src/config/env.ts` — **L556–576** (`ARCHIVAL_HARD_DELETE_ENABLED`) for the house flag shape, and only if REC1-D5's marker has to be an env var at all. **Prefer a named module constant plus the comment.** An env var here is a surface-first decision, not a default — rec-02 was held to the same rule.

**Estimated turns:** 3–5.

---

## Acceptance criteria

### 1. Audio resolution prefers the index

- [x] `resolveAudioArtifact` returns `source: 'index'` whenever a usable registry row exists for the session.
- [x] The existing Path A filters are preserved exactly: `artifact_kind = 'audio_composition'`, `hard_deleted_at IS NULL`, newest-first, limit 1. Do not loosen them — `hard_deleted_at IS NULL` in particular is a deletion-honesty guarantee.
- [x] A row whose `storage_uri` does not yield a SID through `extractCompositionSid` falls through to Path B rather than failing the whole resolution. The current code already behaves this way (L289–292); keep it.
- [x] Path A remains resilient to a query error — an index lookup failure must not break replay for a session that Path B could still serve.

### 2. The transcript fallback is retained, flagged, and dated (REC1-D5)

- [x] Path B (`consultation_transcripts`, L297–320) **still works** and is **not deleted in this task.**
- [x] It is retained behind an **explicit flag or an explicit, prominent comment** that states: why it exists, that it is transitional, that it is retired once rec-05's backfill has run in production, and that retirement is p5's job.
- [x] A future reader can tell from the code alone that Path B is scheduled for removal and what the removal condition is. "There is a fallback" is not enough — the condition must be legible.
- [x] The `CJ`-prefix guard at L313 and its `RM…`-placeholder reasoning are preserved. That guard is load-bearing: without it, an unresolved room SID would be handed downstream as if it were a composition.
- [x] Resolution via Path B is **observable** — it must be possible to answer "how many sessions still depend on the fallback" from logs or a query, because that number is the retirement gate.
- [x] The `source` hint keeps distinguishing `'index'` from `'transcript'`. Do not collapse it.

Marker: `TRANSCRIPT_AUDIO_FALLBACK_ENABLED` (module constant, not an env var). Path B logs `audio resolved via transcript fallback (REC1-D5 — retire after rec-05 backfill)`.

### 3. Video resolution consults the index first

- [x] `resolveVideoArtifact` checks `recording_artifact_index` for a `video_composition` row **before** the live Twilio call.
- [x] The same filters as the audio path apply: `hard_deleted_at IS NULL`, newest-first.
- [x] When no index row exists, the existing Twilio path (`getRecordingArtifactsForSession`, L354) runs exactly as it does today. This is a preference, not a replacement.
- [x] The completed-only guarantee is preserved. Today the Twilio path filters on `status === 'completed'` (L358) so callers never receive a SID whose media is not ready; an index row must carry the same guarantee — which it does, because rec-02 only registers completed compositions.
- [x] The doc-comment at **L334–349** is updated. It currently asserts video has only one source of truth and that no searchable index is needed; both statements become false with this change and leaving them is worse than having no comment.
- [x] The existing catch-and-return-`null` behaviour (L361–368) is preserved — a lookup failure still degrades to "not found" rather than throwing into the replay pipeline.

### 4. The video-consult 404 is fixed

- [x] **A doctor can replay an ended video consult's audio.** This is the finding-#1 fix.
- [x] **A patient can replay an ended video consult's audio**, subject to the unchanged 90-day self-serve window.
- [ ] Reproduce the failure before the change and confirm it is gone after. A passing unit test is not sufficient evidence on its own for this criterion.

Unit tests pin empty-index video → `artifact_not_found` and index-audio video → available. Live founder replay (doctor + patient) is still the close-gate item.

### 5. No regressions in the replay pipeline

- [x] **Voice replay still works.** It is the path that has been carrying production; breaking it while fixing video would be a straight downgrade.
- [x] The **video replay OTP gate** (L784–806) is untouched and still fires for patients (REC-D25).
- [x] The **90-day patient self-serve window** is untouched (REC-D25).
- [x] The revocation blocklist check still runs and still blocks.
- [x] Access-audit rows — granted and denied — are written exactly as before. Replay auditing is a charter-level promise (attestation clause 4) and must not regress.
- [x] `MintReplayError` codes are unchanged. A session with genuinely no artifact still yields `artifact_not_found`, not a new or different code.

### 6. Tests

- [x] Index row present → `source: 'index'`.
- [x] No index row, transcript row present → `source: 'transcript'` (fallback intact).
- [x] Neither → `artifact_not_found`, as today.
- [x] Index row with `hard_deleted_at` set → not returned.
- [x] Index row with an unparseable `storage_uri` → falls through to Path B.
- [x] Video: index row present → resolved without a Twilio call.
- [x] Video: no index row → Twilio path still resolves.
- [x] Existing `recording-access-service` tests still pass unmodified. If an existing test must change, that is a signal of a behaviour change worth surfacing rather than editing away.

Existing cases were not rewritten. The admin mock now honours `artifact_kind` + skips `hard_deleted_at` rows so the new cases can share the fixture.

### Out of scope

- **Deleting Path B.** Retirement is p5, after the backfill has run (REC1-D5).
- Backfilling rows — [`rec-05`](./task-rec-05-artifact-index-backfill.md).
- The replay player UI, the doctor timeline, or `EndedCard.tsx` (p5).
- Symmetric replay notification (REC-D24 — p5).
- The OTP gate and the 90-day window (REC-D25 — not re-litigated).
- Multi-composition replay — one artifact per kind is p1's scope; p5 owns the multi-artifact surface.
- Consent (p2), pause gap rendering (p3), escalation (p4).

---

## Scope Guard

- **Expected files touched: 2–3.** `recording-access-service.ts`, its test file, and — only if REC1-D5's marker genuinely cannot be a module constant — one `config/env.ts` entry plus its `.env.example` line. **Surface that before adding it.**
- **DO NOT** modify `recording-track-service.ts`. `resolveVideoArtifact` keeps calling it as its fallback.
- **DO NOT** modify `twilio-compositions.ts`.
- **DO NOT** modify rec-02's writer. If the `storage_uri` convention does not survive `extractCompositionSid`, **stop and surface it** — that is a Wave 1 defect, and patching around it here would hide it.
- **DO NOT** touch the OTP gate, the self-serve window, or the revocation check.
- **DO NOT** touch any frontend file. This task is backend-only.
- **DO NOT** write a migration. **STOP and surface** if you think you need one.

---

## Global safety gate

- **Data touched?** Reads only — `recording_artifact_index` and `consultation_transcripts`. No writes to either. Access-audit writes are unchanged. **RLS unchanged.**
- **Any PHI in logs?** **No.** Session IDs, composition SIDs and the `source` hint only.
- **External API call?** Yes — the Twilio fallback path, unchanged. No AI calls.
- **Retention / deletion impact?** Indirect but real: `hard_deleted_at IS NULL` and `patient_self_serve_visible` filtering must be preserved, or replay would serve artifacts that retention has retired.

---

## Done when

- Replay resolves from `recording_artifact_index` for both audio and video when a row exists; the transcript fallback still works and carries a legible, dated retirement condition; **a video consult is replayable end-to-end by both doctor and patient**, verified by reproducing the 404 and confirming it is gone; voice replay, the OTP gate, the 90-day window, revocation and access audits are all provably unchanged; no migration; backend typecheck + lint + tests green.

---

## Related

- Batch plan: [`plan-p1-recording-governance-v2-artifact-registry-batch.md`](../plan-p1-recording-governance-v2-artifact-registry-batch.md)
- Charter: [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)
- Execution order: [`EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md`](./EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md)
- Depends on: [`rec-03`](./task-rec-03-video-consult-artifact-parity.md), [`rec-02`](./task-rec-02-artifact-registry-writer.md)
- Unblocked by this task: [`rec-05`](./task-rec-05-artifact-index-backfill.md) (backfill closes the fallback's retirement condition)

---

**Last Updated:** 2026-08-18. Index-first audio + video. Path B flagged. Live smoke still open.
