# Task video-E5: Browser push when remote joins (shared push-notification-service)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch E (T5 reliability) — **S item, ~2 days**

---

## Task overview

Doctor's between consults, has the dashboard tab in another window. Today: patient joins; doctor doesn't notice for 30s. T5.35 ships a Web Push notification:

```
🔔 Patient Maya joined the consult
   Tap to open
```

**Reuses voice C3's / text D6a's `push-notification-service.ts` + `web_push_subscriptions` table.** No new infrastructure; just a new trigger event ("video participant connected") and consumer (the doctor dashboard).

**Decision §28** — doctor only for v1 (same as voice).

**Estimated time:** ~2 days IF reusing shipped push backend; ~7+ days IF this task ships the entire push foundation (per voice C3 contract).

**Status:** ⏸ **Deferred (2026-05-02)** — execution-time audit found the HARD dep (the shared push backend — voice C3 OR text D6a) is **NOT shipped at all** in this codebase: no `web_push_subscriptions` table, no `push-notification-service.ts`, no `frontend/public/sw.js`, no `usePushSubscription` hook, no VAPID env vars. Per this task's own spec ("If neither has shipped: ship the migration + service per voice C3 contract — this task gets the burden then"), proceeding now would balloon scope from a 2-day video-trigger task into a 7+ day cross-batch foundation (D6a + D6b + D6c trio + the video trigger + VAPID ops handoff + doctor opt-in UX + service worker + cross-modality smoke). That foundation belongs in the text or voice batch, not here. Promote back to active when **either** [task-text-D6a](./task-text-D6a-web-push-migration-and-service.md) **or** [task-voice-C3](./task-voice-C3-browser-push-remote-joins.md) has shipped — at that point this task collapses back to its original 2-day scope (just the video trigger + cross-modality `tag` extension). Non-blocking for the rest of Sub-batch E (E.3 / E.4 / E.5 / E.6 / E.7 have no dep on push). See "Audit + scope decision (2026-05-02)" below.

**Depends on:** voice C3 OR text D6a — whichever shipped first (HARD — push backend); voice C3's webhook handler if any. **Both Drafted as of 2026-05-02; neither has shipped.**

**Source:** [T5 §T5.35](../../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md); [decision §28](../Plans/plan-video-consult-selected-features.md#before-sub-batch-e-starts).

---

## Audit + scope decision (2026-05-02)

Execution-time audit found the entire push backend stack is missing:

| Required infrastructure | Present? | Notes |
|---|---|---|
| `web_push_subscriptions` migration | ❌ | Highest extant migration is `085_consultation_extra_participants.sql`; no `086_web_push_subscriptions.sql`. |
| `backend/src/services/push-notification-service.ts` | ❌ | Closest existing file is `backend/src/services/notification-service.ts` (different — non-web-push). |
| `frontend/public/sw.js` (service worker) | ❌ | No service worker file in `frontend/public/`. |
| `frontend/hooks/usePushSubscription.ts` | ❌ | No web-push subscription hook anywhere. |
| `web-push` npm dependency | ❌ | Not in `backend/package.json`. |
| VAPID keys provisioned | ❌ | No `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` env vars; not in `Clariva-bot render.env`. |
| Doctor push opt-in UX | ❌ | No opt-in toggle in dashboard settings. |

**Sibling status (2026-05-02):**
- [task-text-D6a](./task-text-D6a-web-push-migration-and-service.md) — `Status: Drafted. Pending pickup.`
- [task-voice-C3](./task-voice-C3-browser-push-remote-joins.md) — `Status: Drafted.`

**Why defer instead of "this task gets the burden":**

1. **Cross-batch ownership**: shipping D6a/b/c here means the video batch produces text + voice infrastructure. That's the wrong batch boundary; D6a explicitly belongs to text-consult Sub-batch D and voice C3 is the voice owner. Ownership ambiguity is exactly what the task spec's "whoever ships first" clause is trying to prevent.
2. **VAPID + ops handoff**: VAPID key generation requires ops sign-off (env var provisioning across dev / staging / prod) — not something a single video-batch PR should drive unilaterally.
3. **Decision §28 still requires product confirmation**: doctor-only push for v1 is currently the assumed scope, but the opt-in copy + permission-prompt timing affect text + voice equally. Better to settle that once when D6b ships its opt-in UI than to ship a video-only opt-in here.
4. **Non-blocking**: Sub-batch E has 6 other tickets (E.1 ✅ shipped 2026-05-02; E.3 / E.4 / E.5 / E.6 / E.7 still pending). None depend on E5. Deferring E5 doesn't slow the rest of the batch.

**Same defer pattern** as [task-video-D4 patient rating](./task-video-D4-patient-rating.md) — when a HARD dep is unshipped AND would force a sub-batch-spanning foundation, defer cleanly with explicit unblock criteria rather than reshape this batch to absorb it.

---

## Unblock checklist

Promote E5 back to active when **all** of these are true:

- [ ] `web_push_subscriptions` migration shipped (text D6a OR voice C3 — same migration content, ~`086_web_push_subscriptions.sql`).
- [ ] `backend/src/services/push-notification-service.ts` shipped with a `send(userId, payload)` signature.
- [ ] `frontend/public/sw.js` push handler shipped.
- [ ] VAPID keys provisioned in dev / staging / prod env (`VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`).
- [ ] Cross-modality `tag` convention locked (`tag = '${session_id}:${modality}'` per voice C3 spec).
- [ ] Doctor push opt-in UI shipped (text D6b OR equivalent).

When the above is true, this task collapses to: edit `twilio-webhook-controller.ts` to call `pushNotificationService.send(...)` on `participant-connected` for video sessions + extend `frontend/public/sw.js` if any new payload fields are needed + integration test. ~2 days as originally estimated.

---

## Acceptance criteria

### Reuse `push-notification-service.ts` + `web_push_subscriptions`

- [ ] **If voice C3 OR text D6a has shipped:** import `pushNotificationService.send(userId, payload)` from `backend/src/services/push-notification-service.ts`. No new backend infrastructure.
- [ ] **If neither has shipped:** ship the migration + service per voice C3 contract (this task gets the burden then).

### Webhook handler trigger

- [ ] **Edit** `backend/src/controllers/twilio-webhook-controller.ts` — on `participant-connected` for a video room (modality detected from session metadata):
  - Skip if the participant is the doctor themselves (don't push to self).
  - Look up active web_push_subscription for the doctor.
  - Send push payload `{ title: 'Patient joined consult', body: 'Maya • Cardiology consult', deep_link: '/c/video/[sessionId]' }`.
- [ ] **Idempotency** — only send once per (session, participant) tuple. Track in a small in-memory dedupe or DB table flag.

### SW push handler in frontend

- [ ] **Reuse / extend `frontend/public/sw.js`** push handler — on push received, render OS notification with deep-link click handler.
- [ ] Click on notification → `clients.openWindow(deep_link)` opens the consult URL in foreground.

### Active-tab suppression

- [ ] If the doctor already has the consult tab focused, don't fire push (foreground notifications are noise).
- [ ] Use service worker `clients.matchAll()` to detect.

### Manual smoke

- [ ] Doctor has dashboard open + opted into push (existing voice/text opt-in); patient opens video link → doctor sees push within 5s.
- [ ] Tap push → consult URL opens in same browser.
- [ ] Doctor on the consult tab actively → no push (active suppression).
- [ ] Voice consult parallel push still works (shared infrastructure).

### `mode='readonly'`

- [ ] N/A; push is for live calls only.

### General

- [ ] Type-check + lint clean (frontend + backend).
- [ ] No console errors.
- [ ] No regression on voice / text push.

---

## Out of scope

- **Patient-side push** when doctor joins. Decision §28 — out of scope v1.
- **Push when third-party participant joins (C8).** Out of scope.
- **Push when patient sends companion-chat message.** Text batch's D6 owns that.
- **Push retry / queueing on send failure.** Out of scope; rely on push-notification-service's retry.

---

## Files expected to touch

**Backend:**
- `backend/src/controllers/twilio-webhook-controller.ts` — **edit** (~30 LOC: new handler for `participant-connected` for video).
- `backend/src/services/notification-service.ts` — **edit** (~20 LOC: new `notifyDoctorParticipantJoined(sessionId, participantInfo)` helper).

**Frontend:**
- `frontend/public/sw.js` — **edit** (~15 LOC: extend existing push handler if needed).

**Migrations:** none if voice/text already shipped `web_push_subscriptions`. If not, this task ships the migration per voice C3 contract.

**Tests:**
- `backend/tests/integration/video-push-on-join.test.ts` — **new** (~80 LOC: simulate participant-connected webhook → assert push enqueue).

---

## Notes / open decisions

1. **Decision §28** — doctor-only push in v1.
2. **Cross-batch dependency** — coordinate with voice C3 / text D6a owner on the shared service. Whoever ships first writes the foundation; this task consumes.
3. **Idempotency** — dedupe per (session_id, participant_user_id). Twilio webhooks can fire multiple times.
4. **Push payload PHI** — title/body are minimal ("Patient joined") — no clinical content. Confirm at PR time.
5. **Active-tab suppression** — service worker pattern; reuse if voice ships.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch E](../Plans/plan-video-consult-selected-features.md#sub-batch-e--reliability--safety-12-days)
- **Source item:** [T5 §T5.35](../../../../Product%20plans/video-consult/plan-t5-video-reliability-safety.md)
- **Decision:** [§28 — push opt-in scope](../Plans/plan-video-consult-selected-features.md#before-sub-batch-e-starts)
- **Sibling (voice):** voice C3 (push when remote joins on voice)
- **Sibling (text):** [task-text-D6a](./task-text-D6a-web-push-migration-and-service.md), [task-text-D6b](./task-text-D6b-push-subscribe-and-opt-in.md), [task-text-D6c](./task-text-D6c-push-end-to-end-verification.md)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** ⏸ Deferred (2026-05-02) — push backend (text D6a / voice C3) not shipped; would balloon this S task into a 7+ day cross-batch foundation. Promote back when either sibling ships per "Unblock checklist" above.
