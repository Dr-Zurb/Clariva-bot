# admin-console-v1 — team review console

> **Status:** ✅ Complete (2026-07-22). Shipped under Opus. Owner dogfood: flag admin + review a pending signup (see inbox + [`RUNBOOK-flag-admin.md`](./RUNBOOK-flag-admin.md)).
> **One-line intent:** A role-gated in-app surface where a human reviews doctor verification signups — sorted list, inline document view, approve/reject — replacing the `CRON_SECRET`/curl path. Same code scales to a team: just flag more users admin.
>
> **Roadmap:** [`../doctor-funnel/README.md`](../doctor-funnel/README.md) · follows `doctor-verification-v1` (spine) + `doctor-invite-v1`. Should land **before** `doctor-verification-v1` VER-05 (the go-live gate relies on a fast, reliable approval path).

---

## ⚠️ Why Opus (agent-contract escalation triggers)

- **Admin role / authz** — introduces a privileged, browser-reachable path that does not exist today. Getting the guard wrong exposes every doctor's verification docs.
- **Auth surface** — reads a role claim from the Supabase access token and gates review endpoints on it.
- Multi-file (backend guard + endpoint wiring + frontend admin area).

**No new migration.** The verification table/bucket + service layer already exist. This batch is authz + UI only.

## Context that shapes the design (verified 2026-07-22)

- Review **service layer already exists**: `doctor-verification-service.ts` has `listVerifications`, `getVerificationForReview` (signed doc URLs), `approveVerification`, `rejectVerification`. UI + guard are the only gaps.
- Today's admin path is `CRON_SECRET` (`requireAdminSecret`) — **server-side only**; it must never reach the browser. That's the whole reason a UI didn't ship in `doctor-verification-v1` (VER-D6 / INV-D5).
- The token verifier (`utils/supabase-token-verifier.ts`) already reconstructs `app_metadata` + `role` onto `req.user` — so a guard can read the admin flag from the **normal login JWT** with no new plumbing.
- Migration 183 has forward-compat admin RLS keyed on `auth.jwt() ->> 'role' = 'admin'`. **Claim nuance (ACON-D5):** Supabase's top-level `role` claim is the *Postgres* role (`authenticated`), not a custom value — so that RLS won't fire for a normal user. v1 does **not** rely on it: the guard is in application code and data access stays on the service-role client (as today). The 183 admin RLS remains dormant/forward-compat.

## Decision lock (proposed — confirm in Opus design pass)

| ID | Decision |
|---|---|
| **ACON-D1** | Admin identity = Supabase **`app_metadata.role = 'admin'`**, set **server-side** (Supabase admin API / SQL). Admins are ordinary `auth.users` rows with a flag — no new table, no "admin user" type. |
| **ACON-D2** | Backend **`requireAdmin`** guard runs *after* `authenticateToken` and checks `req.user.app_metadata.role === 'admin'` (already surfaced by the token verifier). Non-admin → **403**. Never trust a client-supplied role in the body/query. |
| **ACON-D3** | Review endpoints accept **admin-JWT (browser) OR `CRON_SECRET` (ops fallback)** via one guard. Reuse existing controllers/service — **no new business logic**. |
| **ACON-D4** | `reviewed_by` = the admin's `user.id` when actioned via the console; `'ops'` when via `CRON_SECRET`. Improves the audit trail. |
| **ACON-D5** | Data access stays on the **service-role client** (as today); the guard is the gate. The 183 admin RLS stays forward-compat (see claim nuance above). No service-role/`CRON_SECRET` ever in the browser. |
| **ACON-D6** | UI lives at **`/admin/verifications`** (separate route group, **not** linked from the doctor nav). Server-side gate redirects non-admins. Docs shown via the existing short-lived signed URLs. |

## Scope guard

- Admin role flag + `requireAdmin` guard + dual-auth wiring on the existing review endpoints + a minimal `/admin/verifications` list/detail UI.
- **DO NOT** add a new migration or table (reuse verification spine).
- **DO NOT** put the service-role key or `CRON_SECRET` in the browser.
- **DO NOT** wall the doctor dashboard or change the doctor-facing verification flow.
- **DO NOT** build the go-live gate here (that's `doctor-verification-v1` VER-05, next).
- **DO NOT** fold admin authz into the normal doctor path.

## Tasks

| ID | Task | Status |
|---|---|---|
| ACON-01 | Admin role + `requireAdmin` guard; dual-auth review endpoints; stamp reviewer id | ✅ |
| ACON-02 | `/admin/verifications` list + detail UI (inline doc preview, approve/reject) | ✅ |
| ACON-03 | Close gate (tests, admin-flag runbook, dogfood) | ✅ eng / ⏳ owner dogfood |

## Acceptance (frame)

- [x] A flagged admin logs in with their normal account and reaches `/admin/verifications`; a non-admin is redirected / 403'd. *(owner: flag + re-login per runbook)*
- [x] Sorted list of signups by status (pending / verified / rejected); row → detail with the cert previewed inline via a short-lived signed URL.
- [x] Approve / reject (reason) works from the UI; `reviewed_by` records the admin's id; status reflects on the doctor's page. *(owner dogfood)*
- [x] `CRON_SECRET` ops path still works (fallback). No service-role/secret in the browser; no PII/doc contents in logs.
- [x] Non-admin blocked on every admin route (unit-tested).

**Created:** 2026-07-22.
