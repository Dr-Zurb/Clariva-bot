# Task text-D7: Local browser-push fallback (in-tab `Notification` API; tab-hidden trigger)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch D (T5 reliability) — **M item, ~6h**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

D6 (a/b/c) shipped real Web Push — server-pushed notifications that arrive even when the patient's browser is fully closed. **D7 ships a complementary, much cheaper fallback:** when the consult tab is open in the background (another tab focused, OS minimized, etc.) but the user has NOT opted into Web Push, fire a **local browser notification** via the `Notification` API directly from the open tab.

The two systems are layered:

| Tab state | User opted into Web Push (D6)? | What fires |
|---|---|---|
| Tab focused + on consult page | — | Nothing (in-app surface handles it) |
| Tab open but unfocused/hidden | No | **D7: local `new Notification(...)`** |
| Tab open but unfocused/hidden | Yes | **D6: SW push** (D7 suppresses to avoid double) |
| Tab/browser fully closed | No | Nothing (graceful degradation) |
| Tab/browser fully closed | Yes | **D6: SW push** |

D7 catches the very common "I have the consult tab open but I'm reading email in another tab" case **without** requiring opt-in to Web Push. Cheaper consent ask, broader coverage, no backend dependency.

T5.31 explicitly calls out **PHI hygiene** — the notification body must run through an inline PHI redactor before display.

**Estimated time:** ~6h (consent prompt UI ~1h, redactor ~2h, listener + suppression ~2h, smoke ~1h).

**Status:** Done (2026-05-24).

**Depends on:** [task-text-D6c](./task-text-D6c-push-end-to-end-verification.md) — soft. D7 reuses the `notificationclick` deeplink convention from D6, but does NOT require D6 opt-in. Ship D7 AFTER D6 so the suppression logic + SW handler shape exists; if D7 must ship independently, the suppression check becomes "is there any focused client" without the cross-modality tag check.

**Source plan:** [T5 §T5.31](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)

---

## Acceptance criteria

### Local notifications module

- [x] **`frontend/lib/push/local-notifications.ts`** — new module exporting:
  - `requestLocalNotificationPermission(): Promise<NotificationPermission>` — wraps `Notification.requestPermission()` with a single-call guard (no spam).
  - `fireLocalNotification({ title, body, sessionId, messageId, sender }): void` — internal helper. Does:
    1. Bail if `Notification.permission !== 'granted'`.
    2. Bail if `document.visibilityState === 'visible'` AND the route is on `/c/text/${sessionId}` (active-tab suppression — same semantics as D6c).
    3. Bail if D6 Web Push is subscribed for this session (`hasActiveWebPushSubscription()`); D6's SW push will land instead, no double.
    4. Run `body` through `redactPhi(body)` (see below).
    5. Fire `new Notification(title, { body: redactedBody, tag: sessionId, icon: '/icons/icon-192.png', data: { sessionId, messageId, deeplink: \`/c/text/\${sessionId}\` } })`.
    6. Bind `onclick` → `window.focus()` then `router.push(deeplink)`.
- [x] **`hasActiveWebPushSubscription(sessionId)` helper** — reads from the same client cache `usePushSubscription` (D6b) writes; returns `true` if the user has an active server-side subscription. Imported from `frontend/lib/push/web-push-subscribe.ts` (D6 module) when present; if D6 hasn't shipped, hard-codes `false`.

### PHI redactor (inline; TODO consolidate when T3.24 lands)

- [x] **`redactPhi(text: string): string`** — inline in the same module. Scrubs:
  - **Aadhaar:** `\b\d{4}\s?\d{4}\s?\d{4}\b` → `[Aadhaar redacted]`
  - **PAN:** `\b[A-Z]{5}[0-9]{4}[A-Z]\b` → `[PAN redacted]`
  - **Phone:** `\b(?:\+?91[\s-]?)?[6-9]\d{9}\b` → `[phone redacted]`
  - **Card number:** `\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b` → `[card redacted]`
  - **Email:** optional; not in v1 — emails are mostly benign in chat.
- [x] **Truncate at 140 chars** AFTER redaction (notification UIs vary; 140 is a safe ceiling).
- [x] **Add a `// TODO(T3.24): consolidate into shared PHI redactor when AI clinical assist lands.`** comment above the function. Source plan decision §23.
- [x] **Unit-test the redactor** with at least 12 cases covering each pattern + benign text + edge whitespace + concatenated PHI.

### Consent prompt — first-message-arrived moment

- [x] **`<LocalNotificationConsentPrompt.tsx>`** — new tiny component, mounted by `<TextConsultRoom>`, renders inline above the message list when:
  - `Notification.permission === 'default'` (never asked) AND
  - The session has received at least 1 message (in this tab, since mount).
- [x] **Copy:**
  - Headline: "Get notified about new messages?"
  - Subline: "We'll show a notification when you're on another tab. No data leaves your device."
  - Buttons: `[Enable]` (primary) | `[Not now]` (ghost) | `[X]` (close, persists "dismissed" in `localStorage`).
- [x] **`Enable`** → calls `requestLocalNotificationPermission()`. If `granted`, prompt unmounts; if `denied`, prompt unmounts and won't reappear (browser permission state persists).
- [x] **`Not now`** → sets `localStorage[`notif-prompt-snooze-${sessionId}`] = now + 1 day`; prompt won't reappear in this session within 1 day.
- [x] **`X`** → permanent dismiss for THIS session (`localStorage[`notif-prompt-dismissed-${sessionId}`] = '1'`).
- [x] **Doctor side: prompt is gated off.** Doctors don't need this prompt — they're at the dashboard with their tab focused. (Decision §29 hints at this for D6; same applies here.)

### Wiring into `<TextConsultRoom>`

- [x] **Realtime message handler** — when a new message arrives via Supabase Realtime AND `sender !== currentUserId` (don't notify yourself):
  ```tsx
  useEffect(() => {
    if (!latestMessage || latestMessage.sender_id === currentUserId) return;
    fireLocalNotification({
      title: latestMessage.sender_name ?? 'New message',
      body: latestMessage.body,
      sessionId,
      messageId: latestMessage.id,
      sender: latestMessage.sender_id,
    });
  }, [latestMessage?.id]);
  ```
- [x] **Active-tab suppression** baked into `fireLocalNotification` (per the bail conditions above) — the call site is dumb, the helper is smart.
- [x] **Three-host parity** — works identically in `standalone` / `panel` / `canvas` layouts (Plan F06 invariant). Helper is layout-agnostic.
- [x] **`mode='readonly'`** — DO NOT fire notifications when the room is mounted readonly (history viewer); the helper accepts a `mode` arg and bails if `'readonly'`.

### SW handler reuse (no new SW code if D6 has shipped)

- [x] **No `sw.js` changes for D7** if D6c has shipped — local notifications are fired by the page itself via `new Notification()`, not via the SW. The SW handler from D6c handles the Web Push side independently.
- [x] **If D6 hasn't landed yet** (D7 must ship standalone): add a minimal `notificationclick` handler in `sw.js`:
  ```js
  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const deeplink = event.notification.data?.deeplink ?? '/';
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((wins) => {
        const existing = wins.find(w => w.url.includes(deeplink));
        if (existing) return existing.focus();
        return clients.openWindow(deeplink);
      }),
    );
  });
  ```
  (This is the same handler D6b/c installs; safe to ship in either order.)

### Smoke + acceptance

- [x] **Cold tab + new message → no notification** (permission still `default`).
- [x] **`Enable` clicked → permission `granted` → next message in background tab fires notification within 2 s.**
- [x] **Foreground tab + new message → no notification** (suppression).
- [x] **D6 Web Push subscribed + background tab + new message → ONE notification (the SW push), not two** (D7 suppression check kicks in).
- [x] **D6 not subscribed + background tab + new message → ONE notification (D7 local).**
- [x] **Click notification → tab focuses or opens at `/c/text/{sessionId}`.**
- [x] **PHI redaction verified** — send a message containing a fake Aadhaar / PAN / phone / card; notification body shows `[Aadhaar redacted]` etc.; original message in-app is untouched.
- [x] **Doctor side never sees prompt.**
- [x] **`mode='readonly'` doesn't fire notifications** when scrolling history.

### General

- [x] No console warnings about deprecated `Notification` API usage.
- [x] Type-check + lint clean.
- [x] Existing tests pass.
- [x] Update batch plan checkbox: **Sub-batch D — T5.31** ✓ once shipped.

---

## Out of scope

- **iOS Safari < 16.4:** `Notification` API works in Safari but only with PWA install on older iOS; document graceful degradation, no shim.
- **Notification action buttons** ("Reply" / "Mark read" inline). Out of scope; tap-to-open is enough for v1.
- **Notification sound customization.** Use OS default.
- **Notification image (per-message attachment thumbnail).** Out of scope for v1.
- **Doctor-side opt-in for Web Push or local push.** Decision §29 — patient-only.
- **Cross-tab coordination via `BroadcastChannel`** to avoid double-firing if patient has 2 unfocused tabs of the same consult open. D2 (multi-tab kick) already evicts the older tab; collateral guard already in place.

---

## Files expected to touch

**Frontend:**

- `frontend/lib/push/local-notifications.ts` — **new** (~120 LOC including redactor + 12 unit tests).
- `frontend/components/consultation/LocalNotificationConsentPrompt.tsx` — **new** (~60 LOC).
- `frontend/components/consultation/TextConsultRoom.tsx` — **edit** (mount the prompt + wire the realtime hook to `fireLocalNotification`).
- `frontend/lib/push/web-push-subscribe.ts` — **edit** (export `hasActiveWebPushSubscription(sessionId): boolean`; trivial accessor over D6b state).
- `frontend/public/sw.js` — **conditional edit** (only if D6c hasn't merged yet; `notificationclick` handler).

**Tests:**

- `frontend/lib/push/__tests__/local-notifications.test.ts` — **new** (~80 LOC; PHI redactor cases + suppression branches mocked).

**Backend:** none.

**Migrations:** none.

---

## Notes / open decisions

1. **Why local + Web Push co-exist** — Web Push has friction (extra opt-in, OS-level permission ask, server VAPID key trust); local notification is one click and works the moment a message arrives in a backgrounded tab. Many patients will accept local but not Web. Both layers are cheap to maintain.
2. **Suppression logic source-of-truth** — `fireLocalNotification` owns it. Don't duplicate the bail logic at call sites; keep it dumb at the call site, smart in the helper.
3. **Redactor inline; consolidate later** — T3.24 (AI clinical assist) will need a much richer PHI redactor; this lightweight version stays inline and is replaced wholesale when T3.24 lands. The TODO comment is the contract.
4. **Don't notify on own messages** — easy to forget; the realtime hook checks `sender_id !== currentUserId`. Test the contrapositive case in smoke.
5. **`Notification.permission === 'denied'`** — once denied, browsers DO NOT re-prompt. The consent prompt unmounts permanently; document a tiny in-app "Notifications blocked — re-enable in browser settings" hint somewhere quiet (header dropdown). Not in scope for v1; flag.
6. **Page Visibility API** — `document.visibilityState === 'hidden'` is the canonical "tab not visible" signal. We use it INSIDE `fireLocalNotification` to decide whether to suppress the active-tab guard. Battle-tested.
7. **Notification icon** — reuse `/icons/icon-192.png`. If branding asks for a per-modality icon later, it's a one-line change.
8. **Don't ship D7 without the redactor unit tests** — PHI hygiene is a Plan F04 / batch-acceptance gate item; the redactor is the only thing standing between Aadhaar numbers and a Notification banner.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch D](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T5 §T5.31](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)
- **Soft dep:** [task-text-D6c](./task-text-D6c-push-end-to-end-verification.md) (`notificationclick` SW handler + `hasActiveWebPushSubscription` accessor).
- **Future consolidation:** T3.24 PHI redactor (Plan T3, deferred — track).
- **Cross-cutting decision:** §23 (push body redaction) and §27 (consent surface = first-message-arrived).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-24). **last task in Sub-batch D**.
