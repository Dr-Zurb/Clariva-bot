# Visit narrative — product plan

> **Source thread:** 2026-08-30 chat, immediately after `rx-fast-entry` Phase 3 went gate-green. Owner demand, locked verbatim: *"we have the structured form as is; we want one box where user can write anything they would like to add — be it medicine, be it plan, be it a complaint, or the whole summary — this box automatically parses into its respective field; use AI or parsers or AI fallbacks, you handle the how."*
>
> **Predecessor (do not re-litigate):** [`plan-rx-fast-entry.md`](plan-rx-fast-entry.md) Phase 3 shipped the seed — `VisitDescribeBar`, `visit-segmenter`, `visit-parse-orchestrator`, `VisitParseProposal`, and the apply converters. This program makes that seed the **one** intake for the whole visit. It does not rebuild the parse or apply spine, and it does not touch the structured form.
>
> **Supersessions (recorded, deliberate):** `RFE-Q4` (capture-bar placement) and `RFE-DL-5` (Subjective + Plan only) are superseded **for this surface** — see VN-DL-3 and the annotations in the old plan. The shipped `rx-fast-entry/p3` batch files stay as history; this plan is the live spec.
>
> **Name lock:** the raw text is a **visit narrative**. The UI surface is the **describe box** (component stays `VisitDescribeBar`). Do **not** call this a "scribe" — that implies ambient in-room capture, which this program explicitly defers (VN-DL-9).
>
> **Status:** Phase 1 **Shipped** 2026-08-30 → [`Daily-plans/August 2026/30-08-2026/visit-narrative/`](../Daily-plans/August%202026/30-08-2026/visit-narrative/). Phase 2 **Gate-green** 2026-08-30 → [`p2-transcript-amendment/`](../Daily-plans/August%202026/30-08-2026/visit-narrative/p2-transcript-amendment/). VN-Q5 = **(b)** (provenance, not text). VN-Q6 **skipped by owner**. Transcript accept rate **not collected**. Production ship blocked on attestation STOP (`vnt-02` §1). **Opus throughout — Auto must not execute.** Phase 3 Deferred (counsel).
>
> **Status legend:** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.

---

## North star

> A doctor writes **anything** — one vital, one medicine line, one complaint, or the whole visit in rough language — into **one box**, and each piece lands in its correct structured field. The structured form stays exactly as it is; the box becomes the fastest way to fill it.

After this plan ships:

1. **One box, whole visit.** `spo2 98` sets a vital. `amlodipine 5mg 1 tab od 30 days` lands a medicine row. `fever since 3 days, temp 101, impression viral fever, order cbc, azithro 500 bd 3 days, advice rest` fans out across Subjective, Vitals, Assessment, Investigations, Medications, and Advice.
2. **Deterministic first, AI fallback.** A line an existing grammar can carry never spends an AI call. Only genuinely ambiguous text goes to a model, and model output always lands as a confirm card.
3. **Later, the teleconsult transcript feeds the same funnel** as a post-consult chart amendment — the transcript you already pay for stops being write-only.

---

## Why this is worth doing now

1. **The recognizers already exist.** `parseSetVitalCommand` (vitals, from the `/` command bar), `parseMedicineLine` + `rxMedicineFromParsed` (deterministic medicine lines), the complaint catalog behind `ComplaintAutocomplete`, four AI clients (complaint / medicine extractors; diagnosis / investigation resolvers), and the cue segmenter. Phase 1 is a **router in front of parsers you already own**, not a new AI capability.
2. **The seed shipped this morning.** `VisitDescribeBar` + orchestrator + proposal + apply converters are live (mounted twice, two tabs only). Phase 1 promotes, widens, and de-duplicates them.
3. **Four of five intake sources already produce text.** Typed and dictated are live; `consultation_transcripts` (Whisper / Deepgram Nova-2, migration 061) already holds full teleconsult transcripts at ~9¢/consult **already being paid**. Only the walk-in mic is genuinely new — and it is the one this program defers.
4. **Trust model is already settled.** The form today commits deterministic capture-bar lines on Enter and gates AI behind proposal cards. The box mirrors that exactly — no new safety posture to invent.

---

## Decision locks (VN-DL-1 .. VN-DL-13)

Locked in the 2026-08-30 thread. Re-opening any of them belongs in a new `Decision:` block, not mid-execution.

- **VN-DL-1 — One box, one mount.** The box is the **only** narrative surface. Mounted once, visible on both hosts (flat consultation form and the cockpit). The two Phase-0 mounts (inside `ComplaintList` and `MedicineCaptureBar`) come down in the same task that adds the single mount.

- **VN-DL-2 — The structured form is untouched.** Owner-confirmed 2026-08-30: capture bars, autocomplete, structured fields — byte-identical behavior. The box is additive. Removing or demoting the capture bars is explicitly **not** this program.

- **VN-DL-3 — Whole visit, not two tabs.** Supersedes `RFE-DL-5` for this surface. Phase 1 targets: complaints, vitals, medicines, diagnoses, investigations, and routed prose (exam findings, advice, notes). Sections needing **new** parsers (allergies, family / social / surgical history, follow-up, referral) are a later phase — the box routes their cues to prose in the meantime, it does not pretend to structure them.

- **VN-DL-4 — Deterministic first, AI fallback.** Per slice, in order: vital grammar → medicine line parser (with its existing `should-request-ai-med-parse` gate) → complaint catalog match → cue-routed AI clients → no-cue leftover fan-out. A line a grammar can carry costs zero AI calls.

- **VN-DL-5 — Trust mirrors the form.** A deterministic hit applies on Enter — exactly what typing the same line into a capture bar does today. AI-derived items are confirm cards, per-item accept. **No silent AI write onto a prescription, ever.**

- **VN-DL-6 — No new parse endpoint, no mega-prompt.** The four existing clients only, called with slice-sized text. The diagnosis / investigation clients are **resolvers** — they take a cue-delimited line ("impression: dengue"), never a paragraph. Their catalog-bound output contract (model can never inject an unknown code / order) is inherited, not reimplemented.

- **VN-DL-7 — Long-form funnel (Phase 2).** A transcript has no cues, so it needs an extraction pass — whose output is a **condensed, doctor-editable draft only**. The draft re-enters the same router → proposal → apply path. The long-form model never writes a field. This preserves `RFE-DL-7`'s intent.

- **VN-DL-8 — The transcript is post-hoc. No streaming STT in this program.** Twilio finalises 5–30s after `endSession`; the worker polls with `[1m, 5m, 15m, 1h, 6h]` backoff. The transcript exists minutes after the Rx is signed, so transcript-derived items land as a **chart amendment prompt**, never a live Rx fill.

- **VN-DL-9 — No ambient in-clinic capture in this program.** The recording attestation covers Twilio teleconsult audio as a disclosed mandate inside the `rec-*` retention / erasure machinery. A mic in a physical room captures a third party who never agreed to it. **STOP** — own program, consent surface, outside counsel (tracked in `Business/tracks.md` L9).

- **VN-DL-10 — Browser `SpeechRecognition` is for the doctor's own dictation only.** On Chrome it ships audio to Google's servers — defensible for the doctor's voice, a third-party processor the moment a patient is in the room. Never point it at patient-present audio.

- **VN-DL-11 — Telemetry counts-only.** `[ehr:rxvisit]` gains `source` (`typed` | `dictated` | `transcript`) and per-group kind counts. No narrative text, no quotes, no clinical strings — `RFE-DL-4` posture unchanged.

- **VN-DL-12 — Conversation-derived items carry provenance (Phase 2).** Doctor-authored text is an assertion; a patient's words are evidence. Transcript-derived proposal rows render the verbatim quote and have **no** bulk accept.

- **VN-DL-13 — Model split.** `vnb-01/02/05` Auto; `vnb-03/04` **Opus (max thinking)** — router over AI clients and the cross-tab apply are the hard-rules surfaces. Phase 2 is Opus throughout. Auto will not escalate itself.

---

## Open questions — answered defaults (locked for program duration)

- **VN-Q1: What does the box look like?** Always-visible single-line input at the top of the form ("Add or describe anything — a vital, a medicine, or the whole visit"), mic button, expands while typing. Enter parses. Proposal renders beneath it. Not hidden behind a disclosure — the box **is** the feature.
- **VN-Q2: Capture bars?** Unchanged (VN-DL-2). Their existing test suites are the regression lock.
- **VN-Q3: Partial deterministic hits?** A medicine line that parses but fails the capture bar's own `should-request-ai-med-parse` gate goes to the AI confirm path — the box is never *more* trigger-happy than the capture bar for the same string.
- **VN-Q4: Prose routing?** Cue-routed prose (advice / exam / note) **appends** to the target section's text field via the existing `setField`, never replaces. Shown in the proposal as a card like everything else AI-touched; deterministic cue + verbatim text may land on Enter.
- **VN-Q5: Is the narrative stored?** Phase 1: **no** — ephemeral, client-side, dies with the form. Phase 2 owner decision **2026-08-30: (b)** — store provenance (transcript + span + target + who + when), not clinical text. Erasure inherited via CASCADE from `consultation_transcripts`; that CASCADE may today be inert (no prune path) — `vnt-01` §1.3 verifies before SQL.
- **VN-Q6: What unlocks Phase 2?** Two weeks of Phase-1 accept-rate data by source, with dictated ≥ 50% and within 15 points of typed — plus an owner decision on VN-Q5 (storage) and a vernacular pilot number (VN-DL-12: measured, never promised). **Owner skipped the window 2026-08-30** ("just start"); numbers were not collected.

Decisions explicitly **not** in scope (deferred):

- Ambient walk-in capture and any in-clinic microphone (VN-DL-9). **Spec drafted 2026-08-31 as Phase 3 — still deferred, still not executable.**
- Streaming / live STT during a consult (VN-DL-8).
- New parse services for allergies / histories / follow-up / referral (later phase, gated on Phase-1 accept rate).
- Removing or demoting the capture bars (VN-DL-2).
- Text-consult message ingestion (lowest-value source — the doctor typed those messages and has them on screen).
- Speaker diarisation.

---

## Phase table

| Phase | Theme | Tasks | Gate (one sentence) | Status | Folder |
|---|---|---|---|---|---|
| 1 | One box — anything in | `vnb-01..05` | A doctor types or dictates anything — one vital, one medicine line, or the whole visit — into one box and every piece lands in its correct structured field | **Committed** | [`p1-one-box/`](../Daily-plans/August%202026/30-08-2026/visit-narrative/p1-one-box/) |
| 2 | Transcript → chart amendment | `vnt-01..05` | After a voice consult, the chart offers uncharted items from the transcript, each with its verbatim quote | **Gate-green** 2026-08-30 (VN-Q5 = b; VN-Q6 skipped; production blocked on attestation) | [`p2-transcript-amendment/`](../Daily-plans/August%202026/30-08-2026/visit-narrative/p2-transcript-amendment/) |
| 3 | Ambient walk-in capture | `vna-01..06` | A consented walk-in patient's consult is captured in the room, transcribed, and offered to the chart through Phase 2's unchanged machinery — with erasure and consent proven by standing CI tests | **Drafted 2026-08-31 — NOT promoted.** Still deferred: counsel (L9) + non-DRAFT policy version + VNA-Q1 | [`p3-ambient-walkin/`](../Daily-plans/August%202026/30-08-2026/visit-narrative/p3-ambient-walkin/) |

**Prefix note:** sub-prefixes `vnb` / `vnt` / `vna` — disjoint intake surfaces (guide exception). Numbering does not restart inside a phase.

**Phase 0 is already shipped:** `rx-fast-entry` `rfed-01..04` (the seed this program promotes).

---

## Plan rules

Phase 1 is promoted at [`Daily-plans/August 2026/30-08-2026/visit-narrative/p1-one-box/plan-p1-visit-narrative-one-box-batch.md`](../Daily-plans/August%202026/30-08-2026/visit-narrative/p1-one-box/plan-p1-visit-narrative-one-box-batch.md). **Later phases promote as sibling subfolders under the same `visit-narrative/` plan folder** (the one created on the start date), not under the later day's date.

**Phase 2 gate-green 2026-08-30** on VN-Q5 = (b) and an owner skip of VN-Q6. Transcript accept rate was **not collected** (no real voice consult in the execution env) — that number decides whether to *extend* transcript intake, not whether Phase 3 unlocks. **Phase 3 does not promote without counsel** (`Business/tracks.md` L9). Production ship of Phase 2 is still blocked: `vnt-02` §1 found no attestation basis for sending transcript text to a model; owner overrode the route; clauses were not edited.

**Phase 3 drafted 2026-08-31 — spec only, not promoted.** Writing the plan is not promoting it: no `vna-*` task may be executed, and every task file opens with a §0 pre-flight expected to STOP. Four unblock conditions, all in the batch plan: (1) the L9 counsel answer, as five specific questions rather than general approval; (2) a non-DRAFT `RECORDING_ATTESTATION_POLICY_VERSION` (Phase 2's ship blocker is a subset of this); (3) VNA-Q1, because `consultation_modality` is `('text','voice','video')` and a walk-in therefore has no session row — which both `consultation_transcripts` and `recording_artifact_index` require; (4) whether Phase 3 forks into its own program, since VN-DL-9 says "own program" and this table says Phase 3. **The Phase-2 override is explicitly not a precedent** (VNA-D1): that gate was about a new processor hop over text already captured under a disclosed mandate, this one is about capturing a person who agreed to nothing.

---

## High-level scope (S-items)

**Phase 1 — one box, anything in**

- **S1 — Single mount.** One `VisitDescribeBar` at the top of the form on both hosts; the two Phase-0 mounts come down; explicit parse trigger (Enter / mic-done), no re-parse storm. → `vnb-01`.
- **S2 — Segmenter kinds.** `visit-segmenter` gains `vital`, `diagnosis`, `investigation`, and routed-prose kinds; "Impression:" stops being thrown away. → `vnb-02`.
- **S3 — Deterministic-first router.** The recognizer ladder of VN-DL-4 in front of the AI fan-out; resolvers get lines, not paragraphs. → `vnb-03`.
- **S4 — Proposal groups + apply.** `VisitParseProposal` gains Vitals / Assessment / Investigations / prose groups; applies via `applySetVitalWrites`, the diagnosis and investigation commit paths, `complaintFromAiParsed`, `medicinesFromAiParsed`, and `setField` appends. Deterministic-on-Enter per VN-DL-5. → `vnb-04`.
- **S5 — Telemetry + gate.** `source` + kind dims on `[ehr:rxvisit]`; suites, smoke, docs. → `vnb-05`.

**Phase 2 — transcript → chart amendment**

- **S6 — Narrative provenance table.** Narrative + `source` + per-item spans. **New migration, PHI columns → STOP + Opus.** → `vnt-01`.
- **S7 — Extraction pass.** Transcript → doctor-editable draft (VN-DL-7). Inherits `redactPhiForAI`, fail-soft, mini tier. → `vnt-02`.
- **S8 — Evidence-tier proposal.** Quote line per row, no bulk accept (VN-DL-12). → `vnt-03`.
- **S9 — Chart amendment surface.** Post-consult prompt on the patient consult timeline. → `vnt-04`.
- **S10 — Phase 2 gate.** → `vnt-05`.

**Phase 3 — ambient walk-in capture** (drafted 2026-08-31; **blocked** — see Plan rules)

- **S11 — In-room consent surface.** A per-visit patient consent record at a non-DRAFT policy version, plus the server-side predicate that makes arming impossible without it. Ships no microphone. **The correct output may be a refusal.** → `vna-01`.
- **S12 — Walk-in session identity.** `consultation_modality` has no `in_person`, so a walk-in cannot hold the `consultation_sessions` row that transcripts and the retention index both require. Migration; irreversible; pre-ALTER grep mandatory. → `vna-02`.
- **S13 — In-room capture + upload.** `MediaRecorder` (absent from the repo today), signed-URL upload per the house pattern, new private bucket, and registration into `recording_artifact_index` so `rec-*` governs it. The only task in the program that creates new PHI. → `vna-03`.
- **S14 — Non-Twilio transcription.** Widen the transcription **input**; answer `composition_sid NOT NULL` and `UNIQUE (session, provider)` without altering `061`. → `vna-04`.
- **S15 — Spine reuse.** The transcript re-enters `vnt-02`'s route unchanged; no new AI, no bulk accept, no auto-apply. A large diff here is a failure signal. → `vna-05`.
- **S16 — Phase 3 gate.** Standing CI tests for consent-absence and erasure, on the `vnt-05` pattern. → `vna-06`.

---

## Acceptance gate (cross-cutting, whole program)

Phase 1 (the batch plan owns the full list):

- [x] `spo2 98` on Enter sets SpO₂ — zero AI calls. `amlodipine 5mg 1 tab od 30 days` on Enter lands a medicine row — zero AI calls.
- [x] A whole rough-language visit fans out across Subjective / Vitals / Assessment / Investigations / Medications / prose; AI-derived items are confirm cards; nothing AI-written lands silently.
- [x] The two old mounts are gone; capture-bar suites pass untouched (VN-DL-2 regression lock).
- [x] No new backend route. No new prompt file. `[ehr:rxvisit]` carries counts + `source` + kind only.
- [x] Type-check + lint + suites green.

Before Phase 2 is **selected**: two weeks of accept-rate data meeting VN-Q6, an owner decision on VN-Q5, and a vernacular pilot number.

Phase 2 (the batch plan owns the full list; executed 2026-08-30):

- [x] VN-Q5 = (b); VN-Q6 skipped (no numbers). VNT-Q1 = (i) for the patient-held PDF.
- [x] Timeline offers review on a completed transcript and nothing when there is no usable transcript (component tests; not live-smoked).
- [x] Extraction is span-verified; fabrication test drops unanchored lines. Quote is sliced, never model-echoed. No auto-apply / no Add all.
- [x] `[ehr:rxvisit]` `source: "transcript"` is items offered vs accepted (no det/AI split). Erasure CASCADE pinned by a CI test.
- [x] Attestation STOP recorded and still blocks production ship. Owner override wrote the route; clauses untouched.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Patient chatter becomes a prescribed medicine on a signed legal document | **H** | VN-DL-5 (Phase 1: AI = confirm cards) + VN-DL-12 (Phase 2: quotes, no bulk accept). |
| A transcript-sized prompt grows into a SOAP-blob field-writer | **H** | VN-DL-6 / VN-DL-7. Extraction output is a draft re-entering the router. |
| Browser STT quietly ships patient audio to Google | **H** | VN-DL-10. Scope Guard forbids reaching the hook from any patient-audio path. |
| Ambient walk-in mic ships "because the box already exists" | **H** | VN-DL-9. Not a task in this program; counsel first. |
| Box behavior diverges from capture-bar behavior for the same string | **M** | VN-Q3: shared gates (`should-request-ai-med-parse`), shared converters, shared apply paths. |
| Resolver clients fed whole paragraphs (garbage in, catalog-bound garbage out) | **M** | VN-DL-6: cue-delimited lines only; router tests pin it. |
| Capture bars regress while wiring the single mount | **M** | VN-DL-2: their suites must pass byte-identical; Scope Guard forbids editing their behavior. |
| Old locks (`RFE-Q4`, `RFE-DL-5`) cited to revert the box | **L** | Supersession notes written into `plan-rx-fast-entry.md`. |
| Narrative storage lands without retention / erasure scope | **H** | VN-Q5: Phase 2 gated on an explicit owner decision. |
| Transcript text is sent to a model with no disclosed basis for it | **H** | Phase-2 drafting (2026-08-30) found the recording attestation's six clauses cover recording, deletion policy, patient access, replay logging, streaming-only, and video consent — **none mentions transcription or AI processing** — and the policy version is still `DRAFT-REC-D2-UNAPPROVED`. `vnt-02` §1 is a hard pre-flight that is expected to STOP. |

---

## Cost estimate (per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md))

**Phase 1** — five tasks, two Opus (`vnb-03` router over AI clients, `vnb-04` cross-tab apply), three Auto. ~1.5–2 days.

**Phase 2** — migration with PHI columns + a new AI extraction path. **Opus throughout**, ~14–20h (exec order ~21h). Started without the VN-Q6 numbers on owner skip 2026-08-30. Gate-green same day; production ship still blocked on attestation.

**Phase 3** — unestimated until counsel scopes the consent surface.

**Runtime cost:** Phase 1 *reduces* AI spend per interaction (deterministic-first means `spo2 98` and clean medicine lines stop being candidates for AI at all). Phase 2 adds a mini-tier extraction pass over text whose transcription is already sunk (`WHISPER_USD_PER_MINUTE = 0.006`, `DEEPGRAM_USD_PER_MINUTE = 0.0043`). Phase 3 is where genuinely new per-minute audio spend would appear.

---

## References

- [`plan-rx-fast-entry.md`](plan-rx-fast-entry.md) — predecessor; supersession notes on `RFE-Q4` / `RFE-DL-5`.
- [`PHASED-PLANS-GUIDE.md`](../process/PHASED-PLANS-GUIDE.md) · [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../process/EXECUTION-ORDER-GUIDELINES.md)
- `frontend/components/cockpit/rx/subjective/VisitDescribeBar.tsx` — the box (today mounted twice).
- `frontend/lib/cockpit/visit-segmenter.ts` · `visit-parse-orchestrator.ts` · `visit-parse-apply.ts` — the funnel Phase 1 widens.
- `frontend/lib/cockpit/command-bar-set-vital.ts` — vital grammar + `applySetVitalWrites`.
- `frontend/lib/cockpit/medicine-line-parse.ts` · `rx-medicine-from-capture.ts` · `should-request-ai-med-parse.ts` — deterministic medicine path + its AI gate.
- `frontend/lib/api/complaint-parse.ts` · `medicine-parse.ts` — extractors. `diagnosis-parse.ts` · `investigation-parse.ts` — **resolvers** (line-in, catalog-bound out).
- `frontend/lib/telemetry/visit-describe.ts` — events gaining `source` + kinds.
- `frontend/lib/text/use-speech-recognition.ts` — doctor dictation only (VN-DL-10).
- `backend/src/services/voice-transcription-service.ts` · `voice-transcription-worker.ts` · `backend/src/types/consultation-transcript.ts` — Phase 2 raw material and its timing.
- `backend/src/constants/recording-attestation.ts` — why the attestation does not cover a walk-in mic.

---

**Created:** 2026-08-30  
**Last Updated:** 2026-08-30 (Phase 2 gate-green; attestation still blocks production)
