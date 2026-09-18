# doctor-invite-v1 — post-demo admin invite

> **Status:** ✅ Shipped 2026-07-22. **⚠️ Touches auth (Supabase admin / service-role).**
> **One-line intent:** After a demo, an admin **invites** the doctor by email (they set their own password) and optionally pre-fills practice fields captured during the demo — instead of anyone hand-filling the public signup form (DF-D3).
>
> **Roadmap:** [`../doctor-funnel/README.md`](../doctor-funnel/README.md) · batch #5 (Gate 1: Account, post-demo).

---

## When to build this

Built once `doctor-verification-v1` ver-04 landed the shared admin gate (`requireAdminSecret` / `CRON_SECRET`). Supabase dashboard invite remains a fallback.

## Decision lock

| ID | Decision |
|---|---|
| **INV-D1** | Invite via Supabase `inviteUserByEmail` (service-role, **server-side only**). ✅ |
| **INV-D2** | Reuse the admin guard from `doctor-verification-v1` (ver-04) — `requireAdminSecret` / `CRON_SECRET`. No second admin concept. ✅ |
| **INV-D3** | Invited doctor sets their **own** password via the invite link → lands at `/dashboard/getting-started` when `APP_BASE_URL` is set. ✅ |
| **INV-D4** | Optional pre-fill of `doctor_settings` (practice name/specialty) + optional `user_metadata.full_name` at invite time — never sets a password. ✅ |
| **INV-D5** | **No browser admin UI in v1.** Putting `CRON_SECRET` in a browser form would leak the ops secret. Ops invites via curl / internal tool (same posture as verification review). |

## Scope guard

- One admin invite endpoint + a minimal admin trigger UI; optional settings pre-fill.
- **DO NOT** put service-role keys in the browser.
- **DO NOT** create a separate "invited doctor" type — same account model.
- **DO NOT** build this before the admin role exists (ver-04) unless standing up a minimal guard here.

## Tasks

| ID | Task | Status |
|---|---|---|
| INV-01 | Admin invite endpoint (service-role, server-side) | ✅ |
| INV-02 | Pre-fill from demo + close gate | ✅ (browser UI skipped — INV-D5) |

## What shipped

- `POST /api/v1/admin/doctors/invite` behind `requireAdminSecret`
- Body: `email` (required), optional `fullName` / `practiceName` / `specialty`
- Service: `inviteUserByEmail` + optional `doctor_settings` upsert; already-registered → `ConflictError`
- Prefill point: **at invite time** (once auth user id exists), not first login
- Unit tests: service + controller (10)

### Ops curl

```bash
curl -X POST "$API/api/v1/admin/doctors/invite" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email":"doc@example.com","fullName":"Dr Jane","practiceName":"Clinic","specialty":"Derm"}'
```

## Acceptance

- [x] Admin can invite by email; doctor receives link + sets own password.
- [x] Invited account is indistinguishable from self-serve afterward.
- [x] Optional practice pre-fill lands in `doctor_settings`; no password ever set by admin.
- [x] Service-role stays server-side; admin-guarded; no PII in logs.
- [x] Browser UI deferred (INV-D5) — ops curl documented.

**Created:** 2026-07-22.
