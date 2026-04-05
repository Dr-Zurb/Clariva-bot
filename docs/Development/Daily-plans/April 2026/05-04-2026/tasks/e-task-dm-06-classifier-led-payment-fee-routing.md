# e-task-dm-06: Classifier-led payment & fee routing (hybrid NLU)

## 2026-05-04 — scoped planning

---

## 📋 Task Overview

Today, many DM branches depend on **regex and keyword lists** (`reason-first-triage`, `intentSignalsFeeOrPricing`, typos helpers). Real patient language has **unbounded variation**. This task defines a **hybrid** approach: the **intent classifier** (and optional lightweight follow-up model fields) carries **most phrasing variance**; **deterministic code** still decides **what to do** (narrow fee composer, staff defer, post-medical ack, triage) so **₹ amounts and visit-type policy** stay non-LLM.

**Estimated time:** 3–7 days engineering + 1–2 prompt/schema iterations  
**Status:** ✅ **SHIPPED** (classifier + handler + normalization + tests — 2026-04-05)  
**Completed:** `pricing_signal` / `fee_thread_continuation`; `DM_CLASSIFIER_PRICING_SIGNAL_MIN_CONFIDENCE`; `normalizePatientPricingText`; webhook wiring; `intent-routing-policy` + `ai-service` tests. **Follow-up:** staging sample threads (3.2); optional SILENT_FEE / hybrid NLU appendix (3.3).

**Change type:**

- [x] **Update existing** — `ai-service` (classify schema / prompts), `instagram-dm-webhook-handler.ts`, `reason-first-triage.ts` (thin shared helpers), tests; follow [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md)

**Dependencies:**

- **e-task-dm-04 / e-task-dm-05** — reason-first + silent fee paths; this task **must not** let the LLM invent fees or multi-tier menus.
- **RBH-17** — Understand → Decide → Say; classifier is **Understand**; branch order stays stable.

**Reference:**

- [SILENT_FEE_ASSIGNMENT_POLICY.md](../../../../../task-management/SILENT_FEE_ASSIGNMENT_POLICY.md)
- [e-task-dm-05](../04-04-2026/tasks/e-task-dm-05-silent-fee-menu-closure.md)

---

## 🎯 Product / engineering goals

1. **Structured signals** from classify (examples — exact names TBD in design):
   - Payment **existence** vs **amount-seeking** vs **generic fee interest** (align with `isVagueConsultationPaymentExistenceQuestion` / `isAmountSeekingPricingQuestion`).
   - **Fee-turn continuation** (anaphora) when the **model** judges the user is continuing a fee/payment thread (optional; may stay regex-assisted with model tie-break).
2. **Webhook Decide layer** prefers **classifier signals** when confidence ≥ threshold; falls back to **existing regex** (and typo normalization) when low confidence or API failure.
3. **Single normalization entry** for patient text used by pricing checks (typos like `payemnt`, trim, maybe Roman-script normalization) — **one module** called from defer rules, fee anaphora, and optional classifier pre-step.
4. **Documentation**: short **Hybrid NLU policy** (this repo or `SILENT_FEE_ASSIGNMENT_POLICY` appendix): model for language; code for money and branch invariants. _(Not a standalone appendix yet; behavior documented in this task + [OBSERVABILITY.md](../../../../../Reference/OBSERVABILITY.md) routing notes.)_

---

## ✅ Task breakdown

### 1. Current state & design

- [x] 1.1 Audit: `classifyIntent` output shape, `applyIntentPostClassificationPolicy`, `intentSignalsFeeOrPricing`, and all **payment/fee** branch gates in `instagram-dm-webhook-handler.ts`.
- [x] 1.2 Specify **thresholds** (when to trust classifier vs regex) and **conflict resolution** (e.g. classifier says not-fee but strong pricing regex — document rule). → **`DM_CLASSIFIER_PRICING_SIGNAL_MIN_CONFIDENCE`** (default 0.62); `intentSignalsFeeOrPricing` / keywords still win when classifier omits fee; sub-signals gated by confidence in `classifierSignalsPaymentExistence` / `AmountSeeking` / `FeeThreadContinuation`.
- [x] 1.3 Define **minimal schema extension** (booleans or enum sub-tags) — avoid prompt bloat; version for backward compatibility. → **`pricing_signal`** enum + **`fee_thread_continuation`**; intent cache prefix bump `rbh18dm06:`; merge step strengthens `is_fee_question` + `topics` when `pricing_signal !== 'none'`.

### 2. Implementation

- [x] 2.1 Extend classification (prompt + parsing) to emit new fields; **optional**: log raw model output in dev only (no PHI in prod logs — follow existing redaction). → Prompt + JSON parse + **`pricingSignalKind`** on `logAIClassification` only; raw completion not logged.
- [x] 2.2 Add `normalizePatientPricingText` (or rename) in one util; replace ad-hoc duplication where safe. → `consultation-fees.ts`; `reason-first-triage` + `isPricingInquiryMessage` use it; **`lastBotDiscussesFeesTopic`** exported.
- [x] 2.3 Wire handler: **post-medical ack**, **idle defer**, **fee anaphora**, **ask_more narrow** paths consume classifier flags when enabled (feature flag / env if desired). → Env threshold only; post-med ack OR `classifierSignalsPaymentExistence`; ask_more narrow uses `classifierSignalsAmountSeeking` + `classifierFeeThreadCont`; `signalsFeePricing` includes classifier fee-thread continuation; conflict recovery path aligned.
- [x] 2.4 Unit tests: classifier parse mocks + handler unit tests for **priority order** (classifier vs regex). → `intent-routing-policy.test.ts` (sub-signals + confidence); `ai-service.test.ts` (parse + audit).
- [x] 2.5 Regression: run existing `reason-first-triage`, `consultation-fees`, DM routing tests; add cases for **paraphrased** pay questions (fixture strings, not live API). → Suites green; corpus rows in [e-task-ops-02](./e-task-ops-02-dm-routing-quality-regression-corpus.md) / `dm-routing-golden` cover classifier-stub paths.

### 3. Verification

- [x] 3.1 `npm run type-check`; targeted Jest suites green.
- [ ] 3.2 Staging: sample threads from [e-task-ops-02](./e-task-ops-02-dm-routing-quality-regression-corpus.md) corpus. _(Manual / recommended.)_
- [ ] 3.3 Update **policy doc** or cross-link from [SILENT_FEE_ASSIGNMENT_POLICY.md](../../../../../task-management/SILENT_FEE_ASSIGNMENT_POLICY.md). _(Optional short paragraph linking hybrid NLU + env threshold.)_

---

## 📁 Files likely touched

| Area | Path(s) |
|------|---------|
| Intent | `backend/src/services/ai-service.ts`, related types |
| Handler | `backend/src/workers/instagram-dm-webhook-handler.ts` |
| Rules | `backend/src/utils/reason-first-triage.ts`, `backend/src/utils/consultation-fees.ts` (imports only if needed) |
| Tests | `backend/tests/unit/...` |
| Docs | `docs/task-management/`, this file |

---

## 🌍 Safety & compliance

- [x] No new **verbatim** catalog or ₹ amounts from the LLM — **Say** layer unchanged for fee numbers.
- [x] PHI: do not log full patient text; align with audit/redaction patterns. → `pricingSignalKind` enum metadata only.

---

## ✅ Acceptance criteria

- [x] Classifier exposes **at least one** structured signal that reduces reliance on hand-tuned regex for **payment existence** or **fee follow-up** in **≥1** critical branch (document which). → **`post_medical_payment_existence_ack`** (`classifierSignalsPaymentExistence`); **reason-first `ask_more`** narrow (`classifierSignalsAmountSeeking`, `classifierSignalsFeeThreadContinuation`); **`signalsFeePricing`** / anaphora path.
- [x] **Fallback** path documented and tested when classify fails or returns low confidence. → Below-threshold confidence ignores sub-signals; `unknown`/parse failure unchanged; tests for low confidence on `payment_existence`; regex/keyword fallbacks unchanged.
- [x] **No regression** on silent-fee / staff-defer outcomes from [SILENT_FEE_ASSIGNMENT_POLICY.md](../../../../../task-management/SILENT_FEE_ASSIGNMENT_POLICY.md). → Existing triage/fee tests + type-check green; amounts still from composer/DB only.

---

**Last updated:** 2026-04-05
