# Plan T6 — EHR AI assist (DEFERRED)

## Auto-draft the Rx from the consultation chat / voice transcript so the doctor edits instead of types

> **Read-order:** [README.md](./README.md) → [plan-f01](./plan-f01-prescription-foundation-status.md) → [plan-00](./plan-00-ehr-roadmap.md) → tiers T1–T5 → **plan-t6 (this file)**.
>
> **Status:** ⏸ **DEFERRED.** Per Decision E3 in plan-00. Parked on (a) V1 GA — T1 + T2 + T3 must be in production, (b) AI budget approval — per-Rx LLM cost ceiling, (c) PHI / compliance review for sending consult bodies to a third-party LLM provider.
>
> **Effort (when revisited):** ~3 dev-days for the 5 items.
>
> **Schema:** None. Reuses `consultation_messages` + `consultation_transcripts` + `prescriptions` + (optional) `prescription_ai_drafts` if persistence is needed.

---

## Why this is parked, not killed

AI auto-draft is the highest-impact-per-dev-day item on the entire EHR roadmap **once T1–T5 are mature**. It's also the single feature most likely to undermine doctor trust if shipped early. The order matters:

1. **The structured form must stand on its own first.** If T2's templates + autocomplete + autosave already get a Rx written in 60 seconds, the AI's job is reducing that to 30 seconds. If the form takes 5 minutes today, no AI can save it — the bottleneck is the form.
2. **We need usage data to know what fields the AI should fill.** Doctors might never use "patient education" in V1; we shouldn't optimize the AI for it. T1 + T2 telemetry tells us which fields matter.
3. **PHI sent to LLMs needs a separate compliance pass.** Consultation bodies (chat / voice transcript) ARE PHI. Sending them to OpenAI / Anthropic / etc. requires:
   - BAA with the provider (or self-hosted model).
   - Patient consent disclosure (already in privacy policy? verify).
   - Data-residency story (model endpoint region).
   - Logging / retention story (we don't keep the prompt+response in our logs after the response is consumed).
4. **AI cost per Rx caps the unit economics.** GPT-4o ~ $0.005–$0.015 per draft (rough). At scale, this becomes a real line item; we should ship after we've validated unit economics with the basic flow.

When V1 GA + telemetry + compliance review are all green, this plan unparks immediately. Until then, T6 is on the wall, not in the sprint.

---

## What "AI assist" means in this context

Five items, in priority order if and when this tier ships:

### T6.26 — Auto-draft Rx from consult artifacts (call-end action)

**Status:** ⏸ Deferred. **Effort (when revisited):** 1.5 day.

**Spec sketch.** When a consult ends:

- For text consults: collect last N (~50?) `consultation_messages` for this `session_id`.
- For voice/video consults: load `consultation_transcripts` for this `session_id` (text-consult Plan 07 / video-consult D2).
- Plus chart context: T1's allergies + chronic conditions + last 3 prescriptions, summarized.

Send to the configured LLM with a system prompt asking for a JSON object matching the `prescriptions` payload shape. Validate output, surface in form pre-filled with a "Drafted by AI — review before sending" banner. Doctor edits and sends as normal (auto-save + soft guards still apply).

**Open questions to resolve at unpark time:**

- Which LLM provider? (OpenAI / Anthropic / self-hosted?)
- Streaming UI or one-shot fill?
- Cost per draft cap?
- Handling of low-confidence fields (highlight them differently? Suggest as chips for the doctor to accept/reject?).

---

### T6.27 — Allergy & chronic-condition extraction from chat / transcript

**Status:** ⏸ Deferred. **Effort:** 0.5 day.

**Spec sketch.** Same artifacts as T6.26. Separate task in the same LLM call (or follow-up cheap call): extract `{ allergies: [], chronic_conditions: [] }`. Surface as one-tap-add chips in the chart panel (T1.3). Doctor reviews + clicks "Add to chart" per chip.

This adds value even if T6.26 isn't used — it makes the chart panel self-populating from conversation, addressing the "doctors don't fill in the chart" risk in T1.

---

### T6.28 — Drug recommendation hints

**Status:** ⏸ Deferred. **Effort:** 0.5 day.

**Spec sketch.** From chat + draft diagnosis, propose 1–3 commonly-prescribed drugs with structured fields pre-filled (drug_master_id, dosage, frequency, duration). Surface as "Suggested" chips above the medicines section. Doctor taps to add as a `<MedicineRow>`.

Risk surface: liability. Mitigation: every suggestion shows the source ("Based on your draft diagnosis 'Acute pharyngitis' — typical first-line: Amoxicillin 500mg TID 7 days") and is opt-in only.

---

### T6.29 — Patient-facing Rx explanation in plain language

**Status:** ⏸ Deferred. **Effort:** 0.25 day.

**Spec sketch.** The patient page (T3.16) gets an "Explain in plain language" toggle. When on, an LLM rewrites the Rx into patient-friendly text:

- "You have an upper respiratory infection (a viral cold)."
- "Take Paracetamol 500mg three times a day for 5 days, after meals, to help with fever and body ache."
- "If you're not feeling better in 3 days, please come back."

Doctor preview surfaces in T3.18 ("Patient view") as a separate tab.

**Caveat.** Translation / simplification is a high-trust surface — wrong drug name in plain language is dangerous. Validation: the rewriter MUST preserve drug names + dosages exactly; only NARRATIVE around them is rewritten. Test with golden-set evals.

---

### T6.30 — ICD-10 / SNOMED coding assist (when ICD ships)

**Status:** ⏸ Deferred AND blocked on Decision E4 reversal. **Effort:** 0.25 day.

**Spec sketch.** When the diagnosis field is structured (ICD-10 codes), an LLM proposes the top-3 codes for a given free-text dx. Doctor picks one. Out of scope until ICD-10 enters the roadmap.

---

## Dependencies (what must ship before T6 unparks)

- **T1 fully shipped.** Chart context tables exist; the AI's "extract allergies / conditions" output has somewhere to land.
- **T2 fully shipped.** Drug master + structured medicine fields exist; the AI's draft can use canonical drug IDs (else allergy/DDI checks regress to free-text matching).
- **T3 fully shipped.** Patient-facing PDF + share link in production; T6.29's plain-language explainer hangs off it.
- **V1 GA (≥30 days production).** Telemetry shows which fields matter, what doctors actually fill, what they leave blank. AI prioritization comes from this signal.
- **Compliance review.** PHI to LLM data-flow approved. BAA / DPA in place with chosen provider. Privacy policy updated.
- **AI budget.** Per-Rx LLM cost ceiling agreed. ~$0.01/draft at GPT-4o today; <$10/month per active doctor at typical volume — but verify with finance.

---

## When to unpark

Trigger conditions (any one starts the conversation; all four start the build):

1. Doctor NPS / qualitative feedback flags "wish the form filled itself" as the #1 ask.
2. Doctor activation rate (% writing ≥5 Rx in first week) is below target AND telemetry shows draft-time as the bottleneck.
3. ≥1 competitor ships a credible AI-draft EHR experience that doctors compare us to.
4. AI cost-per-call drops materially (e.g. open-source clinical models become cheap to self-host) — changes unit economics.

Until then: keep the placeholder, keep the mental model, build the foundation that makes AI's job small when it arrives.

---

## Decisions to LOCK at unpark time (currently OPEN)

| ID | Question | Default leaning |
|----|----------|-----------------|
| **T6-D1** | LLM provider — OpenAI / Anthropic / self-hosted (Llama/Mistral) / Indian-cloud-hosted? | Anthropic Claude 3.5 Sonnet (best-in-class clinical reasoning today; HIPAA-eligible BAA). Revisit at unpark. |
| **T6-D2** | Auto-fire on call-end vs. manual "Draft with AI" button? | Manual button. Auto-fire creates "AI did it without me asking" anxiety; explicit invocation is doctor-controlled. |
| **T6-D3** | Persist AI drafts in a separate table (`prescription_ai_drafts`) or merge into the same `prescriptions` row with a flag? | Separate table — keeps the audit trail clean (we know what AI proposed vs. what doctor sent), and lets us evaluate model performance. |
| **T6-D4** | Stream the response (token-by-token) or one-shot fill? | One-shot. Streaming creates anxiety mid-population; one-shot is "review and edit". |
| **T6-D5** | Confidence scoring per field — show numerically (87%) or visually (bar/dot)? | Visual only. Numerical scores invite over-trust of "98%" and dismissal of "60%". |
| **T6-D6** | What happens on LLM failure (timeout, rate limit, parsing error)? | Silent degrade — form remains empty (or with whatever the doctor had). Show a small error toast: "AI draft unavailable — please fill manually." |

---

## Out of scope (even at unpark)

- Diagnostic AI ("here's what the patient probably has") — too high-stakes for this tier; would need its own plan.
- Patient-side AI chat ("ask the AI about your prescription") — not on EHR roadmap; future patient-portal initiative.
- Predictive medication adherence / refill prompting — not on EHR roadmap.
- AI-generated patient-education content (custom per Rx) — covered by T6.29 (plain-language explanation), no further generation.
- Cross-patient learning ("doctors prescribing X for Y often add Z") — privacy concerns; out of scope.
- Voice-to-text dictation directly into form fields — separate accessibility line, not AI-assist tier.

---

## Symmetric deferred status

The text-consult roadmap has [`plan-f10-ai-clinical-assist-status.md`](../text-consult/plan-f10-ai-clinical-assist-status.md) — also deferred, also blocked on similar gates. When T6 unparks, it may make sense to consolidate the AI work into a single cross-tier "AI-assist" sprint covering both EHR and consult-channel surfaces. That decision lives at unpark time.

---

**Created:** 2026-05-03. **Status:** ⏸ DEFERRED. **Owner:** TBD at unpark. **Last reviewed:** 2026-05-03.
