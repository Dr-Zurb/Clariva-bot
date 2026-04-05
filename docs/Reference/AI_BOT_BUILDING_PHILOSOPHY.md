# AI Bot Building Philosophy (Clariva Receptionist)

**Purpose:** Stable reference for *how* we build conversational and classification logic so we do not drift into brittle, unmaintainable strategies. Read this before adding regex lists, keyword matchers, or new LLM calls.

**Audience:** Engineers and AI agents editing `backend` DM/comment flows, `ai-service`, triage, fees, and catalog matching.

**Related:**
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](./RECEPTIONIST_BOT_CONVERSATION_RULES.md) — intent map, three-layer pattern, anti-patterns (keep in sync mentally with this doc)
- [PRIVACY_BY_DESIGN.md](./PRIVACY_BY_DESIGN.md), [COMPLIANCE.md](./COMPLIANCE.md) — PHI, safety copy, consent
- [DECISION_RULES.md](./DECISION_RULES.md) — when docs conflict, resolution order

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

---

## 7. Code map (where this philosophy applies)

Use this when triaging refactors or new features—**not** exhaustive, but the usual surfaces:

| Area | Typical files | Bias |
|------|----------------|------|
| Intent + comment classification | `ai-service.ts` | LLM + small fast paths |
| Visit reason / triage snippet | `reason-first-triage.ts`, `resolveVisitReasonSnippetForTriage` | LLM primary; thin deterministic fallback |
| Fee tier / fee thread | `consultation-fees.ts`, `dm-turn-context`, DM webhook | Structured signals; avoid keyword arms race |
| Service catalog match | `service-catalog-deterministic-match.ts` | Hybrid: high-confidence deterministic + LLM map-to-id when needed |
| Patient fields | `collection-service`, `extract-patient-fields.ts` | AI extraction first; regex fallback bounded |
| Time / date NL | `date-time-parser.ts` | Parser + optional LLM for hard cases |
| Consent | `consent-service.ts` | Keywords OK for obvious cases; consider LLM for paraphrase if mis-detection hurts |

---

## 8. Revision policy

When product priorities change (e.g. stricter cost caps), **update this file** and [RECEPTIONIST_BOT_CONVERSATION_RULES.md](./RECEPTIONIST_BOT_CONVERSATION_RULES.md) together so “quality first” vs “cost first” does not fork across docs.
