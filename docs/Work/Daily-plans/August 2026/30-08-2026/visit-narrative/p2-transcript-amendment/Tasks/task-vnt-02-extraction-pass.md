# Task vnt-02: Transcript → span-anchored draft

> **Filename:** `task-vnt-02-extraction-pass.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).
> **Model: Opus (max thinking). Auto must not run this task.**
> **🛑 This task contains a compliance pre-flight that is expected to end in STOP. Read §1 before anything else. Do not treat it as a formality.**

---

## 📋 Task Overview

The first and only new AI route in this program. A completed transcript's plain text goes in; a **condensed, doctor-editable draft** comes out, where every line carries a character span pointing back into the exact transcript text it was derived from. The service verifies each span resolves before responding, and drops the lines that don't.

That span check is the whole safety argument. The Phase-1 resolvers are safe because a diagnosis the model invents cannot survive re-resolution against the catalog (VN-DL-6). There is no catalog for "things a patient said", so the equivalent structural bind is the transcript itself: a line that cannot be located in the source text did not come from the source text, and is dropped by the service — not flagged, not shown, not trusted to a prompt instruction.

What this task does **not** do: structure anything. The draft is text. The Phase-1 router turns text into fields, client-side, unchanged (VNT-D6). The long-form model has no path to a form field.

**Program / Phase:** visit-narrative · Phase 2 (transcript amendment)
**Batch:** [`plan-p2-visit-narrative-transcript-amendment-batch.md`](../plan-p2-visit-narrative-transcript-amendment-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md`](./EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md)
**Estimated Time:** ~6 hours
**Status:** ✅ **COMPLETE** (owner override of §1 STOP, 2026-08-30). Route written; clauses not widened. Counsel copy still required before production ship.

**Change Type:**
- [x] **New feature** — new service, controller, route, and rate limiter. No existing behavior changes.
- [ ] **Update existing**

**Current State:** (checked against the codebase)
- ✅ **What exists:** `consultation_transcripts.transcript_text` (migration `061`) — a denormalised plain-text concat, populated on `status = 'completed'`. Migration 061's own column comment says it exists to be read by exactly this kind of consumer. **Nothing has ever read it.**
- ✅ **What exists:** the AI-service house pattern, best expressed in `backend/src/services/complaint-parse-service.ts` — an injectable `runLlm` seam so bounding logic is unit-tested without a network call; `redactPhiForAI` on the user prompt; `logAIClassification` audit that is metadata-only; `getOpenAI…Config(tier)` for mini/flagship tiering (never the global `OPENAI_MODEL`); fail-soft on empty or truncated output; `ServiceUnavailableError` only for an unconfigured client or a hard SDK failure. `medicine-parse-service.ts`, `diagnosis-resolver-service.ts`, and `investigation-resolver-service.ts` are the same shape.
- ✅ **What exists:** `redactPhiForAI` at `backend/src/services/ai-service.ts` (lines 472–495) — replaces emails with `[REDACTED_EMAIL]` and phone numbers with `[REDACTED_PHONE]`, covering Indian mobile (`+91` / `0` prefix, 6-9 start, 5-5 grouping), US/international, and a catch-all for any run of ≥ 10 digits. **That is all it does.** Names, DOBs, and clinical text are untouched, by design (comment at line 470).
- ✅ **What exists:** the house rate-limiter pattern in `backend/src/middleware/rate-limiters.ts` (`replayMintLimiter`, `clinicStaffProvisionLimiter`, …).
- ❌ **What's missing:** any route, service, prompt, or type that reads a transcript.
- ⚠️ **Notes:** the house pattern builds its system prompt **inline** (`buildSystemPrompt` inside the service). There is no prompts folder. "One new prompt" (VNT-D3) means one inline builder, not a new file convention.
- ⚠️ **Notes:** the i18n phone gap that `rcp-00` opened (a US-only 3-3-4 pattern) has since been **fixed** — Indian numbers are now covered. Do not re-report it as outstanding. This changes nothing about VNT-D7: better contact-identifier coverage still does not make redaction the compliance basis for sending clinical text to a model.
- ⚠️ **Notes:** the house pattern puts the Zod schema in `backend/src/utils/validation.ts` beside a `validate…Request` helper, which the controller calls — it does **not** define the schema inline in the controller. See `resolveDiagnosisRequestSchema` / `validateResolveDiagnosisRequest` (`validation.ts` ~lines 4937–4952) and its use in `diagnosis-catalog-controller.ts` line 41.

**Scope Guard:**
- Expected files touched: ≤ 8 (service, controller, route mount, rate limiter, types, prompt-bounding tests, service tests, env/config if a tier constant is needed)
- **Backend only.** The frontend client and rendering are `vnt-03`. This task's deliverable is a locked response contract.
- **Exactly one** route, one service, one prompt builder (VNT-D3). A second endpoint, a "summarise this consult" helper, or a general-purpose transcript API is a **STOP**.
- No change to `consultation_transcripts`, `voice-transcription-service.ts`, `voice-transcription-worker.ts`, or any retention worker. This phase is a reader.
- No new redaction helper. No modification to `redactPhiForAI`.
- Any expansion requires explicit approval.

**Reference Documentation:**
- [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-DL-6, VN-DL-7, VN-DL-8
- Batch locks VNT-D2, VNT-D3, VNT-D6, VNT-D7 · VNT-Q2, VNT-Q3
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Compliance pre-flight — do this before writing any code

VNT-D7: redaction is not the compliance basis for this hop. It strips contact identifiers; the payload here is clinical content, which it does not touch. The basis has to be the recording attestation. **Verify that it actually is.**

- [x] ✅ 1.1 Read `backend/src/constants/recording-attestation.ts` and establish what the six clauses actually disclose. - **Completed: 2026-08-30**
  - [x] ✅ 1.1.1 Record, in writing in this file's Notes, whether any clause discloses that recordings are transcribed and processed by a third-party AI model for chart-drafting purposes. **None do.** - **Completed: 2026-08-30**
  - [x] ✅ 1.1.2 Note the shipping status of `RECORDING_ATTESTATION_POLICY_VERSION`. Still `'DRAFT-REC-D2-UNAPPROVED'`. File comment: draft must not ship to production. Second independent block. - **Completed: 2026-08-30**
- [x] ✅ 1.2 Separate the pre-existing gap from the new one. Transcription itself already sends audio to Whisper / Deepgram. That processor hop is not this task's to justify or fix. **A new hop for a new purpose is.** - **Completed: 2026-08-30**
- [x] ✅ 1.3 **Decide and surface.** Attestation does not cover downstream AI processing of transcript text. **STOP.** Did not proceed on "the audio already goes to a third party". Did not widen the clauses. - **Completed: 2026-08-30**
  - [x] ✅ 1.3.1 If STOP: record the finding, open the item on `Business/tracks.md`, and leave `vnt-02` blocked. Item was already on L9 from drafting; updated 2026-08-30 to record the executed STOP. - **Completed: 2026-08-30**

### 2. Read path (no model yet)
- [x] ✅ 2.1 Resolve a transcript from a consult identifier, doctor-scoped. Session `doctor_id` vs `req.user.id`; mismatch → NotFound. - **Completed: 2026-08-30**
- [x] ✅ 2.2 Only `status = 'completed'` transcripts are eligible. `queued` / `processing` / `failed` / `missing` are distinct statuses. - **Completed: 2026-08-30**
- [x] ✅ 2.3 Doctor-only. Route does not set `allowStaff`. Service also `assertVisitNarrativeActorIsDoctor`. - **Completed: 2026-08-30**
- [x] ✅ 2.4 Zod in `validation.ts` (`validateExtractVisitNarrativeRequest`). No DB in the controller. - **Completed: 2026-08-30**

### 3. Length policy (VNT-Q2)
- [x] ✅ 3.1 Working ceiling: `MAX_CHUNK_CHARS = 12_000`, `MAX_CHUNKS = 4` (~48k chars). Typical 10–15 min consult is one chunk. Could not query live durations (no DB URL). - **Completed: 2026-08-30**
- [x] ✅ 3.2 Chunk on Whisper/Deepgram segment boundaries; spans index the full transcript. - **Completed: 2026-08-30**
- [x] ✅ 3.3 Cap = 4. - **Completed: 2026-08-30**
- [x] ✅ 3.4 Over-cap → `status: 'over_window'`, empty lines, model not called. - **Completed: 2026-08-30**

### 4. The extraction call
- [x] ✅ 4.1 Injectable `runLlm`, mini via `getOpenAIComplaintParseConfig('default')` (model only; completion cap 1600), metadata-only audit, fail-soft, 503 only for unconfigured/hard fail. - **Completed: 2026-08-30**
- [x] ✅ 4.2 `redactPhiForAI` before the prompt; `redactionApplied` on the result. - **Completed: 2026-08-30**
- [x] ✅ 4.3 One inline `buildSystemPrompt`. Cue-shaped lines, not SOAP JSON. - **Completed: 2026-08-30**
- [x] ✅ 4.4 Prompt asks for spans; §5 enforces. - **Completed: 2026-08-30**
- [x] ✅ 4.5 `MAX_LINES = 40`, `MAX_LINE_LEN = 240`. - **Completed: 2026-08-30**

### 5. Span verification — the anti-hallucination lock (VNT-D2)
- [x] ✅ 5.1 Spans checked against stored `transcript_text`. - **Completed: 2026-08-30**
- [x] ✅ 5.2 Missing / OOB / inverted / no token overlap → dropped. - **Completed: 2026-08-30**
- [x] ✅ 5.3 `droppedCount` / `keptCount` only in logs. - **Completed: 2026-08-30**
- [x] ✅ 5.4 Line shape is `{ text, spanStart, spanEnd }` — no quote field. - **Completed: 2026-08-30**

### 6. Route + limiter
- [x] ✅ 6.1 `POST /api/v1/visit-narrative/extract`. Auth + Zod. - **Completed: 2026-08-30**
- [x] ✅ 6.2 `visitNarrativeExtractLimiter` — 8/hour per doctor+session. - **Completed: 2026-08-30**
- [x] ✅ 6.3 Typed errors; `asyncHandler`; no try-catch in the controller. - **Completed: 2026-08-30**

### 7. Verification & Testing
- [x] ✅ 7.1 Fabrication test — unresolvable span dropped, anchored line kept. - **Completed: 2026-08-30**
- [x] ✅ 7.2 Span round-trip on kept lines. - **Completed: 2026-08-30**
- [x] ✅ 7.3 Chunk offsets index the full text. - **Completed: 2026-08-30**
- [x] ✅ 7.4 `over_window`; model not called. - **Completed: 2026-08-30**
- [x] ✅ 7.5 Empty / length / malformed → empty draft. - **Completed: 2026-08-30**
- [x] ✅ 7.6 Redaction applied before the prompt. - **Completed: 2026-08-30**
- [x] ✅ 7.7 Other doctor → NotFound; staff → Forbidden; non-completed statuses distinct. - **Completed: 2026-08-30**
- [x] ✅ 7.8 Logger dumps contain counts, not source/line text. - **Completed: 2026-08-30**
- [x] ✅ 7.9 `tsc --noEmit` + eslint on touched files + 16/16 targeted tests. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/src/services/visit-narrative-extraction-service.ts
CREATE: backend/src/controllers/visit-narrative-extraction-controller.ts
CREATE: backend/src/types/<extraction request/response contract>
UPDATE: backend/src/utils/validation.ts            (schema + validate…Request helper)
UPDATE: backend/src/routes/api/v1/<the single new route mount>
UPDATE: backend/src/middleware/rate-limiters.ts
UPDATE: backend/src/config/openai.ts  (only if a new tier config accessor is genuinely required)
CREATE: backend/src/services/__tests__/visit-narrative-extraction-service.test.ts
```

**Existing Code Status:**
- ✅ `backend/src/services/complaint-parse-service.ts` — EXISTS. The structural template. **Not modified.**
- ✅ `backend/src/services/ai-service.ts#redactPhiForAI` — EXISTS. Used as-is. **Not modified.**
- ✅ `backend/src/middleware/rate-limiters.ts` — EXISTS. Extended with one limiter.
- ✅ `backend/migrations/061_consultation_transcripts.sql` — EXISTS. Read-only.
- ✅ Route / service / types / validation / limiter / tests — written 2026-08-30.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **The span check is structural, not advisory.** A prompt instruction to "only quote what was said" is not a guarantee; verifying against stored text is. If the design ever makes span verification optional or client-side, the task has failed regardless of what the tests say.
- **Draft, never fields** (VNT-D6). The response is condensed text plus spans. If the response shape starts to resemble a SOAP object, stop — that is the failure mode VN-DL-7 exists to prevent.
- **The response never carries model-generated quote text.** Spans only. The client slices.
- Controllers orchestrate: validate → service → respond. No DB access in the controller (agent contract).
- No `process.env` — `config/env.ts` only.
- **No PHI in logs** — counts, identifiers, and correlation IDs only. This service handles the single most sensitive text in the product.
- Fail-soft matches the sibling services: a bad model response degrades to an empty draft at the doctor, never an error dialog.
- Redaction applied and audited, while understanding it is necessary and not sufficient (VNT-D7).

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — reads `consultation_transcripts.transcript_text`.
  - [x] **RLS verified?** Service-role read; doctor scoping enforced and tested (7.7).
- [x] **Any PHI in logs?** **No** — asserted at 7.8.
- [x] **External API or AI call?** **Yes** — new hop, owner-overridden §1 STOP.
  - [x] **Consent + redaction confirmed?** Redaction: yes. Consent: **no disclosed basis**; owner override 2026-08-30.
- [x] **Retention / deletion impact?** No new storage. The draft is a response, not a row.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] §1 is resolved with a written answer — **recorded STOP**, then **owner override** to implement anyway. Clauses not widened.
- [x] A completed transcript returns a condensed draft; every line resolves to a verified span.
- [x] A fabricated line with an unresolvable span is dropped **by the service**, proven by test 7.1.
- [x] The response contains no model-echoed quote text.
- [x] Over-length transcripts surface the condition and are never silently truncated.
- [x] Redaction applied, mini tier, fail-soft, rate-limited, doctor-scoped — each asserted.
- [x] Exactly one new route, one new service, one new prompt builder.
- [x] Zero PHI in logs.
- [x] The response contract is documented well enough that `vnt-03` never has to guess. See Notes §contract.
- [x] Type-check + lint + targeted suite green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** §1 found no disclosed basis for sending transcript text to a model for chart-drafting.
**Solution:** STOP. No extraction service, route, prompt, or limiter written. Finding recorded here and on `Business/tracks.md` L9.

---

## 📝 Notes

### §1 written answer (2026-08-30)

Re-read `backend/src/constants/recording-attestation.ts` (not taken from the planning note).

**1.1 — what the six clauses disclose**

| # | Clause (verbatim) | Discloses transcription? | Discloses third-party AI on transcript text? | Discloses chart-drafting use? |
|---|---|---|---|---|
| 1 | Every voice and video consult is audio-recorded. You cannot disable this. | No — capture only | No | No |
| 2 | You cannot delete a recording. Deletion is policy-driven and automatic. | No | No | No |
| 3 | The patient has the same access you do, self-serve for 90 days. | No | No | No |
| 4 | Your replays are logged and the patient is notified. | No | No | No |
| 5 | Streaming only. No download, no re-recording, no sharing outside the platform. | No — and "no sharing outside the platform" cuts against sending text to an external model | No | No |
| 6 | Video capture requires explicit patient consent, every single time. | No | No | No |

**None of the six clauses discloses that recordings are transcribed, or that transcript text is processed by a third-party AI model for chart-drafting.**

**1.1.2 — policy version:** `RECORDING_ATTESTATION_POLICY_VERSION === 'DRAFT-REC-D2-UNAPPROVED'`. File header: *"This draft must not ship to production."* Independent block even if a clause were stretched to cover the hop.

**1.2 — pre-existing vs new**

- **Pre-existing (not this task):** voice pipeline already sends *audio* to Whisper / Deepgram. That hop is undisclosed too, and is not this task's to justify or fix.
- **New (this task):** a *second* hop, for a *new* purpose — send `transcript_text` (clinical content) to a mini-tier model to condense a chart-amendment draft. `redactPhiForAI` strips emails/phones only; it does not make this hop consented.

**1.3 — decision:** **STOP.** Do not write the route. Do not treat "audio already leaves the building" as consent for a new purpose. Do not edit the clauses (REC-D2). Unblock is owner/counsel copy that actually discloses this use, plus an approved (non-DRAFT) policy version.

- **Pre-read finding (2026-08-30, planning-time — re-verified at 1.1):** confirmed. Same six clauses, same draft version. §1.3 ended in STOP as predicted.
- The condensation target is the Phase-1 segmenter's cue vocabulary. The closer the draft looks to something a doctor would have typed into the box, the less new surface this phase adds — that is the design goal, not incidental.
- `complaint-parse-service.ts`'s `boundComplaintList` is the closest existing analogue to §5: take an untrusted model response, bind it to something the server independently knows, drop what doesn't bind. Read it before designing the span check.

---

## 🔗 Related Tasks

- [`task-vnt-01-narrative-provenance-table.md`](./task-vnt-01-narrative-provenance-table.md) — records the spans this task produces
- [`task-vnt-03-evidence-tier-proposal.md`](./task-vnt-03-evidence-tier-proposal.md) — consumes this response contract; do not let it start against a guess
- [Prior phase](../../p1-one-box/) — the router this draft re-enters

---

### Locked response contract (for `vnt-03`)

`POST /api/v1/visit-narrative/extract` body: `{ consultationSessionId: uuid }`.

Result (`TranscriptExtractResult`):
- `status`: `ready | queued | processing | failed | missing | over_window`
- `transcriptId`: string | null
- `transcriptChars`: number
- `lines`: `{ text, spanStart, spanEnd }[]` — condensed cue-shaped draft + full-transcript spans. **No quote field.** Slice `transcript_text` at render.
- `droppedCount`: number
- `overWindow`: boolean
- `chunksUsed`: number
- `redactionApplied`: boolean
- `transcriptText`: string | null — full stored `transcript_text` when available, so `vnt-03`/`vnt-04` can slice quotes. **Not** a model-echoed quote field. Added 2026-08-30 in `vnt-04`.

---

**Last Updated:** 2026-08-30
**Completed:** 2026-08-30 (owner override of §1)
**Pattern:** Span-anchored extraction with server-side verification (catalog-binding analogue for un-catalogued text)
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
