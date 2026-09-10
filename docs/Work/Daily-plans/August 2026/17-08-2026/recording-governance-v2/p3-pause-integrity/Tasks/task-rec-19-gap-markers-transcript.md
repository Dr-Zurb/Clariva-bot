# Task rec-19: Gap markers in the transcript

## 17 Aug 2026 — Batch [p3-pause-integrity](../plan-p3-recording-governance-v2-pause-integrity-batch.md) — Wave 5 — **M, ~3h**

---

## Task overview

The other half of REC-D17. An exported transcript currently reads as an unbroken conversation across a paused window, because the transcription input is the composition and the composition omits the pause. A reader — the patient, another clinician, a regulator — cannot tell that anything is missing. That is worse than an incomplete record: it is a record that misrepresents its own completeness.

This task renders every gap inline in the exported transcript, in timestamp order, with actor and reason code, sourced from the audit ledger.

The merge point is `mergeByTimestamp` (`transcript-pdf-composer.ts:293-319`), today a two-pointer merge of chat messages and voice segments with a pinned chat-before-voice tie-break. Gaps become a third input to that ordering.

**One distinction to hold onto:** [`rec-18`](./task-rec-18-gap-markers-replay-player.md) positions gaps in **media time** because the media has no paused window in it (REC3-D8). A transcript is a chronological document, not a media timeline, so gaps here sit at their **wall-clock timestamps** among the messages. Do not carry rec-18's offset arithmetic into this file.

**Estimated time:** ~3h
**Status:** ✅ Done (2026-08-19) — founder two-pause PDF still open (6.4)
**Hard deps:** [`rec-15`](./task-rec-15-preset-pause-reason-codes.md) (there is a code to render, and no free text left to leak) and [`rec-16`](./task-rec-16-auto-resume-countdown-and-dangling-pause.md) (auto-resumed and ended-while-paused gaps exist).
**Source:** REC-D17 · REC3-D9.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — the transcript half of success metric #4.

**Change Type:** Update existing — extends a shipped composer and its loader.

**Current state:**

- ✅ `mergeByTimestamp` is already the single ordering seam, already exported for tests, and already has a documented tie-break contract (L288–292).
- ✅ `composeTranscriptPdf` uses pdfkit `bufferPages` with a post-body footer pass (L258–272), so page geometry is already handled carefully.
- ✅ The PDF is the **only** user-facing transcript rendering. `transcript_text` is written by `voice-transcription-worker.ts` and consumed only by this composer path — there is no second surface to update.
- ✅ Gaps are a third merge input (`mergeByTimestamp(..., gaps = [])`). Tie-break: chat < gap < voice.
- ✅ Pause/resume system rows are suppressed at `loadChatMessages` only (one representation). Ledger is the structured source.
- ⚠️ Founder two-pause PDF export (6.4) still open — rec-20 records metric #4.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet. One well-factored merge function, one loader, one drawing routine, all with existing tests to extend.

**New chat? Yes.** Pre-load:

- This task + [`../plan-p3-recording-governance-v2-pause-integrity-batch.md`](../plan-p3-recording-governance-v2-pause-integrity-batch.md) (§Why this phase → GAP 5) + the [charter](../../plan-recording-governance-v2-charter.md) REC-D17 row.
- `backend/src/services/transcript-pdf-composer.ts` — **the whole file.** `mergeByTimestamp` **L293–319** with its `MergedItem` union at L284–286, the compose flow and the `merged.length === 0` empty state at L244–256, and the `bufferPages` footer pass at L258–272.
- `backend/src/services/transcript-pdf-service.ts` — L480–556 (`loadChatMessages`, including the system-row branch at **L531–539**) and L558–620 (`loadVoiceTranscriptSegments` — the second source, and the model for adding a third).
- **[`rec-18`](./task-rec-18-gap-markers-replay-player.md) as merged** — its gap-derivation service. Reuse it; do not write a second derivation. If it is not yet merged, this task still consumes the same ledger read rather than duplicating the pairing logic.
- `backend/src/services/recording-pause-service.ts` L155–206 and L273–333 — the ledger read shape and what a pause row contains.
- `backend/tests/unit/services/transcript-pdf-composer.test.ts` and `transcript-pdf-service.test.ts` — both exist and both need extending.
- `backend/migrations/064_consultation_recording_audit.sql` L92–133 — the ledger columns and the session/created_at index.

**Estimated turns:** 3–5.

---

## Acceptance criteria

### 1. Gaps as a third merge input

- [x] 1.1 Gaps are loaded for the session and passed into the composer as their own source, alongside chat messages and voice segments.
- [x] 1.2 `mergeByTimestamp` orders all three by timestamp. Its exported signature and its existing chat-before-voice tie-break are preserved — the current contract is pinned by tests and by a doc-comment, and breaking it silently reorders every existing transcript.
- [x] 1.3 **A gap's tie-break position is pinned and documented** in the same register as the existing contract. A gap sharing a timestamp with a message must land in a defined place, every time.
- [x] 1.4 Gaps sit at **wall-clock** timestamps. No media-time offset arithmetic here — that is rec-18's and it does not apply to a chronological document.
- [x] 1.5 A transcript with gaps but no messages still renders the gaps rather than the "(No messages recorded for this consult.)" empty state at L245–253. A consult that was entirely paused is the single most important transcript to be honest about.

### 2. One representation per pause — decide and record

- [x] 2.1 Establish what the pause/resume system-message rows render as in the transcript today, given `loadChatMessages`'s system branch (L531–539).
- [x] 2.2 **Decide and write into this file** whether the pause/resume system rows are suppressed in favour of the gap marker, or kept alongside it.
- [x] 2.3 **Recommended:** one representation. The gap marker carries duration, actor, reason code and how the gap ended; the banner row carries a sentence. Rendering both makes the reader reconcile two descriptions of one event and doubles the surface where copy can drift.
- [x] 2.4 Whichever is chosen, suppression is a **rendering** decision only. No message row is deleted, edited or hidden at the database level, and no other `system_event` tag's rendering changes.
- [x] 2.5 Resume is not a separate entry. A gap is one object with a start and an end; a lone "recording resumed" line without its opening is how the current surface confuses readers.

### 3. What a gap renders as

- [x] 3.1 Each gap shows: the time it started, its duration, the **actor role**, and the reason **code** resolved to human copy at render time (REC3-D9).
- [x] 3.2 The copy states plainly that this interval was not recorded. A reader must not have to infer it from a timestamp jump — inference is the failure being fixed.
- [x] 3.3 A gap is visually distinct from a message and from a voice segment. It is an annotation about the record, not an utterance in it.
- [x] 3.4 A dangling pause — a consult that ended while paused — renders as a gap running to the end of the consult, and says so.
- [x] 3.5 A legacy pause with no code renders the explicit "not recorded in preset form" state, matching rec-15's wording. Never blank, never a borrowed code.
- [x] 3.6 **No free text from any actor appears anywhere in the output.** This is the same defect rec-15 closed at the write side; this task must not reintroduce it at the read side by falling back to a message body.
- [x] 3.7 A gap marker is not orphaned by a page break — it and its label stay together. The composer's `bufferPages` handling is careful about geometry and this must be too.

### 4. Timezone, ordering and totals

- [x] 4.1 Gap timestamps use the same doctor-timezone formatting as every other timestamp in the document. A gap in UTC beside messages in local time is its own misreading.
- [x] 4.2 Multiple gaps render in chronological order, interleaved correctly with messages and voice segments.
- [x] 4.3 If a summary of total unrecorded time is added, it is presented as a fact and nothing else — no threshold, no warning, no flag (REC-D18 / REC3-D10). This phase ships no judgement about how much pausing is too much.

### 5. Failure behaviour

- [x] 5.1 The gap load failing does **not** fail the export. The transcript still renders, and it carries a visible note that gap information could not be loaded — matching `loadVoiceTranscriptSegments`'s non-fatal posture at L574–580.
- [x] 5.2 A silent fallback to a gapless transcript is **not acceptable.** That produces the exact misleading artifact this task exists to prevent, with no signal that anything was lost.
- [x] 5.3 A malformed ledger history degrades to rendering the gaps that can be paired, and logs the rest without throwing.

### 6. Verification

- [x] 6.1 Composer unit tests: three-way merge ordering; the gap tie-break; a gaps-only transcript; a two-gap transcript in correct order; a gap at the very start and one at the very end.
- [x] 6.2 Service unit tests: gap load failure renders the transcript with the note; a legacy row renders the not-recorded state; the chosen representation from §2 is pinned so a future change is deliberate.
- [x] 6.3 A test asserts the rendered output contains **no** free-text reason for any pause, including for pre-rec-15 rows.
- [ ] 6.4 **Manual: export a real PDF for a consult with two pauses.** Both gaps appear inline, in timestamp order, with actor and code. This is metric #4's transcript evidence — [`rec-20`](./task-rec-20-orphan-row-reconciliation-and-close-gate.md) records the measurement.
- [x] 6.5 An existing transcript with no pauses is **byte-comparable in structure** to what it produced before this task. No reordering, no new furniture.
- [x] 6.6 Backend typecheck + lint + tests green.

### Out of scope

- The replay player surface — [`rec-18`](./task-rec-18-gap-markers-replay-player.md).
- Re-transcribing anything, changing the transcription provider, or transcribing video tracks (a program non-goal).
- Changing the letterhead, footer, watermark, attachment rendering or any existing section of the PDF.
- Changing the transcript token exchange, the download route, storage or the signed-URL TTL.
- Deleting, editing or RLS-hiding any `consultation_messages` row.
- Any threshold, nudge or session flag on cumulative pause time.
- Any migration; any RLS policy.

---

## Scope Guard

- **Expected files touched: ≤ 5** — `transcript-pdf-composer.ts`, `transcript-pdf-service.ts`, the two existing test files, and at most one shared type file.
- **DO NOT TOUCH:** `consultation-message-service.ts` · `recording-pause-service.ts` · `voice-transcription-worker.ts` or `voice-transcription-service.ts` · `consultation_transcripts` and its writers · the transcript download controller / route / storage path · any migration · any RLS policy.
- **DO NOT** write a second gap-derivation. Consume rec-18's.
- **STOP and surface** if: the three-way merge cannot preserve the existing tie-break contract · gap rendering appears to need a change to how messages are stored or hidden · a second migration appears necessary.

---

## Global safety gate (MANDATORY)

- [x] **Data touched?** Read-only. No writes.
  - [x] **RLS verified?** Yes — unchanged. The ledger is read through a service with the admin client, as 064 §Safety requires.
- [x] **Any PHI in logs?** Must be **No**. Session ids, correlation ids, gap counts and durations only. Never a reason string, never transcript content, never a patient identifier.
- [x] **External API or AI call?** No new ones. No transcription is triggered by this task.
- [x] **Retention / deletion impact?** None. Rendering only. Note that the output is a **patient-downloadable** document, which is why criterion 3.6 is absolute.

---

## Design constraints (NO IMPLEMENTATION)

- The audit ledger is the only source of gaps. Never infer one from a timestamp jump, a composition boundary or a message body.
- Wall-clock ordering here; media-time offsets are rec-18's and belong nowhere in this file.
- Reason codes are tokens; human copy is resolved at render time (REC3-D9).
- Degrade visibly. A transcript that quietly loses its gaps is the artifact this phase exists to prevent.
- The existing merge contract is load-bearing and pinned by tests. Extend it; do not re-shape it.
- No PHI in logs, and no doctor-typed text in a patient-downloadable document.

---

## Done when

Gaps are a third input to `mergeByTimestamp` with a pinned tie-break and the existing chat-before-voice contract preserved; every gap renders inline at its wall-clock time with duration, actor role and reason code resolved from the token; the double-representation question is decided and recorded, with no message row deleted or hidden to achieve it; a dangling pause renders to the end of the consult; legacy rows render the not-recorded state; no free text appears in the output for any pause, old or new; a failed gap load still exports a transcript that says gap data is missing rather than silently omitting it; a gapless transcript is structurally unchanged; a real two-pause PDF verified by hand; no migration, no RLS change; backend green.

---

## Related tasks

- [`task-rec-18-gap-markers-replay-player.md`](./task-rec-18-gap-markers-replay-player.md) — same wave, same ledger data, the player surface; owns the gap derivation this task consumes.
- [`task-rec-15-preset-pause-reason-codes.md`](./task-rec-15-preset-pause-reason-codes.md) — removes the free text that reaches this document today.
- [`task-rec-16-auto-resume-countdown-and-dangling-pause.md`](./task-rec-16-auto-resume-countdown-and-dangling-pause.md) — produces the dangling-pause gap.
- [`task-rec-20-orphan-row-reconciliation-and-close-gate.md`](./task-rec-20-orphan-row-reconciliation-and-close-gate.md) — measures metric #4 across both surfaces.
- [Execution order](./EXECUTION-ORDER-p3-recording-governance-v2-pause-integrity.md)

---

**Last Updated:** 2026-08-19.
**Pattern:** third source added to a pinned two-pointer timestamp merge; ledger-derived annotations rendered inline at wall-clock time.

---

## Notes (rec-19)

### §2 — one representation per pause

**Suppress** `system_event === 'recording_paused' | 'recording_resumed'` at `loadChatMessages` only. Rows stay in `consultation_messages`. No other `system_event` is filtered. Resume is not a separate transcript entry — one gap object with start + end.

Today those rows render as `[System: {body}]` via the system branch. After rec-15 the body is still a sentence, not a structured code (`emitSystemMessage` meta is not persisted). Two descriptions of one pause would drift.

### §1.3 — gap tie-break

At equal timestamps: **chat < gap < voice** (ranks 0/1/2). Chat-before-voice is unchanged. `mergeByTimestamp(messages, voice)` still works — `gaps` defaults to `[]`.

Gaps sit at `wallStartedAt`. `mediaOffsetMs` / `positionGapsInMediaTime` are player-only and are dropped in `loadTranscriptGaps`.

### §4.3 — no total unrecorded time

Skipped. A gapless transcript stays structurally unchanged (6.5): no new letterhead furniture.

### Contract consumed from rec-18

`listRecordingGaps(sessionId)` → `{ schemaVersion: 1, gaps }`. Composer takes `TranscriptGapRow` (no import of `recording-gap-service` — keeps pdfkit render free of Twilio/track-service). Reason copy matches rec-15 banner labels. Legacy / unknown → "the reason was not recorded in preset form".
