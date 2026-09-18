# Task lvc-13: CarryForwardButton reads last-visit-summary

**Program / Phase:** last-visit-context · Phase 3
**Status:** Implemented 2026-09-11
**Change Type:** Update existing

`CarryForwardButton` currently fetches `GET /prescriptions/last-subjective` on every Subjective mount. That is a second last-visit read (LVC-DL-6).

Repoint to `useLastVisitSummary()` / the provider already mounted above SOAP. Keep copy-all / pick-fields. Same-appointment siblings stay excluded (LVC-Q2) — the summary is appointment-scoped.

Do not delete the last-subjective endpoint if something outside the cockpit still needs it. Do not start `lvc-14`.
