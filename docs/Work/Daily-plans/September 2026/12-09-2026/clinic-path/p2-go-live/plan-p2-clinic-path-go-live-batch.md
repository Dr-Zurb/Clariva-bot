# Plan p2 — Clinic go-live

> **Product plan:** [`plan-clinic-path.md`](../../../../../Product%20plans/plan-clinic-path.md)
> **Prior phase:** [`../p1-discovery/`](../p1-discovery/)
> **Status:** **Implemented** 2026-09-12. Residual: apply `232_doctor_settings_social_enquiries.sql` before this ships. Existing doctors who already completed profile will not see the question (backfill Yes).
> **Prefix:** `clp` · Tasks `clp-06`…`clp-10`
> **Model:** Astra max / Opus. Migration + go-live gate.

A doctor who answers "Not yet" can complete onboarding without Instagram. A doctor who answers "Yes" (and every existing account) keeps today's checklist.

**Not this phase:** `/clinics` copy, homepage, pricing, hiding the Instagram step.

## Task table

| ID | Title | Size | Model | Status |
|---|---|---|---|---|
| [`clp-06`](./Tasks/task-clp-06-settings-field.md) | Persist the Yes / Not yet answer | M | Opus | ✅ 2026-09-12 |
| [`clp-07`](./Tasks/task-clp-07-complete-profile-question.md) | Ask the question on complete-profile | M | Opus | ✅ 2026-09-12 |
| [`clp-08`](./Tasks/task-clp-08-optional-instagram-complete.md) | Drop Instagram from `complete` when Not yet | M | Opus | ✅ 2026-09-12 |
| [`clp-09`](./Tasks/task-clp-09-optional-checklist-step.md) | Keep Instagram visible, mark optional | S | Opus | ✅ 2026-09-12 |
| [`clp-10`](./Tasks/task-clp-10-phase-2-gate.md) | Two-account proof | M | Opus | ✅ 2026-09-12 — unit proof; apply migration before a live dummy walk |

## Gate (one sentence)

A "Not yet" test doctor reaches go-live complete without Instagram; a Yes / existing account's checklist is unchanged.

## Locks inherited

CLP-DL-6, CLP-DL-7, CLP-DL-8. Do not invent a second product or a clinic SKU.

**Stop rules (TASK_MANAGEMENT_GUIDE):** schema/contract change = Yes. PHI = No (practice preference, not a patient). RLS = inherit existing `doctor_settings` policies — verify, do not invent new ones. External AI = No.

**Created:** 2026-09-12.
