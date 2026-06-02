# Plan 10 — AI clinical assist (Phase D — explicitly deferred until v1 delivery is proven)

## Parking plan: capture the design + entry points so the work can pick up cleanly post-v1

> **Master plan reference:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 6 (AI clinical assist deferred until delivery layer is solid) **LOCKED**.
>
> **Sequencing index:** [plan-00-multi-modality-implementation-index.md](./plan-00-multi-modality-implementation-index.md). Hard depends on **all of Plans 01–09 + post-launch operational data**. No work happens here in v1.

---

## Status

🛑 **DEFERRED.** No code, no tests, no migrations land in v1 from this plan.

This plan exists to:
1. Capture the locked design intent so it isn't lost between v1 ship and AI assist resumption.
2. Document the entry points the v1 plans (01–09) deliberately preserve so AI assist plugs in cleanly later.
3. Document the **trigger conditions** that would unblock work on this plan.
4. Hold the orphan task that the master plan moved out of v1 scope (Task 22).

---

## Goal (when this plan eventually runs, not in v1)

When AI clinical assist is unblocked, this plan ships three layers:

- **Pre-consult AI brief** — fired N minutes before consult start. Reads patient's prior consult history (text transcripts + voice transcripts + chat attachments) and generates a 3–5 bullet brief shown in the doctor's `<LiveConsultPanel>` side panel.
- **Mid-consult red-flag detection** — listens to the live transcript stream + chat messages; surfaces "consider checking BP" / "this could be cardiac" callouts to the doctor (not the patient).
- **Post-consult SOAP + Rx draft** — fires on `consultation_sessions.status='ended'`. Reads merged audio + chat transcript + attachments; produces a SOAP-format markdown draft + structured prescription draft for the doctor to review/edit/sign.

All three are **drafts** — never auto-sent to the patient. Doctor reviews, edits, signs.

---

## Why this is deferred

User direction (master plan Decision 6 LOCKED): *"defer AI assist for now; we should first focus on establishing the main chat system first, AI assistance could be additional layer later."*

Stronger framing: **AI is a multiplier, not a foundation.** Until the foundation (text + voice + video delivery, consent + recording governance, mid-consult switching) is proven with real doctor + patient cohorts, AI assist:

- Has nothing real to read (no production transcripts → no real test data).
- Has no clear quality bar (we don't know what doctors actually need until they're using the product daily).
- Risks building three AI features that doctors don't want, when the actual problem is something else (UX, latency, billing).

Plans 01–09 deliberately preserve the entry points AI assist will plug into:
- `consultation_messages` table is AI-pipeline-friendly by design (one timestamped narrative across text + attachments + system messages — Plan 06's contract).
- `consultation_sessions` lifecycle hooks (Plan 01's facade) are where pre-consult brief generation will fire.
- Voice transcription pipeline (Plan 05's `voice-transcription-service.ts`) produces the audio transcripts AI assist consumes.
- `consultation_modality_history` (Plan 09) gives AI assist the modality-switch context for coherent post-consult summaries.

---

## Trigger conditions to unblock work on this plan

Don't start AI assist until **all** of:

1. ✅ Plans 01 + 02 + 03 + 04 + 05 + 06 shipped to production (v1 alpha).
2. ✅ Plan 07 + 08 shipped (recording replay + video escalation work), so AI assist has real consent-bounded artifacts to read.
3. ✅ Plan 09 shipped (mid-consult switching), so post-consult SOAP can handle multi-modality session narratives correctly.
4. ✅ At least 4 weeks of production usage with real doctors + patients on at least 2 of the 3 modalities (need real transcript data, not synthetic).
5. ✅ Owner-defined acceptance criteria for what "good" means for SOAP / Rx draft quality (likely a doctor-grading rubric on a 50-consult sample).
6. ✅ LLM cost budget agreed (D.1 pre-consult brief is cheap and predictable; D.3 mid-consult red-flag is the expensive one and stays deferred to v2 even within this plan — see "Phase split" below).

If any of those is missing, this plan stays parked.

---

## Phase split (when work resumes)

When this plan unblocks, internally split into three sub-plans, sequenced:

### Phase D.1 — Pre-consult AI brief (lowest cost, highest immediate value)

- One LLM call per session, ~5 min before scheduled start.
- Input: prior consult transcripts + chat attachments (last N consults with this doctor or last N total).
- Output: 3–5 bullet brief: "patient mentioned chest pain in last 2 of 4 consults / on metformin / mentioned anxiety re: travel".
- Surface: side panel in `<LiveConsultPanel>` (doctor only).
- Cost: ~$0.005–0.02 per consult. Predictable.
- Files (anticipated): `consultation-ai-brief.ts`, `ConsultationBriefPanel.tsx`.

### Phase D.2 — Post-consult SOAP + Rx draft

- One LLM call per session at `consultation_sessions.status='ended'`.
- Input: merged audio + chat + attachment captions, ordered by timestamp.
- Output: SOAP markdown + structured prescription draft.
- Surface: doctor's appointment detail page → "Generate SOAP draft" button → review → edit → sign.
- Cost: ~$0.05–0.30 per consult. Variable based on length.
- Files (anticipated): `consultation-ai-soap.ts`, `consultation-post-session-worker.ts` (extend Plan 05's existing worker).

### Phase D.3 — Mid-consult red-flag detection (defer EVEN within this plan to v2)

- Streaming LLM analysis of the live transcript + chat.
- High latency + cost concerns + risk of false positives that cry-wolf the doctor.
- Defer further until D.1 + D.2 are deployed and quality data exists.
- Files (anticipated): `consultation-ai-redflag.ts`, frontend live-banner component.

---

## Tasks parked here

| # | Task (originally from master plan) | Status |
|---|---|---|
| 22 | D.1 — Pre-consult AI brief (originally targeted v1 video flow) | **DEFERRED** per Decision 6 LOCKED. Move into Phase D.1 above when this plan unblocks. |

(No new tasks created in v1 from this plan.)

---

## Files expected to touch (anticipated, when work resumes)

- `backend/src/services/consultation-ai-brief.ts` (new)
- `backend/src/services/consultation-ai-soap.ts` (new)
- `backend/src/services/consultation-ai-redflag.ts` (new — D.3, deferred-within-deferred)
- `backend/src/workers/consultation-post-session-worker.ts` (extend Plan 05's existing worker)
- Hook into existing `prescription-service.ts#createPrescription` for Rx draft persistence (single call site to extend; no schema changes anticipated).
- `frontend/components/consultation/ConsultationBriefPanel.tsx` (new — side panel)
- `frontend/components/consultation/SoapDraftReviewer.tsx` (new — appointment detail page)

None of these are touched in v1.

---

## Risks if AI assist ships too early

| Risk | Mitigation (= the reason for the deferral) |
|------|---------------------------------------------|
| Doctors ignore AI bullets because they're wrong / low-value | Don't ship until quality bar agreed against real cohort sample |
| LLM bill explodes from D.3 streaming red-flag detection | D.3 explicitly deferred to v2 even within this plan |
| AI surfaces patient PHI to wrong doctor due to RLS bug | Plan 04's `consultation_messages` RLS policies are tested in v1; AI consumes via the same policies |
| AI generates incorrect Rx that doctor signs without reading carefully | Drafts are explicitly drafts; review-edit-sign UX must make this obvious. Owner-confirmed UX before D.2 ships. |
| Building AI early eats engineer cycles that were needed for v1 GA hardening | Hard deferral until v1 GA is stable |

---

## Decision log entry (mirrored from master plan for quick read)

> **2026-04-19 — Decision 6 (AI clinical assist sequencing) → DEFERRED beyond v1 entirely.** Original recommendation was "v2 for live red-flag detection, v1 for pre/post AI brief". User direction is stronger: get core text + voice delivery layer working first, AI assist (all of Phase D) is an additive layer shipped after Phases A + C + B + E are proven. AI is a multiplier, not a foundation. Sequencing updated; Phase D moved from concurrent-with-Phase-A to last-after-everything. Task 22 (pre-consult brief) moved to deferred state. — directed by user.

---

## References

- **Master plan:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 6 LOCKED.
- **Plan 04:** `consultation_messages` schema is AI-pipeline-friendly by design.
- **Plan 05:** voice transcription pipeline produces the audio transcripts D.2 consumes.
- **Plan 06:** unified narrative across modalities (system messages, attachments) is what AI assist reads.
- **Plan 09:** modality history gives AI assist the cross-modality context for coherent post-consult summaries.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** ⏸ Parked. No work scheduled. Trigger conditions documented above; owner check-in after v1 GA stable.
