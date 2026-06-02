# Service match — shadow metrics (learn-03)

**Data:** `service_match_shadow_evaluations` at queue time; staff outcome on `service_staff_review_requests` after resolution.

**View:** `service_match_shadow_resolution_metrics` (migration `044_service_match_shadow_learning.sql`) — one row per shadow record where the linked review is **confirmed** or **reassigned**.

## Definitions

| Term | Meaning |
|------|--------|
| **Shadow prediction** | `would_suggest_service_key` — majority `final_catalog_service_key` among learning examples with the same `pattern_key` (newest-first tie-break). |
| **Staff label** | `staff_final_catalog_service_key` from the resolved review row. |
| **Agreement** | `shadow_agrees_with_staff` — both keys non-null and equal (case-insensitive trim). |

## Rates (internal reporting)

- **Coverage:** Share of resolved reviews that have a shadow row (should be ~100% when `SHADOW_LEARNING_ENABLED` and queue path runs).
- **Agreement rate (when shadow predicts):**  
  `COUNT(*) FILTER (WHERE would_suggest_service_key IS NOT NULL AND shadow_agrees_with_staff) / COUNT(*) FILTER (WHERE would_suggest_service_key IS NOT NULL)`  
  over `service_match_shadow_resolution_metrics` (or equivalent SQL).
- **Abstain rate:** `would_suggest_service_key IS NULL` — no historical examples for this `pattern_key`; **do not** count these toward agreement numerator/denominator unless product defines “recall” differently.

**Precision / recall:** Classical definitions require a binary classifier over a fixed set of classes. Here v1 reports **agreement** and **abstain** rates; precision/recall for a specific `service_key` can be derived with extra `GROUP BY` on `staff_final_catalog_service_key` if needed.

**Export:** Query the view in Metabase / SQL client using **service role** or doctor-scoped access per RLS.

---

**Last updated:** 2026-03-31
