# Service match — pattern key (structured, v1)

**Purpose:** Deterministic key for bucketing staff resolutions and shadow retrieval (learn-02 / learn-03). **No** patient text.

**Implementation:** `buildPatternKeyFromInputs` in `backend/src/services/service-match-learning-pattern.ts`.

**Canonical JSON** (`JSON.stringify` insertion order in code):

- `v`: `1` (increment when formula changes).
- `candidate_service_keys`: sorted unique `service_key` values from `candidate_labels` (`[{ service_key, label }]`).
- `proposed_catalog_service_key`: lowercase trim of matcher proposal.
- `reason_codes`: sorted unique strings from matcher / review row `match_reason_codes`.

**Hash:** `sha256(utf8(canonical))` → 64-char hex (`pattern_key`).

**Aligned with:** [plan §2 aggregate step](../Development/Daily-plans/April%202026/12-04-2026/plan-staff-feedback-learning-system.md#2-learning-loop-conceptual), [STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md](./STAFF_FEEDBACK_LEARNING_DATA_CONTRACT.md) DC-ALLOW.

---

**Last updated:** 2026-03-31
