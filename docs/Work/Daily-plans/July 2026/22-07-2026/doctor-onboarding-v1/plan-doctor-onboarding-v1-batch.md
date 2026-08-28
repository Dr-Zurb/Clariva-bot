# doctor-onboarding-v1 — getting-started checklist

> **Status:** ✅ Complete (2026-07-22).
> **One-line intent:** Guide a freshly-signed-up doctor to first value with a **getting-started page + persistent cockpit checklist**, both derived from data we already store — no migration.
>
> **Roadmap:** [`../doctor-funnel/README.md`](../doctor-funnel/README.md) · batch #3 (Gate 3: Setup).

---

## Decision lock

| ID | Decision |
|---|---|
| **ONB-D1** | **Derive** completion from existing data — **no new schema** for v1. |
| **ONB-D2** | Signals: IG via `getConnectionStatus`; practice via `practice_name`; pricing via `catalog_mode` + fee/catalog; availability via ≥1 row. |
| **ONB-D3** | Reuse existing setup pages via **deep links**. |
| **ONB-D4** | Hybrid: skippable `/dashboard/getting-started` + cockpit widget (auto-hides when complete). |
| **ONB-D5** | No permanent dismiss flag in v1. |

## Shipped

- `GET /api/v1/dashboard/onboarding/status` + service/controller/tests
- `/dashboard/getting-started` + `OnboardingSteps`
- `OnboardingChecklistCard` on Today cockpit
- Sidebar “Getting started” nav entry

## Acceptance

- [x] Status endpoint returns 4 booleans + `complete`, doctor-scoped, read-only.
- [x] Getting-started page lists steps with live state + deep links.
- [x] Cockpit widget shows remaining steps; auto-hides when complete.
- [x] No migration; backend tests green; frontend slice lint/tsc clean.

**Created:** 2026-07-22. **Shipped:** 2026-07-22.
