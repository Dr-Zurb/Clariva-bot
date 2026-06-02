# Web Push VAPID provisioning

**Task:** text-D6a · Web Push part 1  
**Consumers:** text consult (D6b/D6c), voice/video remote-join push (T5.32)

This runbook covers generating, deploying, and rotating the VAPID keypair used by `push-notification-service.ts`.

---

## Generate a keypair

From the `backend/` directory:

```bash
npx web-push generate-vapid-keys
```

Example output:

```
Public Key:
BITE0hzdp7lpQGIUoLfMK8ycN3_3HQCk4u_sIw3gHQ8XtYUq5m2LRZESRpnvqyIgDQcCAVCnhP78e2gfqhjDM_I

Private Key:
mtteDyeUtEKNEPibXE6DeVlT7qbTb0mcyIzaPhgXhfs
```

**Never commit real private keys.** Store them in secrets managers only.

---

## Where to set env vars

| Variable | Backend | Frontend |
|----------|---------|----------|
| `WEB_PUSH_VAPID_PUBLIC_KEY` | `.env.local`, Render secrets | — |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | `.env.local`, Render secrets | **Never** expose |
| `WEB_PUSH_CONTACT_EMAIL` | `.env.local`, Render secrets | — |
| `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` | — | Vercel env (same value as public key) |

Placeholders live in:

- `backend/.env.example`
- `frontend/.env.example`

The backend service no-ops when VAPID vars are unset (safe for local dev without push).

---

## Rotation policy

**Do not rotate VAPID keys without a coordinated deploy.**

Rotating the keypair **invalidates every existing push subscription**. All doctors and patients must re-subscribe via the D6b opt-in flow (or a forced re-prompt in a future migration).

Recommended rotation steps:

1. Announce maintenance window (optional — push is best-effort).
2. Deploy new keys to backend **and** frontend (`NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`) in the same release.
3. Truncate or mark revoked all rows in `web_push_subscriptions` (or let 410 cleanup happen organically — slower).
4. Verify a fresh subscribe + send in staging before prod.

---

## Abuse contact

`WEB_PUSH_CONTACT_EMAIL` must be a `mailto:` URI (e.g. `mailto:ops@clariva.health`). Push providers use it for abuse reports per the Web Push spec.

---

## Related code

- Migration: `backend/migrations/111_web_push_subscriptions.sql`
- Service: `backend/src/services/push-notification-service.ts`
- Subscribe flow (D6b): patient opt-in in `<TextConsultRoom>`; doctor dashboard opt-in deferred
- Operations: [web-push-operational-runbook.md](./web-push-operational-runbook.md)
