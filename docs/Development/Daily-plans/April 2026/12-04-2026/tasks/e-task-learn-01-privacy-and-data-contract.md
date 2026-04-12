# Task learn-01: Privacy charter and learning data contract

**Date:** 2026-04-12  
**Plan:** [plan-staff-feedback-learning-system.md](../plan-staff-feedback-learning-system.md)

---

## Task overview

Produce a **signed-off data contract** for the staff-feedback learning system: what may be stored, for how long, who can read it, and how it maps to **global compliance** goals. **Blocks** DB migrations and ingest code in learn-02 until complete.

**Architecture:** This contract governs **structured** learning data by default. A **future** optional layer (message embeddings, LLM-assisted “similar meaning”) is **not** required for v1; if allowed later, it must be called out explicitly with retention, purpose limitation, and legal review — see [plan §1a](../plan-staff-feedback-learning-system.md#1a-structured-first-vs-optional-nl--ai-clarify-scope).

**Estimated time:** 8–16 hours (research + doc + stakeholder review)  
**Status:** Complete (engineering draft — [sign-off](../../../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md#sign-off) pending product/legal)  
**Change type:** Documentation + policy (no production code in this task)

**Depends on:** Nothing  
**Unlocks:** e-task-learn-02

---

## Current state

- `service_staff_review_requests` explicitly avoids PHI in row comments; `resolution_internal_note` is short internal text (“avoid PHI”).
- [PRIVACY_BY_DESIGN.md](../../../../../Reference/PRIVACY_BY_DESIGN.md), [COMPLIANCE.md](../../../../../Reference/COMPLIANCE.md) exist — learning layer must reference them.

---

## Task breakdown

### 1. Inventory

- [x] 1.1 List all fields currently on staff review rows and audit events that could feed learning (structured only). → [DC-INV](../../../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md#dc-inv)
- [x] 1.2 Document what **must not** be copied into new tables (raw DM text, patient name in learning row, etc.). → [DC-DENY](../../../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md#dc-deny)

### 2. Data contract (deliverable: `docs/Reference/`)

**File:** [STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md](../../../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md)

- [x] 2.1 **Allowed fields** for `learning_example` / feature snapshot (reason codes, candidate keys, modality, proposed→final pair, action type, timestamps, `doctor_id`, `review_request_id` FK). → [DC-ALLOW](../../../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md#dc-allow)
- [x] 2.2 **Optional** internal note handling: max length, no patient-identifiable narrative, retention. → [DC-NOTE](../../../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md#dc-note)
- [x] 2.3 **Retention** defaults and **deletion** on account closure / doctor request. → [DC-RET](../../../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md#dc-ret)
- [x] 2.4 **Regional** notes (placeholder): EU / India / US — point to legal review checklist. → [DC-REG](../../../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md#dc-reg)

### 3. Embeddings / optional NL-based similarity (future)

- [x] 3.1 Decision: **v1 = no message embeddings in DB** unless legal approves — document as explicit **deferral** or **gated phase**. Clarify that **patient NLU** (existing matcher LLM) is **out of scope** of this contract except where learning stores **outputs** of that pipeline as **structured** fields (reason codes, etc.). → [DC-FUT](../../../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md#dc-fut)

### 4. Review gate

- [ ] 4.1 Product + engineering sign-off on contract (short meeting or async approval in PR). → Sign-off table in contract doc

### 5. Verification

- [x] 5.1 Link charter from [STAFF_FEEDBACK_LEARNING_INITIATIVE.md](../../../../../task-management/STAFF_FEEDBACK_LEARNING_INITIATIVE.md) and master plan.

---

## Design constraints

- Default **deny** for new PHI in learning store.
- **Audit**: who can read learning rows (RLS pattern to match doctor-owned data).

---

## Global safety gate

- [x] **Data touched?** N (this task) — Y for follow-on tasks gated by this doc
- [x] **PHI in logs?** Must remain No for implementation tasks ([DC-LOG](../../../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md#dc-log))

---

## Acceptance criteria

- [x] Written **data contract** checked into repo: [`docs/Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md`](../../../../../Reference/STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md) (linked from initiative + plan).
- [x] Explicit **v1 ban or allow** list for message-derived storage (`DC-DENY`, `DC-ALLOW`).
- [x] learn-02 can cite contract section IDs (`DC-INV` … `DC-LOG`).

---

## Related tasks

- Next: [e-task-learn-02-learning-store-and-ingest.md](./e-task-learn-02-learning-store-and-ingest.md)

---

**Last updated:** 2026-03-31
