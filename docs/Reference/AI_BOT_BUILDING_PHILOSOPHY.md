# AI Bot Building Philosophy (Clariva Receptionist)

**When to use this file:** **Optional.** Open it only when the product owner or lead **explicitly** asks to align a change with this document. It is **not** a default gate for every PR or agent turn—follow team instructions and tickets first.

**Purpose:** Reference for *how* we prefer to build conversational and classification logic: **LLM-first**, deterministic code for execution and facts. Use it to avoid drifting into brittle regex sprawl—**not** as permission to add new regex or keyword lists unless explicitly requested for that task.

**Audience:** Engineers and AI agents who were asked to read it for a specific refactor or design review.

**Related:**
- [Service catalog matching — Stage A and Stage B](../Development/service-catalog-matching-stages.md) — **exception to “LLM first” for visit→service routing:** deterministic pass runs first; LLM allowlist only when Stage A returns no match (see doc for code map).
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](./RECEPTIONIST_BOT_CONVERSATION_RULES.md) — intent map, three-layer pattern, anti-patterns (keep in sync mentally with this doc)
- [PRIVACY_BY_DESIGN.md](./PRIVACY_BY_DESIGN.md), [COMPLIANCE.md](./COMPLIANCE.md) — PHI, safety copy, consent
- [DECISION_RULES.md](./DECISION_RULES.md) — when docs conflict, resolution order
- [STAFF_FEEDBACK_LEARNING_INITIATIVE.md](../task-management/STAFF_FEEDBACK_LEARNING_INITIATIVE.md) — learning from staff confirm/reassign (opt-in autobook; privacy-first)

---

## 1. Product stance: AI first, regex only when explicitly requested

- **Default:** Use **structured LLM calls** (JSON / `json_object`) to interpret open-ended user text—intent, slots, visit reasons, confirmations, multi-field blobs. Extend **prompts + regression tests**, not pattern files.
- **Regex, hardcoded keyword lists, and brittle `if (text matches X)` chains** are **not** the default way to ship behavior. Add or extend them **only when the product owner explicitly asks** for that approach on a given task (e.g. a closed menu, latency-critical emergency phrase, or compliance-mandated copy).
- **Open-ended patient language is effectively infinite.** Regex-only extraction for reasons, names, and mixed one-line messages is a **fallback** when the model is unavailable or returns nothing—not the primary path.
- **Cost:** Prefer flags, caching, smaller models, and narrow prompts over saving tokens at the cost of wrong routing or empty slots.

We ship a receptionist that feels intelligent; the **primary** tool is the model, not a growing rules engine.

**Conversation sense (like modern LLMs):** Treat user messages as **replies to the last assistant turn** in the same thread. Prefer **structured LLM + last-message context** over isolated keyword matching for routing decisions (consent, confirm details, optional notes). See §4.8.

---

## 2. What works: LLM-first understanding, system-first facts

| Role | Who owns it |
|------|-------------|
| **Interpret** open text (intent, topics, slots, visit reasons, dialog act) | LLM with **structured output** (JSON schema / `json_object`), validated in code |
| **Execute** bookings, payments, state transitions | Deterministic code + DB |
| **Surface facts** (fees, hours, URLs, ₹ amounts) | DB / `doctor_settings` / server-rendered blocks—injected into prompts or appended after generation; **never** trust the model to invent prices or links |

**Guiding line:** *The model interprets; the platform executes; facts come from the database.* (Same as conversation rules.)

---

## 3. Recommended default: LLM primary, minimal deterministic fallback

1. **Primary path** — LLM → structured fields (intent, reasons[], patient slots, `dialog_action`, etc.) whenever the input is natural language or could mix several intents.
2. **Fallback** — Regex or lightweight parsers **only** when the API is down, the model returns empty, or a feature flag disables AI—keep fallback **small** and **best-effort**, not a parallel rules engine.
3. **Optional fast path** — Only if **explicitly** specified for that surface: e.g. fixed emergency keywords, strict grammars (phone normalization, ISO dates). Not a substitute for understanding user text.

Feature flags should flip AI vs fallback—not duplicate logic in three keyword files.

---

## 4. Broken strategies (do not repeat)

These patterns look productive in the short term and become technical debt immediately.

### 4.1 Regex / list sprawl for open vocabulary

- Adding patterns for each new way patients say “blood sugar”, kinship (“nani”, “boss”), fee questions, or visit reasons.
- **Why it breaks:** Unbounded linguistic variation; multilingual text; typos; mixed intent in one message.
- **Instead:** Structured LLM extraction + regression corpus; keep regex for **closed** sets only (e.g. “yes/1/ok” for a confirmed menu).

### 4.2 Sentence-by-sentence special cases in one giant function

- Long chains of `if (text matches X) strip Y` for “quality” snippets without a single structured extraction step.
- **Why it breaks:** Order-dependent bugs, untestable combinations, no single source of truth.
- **Instead:** One structured step (reasons array, dialog act) + formatting; unit tests on JSON shapes.

### 4.3 Letting the model freely generate money, URLs, or policy

- **Why it breaks:** Hallucinated fees, wrong payment links, compliance risk.
- **Instead:** Authoritative blocks from DB; model chooses *which* block or *whether* to ask a clarifying question—not the digits.

### 4.4 AI-only with no fallback or no audit

- **Why it breaks:** Outages, schema drift, silent bad behavior in production.
- **Instead:** Validated JSON, safe fallback path, structured audit events where PHI is redacted per policy.

### 4.5 Duplicate “classification” in three places

- Webhook heuristics, `ai-service` fast regex, and another keyword file all trying to detect the same thing (e.g. fee thread continuation).
- **Why it breaks:** Contradictory behavior by branch order; impossible to reason about.
- **Instead:** One canonical classifier output or shared helper; handler consumes structured result.

### 4.6 Regex-only extraction for “reason for visit” and multi-field blobs

- Guessing **visit reason** from a few keywords (`i have …`, symptom lists) while **ignoring** “i took …”, medication names, or **single-line** messages that start with `Firstname Lastname` (the whole line can be misclassified as “name-like,” so **reason never fills**).
- **Why it breaks:** Real patients send **one message** with name + age + phone + meds; regex order and `split()` heuristics are not a substitute for understanding.
- **Instead:** **Structured LLM extraction** with **thread context** (prior turns already contain BP story, stability, tablets). Merge with **guards**: never treat **affirmation** (“yes confirm that”, “correct”) as `name` or `reason_for_visit`. Prefer **`dialog_act`: `provide_details` vs `confirm_summary`** before overwriting slots.

### 4.7 Asking the user to repeat what the thread already contains

- Rigid templates (“send **all** of these in one message”) that re-ask for BP / tablets when the user **just said** them in the same conversation.
- **Why it breaks:** Feels dumb, increases drop-off; fights the “intelligent receptionist” stance in §1.
- **Instead:** **Summarize or quote** what you already have; ask only for **genuinely missing** fields. Pass a **consolidated reason snippet** (from state + recent messages) into prompts, not a blank form every time.

### 4.8 Keyword-first routing without **dialog context** (same word, different meaning)

- Applying a global rule like “`no` = deny consent” **before** knowing **what the assistant last asked**. Example: after *“Anything else you’d like the doctor to know? (optional)”*, the user says *“no that’s it”* meaning *no extra notes* — not *deny using my contact details*. Keyword-only logic clears data and ships the wrong reply.
- **Why it breaks:** Humans (and LLMs) resolve meaning from **last question + thread**; a static keyword list does not.
- **Instead:** **Context before keywords:** pass the **last assistant message** (or structured `lastPromptKind`) into classifiers; detect **optional-extras** vs **bare consent** (`booking-consent-context.ts`, `resolveConsentReplyForBooking` in `ai-service.ts`). Use **skip-extras** phrases and **semantic consent JSON** when the fast path would confuse *decline* with *refuse consent*. Same pattern for confirm-details vs other “yes/no” steps.

**Human-like bar:** The bot should behave like a good receptionist: **understand the turn**, then act — not fire the first keyword match in the file.

---

## 5. When deterministic logic is still correct

Use **code**, not LLM, when the domain is **closed** and **safety-critical**:

- **Emergency / urgent triage** — Known phrase lists + immediate escalation paths (latency-sensitive).
- **Compliance templates** — Fixed localized copy for medical deflection / emergency (`resolveSafetyMessage` style).
- **Strict grammars** — ISO dates after parse, phone normalization, “pick option 2” after a numbered menu.
- **Idempotent guards** — Rate limits, deduplication, consent record writes.

If you are unsure whether the domain is closed: assume it is **open** and prototype with structured LLM first; narrow to deterministic only with evidence (logs + tests).

---

## 6. Implementation checklist (use only when someone asked you to follow this doc)

- [ ] Is this message class **open-ended**? If yes, is there a **structured LLM** path rather than new regex?
- [ ] Do ₹ amounts / URLs / legal text come from **server or DB**, not raw model output?
- [ ] Is there a **flagged fallback** and **logging/audit** for the AI path?
- [ ] Did we add or extend a **regression test or corpus entry** for routing quality (see ops tasks under `docs/Development/Daily-plans`)?
- [ ] Does this duplicate logic elsewhere? If yes, **consolidate** the source of truth.
- [ ] Does this touch **staff-feedback learning** or autobook? If yes, follow **§9** and [STAFF_FEEDBACK_LEARNING_INITIATIVE.md](../task-management/STAFF_FEEDBACK_LEARNING_INITIATIVE.md) (privacy charter, opt-in, no raw PHI by default).
- [ ] **Booking intake:** Does extraction use **thread context** for visit reason where the user already explained symptoms/BP/meds? Are **confirmation replies** routed **before** slot merge so they do not overwrite **name** / **reason**?
- [ ] **Consent / optional extras:** Does routing use **last assistant message** (or `lastPromptKind`) so **“no / that’s it”** after an **optional extras** question is not treated as **deny consent** (§4.8)?
- [ ] **Consent / detail confirmation:** Prefer **semantic classification** (paraphrase, multilingual) for “yes / I consent / yes correct” rather than **exact-string-only** gates that drop into free-form generation without the real **booking URL** (see `resolveConsentReplyForBooking`, `resolveConfirmDetailsReplyForBooking` in `ai-service.ts`).

---

## 7. Code map (where this philosophy applies)

Use this when triaging refactors or new features—**not** exhaustive, but the usual surfaces:

| Area | Typical files | Bias |
|------|----------------|------|
| Intent + comment classification | `ai-service.ts` | LLM + small fast paths |
| Visit reason / triage snippet | `resolveVisitReasonSnippetForTriage` (`ai-service.ts`); `reason-first-triage.ts` for routing/deferral + **fallback** distillation only | **LLM primary** (structured `reasons[]`). **Do not** add per-symptom / per-phrase regex in `reason-first-triage.ts` to chase new complaints — update the visit-reason system prompt + regression tests instead (§4.1). Fallback stays minimal and best-effort. |
| Fee tier / fee thread | `consultation-fees.ts`, `dm-turn-context`, DM webhook | Structured signals; avoid keyword arms race |
| Service catalog match | `service-catalog-deterministic-match.ts` | Hybrid: high-confidence deterministic + LLM map-to-id when needed |
| Patient fields | `collection-service` (`validateAndApplyExtracted`), `extract-patient-fields.ts` | **Structured LLM extraction first** whenever slots are missing; `extract-patient-fields.ts` is **fallback** if the model returns nothing (no API key, empty JSON). Do **not** extend regex heuristics in `extract-patient-fields.ts` unless explicitly asked—prefer prompt + tests in `extractFieldsWithAI`. Merge **validation** in code (symptom/gender guards), not new keyword lists for NLU. |
| Time / date NL | `date-time-parser.ts` | Parser + optional LLM for hard cases |
| Consent & confirm replies | `consent-service.ts` (`parseConsentReply` fast path), `utils/booking-consent-context.ts`, `ai-service.ts` (`resolveConsentReplyForBooking`, `resolveConfirmDetailsReplyForBooking`) | **Context first:** optional-extras vs bare consent (§4.8); then keywords; **LLM JSON** when unclear so “no that’s it” doesn’t become consent denial. |

---

## 8. Revision policy

This file is **not** automatically part of every release checklist—update it when someone explicitly uses it for a design decision or when the lead asks to refresh it.

When product priorities change (e.g. stricter cost caps), **update this file** and [RECEPTIONIST_BOT_CONVERSATION_RULES.md](./RECEPTIONIST_BOT_CONVERSATION_RULES.md) together so “quality first” vs “cost first” does not fork across docs.

When **staff-feedback learning** behavior or **autobook thresholds** change, update **§9** and [STAFF_FEEDBACK_LEARNING_INITIATIVE.md](../task-management/STAFF_FEEDBACK_LEARNING_INITIATIVE.md) so manual catalog rules vs learned policies stay aligned.

---

## 9. Learning from staff feedback (smart receptionist v2)

**Not a replacement** for §2–3: the model still **interprets**; the platform **executes**. Learning **labels** come from **staff confirm / reassign** (and optional short internal notes), not from inventing rules per phrase.

| Rule | Why |
|------|-----|
| **Generalize, don’t memorize** | Prefer **structured** matcher outputs (reason codes, candidates, modalities, bucket flags) for “similar case.” **Do not** ship v1 learning that stores **raw patient** messages in new tables without a **privacy + legal** sign-off ([PRIVACY_BY_DESIGN.md](./PRIVACY_BY_DESIGN.md)). |
| **Enough examples** | No **auto-finalize** / autobook until **thresholds** are met; cold start stays on matcher + staff review. |
| **Consent before automation** | **Notify** the doctor when a **stable pattern** exists; **explicit opt-in** before any behavior that skips staff review or auto-applies a visit type. |
| **Audit** | Every auto decision must be **explainable** (policy id, pattern summary, counts) and **reversible** (disable policy). |
| **No silent global training** | Cross-tenant learning is **out of scope** unless separately productized; default is **per-doctor** (or per-practice) scope. |
| **Structured-first learning** | v1 **does not** require a learning-specific LLM: aggregation and policy match use **structured** fields + counts. **Optional** semantic similarity (embeddings / LLM) is **gated**. Open-ended **patient** text is still handled by the **existing** matcher NLU where appropriate — see [plan §1a](../Development/Daily-plans/April%202026/12-04-2026/plan-staff-feedback-learning-system.md#1a-structured-first-vs-optional-nl--ai-clarify-scope). |

**Plan:** [plan-staff-feedback-learning-system.md](../Development/Daily-plans/April%202026/12-04-2026/plan-staff-feedback-learning-system.md) — **tasks:** [e-task-learn-01](../Development/Daily-plans/April%202026/12-04-2026/tasks/e-task-learn-01-privacy-and-data-contract.md) … [e-task-learn-05](../Development/Daily-plans/April%202026/12-04-2026/tasks/e-task-learn-05-assist-ui-and-gated-autobook.md).
