# RT-06 — Service catalog, matcher, learning, staff-review DMs — findings & planned changes

**Review date:** 2026-04-13  
**Scope:** `service-catalog-deterministic-match.ts`, `service-catalog-matcher.ts`, `service-match-learning-*.ts`, `staff-service-review-dm.ts`  
**Reference:** [AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/AI_BOT_BUILDING_PHILOSOPHY.md) §2–3, §7, §9; [STAFF_FEEDBACK_LEARNING_INITIATIVE.md](../../../../../task-management/STAFF_FEEDBACK_LEARNING_INITIATIVE.md); [rt-06-catalog-matcher-learning.md](../reading%20tasks/rt-06-catalog-matcher-learning.md)

---

## 1. Hybrid matcher: deterministic vs LLM — boundary is explicit

**Pipeline** (`service-catalog-matcher.ts` **`matchServiceCatalogOffering`**):

| Stage | When it runs | Output |
|-------|----------------|--------|
| **Stage A** | Always first | **`runDeterministicServiceCatalogMatchStageA`** (`service-catalog-deterministic-match.ts`) on **redacted** `reasonForVisitText` |
| **If Stage A hits** | Single-service catalog, unique label/key hit, hint-scored winner, etc. | Return **`source: 'deterministic'`** — **no LLM** |
| **If Stage A misses** | And `skipLlm` or no OpenAI client | **`source: 'fallback'`** to catch-all / first row, **`pendingStaffReview: true`** |
| **Stage B** | Stage A null + LLM allowed | **Allowlist JSON** — `buildServiceCatalogLlmSystemPrompt` lists exact `service_key` rows; **`resolveCatalogOfferingByKey`** rejects hallucinated keys |
| **LLM failure / bad JSON** | — | Same **fallback** path, reason codes include **`MATCHER_ERROR`** when applicable |

**Redaction:** `redactPhiForAI` on reason + recent messages before LLM user content.

**Verdict:** **Boundary is clear** — deterministic **always wins** when it returns non-null; LLM only maps free text to **existing** catalog keys with structured JSON validation.

---

## 2. Learning: structured-first, no silent PHI

| Module | Role |
|--------|------|
| **`service-match-learning-ingest.ts`** | On staff confirm/reassign, inserts **`service_match_learning_examples`** with **`feature_snapshot`** = review row subset + allowlisted **conversation state keys** only — **no raw patient message** in v1 design |
| **`service-match-learning-pattern.ts`** | **`pattern_key`** from reason codes + candidate keys + proposed key (used by ingest, assist, autobook) |
| **`service-match-learning-assist.ts`** | **`fetchAssistHintForReviewRow`** — aggregates **`final_catalog_service_key`** counts by pattern (PHI-free) |
| **`service-match-learning-autobook.ts`** | **`tryApplyLearningPolicyAutobook`** — gated by **`LEARNING_AUTOBOOK_ENABLED`**, policy row match, then **template DM** via **`formatStaffReviewResolvedContinueBookingDm`** |

**Cross-check [STAFF_FEEDBACK_LEARNING_INITIATIVE.md](../../../../../task-management/STAFF_FEEDBACK_LEARNING_INITIATIVE.md):** Structured-first, no raw phrase as primary; **`SERVICE_MATCH_LEARNING_INGEST_ENABLED`** env gate; optional semantic/embedding **later** — **aligned** with ingest implementation comments (DC-ALLOW / no PHI in snapshot per data contract).

---

## 3. Staff-review patient DMs: template-only

**`staff-service-review-dm.ts`:** **`formatAwaitingStaffServiceConfirmationDm`**, **`formatStaffServiceReviewStillPendingDm`**, **`formatStaffReviewResolvedContinueBookingDm`** — **fixed** strings + **`bookingUrl`** from **`buildBookingPageUrl`** (caller); visit label from **catalog** via **`resolveVisitTypeLabelForDm`**. **No LLM** — consistent with **patient-facing facts from code/DB** philosophy.

---

## 4. `intent-routing-policy.ts` (service)

**No file** `backend/src/services/intent-routing-policy.ts`. Post-classification “policy” lives in **`ai-service`** (`applyIntentPostClassificationPolicy`, etc.); tests are named **`intent-routing-policy.test.ts`**. **No action** unless product wants a renamed module for clarity.

---

## 5. Deliverable — boundary statement (matcher: when LLM vs deterministic)

**Use deterministic Stage A only when** one of: single non–catch-all service; **unique** label/key substring match; description disambiguation; **unique** matcher_hints score winner — all on **redacted** text.

**Call the LLM when** Stage A returns **null** and the runtime allows LLM (`skipLlm` false, OpenAI client present). The LLM **never** invents a new service: output **`service_key`** must exist in **`resolveCatalogOfferingByKey`**.

**Never rely on LLM when** Stage A produced a result — **deterministic short-circuits** the pipeline.

**Learning / autobook** paths are **orthogonal**: they use **structured** `pattern_key` and policies, **not** the patient NLU matcher’s LLM step.

---

## 6. Planned changes (planning)

1. **Doc:** Keep **`service-catalog-matcher.ts`** header (ARM-04) as canonical; optional link from **`STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md`** to matcher stages.
2. **Tests:** **`service-catalog-matcher`** unit tests + **golden** for Stage A vs B — already exist; extend when adding catalog rows.
3. **Naming:** If confusion persists, add README note: **intent routing policy** = `ai-service` functions, not `intent-routing-policy.ts` service.

---

## 7. Handoff

| Next | Notes |
|------|--------|
| **RT-07+** | Per README |
| **Execution** | learn tasks e-task-learn-* + `tm-bot-audit` as applicable |

---

## 8. Status

- [x] RT-06 read complete  
