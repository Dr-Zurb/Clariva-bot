# AI Bot Building Philosophy (Clariva Receptionist)

**Purpose:** Stable reference for *how* we build conversational and classification logic so we do not drift into brittle, unmaintainable strategies. Read this before adding regex lists, keyword matchers, or new LLM calls.

**Audience:** Engineers and AI agents editing `backend` DM/comment flows, `ai-service`, triage, fees, and catalog matching.

**Related:**
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](./RECEPTIONIST_BOT_CONVERSATION_RULES.md) — intent map, three-layer pattern, anti-patterns (keep in sync mentally with this doc)
- [PRIVACY_BY_DESIGN.md](./PRIVACY_BY_DESIGN.md), [COMPLIANCE.md](./COMPLIANCE.md) — PHI, safety copy, consent
- [DECISION_RULES.md](./DECISION_RULES.md) — when docs conflict, resolution order
- [STAFF_FEEDBACK_LEARNING_INITIATIVE.md](../task-management/STAFF_FEEDBACK_LEARNING_INITIATIVE.md) — learning from staff confirm/reassign (opt-in autobook; privacy-first)

---

## 1. Product stance: quality over cheap heuristics

- **Open-ended patient language is effectively infinite.** Regex and fixed synonym lists cannot keep up; every “improvement” becomes another branch and another regression.
- **Prefer spending model tokens** on understanding and structuring user input where the alternative is an ever-growing pattern file.
- **Do not optimize for minimal API calls** at the expense of nonsensical summaries, wrong fee routing, or dropped intent. Cost controls should use flags, caching, smaller/faster models, and *narrow* prompts—not pretending English+Hinglish+typos are finite.

This is a deliberate tradeoff: we ship a receptionist that feels intelligent, not a whack-a-mole rules engine.

---

## 2. What works: LLM-first understanding, system-first facts

| Role | Who owns it |
|------|-------------|
| **Interpret** open text (intent, topics, slots, visit reasons, dialog act) | LLM with **structured output** (JSON schema / `json_object`), validated in code |
| **Execute** bookings, payments, state transitions | Deterministic code + DB |
| **Surface facts** (fees, hours, URLs, ₹ amounts) | DB / `doctor_settings` / server-rendered blocks—injected into prompts or appended after generation; **never** trust the model to invent prices or links |

**Guiding line:** *The model interprets; the platform executes; facts come from the database.* (Same as conversation rules.)

---

## 3. Hybrid pattern (recommended default)

1. **Optional fast path** — Only where latency or cost justifies it: very short messages (e.g. pure greeting), obvious emergency keywords, trivial yes/no parsers. Keep these **small** and **length-bounded** so they cannot swallow nuanced messages.
2. **Primary path** — LLM → structured fields (intent, reasons[], fee_hint, `dialog_action`, etc.).
3. **Fallback** — Deterministic parser or conservative default when the model errors, times out, or feature flag is off. Fallbacks should be **minimal**, tested, and logged—not a second copy of the whole problem in regex.

Feature flags (e.g. per-surface “AI snippet on/off”) should flip primary vs fallback, not scatter conflicting behaviors.

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

---

## 5. When deterministic logic is still correct

Use **code**, not LLM, when the domain is **closed** and **safety-critical**:

- **Emergency / urgent triage** — Known phrase lists + immediate escalation paths (latency-sensitive).
- **Compliance templates** — Fixed localized copy for medical deflection / emergency (`resolveSafetyMessage` style).
- **Strict grammars** — ISO dates after parse, phone normalization, “pick option 2” after a numbered menu.
- **Idempotent guards** — Rate limits, deduplication, consent record writes.

If you are unsure whether the domain is closed: assume it is **open** and prototype with structured LLM first; narrow to deterministic only with evidence (logs + tests).

---

## 6. Implementation checklist (before merging)

- [ ] Is this message class **open-ended**? If yes, is there a **structured LLM** path rather than new regex?
- [ ] Do ₹ amounts / URLs / legal text come from **server or DB**, not raw model output?
- [ ] Is there a **flagged fallback** and **logging/audit** for the AI path?
- [ ] Did we add or extend a **regression test or corpus entry** for routing quality (see ops tasks under `docs/Development/Daily-plans`)?
- [ ] Does this duplicate logic elsewhere? If yes, **consolidate** the source of truth.
- [ ] Does this touch **staff-feedback learning** or autobook? If yes, follow **§9** and [STAFF_FEEDBACK_LEARNING_INITIATIVE.md](../task-management/STAFF_FEEDBACK_LEARNING_INITIATIVE.md) (privacy charter, opt-in, no raw PHI by default).
- [ ] **Booking intake:** Does extraction use **thread context** for visit reason where the user already explained symptoms/BP/meds? Are **confirmation replies** routed **before** slot merge so they do not overwrite **name** / **reason**?
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
| Patient fields | `collection-service` (`validateAndApplyExtracted`), `extract-patient-fields.ts` | **Structured LLM extraction** when the message is substantive; regex as **fallback only**. Guardrails: do not overwrite **name** with symptom-like or **affirmation** text; treat **meds / “i took …”** and **thread context** as first-class inputs for **reason_for_visit**—not only `i have …` keyword paths. |
| Time / date NL | `date-time-parser.ts` | Parser + optional LLM for hard cases |
| Consent & confirm replies | `consent-service.ts` (`parseConsentReply` fast path), `ai-service.ts` (`resolveConsentReplyForBooking`, `resolveConfirmDetailsReplyForBooking`) | **Hybrid:** obvious keywords stay fast; **LLM JSON** for unclear / multilingual / “yes correct” so routing reaches **deterministic booking URL** (`formatBookingLinkDm`) instead of the model inventing slots or links. |

---

## 8. Revision policy

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
