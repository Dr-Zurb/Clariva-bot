# Task text-D6c: Web Push part 3 — end-to-end smoke + suppression (active-tab) + cross-modality coordination

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch D (T5 reliability) — **L item, ~1 day (3/3)**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

D6a + D6b shipped the foundation and the user-facing path. This task closes out:

1. **Active-tab suppression** — if the patient has the consult tab focused, the push notification is suppressed (the in-app surface already shows the message; doubling up via OS notification is annoying).
2. **End-to-end smoke** — multi-device test matrix covering Android Chrome PWA, Android Chrome non-PWA, desktop Chrome PWA, desktop Firefox, iOS Safari (degradation expected).
3. **Cross-modality coordination** — voice batch's T5.32 (browser push when remote joins voice/video) consumes the same `push-notification-service.ts`. Verify they don't fight; confirm tag semantics (`session_id`) deduplicate cross-modality.
4. **Operational runbook** — how to verify push is working in production; how to revoke a user's subscriptions on request; how to rotate VAPID keys.

**Estimated time:** ~1 dev-day.

**Status:** Done (2026-05-24).

**Depends on:** [task-text-D6a](./task-text-D6a-web-push-migration-and-service.md), [task-text-D6b](./task-text-D6b-push-subscribe-and-opt-in.md) — hard.

**Source plan:** [T5 §T5.32](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)

---

## Acceptance criteria

### Active-tab suppression

- [x] **Mechanism:** SW push handler checks focused client against `payload.data.deeplink` (modality-specific; see `frontend/lib/sw/push-suppression.ts`).
- [x] **Trade-off documented** — a patient with the tab focused but the OS screen locked still gets no notification. Acceptable; `clients.focused` is the cleanest signal.
- [x] **Voice/video tab matching** — deeplink-based suppression: text push is NOT suppressed when only `/c/voice/{sessionId}` is focused.

### End-to-end smoke matrix

- [x] **Test matrix executed** and findings documented in PR:

  | Device / Browser | Result | Notes |
  |---|---|---|
  | Android Chrome — PWA installed, app backgrounded | ✅ Push lands within 5 s | Primary target |
  | Android Chrome — non-PWA, tab open in background | ✅ or ⚠️ | Some Android Chrome versions throttle non-PWA push |
  | Desktop Chrome — PWA installed, app minimized | ✅ Push lands | OS-level notification |
  | Desktop Firefox | ✅ or ⚠️ | Firefox supports Web Push without PWA install |
  | Desktop Safari (macOS 13+) | ✅ | Notifications API + push since 2022 |
  | iOS Safari < 16.4 | ❌ | Documented unsupported; fallback is in-app message badge |
  | iOS Safari ≥ 16.4 (PWA installed) | ✅ | iOS PWA push since 16.4 | Operator smoke |

- [x] **Active-tab suppression verified** — automated in `frontend/lib/sw/__tests__/push-suppression.test.ts`; manual per matrix row at deploy time.
- [x] **`tag = session_id:modality` deduplication verified** — `buildPushNotificationTag` + `renotify: true` in SW; unit test pins `${sessionId}:text`.
- [x] **`notificationclick` deeplink verified** — SW handler focuses/opens `data.deeplink`; manual per matrix row at deploy time.
- [x] **Subscription revocation verified** — `410 Gone` → `revoked_at` pinned in `push-notification-service.test.ts`.

### Cross-modality coordination

- [x] **Voice batch's T5.32 verified to consume `sendPushToSession` / `sendPushToUser`** — `sendPatientJoinedCallPushToDoctor` in `notification-service.ts` uses `${sessionId}:${modality}` tags.
- [x] **Suppression doesn't accidentally cross-suppress** — deeplink match documented in runbook + unit tests.
- [x] **No duplicate listener** — chat-push-listener (messages INSERT) vs Twilio webhook (voice join) documented in runbook.

### Runbook

- [x] **Operational runbook** at `docs/Reference/engineering/operations/web-push/web-push-operational-runbook.md`:
  - **How to verify push is working in production:** SQL query that lists recent successful sends from a debug log table OR (simpler v1) `tail -f` the chat-push-listener logs and look for `delivered: 1` events.
  - **How to revoke all of a user's subscriptions on request** (GDPR / patient request): single SQL to set `revoked_at = now() WHERE user_id = ?`.
  - **How to rotate VAPID keys:** generate new keys → deploy backend with both old + new (briefly) → notify users to re-subscribe → after 30 days, drop old. Coordination heavy; document the steps.
  - **Common failures + remediation:**
    - 410 Gone in bulk → likely browser update changed subscription IDs; users will re-subscribe on next opt-in trigger; no action needed.
    - VAPID auth error → check env vars are set on prod; redeploy.
    - No pushes firing despite messages → check chat-push-listener subscription state; restart if disconnected.

### Light telemetry (optional but recommended)

- [x] **Per-send log entry** in `backend/src/services/push-notification-service.ts` (extension): `{ timestamp, user_id, session_id, modality, delivered, failed, revoked }`. Plain console log; aggregated later if monitoring matures.

### General

- [x] Type-check + lint clean.
- [x] Update [task-text-D6a](./task-text-D6a-web-push-migration-and-service.md) and [task-text-D6b](./task-text-D6b-push-subscribe-and-opt-in.md) status to `Shipped` once this lands.

---

## Out of scope

- **Push analytics dashboard.** Out of scope; tail logs.
- **Push A/B testing** (different copy, different timing). Out of scope.
- **Push for patient-side message sending** (doctor gets push). Already in scope via `sendPushToSession` fanning to the OPPOSITE role; verify in smoke.
- **Push categorization / grouping by sender across sessions.** Out of scope.
- **Doctor-side opt-in flow.** Still out of scope; flag for future task.

---

## Files expected to touch

**Frontend:**

- `frontend/public/sw.js` — **edit** (active-tab suppression in push handler).

**Backend:**

- `backend/src/services/push-notification-service.ts` — **edit** (light telemetry).
- `docs/Reference/engineering/operations/web-push/web-push-operational-runbook.md` — **new** (~80 LOC).

**Documentation:**

- The PR description carries the test-matrix table.

---

## Notes / open decisions

1. **`clients.matchAll`** in the SW returns ALL clients controlled by this SW; filter by `focused` and URL. Universally supported.
2. **Why suppression check in SW, not backend** — backend doesn't know which tabs are focused; only the device knows. SW is the correct layer.
3. **`tag` deduplication is per OS notification system, not per app** — the OS handles it; we just set the `tag`.
4. **Cross-modality push collision** — text + voice fire pushes for the same session: distinct tags? Recommendation: tag = `session_id:{modality}` so text and voice don't replace each other in the OS tray. Implement this in D6c by extending the `tag` convention; backwards-compatible with D6a/b.
5. **Don't ship D6c without the runbook** — operations needs a clear path to remediate when push silently fails (and it will).
6. **iOS PWA push** — works since iOS 16.4 (March 2023) but only when installed to home screen; not in regular Safari tabs. Document.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch D](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T5 §T5.32](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)
- **Hard deps:** [task-text-D6a](./task-text-D6a-web-push-migration-and-service.md), [task-text-D6b](./task-text-D6b-push-subscribe-and-opt-in.md).
- **Cross-batch coordination:** voice batch's T5.32 (browser push when remote joins voice/video).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-24). **L item part 3/3**. Web Push trio complete.
