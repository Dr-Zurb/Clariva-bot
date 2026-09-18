# admin-console-v3 — doctors directory

> **Status:** ✅ Complete (2026-07-22). **Weight: Opus** (new admin-scoped read that aggregates `auth.users` + `doctor_settings` + `doctor_verification`; returns email/PII to the browser — privilege + data-scope care). **No migration** (reads only). Owner dogfood: `/admin/doctors` funnel + resend from a row.
> **One-line intent:** Give ops a single `/admin/doctors` table that shows the whole funnel — invited / onboarding / pending review / verified / rejected — so we can answer "who did I invite, who's stuck, who never set a password, who's live?" without SQL or guesswork. Fold in **Resend invite** from the row (the exact pain from the invite/set-password debugging).
>
> **Roadmap:** builds on [`../admin-console-v1/`](../admin-console-v1/) (role + `requireAdminJwtOrSecret` + `/admin` shell) and [`../admin-console-v2/`](../admin-console-v2/) (entry point + invite endpoint/form). Precedes **admin-console-v4** (heavier per-doctor actions).

---

## Context that shapes the design (verified 2026-07-22)

- **`auth.users` is the only complete spine.** `listVerifications` (`doctor-verification-service.ts`) reads **only** the `doctor_verification` table, keyed by status, and has **no email**. Invited-but-not-onboarded doctors exist *only* in `auth.users` (no `doctor_verification`, maybe no `doctor_settings`). So the directory must start from `admin.auth.admin.listUsers` and LEFT-join the two tables — not from `doctor_verification`.
- **The funnel signals already exist:**
  - `auth.users.invited_at` + `user_metadata.password_set` → distinguishes *invited (link not finished)* from *account is real* (established in the invite/set-password work — `doctor-invite-service.ts` `clearUnfinishedInviteStub`).
  - `doctor_verification.status` ∈ `unverified | pending_review | verified | rejected` (`types/doctor-verification.ts`).
  - `doctor_settings.practice_name` / `specialty` for display (prefilled at invite).
- **All plumbing is reusable:** `requireAdminJwtOrSecret` gates admin routes; the admin shell + nav + React Query patterns exist; `inviteDoctor(resend:true)` already deletes an unfinished stub and re-invites; `/admin/verifications/[doctorId]` is the existing detail page.
- **Email is PII.** It must render in the admin UI (you identify doctors by email) but must **never** hit logs — logs stay `doctorId` + `correlationId` only (agent contract).

## Decision lock

| ID | Decision |
|---|---|
| **ACON3-D1** | Directory spine = `admin.auth.admin.listUsers` (paginated loop, mirroring `findAuthUserByEmail`), LEFT-joined in-memory with `doctor_settings` + `doctor_verification` by `doctor_id`. Not driven off `doctor_verification`. |
| **ACON3-D2** | Server derives a single `funnelStatus` ∈ `invited \| onboarding \| pending_review \| verified \| rejected`. Precedence: a real `doctor_verification.status` of pending/verified/rejected wins; else `password_set` ⇒ `onboarding`; else `invited_at` (no password) ⇒ `invited`. One source of truth for the badge. |
| **ACON3-D3** | New endpoint `GET /api/v1/admin/doctors`, gated by the existing `requireAdminJwtOrSecret`. **Read-only, no migration, no new auth surface.** |
| **ACON3-D4** | Response includes `email` (needed to identify doctors) but the handler/service **never log it** — structured logs carry `doctorId` + `correlationId` only. |
| **ACON3-D5** | **Pull `Resend invite` forward from the v4 roadmap into v3** because it reuses the existing invite endpoint (`resend:true`) and is the live ops pain. Heavier actions (revoke/re-review verification, pause receptionist) stay in **v4**. *(One-line deviation from the v2 roadmap, flagged for traceability.)* |
| **ACON3-D6** | "View verification" is a deep-link to the existing `/admin/verifications/[doctorId]` — enabled only when a `doctor_verification` row exists (status ≠ `invited`). No new detail UI. |
| **ACON3-D7** | Instagram-connected column is **optional/stretch** — confirm the source (`doctor_settings` IG fields vs a dedicated table) during ACON3-01; the batch ships without it if it adds scope. |
| **ACON3-D8** | Paginated `listUsers` loop is acceptable for invite-only beta volume. Revisit (server-side search/paging) only past ~1k doctors. |

## Scope guard

- **Build:** `GET /api/v1/admin/doctors` (aggregation + derived `funnelStatus`) · `/admin/doctors` table page · funnel status badges · "Doctors" admin-nav link · row actions **Resend invite** (reuse endpoint) + **View verification** (deep-link).
- **DO NOT** add a migration or change any DB schema.
- **DO NOT** put CRON_SECRET / service-role in the browser (directory reads over the admin session JWT).
- **DO NOT** build revoke / re-review / pause-receptionist actions — that's **v4**.
- **DO NOT** change verification or invite backend logic — reuse as-is.
- **DO NOT** log emails or any PII; no full names in logs.

## Tasks

| ID | Task | Weight | Status |
|---|---|---|---|
| ACON3-01 | Backend `GET /admin/doctors` — aggregate `auth.users` + `doctor_settings` + `doctor_verification`, derive `funnelStatus`; types + controller + route + unit tests | Opus | ✅ |
| ACON3-02 | Frontend `/admin/doctors` directory — API client fn + query hook + table + funnel status badges + "Doctors" nav link | Auto | ✅ |
| ACON3-03 | Row actions — Resend invite (reuse `inviteDoctor(resend:true)`) + View-verification deep-link; fix stale invite-form "localhost" copy | Auto | ✅ |
| ACON3-04 | Close gate — typecheck + lint + tests; dogfood (see the funnel, resend from the list); note prod-cutover checklist | Auto | ✅ eng / ⏳ dogfood |

## Roadmap (future batches — NOT this one)

- **admin-console-v4 — Per-doctor actions:** revoke / re-review verification, pause receptionist. **Opus** (touches the live go-live gate / VER-05).
- **admin-console-v5 — Admin management:** grant/revoke `role='admin'` from the UI (currently the SQL runbook). **Opus** (auth surface). Low priority until team growth.
- **Data hygiene (backlog):** resend deletes+recreates the auth user, orphaning the prefilled `doctor_settings` row (old `doctor_id`). Surfaced by the directory; clean up when it becomes noise.

## Acceptance (frame)

- [ ] `/admin/doctors` lists every doctor with an accurate funnel badge; invited-but-never-finished accounts are visible (the ones that were invisible before).
- [ ] Resend invite works from a row for `invited` doctors; View verification deep-links for submitted ones.
- [ ] Email shown in UI, never in logs; reads go over the admin JWT (no secret/service-role in browser).
- [ ] Typecheck + lint + tests green; owner dogfood passes.

**Created:** 2026-07-22.
