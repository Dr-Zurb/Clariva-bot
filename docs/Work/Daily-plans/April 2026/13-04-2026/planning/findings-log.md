# Findings log — philosophy audit (append)

**Instructions:** Each completed reading task (RT-XX) adds a section with date, reviewer, findings.

---

## Template

### RT-XX — <title> — YYYY-MM-DD

**Reviewer:** (name or agent session)

**Aligned:**
- …

**Gaps (P0–P3):**
- P0: …
- P1: …

**Files / line refs:**
- …

---

### RT-01 — ai-service intent & classification — 2026-04-13

**Reviewer:** agent (Cursor)

**Aligned:**
- Structured LLM intent with thread + `conversationGoal` in user content; cache skipped when context used.
- Fee/pricing sub-signals from JSON; post-policies for fee-thread and emergency follow-up.
- `extractFieldsWithAI` + context; consent/confirm semantic paths with optional-extras handling in prompts + `resolveConsentReplyForBooking`.
- Response prompt: facts from injected practice blocks only.
- Visit-reason snippet via LLM JSON `reasons[]`.

**Gaps (P0–P3):**
- **P2:** Expandable `BOOKING_RELATION_KIN` / book-for-else regex maintenance (G1).
- **P2:** Deterministic pre-AI shortcuts + duplicate fee signal via `isPricingInquiryMessage` fallback (G2, G3).
- **P3:** Intent cache key = redacted text only when no context (G4); confirm/extraction regex fast paths (G5, G6).

**Files / line refs:** See [rt-01-ai-service-findings-and-planned-changes.md](./rt-01-ai-service-findings-and-planned-changes.md).

**Planning artifact:** [rt-01-ai-service-findings-and-planned-changes.md](./rt-01-ai-service-findings-and-planned-changes.md)

---

### RT-02 — Instagram DM webhook handler — 2026-04-13

**Reviewer:** agent (Cursor)

**Aligned:**
- RBH-17 split: `classifyIntent` once, then Decide+Say chain with `dmRoutingBranch`; header + `RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md` mostly match execution order.
- `inCollection` definition avoids blocking medical/reason-first on channel-pick alone; medical deflection skipped when collecting details (comment ~L1848).
- Consent/confirm use `resolveConsentReplyForBooking` / `resolveConfirmDetailsReplyForBooking` with `effectiveAskedFor*`; collection uses `validateAndApplyExtracted` + ambiguous vs direct paths.
- Reason-first triage block composes with `composeIdleFeeQuoteDmWithMetaAsync` / defer helpers; emergency branch RBH-15 documented.

**Gaps (P0–P3):**
- **P2:** `effectiveAskedFor*` = `lastPromptKind` **or** substring heuristics on last bot message — template/i18n drift risk (G1 in RT-02 plan).
- **P2:** ~120+ `.test` / `.includes` / regex uses; fee routing combines classifier + anaphora + continuation — duplicate signal paths with `ai-service` (G2).
- **P3:** ~~`RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md` omitted **post_medical_payment_existence_ack**~~ — **fixed** 2026-04-13 (row 8b + note).
- **P3:** Collection kin / `wantsMeFirst` / `wantsJustOther` hardcoded regex — overlaps kin sprawl (RT-01).

**Files / line refs:** See [rt-02-instagram-dm-webhook-findings-and-planned-changes.md](./rt-02-instagram-dm-webhook-findings-and-planned-changes.md).

**Planning artifact:** [rt-02-instagram-dm-webhook-findings-and-planned-changes.md](./rt-02-instagram-dm-webhook-findings-and-planned-changes.md)

---

### RT-03 — Collection, consent, patient match — 2026-04-13

**Reviewer:** agent (Cursor)

**Aligned:**
- `validateAndApplyExtracted`: **phone/email** (`extractPhoneAndEmail`) → **`extractFieldsWithAI`** with `recentTurns` / `lastBotMessage` / `missingFields` → **regex fallback** only when AI returns empty; header documents AI-first.
- Merge guards (`isSymptomLike`, `isRelationshipOrGenderLike`, `isGenderOnly`, fee/meta reason skip) are **validation**, not parallel NLU.
- DM consent: **`resolveConsentReplyForBooking`** runs optional-extras / skip-extras **before** keyword deny; `parseConsentReply` fast path then semantic when unclear.
- **`seedCollectedReasonFromStateIfValid`** threads **`state.reasonForVisit`** into Redis for reason-first handoff (webhook call sites).

**Gaps (P0–P3):**
- **P3:** `parseConsentReply` keyword lists — multilingual / edge phrasing relies on **semantic** path (`unclear`); monitor.
- **P3:** Ensure **all** collection entry points call **`seedCollectedReasonFromStateIfValid`** when `reasonForVisit` is preset (audit).
- **P3:** `tryRecoverAndSetFromMessages` — regex-only recovery if Redis lost; acceptable fallback.

**Files / line refs:** See [rt-03-collection-consent-patient-findings-and-planned-changes.md](./rt-03-collection-consent-patient-findings-and-planned-changes.md).

**Planning artifact:** [rt-03-collection-consent-patient-findings-and-planned-changes.md](./rt-03-collection-consent-patient-findings-and-planned-changes.md)

---

### RT-04 — Reason-first triage, fees, DM context, reply composers — 2026-04-13

**Reviewer:** agent (Cursor)

**Aligned:**
- **Visit reasons:** `resolveVisitReasonSnippetForTriage` (LLM JSON) with fallback to `buildConsolidatedReasonSnippetFromMessages`; `reason-first-triage.ts` header forbids open-ended symptom regex growth.
- **Fee routing:** Policy in `ai-service` + **`consultation-fees.ts`** as canonical pricing keywords; triage adds deferral / anaphora / clinical gating — no separate `intent-routing-policy` module (tests: `intent-routing-policy.test.ts` RBH-14).
- **DM thread for fees:** **`buildFeeCatalogMatchText`** used consistently in webhook; **`buildDmTurnContext`** exists but is **not** used in production (tests only) — optional future single call site.
- **Composers:** `dm-reply-composer.ts` keeps ₹ in deterministic blocks (RBH-19); `dm-routing-clinical-idle-preview.ts` mirrors clinical-idle branches for tests.

**Gaps (P0–P3):**
- **P2:** **`CLINICAL_OR_CONCERN_RE`** / **`feeFollowUpAnaphora`** can still grow — monitor; prefer LLM snippet + `consultation-fees` for new phrasing.
- **P3:** **`buildDmTurnContext`** unwired — minor duplication vs recomputing deflection at each branch.

**Deliverable:** Forbidden / approved patterns — [rt-04-triage-fees-dm-context-findings-and-planned-changes.md §5](./rt-04-triage-fees-dm-context-findings-and-planned-changes.md).

**Planning artifact:** [rt-04-triage-fees-dm-context-findings-and-planned-changes.md](./rt-04-triage-fees-dm-context-findings-and-planned-changes.md)

---

### RT-05 — Safety, emergency, webhook worker — 2026-04-13

**Reviewer:** agent (Cursor)

**Aligned:**
- **`resolveSafetyMessage`:** fixed templates for medical + emergency; **112/108** and hospital guidance are **not** LLM-generated; **`detectSafetyMessageLocale`** is heuristic (no LLM).
- **`isEmergencyUserMessage`:** multilingual **acute-phrase** regex lists complement **intent classifier** (documented in-file); **BP** parsing uses deterministic thresholds for post-escalation policy.
- **Webhook:** controller → signature → idempotency → queue; worker dispatches DM/comment/payment; **`sendInstagramDmWithLocksAndFallback`** — locks, throttle, recipient fallback; retries + dead letter on failure.

**Gaps (P0–P3):**
- **P3:** Growing **`EMERGENCY_PATTERNS_*`** without tests — operational risk, not philosophy conflict if kept bounded.

**Deliverable:** Deterministic vs LLM-assisted — [rt-05-safety-webhook-worker-findings-and-planned-changes.md §4](./rt-05-safety-webhook-worker-findings-and-planned-changes.md).

**Planning artifact:** [rt-05-safety-webhook-worker-findings-and-planned-changes.md](./rt-05-safety-webhook-worker-findings-and-planned-changes.md)

---

### RT-06 — Catalog matcher, learning, staff-review DMs — 2026-04-13

**Reviewer:** agent (Cursor)

**Aligned:**
- **Matcher:** Stage A **`runDeterministicServiceCatalogMatchStageA`** always first; on hit → **`source: 'deterministic'`**, no LLM. Stage B LLM uses **allowlist** prompt + **`resolveCatalogOfferingByKey`**; redacted input. Fallback/catch-all when skip LLM or parse failure.
- **Learning:** Ingest stores **structured** `feature_snapshot` + `pattern_key`; env **`SERVICE_MATCH_LEARNING_INGEST_ENABLED`**; aligns with **STAFF_FEEDBACK_LEARNING_INITIATIVE** (structured-first, no raw patient text in v1 store design).
- **Assist / autobook:** Pattern-based aggregation and policy lookup; autobook gated by **`LEARNING_AUTOBOOK_ENABLED`**.
- **Staff DMs:** **`staff-service-review-dm.ts`** — template copy + catalog label + **booking URL from code**; no LLM.

**Gaps (P0–P3):**
- **P3:** No `intent-routing-policy.ts` **service** file — policy lives in **`ai-service`** (tests only use that name); document to avoid confusion.

**Deliverable:** Matcher boundary — [rt-06-catalog-matcher-learning-findings-and-planned-changes.md §5](./rt-06-catalog-matcher-learning-findings-and-planned-changes.md).

**Planning artifact:** [rt-06-catalog-matcher-learning-findings-and-planned-changes.md](./rt-06-catalog-matcher-learning-findings-and-planned-changes.md)

---

### RT-07 — Utils, validation, conversation types — 2026-04-13

**Reviewer:** agent (Cursor)

**Aligned:**
- **`ConversationState`:** Documented PHI rules (ARM-03); **`lastPromptKind`** + **`conversationLastPromptKindForStep`** on main persist; matcher / reason-first / deflection fields are enums or structured.
- **`validatePatientField`:** Zod — format/range only, **not** NLU.
- **`booking-link-copy.ts`:** Templates + caller-supplied URLs; queue vs slot from settings.
- **`logInstagramDmRouting`:** Branch, intent, steps — **no** user text.

**Gaps (deliverable §5):**
- **P2:** **Consultation channel pick** not represented in **`lastPromptKind`** — still **substring** helpers (`dm-consultation-channel`).
- **P3:** **Optional-extras** vs bare consent — distinguished by **assistant-message** checks, not a dedicated prompt kind.
- **P3:** Legacy rows without **`lastPromptKind`** rely on **`effectiveAskedFor*`** fallbacks.

**Planning artifact:** [rt-07-utils-validation-types-findings-and-planned-changes.md](./rt-07-utils-validation-types-findings-and-planned-changes.md)

---

### RT-08 — Tests, golden corpora, characterization — 2026-04-13

**Reviewer:** agent (Cursor)

**Aligned:**
- **`corpus.json` + `previewClinicalIdleDmBranch`:** Context-rich regression (reason-first phases, post-med payment, Hinglish amount, anaphora, collection guard → `null`).
- **`dm-routing-golden.test.ts`:** Transcript fixtures + partial resolver; **medical in collection** → not `medical_safety`.
- **`webhook-worker-characterization`:** Heavy mocks — **no live OpenAI/Meta** in CI.
- **`ai-service.test.ts`:** `openai` mocked; missing API key paths covered.
- **`booking-turn-classifiers`:** `confirm` / `consent` / **optional extras** (`no thats it`).

**Gaps (deliverable §5):**
- **P2:** **`reason_first_triage_ask_more_ambiguous_yes`** not in **`corpus.json`** (branch exists in preview + handler).
- **P3:** **Multi-field blob** collection; **Hinglish** optional-extras / wrap-up beyond one amount row; **`fee_follow_up_anaphora_idle`** vs `fee_deterministic_idle` — verify coverage.
- **Doc:** **`corpus.json`** does not cover **confirm_details / consent** (idle preview only); those live in **classifiers + worker characterization**.

**Planning artifact:** [rt-08-tests-and-corpora-findings-and-planned-changes.md](./rt-08-tests-and-corpora-findings-and-planned-changes.md)

---

### RT-09 — Reference docs cross-check — 2026-04-13

**Reviewer:** agent (Cursor)

**Aligned:**
- **Handler order** (revoke → paused → cancel/reschedule numeric → emergency → staff → channel → post-med ack → reason-first …) matches **RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md** “Decision order” and early branch table.
- **RECEPTIONIST_BOT_CONVERSATION_RULES.md** — three-layer pattern, RBH-14, fee / `lastPromptKind` consistent with code.
- **DECISION_RULES.md** — philosophy positioned as DM strategy guidance; no conflict with philosophy “optional unless asked.”
- **Philosophy §7 / §9 links** — checked `plan-staff-feedback-learning-system.md`, `e-task-learn-01`–`05`, `STAFF_FEEDBACK_LEARNING_INITIATIVE.md`, RBH-17 task link — paths resolve under `docs/`.

**Gaps (doc backlog §7):**
- **P2:** **RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md** — missing rows for **`booking_resume_after_emergency`**, **`learning_policy_autobook`** (present in `instagram-dm-webhook-handler.ts`).
- **P3:** **COMPLIANCE.md** — optional pointer to actual **`redactPhiForAI`** (vs generic “redactPHI when implemented”).
- **Process:** Philosophy **optional for every PR** vs **elite bot default** — product decision; update philosophy opening + DECISION_RULES only if team adopts stricter gate.

**Planning artifact:** [rt-09-reference-docs-cross-check-findings.md](./rt-09-reference-docs-cross-check-findings.md)

---
