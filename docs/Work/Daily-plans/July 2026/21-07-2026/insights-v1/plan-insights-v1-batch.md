# Insights v1 — batch plan (21 Jul 2026)

> **Hand-off doc.** Written for an executing agent. Self-contained: cites real files, locked decisions, phased tasks, scope guard, verification gate.
>
> **One-line intent:** Turn the staked-but-empty `Insights` tab into a **retrospective practice dashboard** — range-scoped operational, funnel, clinical-mix, and telehealth metrics, all computed over data Clariva already stores. No new capture, no migration.
>
> **Overrides the deferral.** `plan-sidebar-restructure.md` DL-3 / S4.1 parked Insights content "until a doctor asks". A doctor asked (2026-07-21) — this batch is that content plan. S4.1 promoted here.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-insights-v1.md`](./Tasks/EXECUTION-ORDER-insights-v1.md).

---

## Why this batch

The `Insights` sidebar slot has rendered "Coming soon." since the sidebar restructure (sr-01). The Today dashboard answers *"what's happening right now"* (`KpiStrip.tsx`: consults done/total, pending DMs, Rx sent today) but deliberately shows **no trends**. A doctor has no way to see:

- Am I growing / how busy have I been (last 7 / 30 / 90 days)?
- What's my no-show rate, and is it getting worse?
- How much did I actually get paid?
- Is the booking bot converting DMs into paid appointments?
- What am I actually treating / prescribing?
- Is my telehealth quality acceptable?

Every one of those is answerable from existing tables. Insights is the **range/trend surface** that complements Today's **now surface**.

---

## Current state (grounded)

- **Placeholder:** [`frontend/app/dashboard/insights/page.tsx`](../../../../../frontend/app/dashboard/insights/page.tsx) — `<h1>Insights</h1>` + "Coming soon." Server component with the standard auth shape.
- **Sidebar:** `Insights` entry wired (`Sidebar.tsx`, `BarChart3`) → `/dashboard/insights`.
- **KPI pattern to mirror:** [`frontend/components/dashboard/cockpit/KpiStrip.tsx`](../../../../../frontend/components/dashboard/cockpit/KpiStrip.tsx) — `KpiCard`, skeletons, `—` for null.
- **Query plumbing to mirror:** `rxSentTodayQueryOptions` in `frontend/lib/query/options.ts`; `useRxSentTodayQuery` in `frontend/hooks/queries/`.
- **Backend read pattern to mirror:** `dashboard-events-controller.ts` (asyncHandler, `req.user.id` only, `successResponse`, Zod, typed errors) + a nearby read service (`appointment-service.ts`). Routes registered in `backend/src/routes/api/v1/index.ts` (see `/dashboard/events`).
- **Data already present:**
  - `appointments` — `status` (`pending|confirmed|cancelled|completed|no_show`), `consultation_type` (`text|voice|video|in_clinic`), `appointment_date`, `diagnosis_tags[]`, `followup_kind`.
  - `payments` — `amount_minor`, `currency`, `status` (`pending|captured|failed|refunded`), `gateway`.
  - `consultation_sessions` — `modality`, `status`, `actual_started_at`, `actual_ended_at`, `patient_joined_at`, `upgrade_count`/`downgrade_count`.
  - `slot_selections` — `slot_start`, `consumed_at`; `service_staff_review_requests` — `status`, `sla_deadline_at`.
  - `prescriptions` — `diagnoses_json` / `diagnosis_tags`, `investigations_orders_json`; `prescription_medicines` — `medicine_name`.
  - `video_call_quality` / `voice_call_quality` — RTT, jitter, packet loss, fps, bitrate.
- **Missing:** no aggregation endpoints, no Insights query options / hooks, no widgets.

---

## Decision lock (LOCKED 2026-07-21)

| ID | Decision | Implication |
|----|----------|-------------|
| **INS-D1** | **Insights = retrospective / range surface; Today = live / now.** | Do not duplicate the Today KPI strip. No single-day "now" tiles here. |
| **INS-D2** | **Aggregate-only, PHI-safe.** | No patient names / phones / DOBs in any tile. No raw `payments` rows or per-patient rows cross the wire — only counts, sums, rates, percentiles. |
| **INS-D3** | **Doctor-scoped, always.** `req.user.id` is the only `doctor_id`; RLS enforced. | No cross-doctor / multi-clinic benchmarks in v1 (RLS is per-doctor). |
| **INS-D4** | **No new capture, no migration.** Everything computed over existing tables. | Any metric needing new capture (satisfaction / NPS) is parked, not built. |
| **INS-D5** | **Date-range control: 7 / 30 / 90 days, default 30.** | Single control drives every widget on the tab. |
| **INS-D6** | **No new chart dependency.** Reuse the repo's existing chart lib; else a lightweight bar list. | Keeps the bundle honest; avoids a viz-lib bake-off inside a metrics task. |
| **INS-D7** | **Read endpoints under `/api/v1/dashboard/insights/*`.** Controllers orchestrate only; Zod-validated; typed `AppError`s. | Mirrors `/dashboard/events`. One route file, one controller, one service (may grow helpers). |
| **INS-D8** | **Opus for money/RLS-touching tasks.** | `payments`-reading tasks (`ins-01`, `ins-03`) run on Opus per `00-agent-contract.mdc`. |
| **INS-D9** | **Wait time is derived, not stored.** Compute from `appointment_date` vs `consultation_sessions.actual_started_at`. | No new column; keep it a computed metric or defer if noisy. |
| **INS-D10** | **Calendar / week-grid stays parked** (inherits DL-11). | Insights is not a calendar substitute. |

---

## ⚠️ Scope guard

- **DO NOT** touch the Today dashboard or `KpiStrip.tsx` — Insights is a separate surface.
- **DO NOT** add a migration, alter any table, or write to `payments` / `appointments` / `consultation_sessions` / `prescriptions`.
- **DO NOT** render PHI (patient names/phones/DOBs) in any Insights widget. Patient-level drill-down stays in Patients / Cockpit.
- **DO NOT** add a new charting dependency (INS-D6).
- **DO NOT** build parked items: satisfaction/NPS, cross-doctor benchmarks, calendar view, patient-level drill-down.
- If a single task balloons past ~5 backend or ~5 frontend files, **STOP and split** (backend/frontend halves) rather than expanding.

---

## Cross-cutting acceptance gate (whole batch)

Insights v1 is green only when **all** hold:

- [x] `/dashboard/insights` renders a working dashboard (no "Coming soon." remains) behind the standard auth guard.
- [x] A single **7 / 30 / 90-day** range control drives every widget; changing it refetches and updates all tiles.
- [x] **Overview (Tier 1):** volume (by status + modality), no-show rate, revenue captured, consult completion + median duration — all correct against seeded data.
- [x] **Funnel (Tier 2):** DM/slot → consumed → payment captured → confirmed appointment; booking-review SLA/backlog.
- [x] **Clinical mix (Tier 3):** top diagnoses, medicines, investigations — **aggregate counts only, de-identified**.
- [x] **Telehealth (Tier 4):** call-quality summary + modality mix + join-success.
- [x] Every endpoint is doctor-scoped (`req.user.id`), read-only, Zod-validated; revenue counts only `captured`.
- [x] No PHI on the tab; no raw payment/patient rows in any response.
- [x] Today dashboard / `KpiStrip.tsx` untouched.
- [x] Light + dark desktop smoke; loading + empty states don't crash. *(Theme-token UI + empty/loading tests; visual light/dark pass parked in inbox as dogfood.)*
- [x] Insights slice type-check / lint / tests green (repo-wide lint/`tsc` still has pre-existing non-insights noise).

---

## Tasks

| Task | Title | Tier | Size | Model |
|---|---|---|---|---|
| `ins-01` | Practice-health aggregation API (route + controller + service + tests) | 1 | M | **Opus** (payments read) |
| `ins-02` | Insights overview UI — page shell, range control, tiles, volume trend | 1 | M | Sonnet |
| `ins-03` | Booking funnel + booking-review SLA (backend + frontend) | 2 | M | **Opus** (payments read) |
| `ins-04` | Clinical mix — top Dx / meds / investigations, de-identified (backend + frontend) | 3 | M | Sonnet |
| `ins-05` | Telehealth quality — call quality + modality mix + join success (backend + frontend) | 4 | S–M | Sonnet |
| `ins-06` | Close gate — cross-cutting acceptance, smoke matrix, verification, capture follow-ups | — | S | Sonnet / Composer |

---

## Cost estimate

| Wave | Tasks | Wall-clock |
|---|---|---|
| Wave 1 — overview data | `ins-01` | ~3–4h |
| Wave 2 — overview UI | `ins-02` | ~2–3h |
| Wave 3 — funnel | `ins-03` | ~3–4h |
| Wave 4 — clinical mix | `ins-04` | ~3–4h |
| Wave 5 — telehealth | `ins-05` | ~2–3h |
| Wave 6 — close gate | `ins-06` | ~1–2h |
| **Total** | **6** | **~14–20h agent-time** |

**Caps:** 2 Opus tasks (`ins-01`, `ins-03` — payments read). **No migration. No PHI in UI. No RLS change** (reads existing per-doctor policies).

---

## Sequencing notes

- **ins-01 first** — the overview endpoint is the data spine; everything downstream mirrors its route/service pattern.
- **ins-02 next** — thin UI over ins-01; establishes the page shell + range control every later widget plugs into.
- **ins-03 → ins-05** — each tier is an independent vertical slice (endpoint + widget). Can parallelize *after* ins-02 lands the shell, but default to serial to avoid shell merge churn.
- **ins-06 last** — proves the whole-batch gate; capture any dogfood follow-ups to `docs/Work/capture/inbox.md`.

---

## Open questions (resolved)

1. **Chart rendering (INS-D6):** ✅ Repo already has `recharts` — used for overview modality bars. Funnel + telehealth use CSS bars. No new dep.
2. **Wait-time metric (INS-D9):** ✅ Parked — see `docs/Work/capture/inbox.md` (insights-v1 parked wait-time).
3. **Clinical-mix source of truth (ins-04):** ✅ Prefer `prescriptions.diagnoses_json`, fall back to `appointments.diagnosis_tags`; DTO surfaces `diagnosesSource`.
4. **Range presets:** ✅ 7/30/90 fixed (INS-D5); custom picker parked in inbox.

---

## References

- Product plan (deferral overridden): [`../../../../Product plans/plan-sidebar-restructure.md`](../../../../Product%20plans/plan-sidebar-restructure.md) (DL-3 / S4.1)
- DoD: [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)
- Standards / Recipes: `docs/Reference/engineering/development/STANDARDS.md` · `docs/Reference/engineering/development/RECIPES.md`
- Schema: `docs/Reference/engineering/architecture/DB_SCHEMA.md`
- Agent contract: `.cursor/rules/00-agent-contract.mdc`

---

**Created:** 2026-07-21. **Status:** ✅ Complete — shipped 2026-07-21 (`ins-01`…`ins-06`). Overrides DL-3/S4.1 deferral.
