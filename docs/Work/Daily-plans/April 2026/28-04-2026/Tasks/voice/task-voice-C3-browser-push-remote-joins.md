# Task voice-C3: Browser push / desktop notification when remote joins

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch C (production-grade) — **S item, ~2 days (consumes text-consult D6a)**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Doctor on dashboard, browser tab not focused. Patient hits the join URL. **Today: nothing happens.** The doctor only knows because a chime fires (C1) — IF the tab is open. If the dashboard is on another monitor / hidden, the doctor never knows the patient joined.

T5.32 ships a **Web Push notification** (real, OS-level, server-driven) to the doctor's device when a patient joins a voice/video consult. Reuses **all** the infrastructure shipped in text-consult [task-text-D6a](./task-text-D6a-web-push-migration-and-service.md):

- Same migration `0XX_web_push_subscriptions.sql`.
- Same `push-notification-service.ts` backend.
- Same VAPID keys.
- Same `usePushSubscription` frontend hook.
- Same SW push handler.

**Cross-batch coordination point:** whichever batch ships D6a first owns the file; the other consumes. If text-consult D6a is already shipped, this task only adds the **voice-call trigger** + a tiny `tag` convention extension.

**Decision §12:** doctor-only push for v1; patients are typically the active waiter and don't need to be pushed.

**Estimated time:** ~2 days IF reusing text D6a; ~5 days IF C3 is the first batch shipping push (carries the entire D6a/b/c trio).

**Status:** Shipped (2026-05-24).

**Depends on:** [task-text-D6a](./task-text-D6a-web-push-migration-and-service.md) — soft (consumes if shipped; ships otherwise). [task-text-D6b](./task-text-D6b-push-subscribe-and-opt-in.md) — soft (subscribe flow; doctor side might need its own opt-in surface).

**Source:** [T5 §T5.32](../../../../Product%20plans/voice-consult/plan-t5-voice-reliability-safety.md); [decision §12](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-c-starts).

---

## Acceptance criteria

### Cross-batch coordination

- [x] **At PR time, check whether text-consult D6a/b/c has shipped:**
  - **If YES:** this task only adds the voice trigger + cross-modality `tag` convention. Skip the migration / service / VAPID setup.
  - **If NO:** this task ships D6a (migration + push-notification-service.ts + VAPID env vars) AND extends with the voice trigger. Add the cross-modality `tag` convention from the start.
- [x] **`tag` convention (cross-modality, locked):** `tag = '${session_id}:${modality}'`. So a text push and a voice push for the same session show as two distinct OS notifications, not one replacing the other.

### Voice-call trigger (the new bit, regardless of D6a state)

- [x] **Hook into Twilio webhook** at `backend/src/controllers/twilio-webhook-controller.ts`:
  - On `participant-connected` event for a session where `session.modality IN ('voice', 'video')`:
    - Determine whose role just joined (doctor vs patient).
    - Determine the OPPOSITE role's user_id from `consultation_sessions`.
    - Call `pushNotificationService.sendPushToUser({ userId, title, body, deeplink, tag })`:
      - `title`: `"Patient joined your call"` (doctor-side) — decision §12: doctor-only for v1, so we never push patient.
      - `body`: short, no PHI: `"Your patient is in the waiting room. Tap to join."` (or similar; if the patient hasn't actually been verified by name, "Patient" is fine).
      - `deeplink`: `/c/voice/${sessionId}` or `/c/video/${sessionId}` for doctor — wait, doctors typically launch from dashboard. Use the dashboard call-launch route: `/dashboard/consult/${sessionId}`.
      - `tag`: `'${sessionId}:voice'` (or `:video`) for cross-modality dedup.
- [x] **Don't push the joiner themselves.** If the doctor joined first (typical), the participant-connected event fires for them too; suppress the doctor-self-push.

### Doctor-side opt-in flow

- [x] **If text D6b has shipped a patient-side opt-in flow**, mirror it for doctors:
  - Trigger surface: when doctor visits dashboard for the first time after C3 ships, show a one-time prompt: "Get notified when patients join your calls?"
  - On Enable: subscribe via the existing `usePushSubscription` hook.
  - Persist subscription to the same `web_push_subscriptions` table.
- [ ] **Decision §29 carryover from text** — patient opt-in only for chat push; voice C3 is the first DOCTOR opt-in surface. Coordinate copy with text-consult batch.

### Active-tab suppression (extends D6c)

- [x] **The SW push handler already suppresses** if a focused tab matches the deeplink. Verify the deeplink check works for `/dashboard/consult/${sessionId}` shape. Adjust the check to be liberal: if any focused tab contains `${sessionId}` in URL, suppress.

### Manual smoke

- [ ] Doctor on dashboard, tab focused → patient joins → no push (suppressed by active-tab guard); chime from C1 fires.
- [ ] Doctor switches to another tab → patient joins → push lands within 5s; tap deeplinks to dashboard call route.
- [ ] Doctor on phone (PWA installed, app backgrounded) → patient joins → OS notification.
- [ ] Cross-modality dedup: text message comes in same session AND patient joins voice → two distinct notifications (different tags).
- [ ] Doctor opts out → no further pushes.

### General

- [x] Type-check + lint clean.
- [x] No PHI in push body (no patient name; just "Patient").
- [x] Migration (if shipped here) forward + reverse cleanly. *(Consumed text D6a migration — not shipped in this task.)*

---

## Out of scope

- **Patient-side push** (decision §12: doctor-only).
- **Push body customization** by clinic. Out of scope.
- **Notification action buttons** ("Decline", "Join Now"). Out of scope.
- **SMS fallback.** Out of scope.

---

## Files expected to touch

**Backend:**

- `backend/src/controllers/twilio-webhook-controller.ts` — **edit** (~30 LOC: participant-connected → push fan-out).
- `backend/src/services/voice-remote-join-push-service.ts` — **new** (~45 LOC: thin wrapper for "patient joined" copy).
- `backend/src/services/push-notification-service.ts` — **either consume from text D6a OR ship here** (~250 LOC if shipping).
- `backend/migrations/0XX_web_push_subscriptions.sql` — **either skip OR ship** (~80 LOC if shipping).

**Frontend:**

- `frontend/components/dashboard/PushOptInPrompt.tsx` (or similar) — **new** (~80 LOC; doctor-side opt-in).
- `frontend/hooks/usePushSubscription.ts` — **either consume from text D6b OR ship** (~120 LOC if shipping).
- `frontend/public/sw.js` — **edit** (~10 LOC: extend deeplink suppression to dashboard routes).

**Tests:** integration test against the new webhook trigger.

---

## Notes / open decisions

1. **Cross-batch ownership** — coordinate at standup. If text D6 is mid-flight, time C3 to start AFTER D6 lands. Saves ~3 days.
2. **`tag` convention** — `'${sessionId}:${modality}'` is locked from D6c onwards; voice MUST follow.
3. **Why doctor-only** — patients are usually waiting actively; pushing them adds noise. Decision §12.
4. **Deeplink shape** — for doctor, the dashboard call route. For patient (when patient push someday lands), the `/c/voice/${sessionId}` route.
5. **Suppression generic** — the SW handler should suppress if ANY focused tab contains `${sessionId}`, regardless of route prefix. Future-proof.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch C](../Plans/plan-voice-consult-selected-features.md#sub-batch-c--production-grade-17-days)
- **Source item:** [T5 §T5.32](../../../../Product%20plans/voice-consult/plan-t5-voice-reliability-safety.md)
- **Decision:** [§12 — doctor-only](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-c-starts)
- **Cross-batch share:** [task-text-D6a](./task-text-D6a-web-push-migration-and-service.md), [task-text-D6b](./task-text-D6b-push-subscribe-and-opt-in.md), [task-text-D6c](./task-text-D6c-push-end-to-end-verification.md).

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Shipped (2026-05-24). Consumed text D6a push stack; voice trigger + doctor opt-in + SW suppression.
