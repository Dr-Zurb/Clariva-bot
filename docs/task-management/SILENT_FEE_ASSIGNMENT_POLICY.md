# Silent fee assignment & no tier menu (DM receptionist)

**Status:** Product + engineering policy  
**Primary implementation task:** [e-task-dm-05](../Development/Daily-plans/April%202026/04-04-2026/tasks/e-task-dm-05-silent-fee-menu-closure.md)  
**Related:** [e-task-dm-04](../Development/Daily-plans/April%202026/04-04-2026/tasks/e-task-dm-04-reason-first-triage-silent-assignment.md), [AI_RECEPTIONIST_PLAN.md](./AI_RECEPTIONIST_PLAN.md)

---

## Why this exists

In Instagram DM, showing a **full teleconsult catalog** (General vs NCD vs Other, etc.) pushes patients to **choose a fee tier** that may not match what the clinician or billing expects. Reason-first triage and server-side matcher assignment reduce that risk; this policy closes remaining gaps where **multi-row menus** or **LLM paraphrases** still appear after the user has shared a clinical concern or entered the post-deflection fee path.

---

## Principles

1. **Triage before tariff (default):** If the thread is **clinical-led**, prefer confirming reason → **one** aligned fee surface **or** **staff confirmation** — not “pick your category.”
2. **Two patient-visible outcomes:**  
   - **(A)** A **single** visit-type fee block (modalities for **that** row only), **or**  
   - **(B)** **Staff / practice** will confirm visit type; patient waits; **no payment required yet** (per existing SLA copy).
3. **Server assigns:** `service_key` / visit type comes from **rules + matcher + staff gate** — not from the patient selecting the cheapest row.
4. **LLM is not a third catalog channel:** Open-response generation must not list all tiers when this policy applies; routing should use deterministic composers or staff defer.
5. **Transparency without hijack:** Users who **explicitly** want a full list may be served a separate path (e.g. “all your consultation prices”) **without** breaking the default clinical-first journey.

---

## Approved refinements (microcopy & UX)

- **Explicit promise (one line):** Tell the patient that the practice **matches** what they described to the **correct visit type** and that they **do not need to pick fee options** in chat. Localize (EN / HI / PA) consistent with `reason-first-triage` patterns.
- **Fee follow-ups:** Short replies (**“what is it?”**, **“how much for that?”**) after a fee/payment message must still be treated as **fee continuation**, not generic open AI with full catalog.
- **Optional later:** A dedicated, non-default path for **“full price list”** / power users — documented separately so it does not collide with reason-first state.

---

## Engineering alignment (high level)

| Area | Direction |
|------|------------|
| Matcher + composer | If clinical-led and matcher would show **multiple** rows, **narrow** to one row when confident; otherwise **staff defer** (reuse competing-bucket–style messaging where appropriate). |
| Webhook | Avoid **`ai_open_response`** for fee continuation when clinical-led flags apply; centralize thread signals (deflection, triage phase, post-medical ack). |
| AI system prompt | When policy flag is set, **suppress** verbatim multi-row catalog; instruct **no** tier choice; match existing **competing visit-type buckets** hardening pattern. |

---

## Acceptance (for ops / QA)

- Symptom-led DM → fee question → **no** patient-facing menu of **all** catalog rows unless explicit “list all” escape.  
- Outcome is **narrow quote** or **staff wait** copy with SLA.  
- Transcripts recorded in staging notes linked from e-task-dm-05.

---

**Last updated:** 2026-03-31
