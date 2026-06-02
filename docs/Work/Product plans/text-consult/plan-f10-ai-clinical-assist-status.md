# Plan F10 — AI clinical assist (Plan 10) — status (text-consult slice)

## Single-pane status of the AI rails the text-consult T3 tier hard-depends on

> **Original plan (canonical for delivery history):** [Daily-plans/April 2026/19-04-2026/Plans/plan-10-ai-clinical-assist-deferred.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-10-ai-clinical-assist-deferred.md). Plan 10 spans **all three modalities** (text + voice + video AI assist); this file extracts the text-consult-relevant view.

---

## Headline status

⏸ **EXPLICITLY DEFERRED** by Decision 6 LOCKED. **No code, no tests, no migrations land in v1 from Plan 10.** The plan is parked until trigger conditions are met (see "Unblock triggers" below).

This is the **only foundation plan with material outstanding work that the text-consult tiers genuinely depend on**. Specifically: **5 of the 7 items in [T3 — Clinical workflow](./plan-t3-text-clinical-workflow.md) hard-block on Plan 10.**

---

## Why deferred (master plan Decision 6 LOCKED)

User direction (verbatim from the master plan): *"defer AI assist for now; we should first focus on establishing the main chat system first, AI assistance could be additional layer later."*

Stronger framing: **AI is a multiplier, not a foundation.** Until the v1 delivery layer (text + voice + video, recording governance, mid-consult switching) is proven with real doctor-patient cohorts, AI assist:

- Has nothing real to read (no production transcripts → no real test data).
- Has no quality bar (we don't know what doctors actually need until they're using the product daily).
- Risks building features that doctors don't want when the actual problem is something else.

Plan 10 deliberately preserves the entry points AI assist will plug into:

- `consultation_messages` is **AI-pipeline-friendly by design** — one timestamped narrative across text + attachments + system messages (Plan 06 contract).
- `consultation_sessions` lifecycle hooks (Plan 01 facade) are where pre-consult brief generation will fire.
- Voice transcription pipeline (`backend/src/services/voice-transcription-*.ts`) already produces the audio transcripts for consumption.
- `consultation_modality_history` (Plan 09) gives modality-switch context for coherent post-consult summaries.

---

## What's outstanding (everything)

### Phase D.1 — Pre-consult AI brief

- One LLM call per session, ~5 min before scheduled start.
- Input: prior consult transcripts (text + voice transcripts) + chat attachments.
- Output: 3–5 bullet brief shown in doctor's `<LiveConsultPanel>` side panel.
- Cost: ~$0.005–0.02 per consult (predictable).
- Files (anticipated): `backend/src/services/consultation-ai-brief.ts`, `frontend/components/consultation/ConsultationBriefPanel.tsx`.

### Phase D.2 — Post-consult SOAP + Rx draft

- One LLM call at `consultation_sessions.status='ended'`.
- Input: merged audio + chat + attachment captions, ordered by timestamp.
- Output: SOAP markdown + structured prescription draft.
- Surface: doctor's appointment detail page → "Generate SOAP draft" → review / edit / sign.
- Cost: ~$0.05–0.30 per consult (variable).
- Files (anticipated): `backend/src/services/consultation-ai-soap.ts`, extend `backend/src/workers/consultation-post-session-worker.ts`.

### Phase D.3 — Mid-consult red-flag detection

- Streaming LLM analysis of live transcript + chat.
- **Deferred even within Plan 10** to v2 — high latency + cost concerns + risk of false positives.

### Plan 10 cross-cutting rails (which T3 inherits)

The text-consult roadmap's [T3 tier](./plan-t3-text-clinical-workflow.md) needs all of these from Plan 10 — **none of them ship in v1**:

- **LLM provider routing** (OpenAI / Azure OpenAI / Bedrock fallback).
- **PHI redaction at the wire boundary** before any prompt leaves the backend.
- **Cost guards + rate limits** per doctor, per session.
- **Clinical-prompt library** — prompts like "suggest 3 reply options" are Plan-10 deliverables, not T3 deliverables.
- **Audit log for AI calls** (who triggered, which model, cost, latency, outcome).

---

## Unblock triggers

Plan 10 stays parked until **all** of:

1. ✅ Plans 01 + 02 + 03 + 04 + 05 + 06 shipped to production (v1 alpha) — **DONE.**
2. ✅ Plans 07 + 08 shipped (recording replay + video escalation) — **Plan 07 DONE; Plan 08 status: see voice/video roadmap.**
3. ⏳ Plan 09 shipped (mid-consult switching) — **outstanding.**
4. ⏳ At least 4 weeks of production usage with real doctors + patients on at least 2 of the 3 modalities (need real transcript data, not synthetic).
5. ⏳ Owner-defined acceptance criteria for SOAP / Rx draft quality (likely a doctor-grading rubric on a 50-consult sample).
6. ⏳ LLM cost budget agreed (D.1 cheap, D.2 variable, D.3 expensive — D.3 stays deferred to v2 even within this plan).

If any of those is missing, this plan stays parked.

---

## Impact on the text-consult tier roadmap

### T3 items hard-blocked on Plan 10

| Item | Why blocked |
|------|-------------|
| **T3.18 — Suggested replies** | Needs Plan-10 LLM routing + prompt library + cost guard + audit log. |
| **T3.20 — AI chat summary pane** | Same LLM routing + a dedicated summary prompt + cost guard. |
| **T3.22 — Auto-extract into draft SOAP** | Hooks into Plan 10's draft-SOAP service (which doesn't exist yet). |
| **T3.23 — In-chat translation** | Reuses Plan 10's provider routing for translation calls + same PHI redaction. |

### T3 items NOT blocked on Plan 10 (can ship without it)

| Item | Notes |
|------|-------|
| **T3.19 — Quick-insert templates** | Pure SQL + UI. Doctor-scoped templates table; no AI involved. |
| **T3.21 — Structured intake form** | Pure SQL + UI; new system kinds (`form_request`, `form_response`); no AI. |
| **T3.24 — PHI / sensitive-data redaction warning** | Pure-client regex bank (Aadhaar / PAN / phone / card); no data leaves device. |

So even with Plan 10 deferred, **3 of 7 T3 items can be picked up immediately** if the user wants any text-consult clinical-workflow value pre-Plan-10. T3.19 templates in particular is quick (~5h) and high-value.

### Suggested staging within T3 if shipping ahead of Plan 10

A reasonable mini-batch that doesn't block on Plan 10:

```
T3.19 (templates)       ~5h
T3.21 (intake form)     ~3 days
T3.24 (redaction)       ~6h
Total                   ~4 days
```

This delivers a meaningful "doctor workspace" feel without any AI dependency, then waits for Plan 10 to land before the four AI-driven items (T3.18 / T3.20 / T3.22 / T3.23) are picked up.

---

## Risks if AI assist ships too early (mirrored from original)

| Risk | Mitigation (= reason for deferral) |
|------|------------------------------------|
| Doctors ignore AI bullets because they're wrong / low-value | Don't ship until quality bar agreed against real cohort sample |
| LLM bill explodes from D.3 streaming red-flag detection | D.3 explicitly deferred to v2 even within this plan |
| AI surfaces patient PHI to wrong doctor due to RLS bug | Plan 04's `consultation_messages` RLS policies (now `safe_uuid_sub()`-hardened) are tested in v1; AI consumes via the same policies |
| AI generates incorrect Rx that doctor signs without reading | Drafts are explicitly drafts; review-edit-sign UX must make this obvious. Owner-confirmed UX before D.2 ships. |
| Building AI early eats engineer cycles needed for v1 GA hardening | Hard deferral until v1 GA stable |

---

## How to consume this status

- **If you're picking T3 items today:** pick from {T3.19, T3.21, T3.24} only — see "T3 items NOT blocked" above.
- **If you want all 7 T3 items:** schedule the four AI-driven items behind Plan 10's unblock. Don't try to inline LLM calls without the Plan-10 rails (provider routing / PHI redaction / cost guard / audit) — that's strictly worse than waiting.
- **If you want to unblock Plan 10 itself:** owner check-in after v1 GA stable; verify the trigger conditions above; then split into Phase D.1 → D.2 sub-plans before any code lands.

---

## References

- **Original plan (canonical for history):** [plan-10-ai-clinical-assist-deferred.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-10-ai-clinical-assist-deferred.md).
- **Master plan:** [plan-multi-modality-consultations.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-multi-modality-consultations.md) — Decision 6 LOCKED.
- **Tier with the dependency:** [plan-t3-text-clinical-workflow.md](./plan-t3-text-clinical-workflow.md).
- **Tier roadmap:** [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md).

---

**Status:** ⏸ Parked. No work scheduled. Trigger conditions documented above; owner check-in after v1 GA stable.  
**Re-homed under text-consult roadmap:** 2026-04-28.
