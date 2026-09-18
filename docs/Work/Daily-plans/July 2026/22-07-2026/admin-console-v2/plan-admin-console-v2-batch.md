# admin-console-v2 — discoverability + invite UI

> **Status:** ✅ Complete (2026-07-22). **Weight: Auto** (frontend + reuse of an existing admin endpoint). Owner dogfood: profile-menu link + invite a test email.
> **One-line intent:** Make the admin console reachable without typing a URL (admin-only entry point), and turn the curl-only doctor-invite endpoint into a real form. The two smallest, highest-value admin-account improvements.
>
> **Roadmap:** [`../doctor-funnel/README.md`](../doctor-funnel/README.md) · builds on [`../admin-console-v1/`](../admin-console-v1/) (role + guard + `/admin/verifications`).

---

## Context that shapes the design (verified 2026-07-22)

- `/admin` is already a gated mini-app (layout header + `requireAdminAuth`); it just isn't linked from anywhere — deliberate in ACON-D6 ("not linked from the doctor nav"). v2 adds the discoverable, admin-only entry point.
- The invite endpoint **already exists**: `POST /api/v1/admin/doctors/invite`, body `{ email, fullName?, practiceName?, specialty? }` → `{ doctorId, prefilled }`. Since acon-01 it's gated by `requireAdminJwtOrSecret`, so a **browser admin** (session Bearer) can call it — no CRON_SECRET in the browser. Only a frontend page + API client fn are missing.
- Profile menu is `components/layout/HeaderProfileMenu.tsx` (receives `userEmail`). The dashboard layout already has `user` — the admin role (`user.app_metadata.role`) just needs threading: layout → `DashboardShell` → `Header` → `HeaderProfileMenu`.

## Decision lock

| ID | Decision |
|---|---|
| **ACON2-D1** | Entry point = an **"Admin console" item in the profile dropdown** (`HeaderProfileMenu`), rendered only when `app_metadata.role === 'admin'`. Keeps the doctor sidebar workflow-focused (matches DL-7: Settings/Integrations live in the dropdown). |
| **ACON2-D2** | The link is **visibility only** — the real gate stays server-side (`requireAdminAuth` on `/admin/*` + backend `requireAdminJwtOrSecret`). Hiding/showing the link changes nothing about access. |
| **ACON2-D3** | Invite UI lives at **`/admin/doctors/invite`** inside the existing admin shell; a nav item "Doctors" (or "Invite") joins "Verifications" in the admin header. |
| **ACON2-D4** | Invite UI **reuses the existing endpoint** via the browser admin JWT. No new backend, no new validation surface — mirror the server Zod schema in the form. |
| **ACON2-D5** | `prefilled` in the response reflects whether practice/name prefill was applied; surface a plain success ("Invite sent to …") and handle the already-registered 409 with a clear message. |

## Scope guard

- Admin-only profile-dropdown link + `isAdmin` plumbing + `/admin/doctors/invite` form + API client fn.
- **DO NOT** add a migration, new backend endpoint, or new auth surface (all reused).
- **DO NOT** put CRON_SECRET / service-role in the browser (invite goes over the admin session JWT).
- **DO NOT** add the admin link to the doctor sidebar or show it to non-admins.
- **DO NOT** build the doctors directory or per-doctor actions here (that's v3 — see roadmap).

## Tasks

| ID | Task | Status |
|---|---|---|
| ACON2-01 | Admin-only "Admin console" entry point (profile dropdown + `isAdmin` plumbing) | ✅ |
| ACON2-02 | `/admin/doctors/invite` form (reuse invite endpoint via admin JWT) | ✅ |
| ACON2-03 | Close gate (typecheck + lint, dogfood invite from the browser) | ✅ eng / ⏳ dogfood |

## Roadmap (future batches — NOT this one)

- **admin-console-v3 — Doctors directory** (`/admin/doctors`): one table of every doctor with verification / IG-connected / onboarding-complete status. Needs a **new admin-scoped read endpoint** aggregating `auth.users` + `doctor_verification` + `doctor_settings` + `doctor_instagram`. **Opus** (broad data scope, RLS/PHI care).
- **admin-console-v4 — Per-doctor actions**: resend invite, re-review / revoke verification, pause receptionist. **Opus** (touches the live go-live gate).
- **admin-console-v5 — Admin management**: grant/revoke `role='admin'` from the UI (currently SQL). **Opus** (auth surface). Low priority until team growth.

## Acceptance (frame)

- [ ] Admin sees "Admin console" in the profile dropdown → one click to `/admin/verifications`. Non-admins never see it.
- [ ] `/admin/doctors/invite` sends an invite over the admin session (no secret in browser); success + already-registered (409) messaged clearly.
- [ ] Typecheck + lint green; dogfood: invite a test email end-to-end.

**Created:** 2026-07-22.
