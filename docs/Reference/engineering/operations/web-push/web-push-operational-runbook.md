# Web Push operational runbook

**Task:** text-D6c · Web Push part 3  
**Related:** [web-push-vapid-provisioning.md](./web-push-vapid-provisioning.md)

Operations guide for verifying, remediating, and revoking Web Push in production.

---

## Architecture recap

| Layer | Responsibility |
|-------|----------------|
| `chat-push-listener.ts` | Realtime `consultation_messages` INSERT → `sendPushToSession` (text modality) |
| Voice batch T5.32 (future) | Twilio `participant-connected` → `sendPushToUser` (voice/video modality) |
| `push-notification-service.ts` | VAPID fan-out + telemetry logs |
| `frontend/public/sw.js` | Active-tab suppression + OS notification display |
| `web_push_subscriptions` | Per-device endpoints |

**No duplicate listener:** text listens to `consultation_messages`; voice listens to Twilio webhooks. They do not double-fire on the same event.

**Cross-modality tags:** `${sessionId}:text` vs `${sessionId}:voice` vs `${sessionId}:video` — text and voice pushes for the same session appear as separate OS notifications.

**Active-tab suppression (SW layer):** suppresses when a **focused** client URL includes the push `data.deeplink` (e.g. `/c/text/{sessionId}`). A focused voice tab does **not** suppress a text chat push for the same session.

**Trade-off:** focused consult tab + locked phone screen → no OS notification. Acceptable; the device only exposes `clients.focused`.

---

## Verify push is working in production

### 1. Tail structured logs

```bash
# Render / Docker — filter push telemetry
tail -f /var/log/backend.log | rg "Web Push send telemetry|Chat push listener fan-out"
```

Look for:

```json
{
  "user_id": "...",
  "session_id": "...",
  "modality": "text",
  "delivered": 1,
  "failed": 0,
  "revoked": 0
}
```

`delivered: 0` with no `failed`/`revoked` usually means the recipient has no active subscription (normal if they haven't opted in).

### 2. Confirm listener is subscribed

On backend boot:

```
Chat push listener Realtime channel subscribed
```

If you see repeated `Chat push listener Realtime channel disconnected` → restart the backend instance or check Supabase Realtime health.

### 3. SQL — active subscriptions for a user

```sql
SELECT id, endpoint, user_role, created_at, last_used_at
FROM web_push_subscriptions
WHERE user_id = '<uuid>'
  AND revoked_at IS NULL
ORDER BY created_at DESC;
```

### 4. Staging smoke (recommended before prod deploy)

See **End-to-end smoke matrix** below.

---

## Revoke all subscriptions for a user (GDPR / patient request)

Soft-revoke (keeps audit trail):

```sql
UPDATE web_push_subscriptions
SET revoked_at = now()
WHERE user_id = '<uuid>'
  AND revoked_at IS NULL;
```

Hard delete (only if policy requires):

```sql
DELETE FROM web_push_subscriptions WHERE user_id = '<uuid>';
```

The user must re-subscribe via the D6b opt-in flow to receive pushes again.

---

## Rotate VAPID keys

See [web-push-vapid-provisioning.md](./web-push-vapid-provisioning.md) for generation steps.

**Coordination-heavy rotation (recommended):**

1. Generate new keypair: `npx web-push generate-vapid-keys`
2. Deploy backend with new `WEB_PUSH_VAPID_*` vars **and** frontend with matching `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` in the same release window.
3. Optionally bulk-revoke existing rows so stale endpoints fail fast:
   ```sql
   UPDATE web_push_subscriptions SET revoked_at = now() WHERE revoked_at IS NULL;
   ```
4. Users re-subscribe on next opt-in trigger (first inbound message banner for patients; doctor dashboard opt-in when shipped).
5. After ~30 days with zero `delivered` on old endpoints, rotation is complete.

**Brief dual-key window** (advanced): not implemented in v1 — single keypair only.

---

## Common failures + remediation

| Symptom | Likely cause | Remediation |
|---------|--------------|-------------|
| Bulk `revoked: N` in logs | Browser cleared site data or changed push permission → `410 Gone` | No action — rows auto-revoked; user re-subscribes on next opt-in |
| `Web Push skipped — VAPID env vars not configured` | Missing prod secrets | Set `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_CONTACT_EMAIL`; redeploy |
| VAPID auth errors in warn logs | Key mismatch between backend private key and frontend public key | Align env vars; redeploy both services together |
| Messages send but `delivered: 0` always | Recipient never subscribed | Expected for users who dismissed opt-in or denied permission |
| No `Chat push listener` logs at all | Listener failed to subscribe | Restart backend; verify `SUPABASE_SERVICE_ROLE_KEY` and Realtime publication on `consultation_messages` |
| Push fires while tab focused | Old SW cached | Bump `SW_VERSION` in `sw.js`; user reloads PWA |
| Duplicate notifications (horizontal scale) | Multiple backend instances each run `chat-push-listener` | Documented v1 limitation — add leader election in a future task |

---

## End-to-end smoke matrix

Execute on staging before prod promotion. Record results in the PR description.

| Device / Browser | Expected | Notes | Result |
|------------------|----------|-------|--------|
| Android Chrome — PWA installed, app backgrounded | Push within 5 s | Primary target | Operator smoke |
| Android Chrome — non-PWA, tab in background | Push or throttled | Some OEMs throttle non-PWA | Operator smoke |
| Desktop Chrome — PWA minimized | OS notification | | Operator smoke |
| Desktop Firefox | Push without PWA install | Firefox supports Web Push | Operator smoke |
| Desktop Safari (macOS 13+) | Push | Notifications API + push since 2022 | Operator smoke |
| iOS Safari < 16.4 | Unsupported | In-app badge only; no Web Push | Documented ❌ |
| iOS Safari ≥ 16.4 — PWA on home screen | Push | Requires installed PWA | Operator smoke |

**Contract tests (automated in CI):**

- `frontend/lib/sw/__tests__/push-suppression.test.ts` — deeplink-based suppression; voice tab does not suppress text push
- `backend/tests/unit/services/push-notification-service.test.ts` — tag `${sessionId}:text`, telemetry, 410 revoke
- `backend/tests/unit/services/chat-push-listener.test.ts` — body truncation, no PHI in logs

**Manual checks per ✅ row:**

1. **Active-tab suppression** — focused text consult tab → no OS notification; blur tab → notification fires
2. **Tag dedup** — send 3 messages quickly → one tray entry with latest body (`renotify: true` + tag `${sessionId}:text`)
3. **notificationclick** — tap → focuses/opens `/c/text/{sessionId}`
4. **410 revocation** — clear site data → next send marks `revoked_at` (see service unit test)

---

## Cross-modality coordination (voice T5.32)

Voice batch consumes the same `push-notification-service.ts`:

```ts
await sendPushToUser({
  userId: doctorId,
  payload: {
    title: 'Patient joined your call',
    body: 'Your patient is in the waiting room. Tap to join.',
    tag: buildPushNotificationTag(sessionId, 'voice'),
    data: { sessionId, deeplink: `/dashboard/consult/${sessionId}`, modality: 'voice' },
  },
  sessionId,
  modality: 'voice',
});
```

Text chat push and voice join push for the same session use **different tags** and **different deeplinks** — they do not replace each other in the OS tray.

---

## Related code

- SW: `frontend/public/sw.js` (`SW_VERSION`, push handler)
- Suppression helper: `frontend/lib/sw/push-suppression.ts`
- Service: `backend/src/services/push-notification-service.ts`
- Text listener: `backend/src/services/chat-push-listener.ts`
- Migration: `backend/migrations/111_web_push_subscriptions.sql`
