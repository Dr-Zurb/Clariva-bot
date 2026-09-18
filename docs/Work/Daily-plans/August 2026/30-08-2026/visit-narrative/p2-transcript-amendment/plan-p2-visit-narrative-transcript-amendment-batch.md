# Plan p2 — Transcript → chart amendment

## 30 Aug 2026 — Batch `visit-narrative` / `p2-transcript-amendment` (`vnt-01..05`) — **L, ~21h · Opus throughout**

> **Status:** **Gate-green** 2026-08-30 (engineering). VN-Q5 = **(b)** (provenance, not text). VN-Q6 window **skipped by owner** ("just start") — numbers not collected. Transcript accept rate **not collected** (this env never saw a real completed voice-consult transcript). Attestation scope still blocks *production* ship (`vnt-02` §1 STOP; owner overrode the route; clauses not edited). **Executor: Opus throughout (VN-DL-13). Auto must not run these tasks.**
> **Product plan:** [`plan-visit-narrative.md`](../../../../../Product%20plans/plan-visit-narrative.md) (VN-DL-1…VN-DL-13 — this phase implements VN-DL-7, 8, 11, 12, 13)
> **Prior phase:** [`../p1-one-box/`](../p1-one-box/) — shipped 2026-08-30. Its router, proposal, and apply spine is what a transcript feeds into. This phase does **not** rebuild it.
> **Program:** [`../README.md`](../README.md) · Prefix `vnt`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md`](./Tasks/EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md)

---

## Why this phase

Phase 1 made one box take anything a doctor **types or dictates**. The third intake source is already sitting in the database, paid for, and write-only: `consultation_transcripts` (migration 061) holds the full Whisper / Deepgram transcript of every voice and video consult. Migration 061's own column comment says the quiet part out loud —

> `transcript_text` … *"Denormalised plain-text concat. Enables `SELECT transcript_text` without paying to re-parse the JSON — Plan 10 (AI clinical assist) **will read this column**."*

Nothing has ever read it. This phase is that reader.

The shape of the work is fixed by two inherited locks. **VN-DL-8**: the transcript finalises minutes *after* `endSession` (Twilio composition + a `[1m, 5m, 15m, 1h, 6h]` poll ladder), so by the time the text exists the prescription is typically already written. Transcript-derived items are therefore a **chart amendment**, never a live Rx fill. **VN-DL-7**: a transcript has no cues, so it needs an extraction pass — and that pass emits a **condensed, doctor-editable draft**, which re-enters the Phase-1 router. The long-form model never writes a field.

The one genuinely new idea in this phase is **evidence tiering** (VN-DL-12). Doctor-authored text is an assertion. A patient's recorded words are evidence. A row derived from a transcript renders the verbatim quote it came from and is accepted one at a time — there is no "Add all" for things a patient said.

**Escalate:** every task here touches a hard-rules surface — a new PHI-adjacent table, a new AI route over clinical text, and a write onto a chart that may already be legally signed. **Opus (max thinking) throughout, per VN-DL-13.** Auto will not escalate itself.

---

## Unblock conditions

Both must be true before the first task starts. Neither is an agent decision.

### 1. VN-Q5 — is the narrative stored? (owner **STOP**)

Phase 1 answered this "no, ephemeral". Phase 2 cannot stay silent on it: the moment a proposal row says *"the patient said this at 14:32"*, something has to remember where that came from. Three admissible answers, each with a different `vnt-01`:

| Option | What persists | Erasure surface | `vnt-01` becomes |
|---|---|---|---|
| **(a) Store nothing** | Nothing. Quotes are rendered live from `transcript_text` during the session and forgotten on accept. | None added. | **Deleted.** Phase starts at `vnt-02`. Accepted rows carry no record of having come from a patient's words. |
| **(b) Store provenance, not text** ← *recommended* | One row per accepted item: which transcript row, which character span, which target, who accepted, when. **No clinical free-text column.** The quote is re-derived by slicing `transcript_text`. | Inherited. `ON DELETE CASCADE` from `consultation_transcripts` means the existing transcript prune takes provenance with it. | A small append-only table, no new PHI text. |
| **(c) Store the narrative too** | (b) plus the raw typed/dictated narrative, which today has no home anywhere. | **New.** A new PHI text store with its own DPDP retention + erasure obligation. | A genuinely new PHI store — full retention design, counsel-adjacent. |

**Recommendation (a recommendation, not a decision): (b).** It buys the entire clinical-provenance value — "this diagnosis traces to the patient's own words" — without creating a second copy of PHI or a second erasure obligation, because spans are integers and the text they point at is governed elsewhere.

> ⚠️ **Caveat found while drafting, which weakens that reasoning — read before deciding.** The claim "already governed by the `rec-*` retention machinery" does not appear to survive contact with the code. **No code path deletes a `consultation_transcripts` row.** The archival worker and erasure service act on `recording_artifact_index` and storage objects and never reference the transcripts table; neither does the account-deletion worker. The only deletion route is `ON DELETE CASCADE` from `consultation_sessions`, and migration 061's header says session rows are deliberately retained through the regulatory window.
>
> If that holds, transcripts are effectively never pruned. Option (b) is still the *least-worst* of the three — it adds no new PHI text and a CASCADE that is correct even if currently inert — but it should be chosen with eyes open: the erasure it inherits may today be **no erasure at all**. That is a pre-existing gap in the transcript retention posture, not one Phase 2 creates, and it is worth its own thread regardless of what VN-Q5 decides. `vnt-01` §1.3 makes verifying this a hard pre-flight.

**Decision:** **(b)** — owner, 2026-08-30. Store provenance, not text. One append-only row per accepted item: transcript, character span, target, who accepted, when. No clinical free-text column. Caveat above accepted with eyes open: inherited erasure may today be inert; `vnt-01` §1.3 still verifies before writing SQL.

### 2. VN-Q6 — accept-rate window

Two weeks of Phase-1 data (window **2026-08-30 → 2026-09-13**): dictated accept rate ≥ 50% and within 15 points of typed, plus a vernacular pilot number (VN-DL-12 — measured, never promised). If dictation does not clear this bar, transcript extraction is building on sand and this phase should be re-scoped rather than started.

**Numbers:** **skipped by owner, 2026-08-30** ("just start"). Window was 2026-08-30 → 2026-09-13; no accept-rate data collected. Phase starts without the dictated-vs-typed bar.

### 3. Attestation scope — surfaced at drafting, resolved inside `vnt-02`

Not a gate on *starting*, but a gate on *shipping*, and the owner should open it now rather than meet it six hours into `vnt-02`.

Drafting read `backend/src/constants/recording-attestation.ts`. Its six clauses cover recording, non-deletion, patient access, replay logging, streaming-only, and video consent. **On a plain reading, none of them discloses that a recording is transcribed and processed by a third-party AI model.** Separately, `RECORDING_ATTESTATION_POLICY_VERSION` is still `'DRAFT-REC-D2-UNAPPROVED'`, with a file comment saying the draft must not ship to production.

Transcription already sends audio to Whisper / Deepgram, so a processor hop exists today — that pre-existing gap is not this phase's to fix. **A new hop for a new purpose is.** `vnt-02` §1 makes this a hard pre-flight that is expected to end in STOP, and widening the attestation copy is explicitly *not* an engineering decision (REC-D2).

**Owner action:** **STOP recorded 2026-08-30** (`vnt-02` §1). No existing basis in the six clauses; policy version still `DRAFT-REC-D2-UNAPPROVED`. **Owner overrode the same day** ("just do it") to write the extraction route anyway. Clauses were not edited (REC-D2). Tracked on `Business/tracks.md` L9 as still needing counsel copy before *production* ship.

---

## Decision lock (phase — inherits the product plan)

| ID | Phase decision |
|----|----------------|
| VN-DL-1…13 | Inherited. **Do not re-litigate.** |
| **VNT-D1** | **VN-Q5 gates `vnt-01` only.** Whatever the owner answers, `vnt-02..05` are unchanged in shape — extraction, evidence rendering, and the amendment surface do not depend on storage existing. If the answer is (a), `vnt-01` is struck and the phase is four tasks. Do not let an undecided VN-Q5 block work that does not need it. |
| **VNT-D2** | **Span-anchored output, enforced server-side.** Every line the extraction pass emits carries a character span into the exact `transcript_text` it was derived from. The service **verifies each span resolves** and **drops** any line that does not, before responding. This is the structural anti-hallucination lock — the same posture as the diagnosis / investigation resolvers' catalog binding (VN-DL-6). It is not a prompt instruction, and a prompt instruction is not a substitute for it. |
| **VNT-D3** | **Exactly one new route, one new prompt, one new service.** VN-DL-6 ("no new parse endpoint") was a **Phase-1** lock; VN-DL-7 opens this door for Phase 2 and opens it exactly this wide. Names are locked in `vnt-02` so `vnt-03` / `vnt-04` never guess. A second endpoint, a second prompt, or a "while I'm here" summarisation helper is a **STOP**. |
| **VNT-D4** | **Transcript items never auto-apply.** VNB-D4's deterministic-on-Enter trust split covers text **the doctor typed**. It does **not** extend to `source: 'transcript'` — even when a deterministic recognizer matches the line cleanly. Every transcript-derived row is a confirm card, accepted one at a time, no bulk accept, no per-group "Add all" (VN-DL-12). |
| **VNT-D5** | **One write path.** `visit-parse-apply.ts` writes through `RxFormContext`. The amendment surface therefore **navigates into the existing consult's form** and proposes there. It does **not** grow a second apply path that writes to the chart off-form. If the target consult's form cannot be opened in an amendment context, **STOP and surface** — do not build a parallel writer. |
| **VNT-D6** | **Draft, never fields.** The extraction response is condensed text plus spans. Structuring is the Phase-1 router's job, client-side, unchanged. The long-form model's output never reaches a form field without passing through the router and a confirm card. |
| **VNT-D7** | **Redaction is necessary, not sufficient.** `redactPhiForAI` (`backend/src/services/ai-service.ts`) strips contact identifiers — emails, phone numbers — and is mandatory on the transcript text before any model call, matching `complaint-parse-service.ts` / `medicine-parse-service.ts`. It does **not** strip clinical content, and clinical content is the entire payload here. The compliance basis for this hop is therefore the **recording attestation**, not redaction. `vnt-02` must verify the attestation actually covers downstream AI processing of transcript text before writing the call — if it covers only capture and storage, **STOP**. |
| **VNT-D8** | **Phase-1 behavior is frozen.** Typed and dictated paths through the segmenter, router, proposal, and apply modules must not change. Their suites are the regression lock, exactly as the capture-bar suites were Phase 1's. Widening a DTO with an optional evidence field is in scope; changing what a typed input does is not. |

---

## Open questions (phase) — verify, do not assume

- **VNT-Q1 — Is a signed prescription immutable?** **Answered 2026-08-30 (i) for the patient-held PDF.** There is no `signed_at` / lock column. The sent PDF is frozen (BRD-D4 remint-only). Amendment writes this consult's chart via the existing form; surface copy says the sent PDF is not updated. Public HTML `/r/[id]` still re-reads live — pre-existing, not changed here.
- **VNT-Q2 — Long-consult policy.** A 40-minute consult's `transcript_text` will not fit a comfortable prompt window. Default: chunk on transcript segment boundaries with spans preserved through the chunking, and cap total chunks per extraction. On exceeding the cap, surface *"transcript longer than the extraction window"* — **never silently truncate**, because a silently truncated transcript produces a confidently incomplete amendment.
- **VNT-Q3 — Who may trigger extraction?** Default: **doctor only.** Deciding what belongs in a chart is clinical judgement. Clinic staff exist in the auth model (`allowStaff`, `resolveActingDoctor`) so this must be explicit at the route, not incidental.

---

## Scope Guard — DO NOT TOUCH

- The structured form (VN-DL-2) — capture bars, autocomplete, fields. Still byte-identical, still not this program.
- Phase-1 typed / dictated behavior (VNT-D8). Its suites must pass **untouched**.
- `consultation_transcripts` schema, `voice-transcription-service.ts`, `voice-transcription-worker.ts` — this phase is a **reader**. Changing the transcription pipeline is a different program.
- `recording_artifact_index`, the retention / hard-delete workers, and the `rec-*` erasure machinery.
- Streaming or live STT during a consult (VN-DL-8).
- Any in-clinic / ambient microphone (VN-DL-9) — Phase 3, counsel-gated.
- Speaker diarisation (explicitly deferred in the product plan).
- A second apply path off the Rx form (VNT-D5).
- New parse services for allergies / histories / follow-up / referral — still a later phase; their cues still route to prose.
- Text-consult message ingestion (lowest-value source — the doctor typed those and has them on screen).

---

## Tasks

| ID | Title | Size | Model |
|----|-------|------|-------|
| [`vnt-01`](./Tasks/task-vnt-01-narrative-provenance-table.md) | Narrative provenance table (migration) | M | **Opus** — blocked on VN-Q5 |
| [`vnt-02`](./Tasks/task-vnt-02-extraction-pass.md) | Transcript → span-anchored draft (one new route) | L | **Opus** |
| [`vnt-03`](./Tasks/task-vnt-03-evidence-tier-proposal.md) | Evidence-tier proposal rows (quote, no bulk accept) | L | **Opus** — **done 2026-08-30** |
| [`vnt-04`](./Tasks/task-vnt-04-chart-amendment-surface.md) | Chart amendment surface on the consult timeline | L | **Opus** — **done 2026-08-30** |
| [`vnt-05`](./Tasks/task-vnt-05-phase-2-gate.md) | Telemetry `transcript` dim + Phase 2 gate | M | **Opus** (per VN-DL-13) — **done 2026-08-30** |

---

## Acceptance gate

Checked 2026-08-30 against a real observation (test, grep, or file), not an assumption.

- [x] VN-Q5 answered by the owner and recorded in this file; VN-Q6 numbers recorded. — **(b)** 2026-08-30. VN-Q6 **skipped**; no accept-rate numbers exist.
- [x] After a voice consult with a completed transcript, the patient's consult timeline offers *"review transcript for uncharted items"* on that entry — and offers nothing on entries with no transcript. — `ConsultTimelinePane.test.tsx` (completed → link; `transcriptStatus: null` → absence). **Not live-smoked** on a real voice consult in this env.
- [x] The extraction route redacts via `redactPhiForAI`, runs on the mini tier, fails soft, is rate-limited, and is doctor-scoped (VNT-Q3). — `visit-narrative-extraction-service.ts` + limiter + route (no `allowStaff`).
- [x] Every draft line returned carries a span that resolves against the stored `transcript_text`; a fabricated line with no valid span is **dropped by the service**, proven by a test that feeds a model response containing one. — `visit-narrative-extraction-service.test.ts` fabrication cases green (2026-08-30).
- [x] Transcript-derived proposal rows render their **verbatim quote**, sliced from the transcript — never echoed from the model response. — `VisitParseProposal.test.tsx`.
- [x] No transcript-derived item auto-applies. No "Add all" on any transcript group. Per-item accept only (VNT-D4). — `visit-parse-apply.test.ts` (vnt-03) + `VisitParseProposal.test.tsx`.
- [x] A transcript longer than the extraction window surfaces that fact instead of truncating (VNT-Q2). — `VisitNarrativeAmendment.test.tsx`.
- [x] VNT-Q1 is answered in `vnt-04` from the code, and the surface's wording matches the answer. — **(i)** for the patient-held PDF. Copy: `AMENDMENT_BANNER_COPY`.
- [x] If VN-Q5 = (b) or (c): deleting a transcript removes its provenance rows (erasure verified, not assumed). — `224-visit-narrative-provenance-erasure.test.ts` (CI). Scenario is SQL-driven: this env has no live Postgres, so the store's CASCADE/RESTRICT is parsed from 224. A loosened FK fails the build. Negative: direct provenance delete is append-only and does not touch the transcript. **224 is still unapplied on this env.**
- [x] `[ehr:rxvisit]` gains `source: "transcript"` and carries counts only — no quotes, no clinical strings (VN-DL-11). — `visit-describe.ts` + `visit-describe.test.ts`. Denominator is items offered vs accepted per consult (no det/AI split — VNT-D4).
- [x] Phase-1 suites pass untouched (VNT-D8). Type-check + lint clean. New backend + frontend suites green. — Phase-1 describe-bar / apply / orchestrator / proposal suites green. Touched-file lint + backend `tsc` clean. Frontend `tsc` still has **pre-existing** errors outside this phase.

### Residuals (do not silently close)

- **Production ship blocked.** `vnt-02` §1 STOP stands: attestation six clauses do not disclose AI processing of transcript text; policy still `DRAFT-REC-D2-UNAPPROVED`. Owner overrode to write the route; clauses were not edited (REC-D2). Tracked on `Business/tracks.md` L9.
- **Migration 224 unapplied** on this environment. Operator must apply and run the verification SQL.
- **No live voice-consult smoke.** Amendment surface was verified in unit/component tests only.
- **Transcript accept rate: not collected.** This phase never saw a real completed voice consult here. That number decides whether transcript intake is worth *extending*, not whether Phase 3 unlocks (Phase 3 is counsel-gated regardless).
- **`hasTranscript` on `recording_artifact_index` is permanently false** — `registerFinalisedComposition` rejects `artifact_kind='transcript'` (rec-28). Offer gates on `consultation_transcripts.status` instead. Not absorbed.
- **Inherited erasure may be inert.** No production path deletes `consultation_transcripts` rows. CASCADE is correct and currently unused.
- **VNT-D3 as executed:** one new *AI* route / prompt / service (`POST /extract`, `buildSystemPrompt`, `visit-narrative-extraction-service`). `POST /provenance` is a second HTTP route and a second service — not an AI hop. Recorded, not a silent second model call.
- Frontend `tsc --noEmit` still fails on pre-existing files (`vital-confidence.ts`, `lib/desk/*`, `filter-patient-in-call-thread.ts`). None in this phase's touched files.
- Full-repo suites are **not** green (pre-existing, none in this phase's files): frontend `49` files / `131` tests failed of `526` files (`SubjectiveSection` QueryClient still in the tail); backend `32` suites / `31` tests failed of `483` suites (observed: `create-patient-handler`, `service-match-learning-autobook`, `intake-language-plumbing`). Phase-1 known flakes (unchanged, not inherited as new): `ComplaintList` timeout, `PlanSection` incomplete-row collapse, `SubjectiveSection` QueryClient.

---

## Risk register (phase)

| Risk | Severity | Mitigation |
|------|---|------------|
| Patient chatter becomes a prescribed medicine on a legal document | **H** | VNT-D4 — transcript items never auto-apply, no bulk accept, quote always visible. |
| The extraction pass grows into a SOAP-blob field writer | **H** | VNT-D6 + VNT-D3. Output is draft text + spans; the Phase-1 router does the structuring. One route, one prompt, enforced by Scope Guard. |
| Model fabricates a plausible clinical line that was never said | **H** | VNT-D2 — span verified server-side against the stored text; unanchored lines dropped. Quote rendered by slicing, never by echoing the model. |
| Amendment silently mutates a signed prescription | **H** | VNT-Q1 — answered from the code before `vnt-04` builds, and the surface's copy has to match the answer. |
| Provenance becomes a second, ungoverned PHI store | **H** | VN-Q5 decision; option (b) stores spans, not text, and inherits the transcript's erasure via CASCADE. |
| Transcript deleted under retention, provenance rows orphaned and dangling | **H** | CASCADE from `consultation_transcripts`, **verified by test** in `vnt-05`, not assumed from the DDL. |
| Redaction cited as the compliance basis for sending clinical text to a model | **M** | VNT-D7 — it is not. The attestation is, and `vnt-02` verifies the attestation's actual scope first. |
| Cost blowout on long transcripts | **M** | VNT-Q2 chunk cap + mini tier. Extraction cost logged the way transcription cost already is (`cost_usd_cents` precedent). |
| Phase-1 typed / dictated behavior regresses while widening the DTO | **M** | VNT-D8 — Phase-1 suites are the regression lock and must pass without edits. |
| Span drift between chunking and rendering produces a quote that misattributes words to the patient | **M** | Spans preserved through chunking; a round-trip test slices every returned span and asserts it against the source text. |
| "The box already exists" used to justify an in-clinic mic | **H** | VN-DL-9. Not a task here. Counsel first (`Business/tracks.md` L9). |

---

**Last Updated:** 2026-08-30 (vnt-05 gate)
