# Text T5 — Reliability / safety / scale (7 items, ~14 days)

## Multi-tab kick, crash recovery, push notifications, virtualization, rate limit, delivery health

> **Roadmap reference:** [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md). T5 is the "scale-out + harden" slice; defer until usage data justifies it (~10 active doctors or first 200-message session, whichever first).
>
> **Foundation:** [plan-04-text-consultation-supabase.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-04-text-consultation-supabase.md) (Realtime + presence baseline) + [plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md) (system kinds) + ops infra around push and PWA installability.

---

## Goal

Ship seven items that turn the chat from "works for the happy path with one tab" to "survives multi-device users, app crashes, long sessions, abuse, and chronic flaky-network users". This tier is what lets us turn on chat for thousands of patients without a 3am page.

Three items are about **session integrity** (multi-tab kick, crash recovery, rate limit). Two are about **delivery + attention** (browser push, mobile-PWA push). Two are about **scale** (virtualization, delivery health metrics).

---

## Status

`Drafted`. **All 7 items SELECTED 2026-04-28** for the implementation batch tracked in [plan-text-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md) — owner explicitly opted in to ship the entire reliability/safety/scale tier without waiting on the deferral thresholds (≥10 active doctors / first 200-msg session / first incident). T5 maps to Sub-batch D (three migrations + Web Push backend; the heaviest sub-batch).

---

## What's in scope (7 items)

> All 7 items below are marked **`[SELECTED 2026-04-28]`** — see [combined batch plan](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md) for sequencing into Sub-batch D (frontend-light items first as warm-up, then three migrations + push backend).

| # | Item | Effort | Touch points |
|---|------|--------|--------------|
| T5.29 | **`[SELECTED 2026-04-28]`** **Multi-tab kick** (patient side). Two patient tabs open on the same session → newer tab takes over, older tab shows "This consultation is open in another tab — switch back here" with a "Take over" button. Prevents split-brain composer. | M (~6h) | New `chat-presence-claim` Supabase Realtime broadcast; `TextConsultRoom.tsx` claim handler. |
| T5.30 | **`[SELECTED 2026-04-28]`** **Composer-draft crash recovery.** Persist composer draft to `sessionStorage` keyed by `sessionId` after every keystroke (debounced 500 ms). On reload / crash recovery, repopulate. Clear on send. | S (~3h) | New `frontend/hooks/useComposerDraft.ts`; `TextConsultRoom.tsx` composer integration. |
| T5.31 | **`[SELECTED 2026-04-28]`** **Browser push when message arrives in unfocused tab.** When tab is hidden + new message arrives → `navigator.serviceWorker.showNotification()` with sender name + truncated body (+ "open" action that focuses the tab). Permission-prompted at consult start. | M (~6h) | New `frontend/lib/push/local-notifications.ts`; service worker registration; permission UX in pre-chat or first-message moment. |
| T5.32 | **`[SELECTED 2026-04-28]`** **Mobile-PWA push** (true push, app backgrounded). Web Push API + VAPID + per-user subscription stored backend-side. Server pushes when chat INSERT lands AND patient subscription exists AND tab not active. | L (~5 days) | New backend `push-notification-service.ts`; new migration `web_push_subscriptions`; PWA manifest + SW push handler; opt-in flow on first chat. |
| T5.33 | **`[SELECTED 2026-04-28]`** **Virtualization** for messages > 200. Today the message list renders all DOM nodes; >200 messages on weaker devices = jank. Add `react-virtuoso` (or hand-rolled windowing) for the message list. Composer + header unchanged. | L (~3 days) | `TextConsultRoom.tsx` message-list render path; new `<VirtualizedMessageList>` wrapper; auto-scroll preservation across virtualisation. |
| T5.34 | **`[SELECTED 2026-04-28]`** **Rate limit + spam protection.** Enforce server-side: ≤30 messages per minute per sender per session; ≤200 per hour. RLS-side `consultation_messages_insert_rate_limit` policy backed by a denormalised counter. Patient bot-flood guard. | M (~6h) | New SQL function `check_chat_insert_rate(...)` + RLS rewrite; frontend graceful "you're sending too fast" inline toast. |
| T5.35 | **`[SELECTED 2026-04-28]`** **Delivery health metrics.** Background telemetry: per-message round-trip latency (compose → server-ack), reconnect counts per session, presence-flap counts. Persist to `text_chat_quality` table; surface a doctor-side "Connection: Excellent / Fair / Poor" badge during call. | M (~7h) | New `text_chat_quality` table; client-side measurement hooks; backend ingestion endpoint; small dashboard widget. |

---

## Non-goals (explicitly NOT in T5 — owned by other tiers / plans)

- **AI chat surfaces** — T3.
- **Post-chat surfaces** — T4.
- **Mobile gestures / dictation** — T6.
- **End-to-end encryption** of message bodies — explicit Decision needed; out of T5 scope. Today RLS + TLS is the security boundary.
- **Per-doctor cost guard** for AI calls — owned by Plan 10.
- **Rate-limit on attachments** — out of scope (covered by the existing 10 MiB / file size limit).

---

## Implementation contract per item

### T5.29 — Multi-tab kick

```ts
// New presence broadcast on the existing presence channel:
//   event: 'chat-presence-claim'
//   payload: { user_id, claim_id: <random uuid>, claimed_at: ISO }
//
// On TextConsultRoom mount:
//   1. Generate a fresh claim_id.
//   2. Send 'chat-presence-claim' broadcast.
//   3. Listen for incoming 'chat-presence-claim' from same user_id with
//      newer claimed_at. If received: switch UI to "kicked" state.
//
// "Kicked" UI:
//   - Composer + message list dimmed.
//   - Banner: "This consultation is open in another tab. Switch back, or
//     [Take over here]."
//   - Take over → re-broadcast a new claim_id; the other tab sees it +
//     flips to kicked. Effectively "ping-pong" between tabs.
//
// Doctor side: NOT applied (doctors legitimately use multi-monitor with
// chat in two contexts).
```

### T5.30 — Composer-draft crash recovery

```ts
// frontend/hooks/useComposerDraft.ts (NEW)

export function useComposerDraft(sessionId: string): {
  draft: string;
  setDraft: (next: string) => void;
  clearDraft: () => void;
} {
  const key = `chat_draft:${sessionId}`;
  const [draft, setDraftState] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem(key) ?? '';
  });

  const persist = useMemo(
    () => debounce((v: string) => sessionStorage.setItem(key, v), 500),
    [key],
  );

  return {
    draft,
    setDraft: (next) => { setDraftState(next); persist(next); },
    clearDraft: () => { setDraftState(''); sessionStorage.removeItem(key); },
  };
}

// In TextConsultRoom: replace useState<string>('') for composer with
// useComposerDraft(sessionId). Call clearDraft() on successful send.
//
// SessionStorage (not localStorage) — drafts shouldn't survive across
// browser sessions; that would feel "haunted".
```

### T5.31 — Browser push (local, no server)

```ts
// frontend/lib/push/local-notifications.ts (NEW)
//
// Permission flow:
//   - On first message received while tab hidden, prompt:
//     "Get notified when {Doctor} replies?"  [Yes] [Not now]
//   - On Yes: navigator.permissions.query → Notification.requestPermission().
//   - Persist consent in localStorage (`chat_push_consent_v1`) so we don't
//     re-prompt every consult.
//
// On INSERT received with document.visibilityState === 'hidden':
//   - registration.showNotification(`${counterpartyName}`, {
//       body: truncate(message.body, 80),
//       tag: `consult:${sessionId}`,                  // collapses to 1 per session
//       icon: '/icons/clariva-192.png',
//       data: { sessionId, route: '/c/text/...' },
//     });
//
// SW notificationclick handler: focus existing tab if open, else open the
// patient route URL.
//
// No PHI in notification body? Allow truncated body BUT redact patterns
// detected by T3.24's sensitive-pattern detector. Doctor names are PHI-
// adjacent but acceptable.
```

### T5.32 — Mobile-PWA push (true push)

```sql
CREATE TABLE web_push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_kind   TEXT NOT NULL CHECK (user_kind IN ('doctor','patient')),
  user_id     UUID NOT NULL,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh_key  TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX web_push_subscriptions_user_idx
  ON web_push_subscriptions(user_kind, user_id);
```

```ts
// backend/src/services/push-notification-service.ts (NEW)
//
// On consultation_messages INSERT (Realtime → Edge Function or backend
// listener):
//   1. Identify the recipient (the side that didn't send).
//   2. Look up active web_push_subscriptions for that user.
//   3. For each: web-push library → POST to endpoint with VAPID auth.
//   4. Payload: same shape as T5.31's local notification.
//
// VAPID keys: stored in env (PUBLIC + PRIVATE). Frontend reads PUBLIC at
// register-time.
//
// Subscription opt-in flow on patient side: same UX as T5.31's local
// notif prompt, but additionally calls
//   registration.pushManager.subscribe({ ... })
// and POSTs the subscription to /api/v1/push/subscribe.
//
// Suppression: don't push if the recipient's tab is currently active
// (presence channel signal).
```

### T5.33 — Virtualization

```ts
// Add `react-virtuoso` dep (or hand-roll a windowed list — virtuoso is
// 8KB gz and handles auto-scroll-to-bottom + scroll-anchoring nicely).
//
// In TextConsultRoom.tsx:
//   - Replace the .map() over messages with <Virtuoso ... />.
//   - data = messages array.
//   - itemContent = (index, message) => <MessageBubble message={message} />.
//   - followOutput = "smooth" → auto-scroll on new message when at bottom.
//   - atBottomStateChange → drives wasAtBottomRef + jump-to-latest pill (T1.1).
//
// Day separators (T1.4): render via groupedRender or a sentinel item
// between bubbles.
//
// Reactions / replies (T2): unaffected — the bubble component owns its
// own absolute-positioned popovers.
//
// Performance gate: only mount Virtuoso when messages.length > 100.
// Below that, the simple .map() is faster (no overhead).
```

### T5.34 — Rate limit

```sql
-- Denormalised per-session counter.
ALTER TABLE consultation_sessions
  ADD COLUMN message_counts JSONB NOT NULL DEFAULT '{}'::jsonb;
  -- Shape: { "doctor": { "minute": [...], "hour": [...] },
  --          "patient": { ... } }
  -- Each list is timestamps trimmed at insert time.

CREATE OR REPLACE FUNCTION check_chat_insert_rate(
  p_session_id UUID,
  p_role       TEXT,
  p_now        TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_minute_count INT;
  v_hour_count   INT;
  v_minute_threshold CONSTANT INT := 30;
  v_hour_threshold   CONSTANT INT := 200;
BEGIN
  -- ... trim + count + return false if over threshold.
END;
$$;

-- New RLS on INSERT path: check_chat_insert_rate(...) must be true.
```

```ts
// Frontend: on RLS-rejection that maps to rate-limit (specific error code
// returned via Postgres notice), surface inline:
//   "You're sending too quickly. Slow down a moment."
// Composer disabled for 5 s, then re-enabled with a fresh send attempt.
```

### T5.35 — Delivery health metrics

```sql
CREATE TABLE text_chat_quality (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES consultation_sessions(id),
  user_role       TEXT NOT NULL CHECK (user_role IN ('doctor','patient')),
  measured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_to_ack_ms  INT,                      -- compose → server-ack
  reconnect_count INT,                      -- since last ingest
  presence_flaps  INT,                      -- counterparty offline→online flaps
  network_type    TEXT                      -- navigator.connection?.effectiveType
);

CREATE INDEX text_chat_quality_session_idx
  ON text_chat_quality(session_id, measured_at);
```

```ts
// Client measurement:
//   - send_to_ack_ms: per-message; sample → average over last 5 messages.
//   - reconnect_count: increment in the existing connect() failure path.
//   - presence_flaps: increment in the presence-sync handler.
//
// Ingest: POST /api/v1/consultation/:sessionId/chat-quality
//   { send_to_ack_ms, reconnect_count, presence_flaps, network_type }
//   - Throttled: 1 ingest per 30 s per side per session.
//
// Doctor-side surface: small "Connection: Excellent" badge in header.
//   Excellent: avg send_to_ack < 300 ms AND reconnects = 0.
//   Fair:      300–1000 ms OR ≤2 reconnects.
//   Poor:      > 1000 ms OR > 2 reconnects.
//
// Pure observability — does NOT enforce / disconnect / refuse anything.
```

---

## Acceptance criteria

- [ ] **T5.29** — opening a patient session in a second tab kicks the first within 1 s; "Take over" round-trips correctly; no split-brain INSERTs observed.
- [ ] **T5.30** — composer draft survives a hard reload, a tab crash, AND a network blip; clears on successful send.
- [ ] **T5.31** — local notification fires within 500 ms of INSERT when tab is hidden; consent prompt appears at most once per device; notificationclick focuses existing tab.
- [ ] **T5.32** — push notification fires within 5 s on patient device after doctor sends, even with the PWA fully backgrounded; subscription survives device restart; suppressed when tab is active.
- [ ] **T5.33** — 1000-message session scrolls smoothly at 60 fps on mid-tier Android; auto-scroll on new-message-at-bottom still works; jump-to-latest (T1.1) still works.
- [ ] **T5.34** — patient sending 31st message in a minute is rejected; inline toast shows; composer auto-recovers after 5 s; doctor unaffected by patient's quota.
- [ ] **T5.35** — quality table populates within 30 s of session start; doctor-side badge updates correctly; no PHI in the quality payload (no message bodies, no sender ids beyond role).
- [ ] No regression on existing chat flow (Plan 04 / 06 / 07 surfaces unaffected).
- [ ] PHI hygiene: no message body in push payload beyond what T3.24 detector permits; no body in quality telemetry; no body in any new logs.
- [ ] Frontend type-check + lint clean. Backend type-check + lint clean. Migrations reversible.
- [ ] Manual smoke: 30-min stress chat with simulated reconnects + multi-tab + 1000 messages exercises every T5 item.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` (**extend**) — virtualization, draft hook, multi-tab claim, push consent prompt.
- `frontend/components/consultation/VirtualizedMessageList.tsx` (**new**, T5.33).
- `frontend/hooks/useComposerDraft.ts` (**new**, T5.30).
- `frontend/lib/push/local-notifications.ts` (**new**, T5.31).
- `frontend/lib/push/web-push-subscribe.ts` (**new**, T5.32).
- `frontend/public/sw.js` (**extend**, T5.31 + T5.32) — push + notificationclick handlers.

**Backend:**

- `backend/src/services/push-notification-service.ts` (**new**, T5.32).
- `backend/src/services/chat-quality-service.ts` (**new**, T5.35).
- `backend/src/controllers/push-controller.ts` (**new**, T5.32) — subscribe / unsubscribe.
- `backend/src/controllers/consultation-controller.ts` (**extend**, T5.35) — quality ingest endpoint.
- `backend/migrations/0XX_web_push_subscriptions.sql` (**new**, T5.32).
- `backend/migrations/0XX_consultation_messages_rate_limit.sql` (**new**, T5.34).
- `backend/migrations/0XX_text_chat_quality.sql` (**new**, T5.35).

**Ops:**

- New env vars: `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_CONTACT_EMAIL`.

---

## Open questions / decisions for during implementation

1. **Virtualization library choice** (T5.33) — `react-virtuoso` (8KB, MIT) vs hand-roll. Recommendation: virtuoso — its scroll-anchoring + follow-output semantics are non-trivial to get right.
2. **Multi-tab kick on doctor side** (T5.29) — defaults to "no kick". Doctors legitimately use multi-monitor. Confirm. Recommendation: no kick, but show a small "Open in 2 tabs" badge so doctor knows.
3. **Push body content** (T5.31 + T5.32) — show truncated body, or just "New message"? Recommendation: truncated body (post-T3.24 redaction); UX is materially better and PHI risk is bounded.
4. **Rate-limit thresholds** (T5.34) — 30/min and 200/hour are starting numbers. Calibrate after 2 weeks of production data. Doctor-side: same or higher? Recommendation: same (no need to differentiate; doctors organically don't hit it).
5. **Virtualization mount threshold** (T5.33) — render virtuoso always vs only when count > 100? Recommendation: always once shipped — eliminates a code branch + the overhead is negligible.
6. **Quality badge audience** (T5.35) — doctor only, or also patient? Recommendation: doctor only for v1 — patient-side QoS badges add anxiety more than utility.
7. **Push consent surface** (T5.31) — first-message-arrived moment vs pre-chat permission card. Recommendation: first-message — context is concrete, prompt feels earned.

---

## References

- [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md)
- [plan-04-text-consultation-supabase.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-04-text-consultation-supabase.md) — Realtime + presence baseline.
- [plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md) — three-host parity.
- [Voice T5 — Reliability / safety](../voice-consult/plan-t5-voice-reliability-safety.md) — symmetric tier on the voice side; some items overlap (push, multi-tab) and should share infra (T5.32 push backend is shared between voice + text).
- Web Push — VAPID + `web-push` npm library.
- `react-virtuoso` — virtualisation library candidate for T5.33.
- Postgres trigger + denormalised counter pattern — T5.34 rate limit precedent.

---

**Owner:** TBD  
**Created:** 2026-04-28  
**Status:** Drafted; **all 7 items SELECTED 2026-04-28** — implementation tracked in [plan-text-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md) (Sub-batch D; three migrations + Web Push backend + virtualization). Owner overrode the original "defer until usage thresholds met" gate — shipping this tier alongside T1 / T2 / T6 to land a production-grade text surface in one wave.
