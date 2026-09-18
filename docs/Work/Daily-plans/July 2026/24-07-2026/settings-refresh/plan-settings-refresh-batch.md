# settings-refresh — batch plan

> Make Settings feel finished: shared load/save shell, semantic tokens, two
> organization fixes (Pricing unify + IG pause → Integrations). No new Profile /
> Notifications / Danger-zone pages. No persistent settings nav.

**Exec:** [`./Tasks/EXECUTION-ORDER-settings-refresh.md`](./Tasks/EXECUTION-ORDER-settings-refresh.md)

---

## Why

Settings still uses hardcoded gray/blue classes, six copy-pasted
`getSession → getDoctorSettings → dirty/save` blocks (ignoring
`useDoctorSettingsQuery`), and split-brain org (currency vs fees; IG pause in
Bot Messages). Reads as unfinished next to Getting started / verification.

---

## Decision lock (SR-D*)

| # | Decision | Rationale |
|---|---|---|
| **SR-D1** | Shared `useDoctorSettingsForm` + `SettingsPageShell` for leaf pages. Token via `useSessionAccessToken` (client) — Settings sits under a Client layout tree, so `requireDashboardAuth` / `server-only` cannot be used on these pages. | Kill 6× fetch/save duplication; match dashboard query patterns without breaking the Client layout boundary. |
| **SR-D2** | Semantic tokens + shadcn `Input` / `Label` / `Card` / `Button` where practical. Native `<select>`/`<textarea>` OK with token classes. | Dark-mode + halo-blue; no full redesign. |
| **SR-D3** | **Pricing** = practice currency + services catalog. Keep URL `/practice-setup/services-catalog`; label/card → “Pricing”. Currency leaves Practice Info. | Unify without breaking onboarding deep links. |
| **SR-D4** | Move **pause Instagram receptionist** to Integrations (beside Connect). Bot Messages keeps welcome + default notes only. | Same feature, one place. |
| **SR-D5** | Defer: Profile page, Notifications, Danger zone, theme toggle wiring, persistent settings nav. | Scope lock from owner 2026-07-24. |
| **SR-D6** | Migrate **services-catalog** lightly: add currency section + token chrome; do **not** fully rewrite the catalog editor into the form hook this batch. | Catalog page is large/mode-aware — blast radius. |
| **SR-D7** | Frontend-only. No migration. | Settings already backed by existing `doctor_settings` PATCH. |

---

## Target IA (unchanged nesting, clearer labels)

```
Settings
├─ Account
├─ Practice setup
│   ├─ Practice info      (no currency)
│   ├─ Pricing            (was Services catalog + currency)
│   ├─ Booking rules
│   ├─ OPD mode
│   ├─ Patient flow
│   ├─ Messaging          (was Bot Messages; no IG pause)
│   └─ Availability
└─ Integrations           (+ IG pause)
```

---

## Out of scope

- Profile / Notifications / Danger zone
- Theme toggle implementation
- Renaming the URL path away from `services-catalog`
- Backend changes

---

## Close gate

- [x] Shared shell + form hook used by practice-info, booking-rules, opd-mode, patient-flow, messaging
- [x] Hardcoded gray/blue largely gone on touched pages
- [x] Currency on Pricing; gone from Practice info
- [x] IG pause on Integrations only
- [x] Landings copy/casing updated
- [x] Lint + vitest green on touched files

**Follow-up (not this batch):** Availability page still on legacy gray chrome + hand-rolled fetch — same shell migration when you next touch it.
