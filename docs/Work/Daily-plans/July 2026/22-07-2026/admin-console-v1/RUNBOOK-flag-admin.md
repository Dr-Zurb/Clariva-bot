# Runbook — flag the first admin

> Part of [`admin-console-v1`](./plan-admin-console-v1-batch.md) · acon-03.

Admin access = Supabase `app_metadata.role = 'admin'`, set **server-side only**. The browser console never sets this flag.

## Option A — Supabase SQL editor (fastest)

```sql
UPDATE auth.users
SET raw_app_meta_data =
  COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
WHERE email = 'YOU@example.com';
```

Confirm:

```sql
SELECT id, email, raw_app_meta_data->>'role' AS role
FROM auth.users
WHERE email = 'YOU@example.com';
```

## Option B — service-role script (Node / curl)

Via Supabase Admin API `auth.admin.updateUserById` (service role key — never expose to the browser):

```ts
await supabaseAdmin.auth.admin.updateUserById(userId, {
  app_metadata: { role: 'admin' },
});
```

Merging: prefer reading existing `app_metadata` first and merging so you don't wipe other keys.

## After flagging — re-login required

Access tokens are minted at login. A session that predates the flag will **not** carry `role: admin` until you:

1. Sign out
2. Sign in again
3. Open `/admin/verifications`

If you still land on `/dashboard`, the JWT is stale or the SQL didn't match the email.

## Ops fallback (no admin JWT)

`CRON_SECRET` still works on `/api/v1/admin/verifications/*` and `/api/v1/admin/doctors/*` (curl / internal tools). Prefer the console once your account is flagged.

## Revoke

```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data - 'role'
WHERE email = 'YOU@example.com';
```

Then re-login (or wait for token expiry).
