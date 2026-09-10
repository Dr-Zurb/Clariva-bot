# alu-02 — Empty, loading, error, close gate

> **Model:** Auto  
> **Depends:** alu-01  
> **Plan:** [plan-alerts-ui-align-batch.md](../plan-alerts-ui-align-batch.md) · ALU-D5, D7, D9

## Goal

Empty/loading/error polish + verify.

## Work

1. Dashed empty state; `Alert` + Retry for feed errors.
2. In-feed Skeleton rows; `components/skeletons/alerts.tsx` + `alerts/loading.tsx`.
3. Update `DoctorDashboardEventFeed.test.tsx` for chrome copy changes; run tests.

## Done when

- Empty/loading/error match dashboard list hubs.
- Feed unit tests green; batch acceptance checked off.
