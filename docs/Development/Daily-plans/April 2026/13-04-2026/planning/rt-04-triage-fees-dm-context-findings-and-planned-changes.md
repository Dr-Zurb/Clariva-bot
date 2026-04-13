# RT-04 — Reason-first triage, fees, DM context, reply composers — findings & planned changes

**Review date:** 2026-04-13  
**Scope:** `reason-first-triage.ts`, `dm-turn-context.ts`, `consultation-fees.ts`, `dm-reply-composer.ts`, `dm-routing-clinical-idle-preview.ts`  
**Reference:** [AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md), [rt-04-triage-fees-dm-context.md](../reading%20tasks/rt-04-triage-fees-dm-context.md)

---

## 1. Reason-first: LLM vs regex

| Concern | Primary | Fallback |
|--------|---------|----------|
| **Visit reason / confirm snippet** | **`resolveVisitReasonSnippetForTriage`** in `ai-service.ts` — JSON `reasons[]`, `VISIT_REASON_SNIPPET_SYSTEM`, flag `VISIT_REASON_SNIPPET_AI_ENABLED` | **`buildConsolidatedReasonSnippetFromMessages`** → `distillPatientReasonLinesFromMessage` / `distillReasonSnippetFromPatientParts` in **`reason-first-triage.ts`** |

**File header** (`reason-first-triage.ts` L4–14) explicitly forbids growing open-ended symptom regex; **`CLINICAL_OR_CONCERN_RE`** is a **broad routing cue** for gating (`userMessageSuggestsClinicalReason`, deferral), not per-symptom NLU.

**Where regex still grows (risk):**

- **`CLINICAL_OR_CONCERN_RE`** — long alternation; new terms here should be **rare** and for **gating only**.
- **`feeFollowUpAnaphora`** — short anaphoric fee follow-ups (“how much?”, “kitna?”).
- **Closed dialog** patterns: `NOTHING_ELSE_RE`, `CONFIRM_YES_RE`, `NEGATION_CLARIFY_RE`, `parseReasonFirstAskMoreAmbiguousYes` — **OK** (bounded acts).
- **`distillPatientReasonLinesFromMessage`** — stripping greetings/pricing; **not** for new complaint vocabulary.

---

## 2. Fee routing: classifier vs keywords vs triage

**There is no separate `intent-routing-policy` module.** Policy lives in:

- **`ai-service`:** `classifyIntent`, **`applyIntentPostClassificationPolicy`**, **`intentSignalsFeeOrPricing`**, **`classifierSignalsFeeThreadContinuation`**, **`classifierSignalsPaymentExistence`** (see tests in `backend/tests/unit/services/intent-routing-policy.test.ts` — **RBH-14**).
- **`consultation-fees.ts`:** **`isPricingInquiryMessage`**, **`normalizePatientPricingText`**, **`isAmountSeekingPricingQuestion`**, typo normalization — **canonical keyword / pricing shape** for handlers and triage.
- **`reason-first-triage.ts`:** **`shouldDeferIdleFeeForReasonFirstTriage`**, **`feeFollowUpAnaphora`**, **`lastBotDiscussesFeesTopic`**, **`isVagueConsultationPaymentExistenceQuestion`** — **thread + product** rules layered on top.
- **Webhook:** composes **`signalsFeePricing`** = classifier + anaphora + fee-thread continuation (`instagram-dm-webhook-handler.ts`).

**Arms race risk:** Same user line can be “pricing” via **`isPricingInquiryMessage`**, classifier topics, or anaphora — **documented precedence** in RT-01/RT-02 plans; **keep** `consultation-fees` as the **single keyword expansion point** for new fee phrasing.

---

## 3. DM context: single memory layer?

| Export | Role | Used in production handler? |
|--------|------|-----------------------------|
| **`buildFeeCatalogMatchText`** | Concatenate redacted patient lines + current message; omit pricing-only lines via **`shouldOmitPatientLineFromFeeCatalogMatchContent`** | **Yes** — many call sites in `instagram-dm-webhook-handler.ts` |
| **`buildDmTurnContext`** | `{ feeCatalogMatchText, recentMedicalDeflection }` | **No** — only referenced in **`dm-turn-context.test.ts`** |

**Finding:** Thread text for fee matching is **not duplicated** elsewhere; it consistently goes through **`buildFeeCatalogMatchText`**. The higher-level **`buildDmTurnContext`** is a **thin wrapper** that is **not** wired into the webhook; deflection is recomputed via **`isRecentMedicalDeflectionWindow(state)`** at use sites. **Optional cleanup:** use **`buildDmTurnContext`** once per inbound turn if you want **one** assembly for fee + deflection flag (low priority).

---

## 4. `dm-reply-composer.ts` & `dm-routing-clinical-idle-preview.ts`

- **`dm-reply-composer.ts`:** RBH-19 — **deterministic** fee segments + optional async LLM catalog narrow; ₹ amounts from **`formatConsultationFeesForDmWithMeta*`** — **aligned** with philosophy.
- **`dm-routing-clinical-idle-preview.ts`:** Mirrors **clinical-idle** branches for **tests**; **no DB**. Keep in sync when handler order changes.

---

## 5. Deliverable — forbidden vs approved patterns

### Forbidden (do not add without architecture review)

| Pattern | Why |
|---------|-----|
| **New symptom / complaint terms** in **`CLINICAL_OR_CONCERN_RE`** to fix one user wording | Use **`VISIT_REASON_SNIPPET_SYSTEM`** + tests; regex cannot scale. |
| **New open-ended lines** in **`distillPatientReasonLinesFromMessage`** for “smarter” reasons | Same; LLM path is authoritative. |
| **Duplicate pricing keyword lists** outside **`consultation-fees.ts`** | Arms race with **`isPricingInquiryMessage`**. |
| **New `feeFollowUpAnaphora` branches** without golden / preview tests | Fragile fee routing. |
| **Second builder** for “fee thread text” parallel to **`buildFeeCatalogMatchText`** | Single redacted thread string. |

### Approved extension points

| Change | Where | Tests |
|--------|--------|--------|
| **Visit reason quality / fields** | **`VISIT_REASON_SNIPPET_SYSTEM`** + **`resolveVisitReasonSnippetForTriage`** in **`ai-service.ts`** | Add/extend unit tests for JSON parse + snippet; optional corpus |
| **Pricing “is this a fee question?”** | **`consultation-fees.ts`** (`isPricingInquiryMessage`, normalize) | **`consultation-fees` / fee routing tests** |
| **Post-classification policy** (fee thread, book vs ask) | **`applyIntentPostClassificationPolicy`** | **`intent-routing-policy.test.ts`** |
| **Reason-first deferral / gating** | **`reason-first-triage.ts`** — only **closed** patterns or **broad** clinical cue | **`dm-routing-clinical-idle-preview`** + golden fixtures **`dm-routing-fixture-resolve`** / webhook tests |
| **Clinical idle branch preview** | **`dm-routing-clinical-idle-preview.ts`** | Keep aligned with handler when editing triage |
| **Fee DM composition** | **`dm-reply-composer.ts`** + **`consultation-fees.ts`** formatters | Existing DM / fee tests |

---

## 6. Planned changes (planning)

1. **Optional:** Call **`buildDmTurnContext`** from webhook once per turn and pass **`feeCatalogMatchText`** through — reduces drift if more turn fields are added.
2. **Doc:** Link this file’s §5 table from **`reason-first-triage.ts`** header (already points to philosophy — optional cross-link to planning).
3. **Monitor:** Size of **`CLINICAL_OR_CONCERN_RE`** — if it grows monthly, move clinical gating toward **classifier topic** or **small LLM gate**.

---

## 7. Handoff

| Next | Notes |
|------|--------|
| **RT-05+** | Per reading-task list |
| **Execution** | Fee / triage changes always touch **`consultation-fees`** + **`ai-service`** policies + preview tests |

---

## 8. Status

- [x] RT-04 read complete  
- [ ] Optional `buildDmTurnContext` wiring when execution allows
