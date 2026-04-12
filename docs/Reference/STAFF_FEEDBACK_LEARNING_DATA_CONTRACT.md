# Staff feedback learning — data contract (v1)

**Status:** Engineering draft — **requires product + legal async sign-off** before learn-02 migrations ship.  
**Supersedes:** Nothing (first version).  
**Related:** [PRIVACY_BY_DESIGN.md](./PRIVACY_BY_DESIGN.md) · [COMPLIANCE.md](./COMPLIANCE.md) · [DATA_RETENTION.md](./DATA_RETENTION.md) · [plan §1a](../Development/Daily-plans/April%202026/12-04-2026/plan-staff-feedback-learning-system.md#1a-structured-first-vs-optional-nl--ai-clarify-scope)

**Cite in code / PRs:** Use IDs in the first column (e.g. `DC-ALLOW`, `DC-DENY`).

| ID | Topic |
|----|--------|
| [DC-INV](#dc-inv) | Source inventory |
| [DC-DENY](#dc-deny) | Deny list |
| [DC-ALLOW](#dc-allow) | Allowed fields |
| [DC-NOTE](#dc-note) | Internal notes |
| [DC-RET](#dc-ret) | Retention / deletion |
| [DC-REG](#dc-reg) | Regional placeholder |
| [DC-FUT](#dc-fut) | Future NL / embeddings |
| [DC-RLS](#dc-rls) | Access / RLS |
| [DC-LOG](#dc-log) | Logging |

---

<a id="dc-inv"></a>

## DC-INV — Source inventory (structured only)

**Tables (Postgres):** `service_staff_review_requests`, `service_staff_review_audit_events` (see `backend/migrations/040_service_staff_review_requests.sql`; `042_staff_review_sla_deadline_nullable.sql` — `sla_deadline_at` may be NULL on new rows).

### `service_staff_review_requests` — columns relevant to learning

| Column | Learning use |
|--------|----------------|
| `id` | FK target (`review_request_id`) for idempotent ingest |
| `doctor_id` | Partition / policy scope |
| `conversation_id` | Join key only; **do not** persist raw conversation text in learning rows |
| `patient_id` | **Default v1:** omit from `feature_snapshot` or store only as opaque UUID if product requires join-back — prefer **no** patient id in learning aggregate tables; **confirm** in learn-02 schema PR |
| `correlation_id` | Ops correlation; optional in learning row; **no** PHI |
| `status` | Label filter (confirm / reassign vs cancel / timeout) |
| `proposed_catalog_service_key`, `proposed_catalog_service_id`, `proposed_consultation_modality` | Structured features |
| `match_confidence` | Structured feature |
| `match_reason_codes` | JSON array of **enumerated** reason codes (matcher output) |
| `candidate_labels` | JSON `[{service_key, label}]` — catalog labels only |
| `sla_deadline_at`, `created_at`, `updated_at`, `resolved_at` | Timestamps |
| `resolved_by_user_id` | Staff actor (UUID); acceptable for audit |
| `final_catalog_service_key`, `final_catalog_service_id`, `final_consultation_modality` | **Labels** after resolution |
| `resolution_internal_note` | See [DC-NOTE](#dc-note) |

### `service_staff_review_audit_events` — columns

| Column | Learning use |
|--------|----------------|
| `review_request_id` | Join to request |
| `event_type` | `created` \| `confirmed` \| `reassigned` \| `cancelled_by_staff` \| `cancelled_timeout` |
| `actor_user_id` | Staff user |
| `metadata` | Event-specific JSON (see below); **copy only** fields allowed under [DC-ALLOW](#dc-allow) |
| `correlation_id`, `created_at` | Correlation / time |

**`metadata` shapes (current backend):**

- **`created`:** `{ correlation_id, conversation_id }` — **do not** copy `conversation_id` into learning **text**; optional opaque ref ok per learn-02.
- **`confirmed`:** `proposed_catalog_service_key`, `final_catalog_service_key`, `resolution_internal_note` (optional).
- **`reassigned`:** `proposed_catalog_service_key`, `final_catalog_service_key`, `final_catalog_service_id`, `final_consultation_modality`, optional `catalog_matcher_hints_updated`.
- **`cancelled_by_staff`:** `proposed_catalog_service_key`, `resolution_internal_note` (optional).
- **`cancelled_timeout`:** (if used) — structured fields only; no patient narrative.

### Not persisted on review rows (inbox enrichment only)

`listEnrichedServiceStaffReviewsForDoctor` adds **`patient_display_name`** and **`reason_for_visit_preview`** from `patients` / `conversations.metadata` for UI. These are **out of scope** for v1 learning storage — see [DC-DENY](#dc-deny).

### Conversation state (for learn-02 ingest)

Matcher outputs in `ConversationState` (e.g. `serviceCatalogMatchReasonCodes`, `matcherProposedCatalogServiceKey`) may be snapshotted **as structured fields** at resolution time per [DC-ALLOW](#dc-allow). **Raw** patient messages or free-text reason for visit **must not** be copied — [DC-DENY](#dc-deny).

---

<a id="dc-deny"></a>

## DC-DENY — Must not copy into learning stores (v1)

- **Raw** Instagram / DM **message text** from patients.
- **Full** `reasonForVisit` or any **clinical narrative** (even if in conversation metadata).
- **Patient name**, phone, email, address, or other direct identifiers.
- **Free-text** staff notes that contain identifiable patient details (treat `resolution_internal_note` as **internal short text** with **no** patient-identifying content — [DC-NOTE](#dc-note)).
- **Arbitrary** JSON from `conversations` or `messages` tables beyond **enumerated** matcher fields approved in [DC-ALLOW](#dc-allow).

**Existing matcher LLM:** May produce **structured** outputs (reason codes, candidate keys). That pipeline is **orthogonal** to this contract. Learning tables store **those structured outputs**, not model prompts/responses or raw chat.

---

<a id="dc-allow"></a>

## DC-ALLOW — Learning example / feature snapshot (v1)

**Purpose:** Supervised labels + structured features for similarity / pattern keys (hash of codes + keys + proposed→final), per master plan.

**Allowed categories (non-exhaustive; learn-02 schema may name columns vs JSONB):**

| Field group | Examples |
|-------------|----------|
| **Identity / linkage** | `doctor_id`, `review_request_id` (unique), ingest `created_at` |
| **Action / label** | `action`: `confirmed` \| `reassigned` \| (optional) `cancelled_by_staff` excluded from positive labels unless product defines policy |
| **Proposal vs final** | `proposed_catalog_service_key`, `final_catalog_service_key`, optional service UUIDs, `proposed_consultation_modality`, `final_consultation_modality` |
| **Matcher structure** | `match_confidence`, `match_reason_codes` (array of **known** string codes), `candidate_labels` (service_key + catalog label only) |
| **Optional ops** | `correlation_id` (no content), `resolved_at` |

**Pattern key:** Exact formula in learn-03; must use **only** [DC-ALLOW](#dc-allow) fields.

---

<a id="dc-note"></a>

## DC-NOTE — `resolution_internal_note` & audit metadata

- **Max length:** 2000 characters (see `NOTE_MAX` in `service-staff-review-service.ts`).
- **Content:** Short internal context for staff; **must not** be used to store patient-identifying narrative. Prefer empty for learning aggregates if in doubt.
- **Retention:** Same as parent learning row / request retention ([DC-RET](#dc-ret)).
- If copied into a learning table for debugging, **same** constraints apply; consider **excluding** from aggregate exports used for product analytics.

---

<a id="dc-ret"></a>

## DC-RET — Retention / deletion

**Defaults (v1 — tune per environment after legal review):**

- Learning examples are **doctor operational data** for improving routing; align with [DATA_RETENTION.md](./DATA_RETENTION.md) principles.
- **Table:** `service_match_learning_examples` (migration `043_service_match_learning_examples.sql`): `ON DELETE CASCADE` from `auth.users` (`doctor_id`) and from `service_staff_review_requests` (`review_request_id`). **No** `patient_id` column in v1.
- **On doctor account deletion:** rows cascade with `doctor_id`.
- **On patient erasure request:** v1 rows do not store `patient_id`; tie-break via review request / conversation deletion policies if a join path appears in a future schema.
- **Backup / exports:** No patient narrative; structured fields only.

---

<a id="dc-reg"></a>

## DC-REG — Regional / legal (placeholder)

- **EU:** GDPR — lawful basis, DPIA if high-risk profiling; purpose limitation for “learning” feature documented in privacy notice.
- **India:** DPDPA — consent / notice for automated decision-making if applicable; data principal rights.
- **US:** State privacy laws; HIPAA **may** apply depending on entity role — **legal** to confirm before marketing “clinical” learning.

**Action:** Legal review checklist before enabling **autobook** or **cross-practice** aggregates. Engineering tracks technical minimization here; **policy** text is out of scope for this file.

---

<a id="dc-fut"></a>

## DC-FUT — Optional embeddings / NL similarity (deferred)

- **v1:** **No** storage of message **embeddings** in Postgres unless this contract is amended and legal approves.
- **v1:** **No** learning-only LLM required; pattern match remains **deterministic** on structured fields ([plan §1a](../Development/Daily-plans/April%202026/12-04-2026/plan-staff-feedback-learning-system.md#1a-structured-first-vs-optional-nl--ai-clarify-scope)).
- **Future phase:** If product adds semantic similarity, specify: embedding model, redaction pipeline, retention, opt-in, and update **DC-ALLOW** / **DC-DENY** explicitly.

---

<a id="dc-rls"></a>

## DC-RLS — Access model

- **Same principle as ARM-06:** Learning rows are **doctor-scoped**; doctors may **read** only their practice’s data via RLS; backend workers use `service_role` with least privilege.
- **Shadow / admin metrics:** Internal roles only; no patient-facing exposure of learning rows.

---

<a id="dc-log"></a>

## DC-LOG — Logging

- **No PHI** in application logs for learning paths (correlation IDs and UUIDs only) — aligns with [COMPLIANCE.md](./COMPLIANCE.md) and existing staff-review logging.

---

<a id="sign-off"></a>

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Product | | | |
| Engineering | | | |
| Legal / Privacy | | | Optional for draft; **required** before autobook / embeddings |

---

**Last updated:** 2026-03-31
