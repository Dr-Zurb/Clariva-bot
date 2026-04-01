# e-task-arm-04: Service matcher engine (v1)

## 2026-04-02 — Structured match + allowlist validation

---

## 📋 Task Overview

Implement a **deterministic-first, AI-assisted** **matcher** that, given patient **reason-for-visit context** (and optional recent turns per compliance), the doctor’s **`service_offerings_json`**, and the **reserved catch-all key** from **e-task-arm-01**, returns:

- **Validated** `catalogServiceKey` that **exists** in the active catalog (via existing helpers such as `findServiceOfferingByKey` / `getActiveServiceCatalog`).
- **Suggested** teleconsult **modality** when inferable; otherwise leave for downstream default rules.
- **`match_confidence`** and optional **reason codes** for **routing** (high → immediate booking path; medium/low → staff review per plan).

**Never** persist or expose a `service_key` that failed allowlist validation. **No-match** above specialty thresholds → **catch-all** `other` (or agreed key).

**Estimated Time:** 2–3 days  
**Status:** ✅ **DONE** (v1 engine + unit tests + webhook integration + **ARM-05** confidence branching)

**Change Type:**
- [x] **New feature** — new module/service + integration points; may **update** worker to call it

**Current State:**
- ✅ **Heuristic** narrowing: `pickCatalogServicesMatchingUserText` in `consultation-fees.ts` (substring match on label/key) — **not** sufficient as sole matcher.
- ✅ **Catalog helpers**: `service-catalog-helpers.ts`, **quote** path validates keys.
- ✅ **AI service** can consume expanded catalog strings (`formatServiceCatalogForAiContext`).
- ✅ **Unified matcher:** `matchServiceCatalogOffering` + webhook **`enrichStateWithServiceCatalogMatch`** → **`applyMatcherProposalToConversationState`** (confidence, `pendingStaffReview`, `autoFinalize` when high).
- ✅ **Logging / metrics:** `service_catalog_match`, `instagram_dm_service_catalog_match`; optional **`metrics`** callback on results.

**Dependencies:** **e-task-arm-01**, **e-task-arm-03**; **e-task-arm-02** optional (hints improve quality).

**Reference:**
- Plan §2, §4, §8
- [COMPLIANCE.md](../../../../../Reference/COMPLIANCE.md) — **PHI** to LLM only via existing redaction/consent patterns
- [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown

### 1. Architecture
- [x] 1.1 Place matcher in **backend service layer** (no Express types in core logic) with clear **inputs/outputs** documented in `RECIPES.md` or module README if patterns are new.
- [x] 1.2 **Separation**: pure validation function vs LLM call wrapper (testability).

### 2. Matching strategy (implementation detail in code, not here)
- [x] 2.1 **Stage A**: deterministic rules (keyword retrieval from ARM-02 fields, label overlap, single-service shortcut).
- [x] 2.2 **Stage B**: LLM chooses **only among enumerated allowed keys** + modalities; **output must be parseable**; on parse failure → **fallback** to catch-all + **low** confidence or **staff review** per product default.
- [x] 2.3 **Validate** LLM-chosen key against catalog; on mismatch → treat as **no valid AI output**.

### 3. Outputs for downstream
- [x] 3.1 Return object consumed by Instagram worker: proposal key, confidence, candidate list for inbox UI (top-N labels **without** PHI in logs).
- [x] 3.2 **Metrics** hooks: counts by confidence, fallback rate to `other`, parse failures (metadata only).

### 4. Tests
- [x] 4.1 Unit tests: catalog with 2 services + `other` — various reason strings → expected band (use fixtures, **no** real API keys in CI if LLM mocked).
- [x] 4.2 **Adversarial**: hallucinated key from mocked LLM → must not pass validator.

### 5. Docs
- [x] 5.1 Update plan cross-links; add short **operator** note on tuning hints (ARM-02).

---

## 📁 Files (expected)

```
backend/src/services/service-catalog-matcher.ts
backend/src/workers/instagram-dm-webhook-handler.ts — enrichStateWithServiceCatalogMatch (confirm → consent)
backend/tests/unit/services/service-catalog-matcher.test.ts
```

---

## 🌍 Global Safety Gate

- [x] **External AI?** Y — **`redactPhiForAI`** on reason + recent turns before LLM (same posture as intent classifier)
- [x] **PHI in logs?** N — log confidence + keys + correlation id only
- [x] **PII in prompts?** follow `ai-service` / webhook **redaction** patterns

---

## ✅ Acceptance Criteria

- **100%** of emitted keys exist in catalog or explicit catch-all.
- Confidence bands drive ARM-05 behavior in tests or integration harness.
- Compliance review for **prompt + data** handling.

---

## 🔗 Related

- [e-task-arm-01](./e-task-arm-01-mandatory-other-not-listed-catalog.md)
- [e-task-arm-02](./e-task-arm-02-matcher-hints-catalog-fields.md)
- [e-task-arm-05](./e-task-arm-05-dm-flow-high-vs-pending-staff.md)

---

**Last Updated:** 2026-03-31
