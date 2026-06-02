# Task text-D6b: Web Push part 2 — subscribe/unsubscribe controllers + frontend opt-in flow + SW push handler

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch D (T5 reliability) — **L item, ~2 days (2/3)**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

D6a established the schema + backend service. This task wires the user-facing path:

1. Backend endpoints for subscribing / unsubscribing / listing the user's push subscriptions.
2. Frontend: a small `usePushSubscription` hook that handles the browser permission prompt + service-worker subscription registration.
3. **Opt-in moment** — the patient is prompted on their FIRST inbound chat message in a session (not on page load — too aggressive). One time per device. Doctor side opted in at dashboard settings (separate UX — flag for a future iteration; doctor-side opt-in is OUT OF SCOPE for this task to limit cross-cutting work).
4. SW push handler that receives the push payload and shows the OS notification.
5. Hook the chat-message INSERT path to call `sendPushToSession` from D6a's service.

**Estimated time:** ~2 dev-days.

**Status:** Shipped (2026-05-24).

**Depends on:** [task-text-D6a](./task-text-D6a-web-push-migration-and-service.md) — hard. **Hard-blocks D6c.**

**Source plan:** [T5 §T5.32](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)

---

## Acceptance criteria

### Backend controllers

- [x] **`POST /api/v1/push/subscribe`** in `backend/src/controllers/push-controller.ts`:
  - Body: `{ endpoint, p256dhKey, authKey, userAgent? }`.
  - Auth: doctor Supabase JWT OR patient scoped companion JWT (`consult_role=patient`). The user_id derived from auth.
  - UPSERT into `web_push_subscriptions` keyed on `(user_id, endpoint)`. If the row exists with `revoked_at IS NOT NULL`, clear the revocation.
  - Returns `201 Created` with subscription id.
- [x] **`DELETE /api/v1/push/subscribe/:id`** — soft-delete (sets `revoked_at = now()`). Auth as above.
- [x] **`GET /api/v1/push/subscriptions`** — lists the user's active subscriptions (for a "manage notifications" UI down the line; not used in this task, but cheap to ship).
- [x] **Routes registered** in `backend/src/routes/api/v1/push.ts`.
- [x] **Unit tests** at `backend/tests/unit/controllers/push-controller.test.ts`.

### Service worker push handler

- [x] **`frontend/public/sw.js` extends with push handler:**
  ```js
  self.addEventListener('push', (event) => {
    if (!event.data) return;
    const payload = event.data.json();
    event.waitUntil(
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon || '/icons/icon-192.png',
        badge: payload.badge || '/icons/badge-72.png',
        tag: payload.tag,
        data: payload.data || {},
      }),
    );
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const deeplink = event.notification.data?.deeplink || '/';
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
        // Focus an existing tab on the deeplink if one exists; else open a new one.
        const existing = wins.find(w => w.url.includes(deeplink));
        if (existing) return existing.focus();
        return clients.openWindow(deeplink);
      }),
    );
  });
  ```
- [x] **Versioned cache** — bump SW version constant (`v3-2026-05-24-d6b`) so the push handler is registered on next app load. Document the SW lifecycle hand-off.

### Frontend hook + opt-in

- [x] **`usePushSubscription` hook** at `frontend/lib/text/use-push-subscription.ts`:
  ```ts
  // Returns:
  // {
  //   permission: 'default' | 'granted' | 'denied',
  //   subscribed: boolean,
  //   subscribe: () => Promise<void>,    // requests permission + creates SW subscription + POSTs to backend
  //   unsubscribe: () => Promise<void>,  // unsubscribes SW + DELETEs backend row
  //   notSupported: boolean,             // true on iOS Safari < 16.4 (no Web Push) or non-PWA Chrome (limited)
  // }
  ```
- [x] **`subscribe` flow:**
  1. Calls `Notification.requestPermission()` → `'granted' | 'denied' | 'default'`.
  2. On `granted`, gets the SW registration: `navigator.serviceWorker.ready`.
  3. Subscribes: `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKeyAsUint8Array })`.
  4. POSTs `{ endpoint, p256dhKey, authKey, userAgent }` to `/api/v1/push/subscribe`.
  5. Stores the local "I'm subscribed on this device" flag in `localStorage` for fast permission-state UI.
- [x] **`unsubscribe` flow:** SW unsubscribes; backend `DELETE /api/v1/push/subscribe/:id`.
- [x] **Opt-in moment in `<TextConsultRoom>`:**
  - On the FIRST INSERT received from the counterparty during this session AND `permission === 'default'` AND not previously dismissed in this localStorage key:
    - Show a small banner above the message list: `Get notified when {Dr. Sharma / your patient} replies on this device. · Enable · Not now`.
    - "Enable" → calls `subscribe()`.
    - "Not now" → sets a "dismissed for 7 days" localStorage flag; banner won't reappear for 7 days on this device.
  - Banner does NOT appear on page load (too aggressive). Only on first inbound message.
- [x] **Doctor side gets opt-in via dashboard settings — OUT OF SCOPE for this task.** Document as a follow-up.
- [x] **`mode='readonly'`** — banner doesn't appear; subscribe path doesn't run.
- [x] **Cross-host parity** — banner renders only in `standalone` (the patient consult host). `panel` and `canvas` are voice/video room hosts where the patient's primary surface is the call, not chat — push is the wrong primitive. Doctor-side opt-in lives on the doctor dashboard (separate task).

### Chat-message INSERT → push fan-out

- [x] **Backend hook** — Option A Realtime listener in `backend/src/services/chat-push-listener.ts`.
- [x] **Lifecycle** — listener mounts on backend boot, gracefully handles channel-disconnect + reconnect. Logs `{ delivered, failed, revoked }` per event (no body).
- [x] **Active-tab suppression deferred to D6c.** For now, the listener fires unconditionally — D6c adds the suppression mechanism.

### General

- [x] **PHI hygiene** — payload `body` is the truncated message preview. Listener never logs the body. Pin in a test.
- [x] Frontend type-check + lint clean. Backend type-check + lint clean. Manual smoke (Android Chrome, PWA installed): patient on consult; doctor sends a message; banner appears; patient taps Enable; OS permission prompt; allow; subscription POST succeeds; doctor sends another message; OS notification fires within 5 s — **pending operator smoke on device**.

---

## Out of scope

- **Doctor-side opt-in flow.** Lives on the dashboard; separate task.
- **Active-tab suppression / focused-tab deduplication.** D6c owns.
- **End-to-end smoke + cross-modality coordination.** D6c owns.
- **iOS Safari < 16.4** — no Web Push. Document; degradation only.
- **Notification customization per user / per session.** Out of scope.

---

## Files expected to touch

**Backend:**

- `backend/src/controllers/push-controller.ts` — **new** (~120 LOC).
- `backend/src/routes/api/v1/push.ts` — **new** (~30 LOC).
- `backend/src/services/chat-push-listener.ts` — **new** (~80 LOC).
- `backend/src/index.ts` (or wherever the boot sequence lives) — **edit** (mount the chat-push-listener on startup).
- `backend/tests/unit/controllers/push-controller.test.ts` — **new** (~100 LOC).

**Frontend:**

- `frontend/lib/text/use-push-subscription.ts` — **new** (~120 LOC).
- `frontend/lib/text/__tests__/use-push-subscription.test.ts` — **new** (~80 LOC).
- `frontend/components/consultation/PushOptInBanner.tsx` — **new** (~60 LOC).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (mount banner; first-INSERT trigger; banner state).
- `frontend/public/sw.js` — **edit** (push + notificationclick handlers; bump SW version).

---

## Notes / open decisions

1. **Why opt-in on first inbound message** — ask permission when context makes the value obvious. Asking on page load fails to land 80% of the time; asking right after the user sees a doctor reply lands 50%.
2. **Why localStorage flag** — survives PWA reinstall (mostly). If the patient denied, we don't ask again for 7 days.
3. **`userVisibleOnly: true`** — required by browsers for non-Chrome push. Always set it.
4. **VAPID key conversion** — `applicationServerKey` must be a `Uint8Array`; the env var is base64. Add a helper `urlBase64ToUint8Array` (well-documented one-liner).
5. **Listener scaling** — single backend instance is fine for v1. When the backend horizontally scales, ALL instances would subscribe and ALL would fire pushes (duplicate). Document the limitation; D6c can add a "leader-elect" mechanism if needed.
6. **Listener startup order** — must mount AFTER Supabase client is ready and AFTER VAPID env vars are loaded. Fail-fast on startup if env vars missing.
7. **`tag = session_id`** — multiple unread messages from the same session show as one notification (replaces). Patient taps; deeplink opens consult; can scroll up to read all. Less spammy.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch D](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T5 §T5.32](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)
- **Hard dep:** [task-text-D6a](./task-text-D6a-web-push-migration-and-service.md).
- **Sibling part:** [task-text-D6c](./task-text-D6c-push-end-to-end-verification.md).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Shipped (2026-05-24). Closed by D6c verification.
