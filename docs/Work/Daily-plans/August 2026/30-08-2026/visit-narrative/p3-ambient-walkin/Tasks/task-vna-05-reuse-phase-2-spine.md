# Task vna-05: Reuse the Phase-2 spine (no new AI)

> **Filename:** `task-vna-05-reuse-phase-2-spine.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).
> **Model: Opus (max thinking). Auto must not run this task.**
> ⛔ **BLOCKED — needs `vna-04` green.** §0 is expected to STOP.
> 🎯 **This task mostly *proves* reuse. A large diff here is a failure signal, not progress.**

---

## 📋 Task Overview

Walk a room-audio transcript through the machinery Phase 2 already built and confirm it comes out the other side as a chart amendment the doctor accepts item by item — with no new AI route, no new prompt, no new service, and no drift in the trust model.

The interesting risk here is not that it fails. It is that it *works* and someone improves it along the way: a summariser "because a whole visit is longer than a teleconsult", a bulk-accept "because there are more items", an auto-apply "because the doctor is busy". Each of those is a lock break (VNT-D3 / VNT-D4 / VNT-D5), and each is easier to add here than anywhere else in the program.

**Program / Phase:** visit-narrative · Phase 3 (ambient walk-in)
**Batch:** [`plan-p3-visit-narrative-ambient-walkin-batch.md`](../plan-p3-visit-narrative-ambient-walkin-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md`](./EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md)
**Estimated Time:** ~4 hours
**Status:** ⛔ **BLOCKED — not started**
**Completed:** —

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — extends reach; changes no behaviour

**Current State:** (Phase 2, gate-green 2026-08-30)
- ✅ **What exists:** `POST /api/v1/visit-narrative/extract` (`vnt-02`) — **the one AI route/prompt/service** in this program (VNT-D3). Takes transcript text keyed by session, returns condensed items anchored with character spans, span-verified against the source.
- ✅ **What exists:** `POST /api/v1/visit-narrative/provenance` (`vnt-01` / `vnt-03`) — a second HTTP route but **not** a second AI hop; persists provenance metadata.
- ✅ **What exists:** the evidence-tier proposal (`vnt-03`) — transcript-derived rows render the **verbatim quote**, are per-item accept only, and have **no "Add all"** (VN-DL-12 / VNT-D4).
- ✅ **What exists:** `frontend/components/cockpit/rx/subjective/VisitNarrativeAmendment.tsx` (`vnt-04`) — the amendment host, offered post-hoc, never a live Rx fill (VN-DL-8).
- ✅ **What exists:** `visit_narrative_provenance` (migration `224`) — `doctor_id`, `patient_id`, `appointment_id`, `consultation_session_id`, `transcript_id`, `span_start`, `span_end`, `target_kind`, `accepted_by`, `accepted_at`. Append-only, deny-all RLS, `transcript_id` CASCADE. **No clinical free text** (VN-Q5 = (b)); the only `TEXT` column is `target_kind`.
- ✅ **What exists:** `frontend/lib/telemetry/visit-describe.ts` — `visitDescribeTranscriptShown` / `visitDescribeTranscriptAccepted` with an offered-vs-accepted denominator, plus the Phase-1 `typed` / `dictated` shapes which are byte-locked.
- ✅ **What exists:** a room-audio transcript from `vna-04`, keyed on the walk-in session row from `vna-02`.
- ❌ **What's missing:** the offer for an in-person visit (the surface is currently reached from a teleconsult context), and an answer to VNA-Q2.
- ⚠️ **Notes:** migration `224` is **written but unapplied on dev** (`vnt-01` §4.1–4.4 operator residual). Provenance writes cannot be asserted live until it lands. Do not "fix" this by writing a second table.
- ⚠️ **Notes:** `registerFinalisedComposition` rejects `artifact_kind='transcript'` (rec-28), so `hasTranscript` on the artifact index is permanently false. Phase 2 routed around it via `consultation_transcripts.status`. **Inherit that route; do not repair rec-28 here.**

**Scope Guard:**
- Expected files touched: ≤ 6.
- **Zero new AI routes, prompts, or services** (VNA-D5 / VNT-D3). Not one.
- No change to the extract prompt, the span-verification rule, the proposal's trust model, or the apply path (VNT-D5 — one writer).
- No new auto-apply, no bulk accept for transcript-derived items (VNT-D4 / VN-DL-12).
- No new telemetry source unless VNA-Q2 says so — VN-DL-11's list (`typed` | `dictated` | `transcript`) is closed by default.
- No `ALTER` of `visit_narrative_provenance`. A capture-source column is only in scope if VNA-Q2 explicitly asks for one.
- No change to Phase-1 event shapes — they are byte-locked and `vnt-05` has the tests.
- Any expansion requires explicit approval.

**Reference Documentation:**
- Batch VNA-D5, VNA-D6, VNA-Q2
- [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-DL-8, VN-DL-11, VN-DL-12
- [Phase 2 batch plan](../../p2-transcript-amendment/plan-p2-visit-narrative-transcript-amendment-batch.md) — VNT-D3, D4, D5, D8
- [`task-vnt-04-chart-amendment-surface.md`](../../p2-transcript-amendment/Tasks/task-vnt-04-chart-amendment-surface.md) · [`task-vnt-05-phase-2-gate.md`](../../p2-transcript-amendment/Tasks/task-vnt-05-phase-2-gate.md)

---

## ✅ Task Breakdown (Hierarchical)

### 0. Pre-flight — **expected to STOP**
- [ ] 0.1 `vna-04` gate green (a room-audio transcript exists)? If not → **STOP**.
- [ ] 0.2 Read Phase 2's four surfaces before changing anything: extract route, proposal, amendment host, provenance write. Inventory the AI routes / prompts / services that exist **today** — that inventory is the number this task must not increase.
- [ ] 0.3 Confirm migration `224` is applied on dev, or record that provenance assertions are deferred to the operator (as `vnt-01` §4 did). Do not create a substitute table.

### 1. The offer
- [ ] 1.1 The amendment surface is offered for a walk-in visit with a **completed** transcript, and never before one exists.
- [ ] 1.2 Reached the same way it is for a teleconsult, via the same status source Phase 2 chose (`consultation_transcripts.status`, not the artifact index).
- [ ] 1.3 No offer when consent was declined, when capture never happened, or when transcription failed (`vna-04` §3.2) — an empty amendment offer is worse than none.

### 2. Reuse, verified
- [ ] 2.1 The transcript enters `vnt-02`'s extract route **unchanged** — same route, same prompt, same service, same span verification.
- [ ] 2.2 Span verification still holds for room audio. Longer, messier, multi-speaker text is a stress case, not an exception — if verification rejects, that is the system working.
- [ ] 2.3 The verbatim quote renders; per-item accept only; **no "Add all"** (VN-DL-12).
- [ ] 2.4 Accepting writes one provenance row per item through the **existing** path, with no new columns.
- [ ] 2.5 The apply path is the single writer Phase 1 established (VNT-D5). No second path, no "faster" path for ambient.

### 3. VNA-Q2 — is ambient a distinct source?
- [ ] 3.1 Answer it in writing here, checked against the shipped provenance table rather than from memory.
- [ ] 3.2 Default: **reuse `transcript`** for telemetry (VN-DL-11's list stays closed); distinguish in provenance **only if** a real audit question needs it.
- [ ] 3.3 If a capture-source distinction is warranted, prefer deriving it from data that already exists (the session's modality, the transcript's `composition_sid` convention) over adding a column.
- [ ] 3.4 Whatever the answer: counts only, no text, no quotes, no clinical strings (VN-DL-11).

### 4. Verification & Testing
- [ ] 4.1 **Grep gate:** the AI route / prompt / service inventory from 0.2 is unchanged. Zero additions.
- [ ] 4.2 Phase-2 suites pass untouched (`vnt-02`…`vnt-05`) — VNT-D8 extends here.
- [ ] 4.3 Phase-1 telemetry shapes byte-identical (`vnt-05`'s tests are the lock).
- [ ] 4.4 Offer-visibility tests: completed ⇒ offered; failed / declined / never-captured ⇒ not offered.
- [ ] 4.5 No-bulk-accept and no-auto-apply tests for a room-audio proposal, mirroring `vnt-03`/`vnt-04`'s.
- [ ] 4.6 `npx tsc --noEmit` + lint clean; frontend + backend suites green.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: the amendment host's offer condition (in-person reach)
UPDATE: frontend/lib/telemetry/visit-describe.ts        (only if VNA-Q2 requires it)
CREATE: tests — offer visibility, reuse assertions, no-bulk-accept, no-auto-apply
UPDATE: this file (the VNA-Q2 answer) + the batch plan
```

**Existing Code Status:**
- ✅ `frontend/components/cockpit/rx/subjective/VisitNarrativeAmendment.tsx` — EXISTS. Reach extended; behaviour unchanged.
- ✅ `backend/src/services/visit-narrative-extraction-service.ts` — EXISTS. **Not modified.**
- ✅ `backend/migrations/224_visit_narrative_provenance.sql` — EXISTS (unapplied on dev). **Not altered.**
- ✅ `frontend/lib/telemetry/visit-describe.ts` — EXISTS. Touched only if VNA-Q2 says so.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **A big diff is the failure mode.** This task's value is a proof, not a feature.
- **Longer input is not a licence for a summariser** (VNA-D5). A walk-in transcript being messier than a teleconsult's is not an argument for a new prompt; it is an argument for the doctor reviewing items one at a time, which is what already ships.
- **More items is not an argument for bulk accept** (VN-DL-12). The patient's words are evidence; the doctor asserts them one at a time or not at all.
- **The telemetry source list is closed by default** (VN-DL-11). Widening it is a decision, not an implementation detail.
- **Do not repair rec-28 or apply `224` from inside this task** — both are recorded residuals with owners.
- No PHI in logs; counts only.

**DO NOT include:** code, pseudo-code, function signatures, or DDL in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — reads transcript text, writes provenance metadata via the existing path.
  - [ ] **RLS verified?** Unchanged — `224` deny-all, endpoint-scoped, as Phase 2 shipped.
- [ ] **Any PHI in logs?** Must be **no** — counts only (VN-DL-11).
- [ ] **External API or AI call?** **Yes, the existing one only.** Zero new AI surfaces (VNA-D5).
- [ ] **Retention / deletion impact?** **No new store.** Provenance erasure still inherited via CASCADE from `consultation_transcripts`.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [ ] Zero new AI routes, prompts, or services — grepped against the 0.2 inventory.
- [ ] A room-audio transcript produces a proposal through `vnt-02`'s unchanged route, with spans verified.
- [ ] Verbatim quote, per-item accept, no bulk accept, no auto-apply — all as Phase 2 shipped, tested for the ambient case.
- [ ] Offer appears only for a completed transcript; absent for failed / declined / never-captured.
- [ ] Provenance rows written through the existing path, with no schema change.
- [ ] VNA-Q2 answered in writing; telemetry counts-only; Phase-1/2 event shapes byte-identical.
- [ ] Phase-1 and Phase-2 suites pass untouched.
- [ ] Type-check + lint clean.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

⟨fill as executed⟩

---

## 📝 Notes

- The strongest argument for this whole phase is visible here: after four hard tasks about consent, identity, capture, and transcription, the clinical value arrives for **free**, because Phase 2 built the reader properly. That is also the argument for not touching it.
- If span verification rejects a large share of room-audio items, the finding belongs in `vna-06`'s gate as a measured number — not fixed by loosening the verifier. VNT-D2 chose verification over trust deliberately.

---

## 🔗 Related Tasks

- [`task-vna-04-non-twilio-transcription.md`](./task-vna-04-non-twilio-transcription.md) — produces the transcript
- [`task-vna-06-phase-3-gate.md`](./task-vna-06-phase-3-gate.md) — closes the phase
- [Phase 2 `vnt-03`](../../p2-transcript-amendment/Tasks/task-vnt-03-evidence-tier-proposal.md) · [`vnt-04`](../../p2-transcript-amendment/Tasks/task-vnt-04-chart-amendment-surface.md) — the surfaces being reused

---

**Last Updated:** 2026-08-31
**Completed:** —
**Pattern:** Extend reach, prove behaviour unchanged
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
