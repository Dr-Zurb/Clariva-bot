# Task text-D6a: Web Push part 1 — migration `086_web_push_subscriptions.sql` + `push-notification-service.ts` backend + VAPID env

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch D (T5 reliability) — **L item, ~2 days (1/3)**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

T5.32 ships true mobile-PWA push (notifications when the app is fully backgrounded — patient on the home screen / phone in pocket / app not running). This is a multi-day effort split into three sequential tasks:

- **D6a (this task)** — schema, backend service, VAPID provisioning. **No user-visible behavior yet.**
- **D6b** — subscribe/unsubscribe controllers, frontend opt-in flow, service-worker push handler.
- **D6c** — end-to-end smoke, suppression (active-tab), cross-modality coordination with the voice batch.

D6a establishes the foundation: a table to store push subscriptions, a backend service that knows how to fan-out a Web Push payload using `web-push` library + VAPID keys, and the env vars provisioned in dev / staging / prod.

**Cross-modality coordination:** The voice batch's T5.32 (browser push when remote joins) shares this infrastructure. Implement push-notification-service.ts ONCE here; the voice batch consumes it.

**Estimated time:** ~2 dev-days.

**Status:** Shipped (2026-05-24). Migration shipped as **111** (086 was already taken by `video_call_quality`).

**Depends on:** None hard. **Hard-blocks D6b + D6c**.

**Source plan:** [T5 §T5.32](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)

---

## Acceptance criteria

### Migration

- [x] **Migration `111_web_push_subscriptions.sql`** (086 was taken; next free slot after 110):
  ```sql
  CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID         NOT NULL,            -- doctor or patient principal id
    user_role     TEXT         NOT NULL CHECK (user_role IN ('doctor', 'patient')),
    endpoint      TEXT         NOT NULL,
    p256dh_key    TEXT         NOT NULL,
    auth_key      TEXT         NOT NULL,
    user_agent    TEXT,                              -- for debugging
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_used_at  TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ,                      -- nulled on subscription cleanup
    UNIQUE (user_id, endpoint)                       -- one subscription per device per user
  );

  CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_active
    ON web_push_subscriptions (user_id) WHERE revoked_at IS NULL;

  ALTER TABLE web_push_subscriptions ENABLE ROW LEVEL SECURITY;

  -- SELECT: user can read their own subscriptions
  CREATE POLICY web_push_subscriptions_select_own
    ON web_push_subscriptions FOR SELECT
    USING (user_id = public.safe_uuid_sub());

  -- INSERT: user inserts their own subscription
  CREATE POLICY web_push_subscriptions_insert_own
    ON web_push_subscriptions FOR INSERT
    WITH CHECK (user_id = public.safe_uuid_sub());

  -- UPDATE: user can update their own (used for revocation)
  CREATE POLICY web_push_subscriptions_update_own
    ON web_push_subscriptions FOR UPDATE
    USING (user_id = public.safe_uuid_sub())
    WITH CHECK (user_id = public.safe_uuid_sub());

  -- DELETE: user can delete their own
  CREATE POLICY web_push_subscriptions_delete_own
    ON web_push_subscriptions FOR DELETE
    USING (user_id = public.safe_uuid_sub());
  ```
- [x] **Reverse migration documented**.
- [x] **Content-sanity test** at `backend/tests/unit/migrations/web-push-subscriptions-migration.test.ts` pinning `safe_uuid_sub()` references + RLS shape + UNIQUE constraint.

### Env vars

- [x] **VAPID keypair generated** — `npx web-push generate-vapid-keys` produces a public/private pair. Document the command in the PR.
- [x] **`WEB_PUSH_VAPID_PUBLIC_KEY`** added to `backend/.env.example` (placeholder value; real values out-of-band in `.env.local`, staging secrets, prod secrets).
- [x] **`WEB_PUSH_VAPID_PRIVATE_KEY`** added to `backend/.env.example` similarly.
- [x] **`WEB_PUSH_CONTACT_EMAIL`** — e.g. `mailto:ops@clariva.health`. Required by Web Push spec for upstream-provider abuse contact.
- [x] **Provisioning runbook** at `docs/Reference/engineering/operations/web-push/web-push-vapid-provisioning.md` (or extend the existing env-vars doc):
  - How to generate keys.
  - Where to set them (`.env.local` / Render dashboard / Vercel dashboard / wherever).
  - Rotation policy (don't rotate without coordinated SW + frontend redeploy).
  - **Critical:** rotating VAPID keys invalidates all existing push subscriptions — patients/doctors must re-subscribe. Document.
- [x] **Frontend exposes the public key** — `frontend/.env.example` adds `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`. Wired to the subscribe call in D6b.

### Backend service

- [x] **`web-push` npm package added** to `backend/package.json`. Pin version.
- [x] **`backend/src/services/push-notification-service.ts` new file** with the contract:
  ```ts
  interface PushPayload {
    title: string;             // e.g. "Dr. Sharma sent a message"
    body: string;              // SHORT preview — e.g. "Take 5mg twice a day" — NEVER full PHI
    icon?: string;             // PWA icon URL
    badge?: string;            // small monochrome icon
    tag?: string;              // groups notifications (e.g. session_id) so a re-fire replaces vs stacks
    data?: Record<string, unknown>;  // arbitrary; SW reads on click (e.g. { sessionId, deeplink })
  }

  interface SendPushOptions {
    userId: string;
    payload: PushPayload;
    /**
     * If true, no-op when the subscription doesn't exist. Default true; the service
     * logs but doesn't throw on "user has no subscription" — it's a normal case.
     */
    silentMissingSubscription?: boolean;
  }

  export async function sendPushToUser(opts: SendPushOptions): Promise<{ delivered: number; failed: number; revoked: number }>;

  export async function sendPushToSession(opts: { sessionId: string; senderRole: 'doctor' | 'patient'; payload: PushPayload }): Promise<{ delivered: number; failed: number; revoked: number }>;
  ```
- [x] **`sendPushToUser` implementation:**
  - Loads all `revoked_at IS NULL` subscriptions for the user from the DB (service-role client).
  - For each, calls `webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, JSON.stringify(payload))` with `vapidDetails: { subject: WEB_PUSH_CONTACT_EMAIL, publicKey, privateKey }`.
  - On `410 Gone` or `404 Not Found` from the push provider → mark the subscription `revoked_at = now()` (browser/server unsubscribed it).
  - On other errors → log + count as failed; don't revoke (could be transient).
  - Updates `last_used_at = now()` on successful delivery.
  - Returns counts.
- [x] **`sendPushToSession` implementation:**
  - Loads the session (`consultation_sessions`).
  - Determines the recipient(s) — `senderRole === 'doctor'` → fan to `patient_id`; `'patient'` → fan to `doctor_id`.
  - Calls `sendPushToUser` for each recipient.
- [x] **Unit test** at `backend/tests/unit/services/push-notification-service.test.ts` mocks `web-push` and asserts:
  - Loads only non-revoked subscriptions.
  - Marks 410 as revoked.
  - Other 5xx errors don't revoke.
  - `last_used_at` updates on success.
  - Empty subscription list returns `{ delivered: 0, failed: 0, revoked: 0 }` (no throw).
- [x] **PHI hygiene** — service NEVER logs the `payload.body` (even though the body is meant to be short). Logs only `{ user_id, delivered, failed, revoked }`. Pin in test with a console-spy assertion.

---

## Out of scope

- **Subscribing / unsubscribing endpoints.** D6b owns.
- **Frontend opt-in flow.** D6b owns.
- **Service-worker push handler.** D6b owns.
- **Calling `sendPushToSession` from chat-message INSERT trigger.** D6b owns; D6c verifies end-to-end.
- **Suppression when active-tab.** D6c owns.
- **Push-payload PHI redaction.** D7 owns the inline redactor (placeholder until T3.24).

---

## Files expected to touch

**Backend:**

- `backend/migrations/111_web_push_subscriptions.sql` — **new** (~80 LOC).
- `backend/tests/unit/migrations/web-push-subscriptions-migration.test.ts` — **new** (~40 LOC).
- `backend/src/services/push-notification-service.ts` — **new** (~150 LOC).
- `backend/tests/unit/services/push-notification-service.test.ts` — **new** (~120 LOC).
- `backend/package.json` — **edit** (add `web-push`).
- `backend/.env.example` — **edit** (add 3 VAPID vars).
- `docs/Reference/engineering/operations/web-push/web-push-vapid-provisioning.md` — **new** (~50 LOC; runbook).
- `frontend/.env.example` — **edit** (add `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`).

---

## Notes / open decisions

1. **`web-push` library** — battle-tested; handles VAPID JWT signing, payload encryption, push-provider quirks. Don't roll our own.
2. **`tag` field semantics** — set `tag = sessionId` so a new push replaces an older notification from the same session in the OS notification tray. Prevents notification clutter.
3. **`silentMissingSubscription` default** — true; it's normal for users to not have subscriptions (haven't installed PWA, haven't opted in). Don't paginate ops alerts on this.
4. **Why `web_push_subscriptions.user_role`** — used by D6c suppression: only fan to the OPPOSITE role of the sender. We could derive role from session lookup but storing it on the row is cheaper for fan-out.
5. **`UNIQUE (user_id, endpoint)`** — same device re-subscribing produces an UPSERT (D6b handles); without UNIQUE, refresh-then-resubscribe duplicates rows.
6. **Service-role for INSERTs at the controller layer** — D6b's subscribe controller uses the service-role client to bypass RLS on INSERT (the user's JWT is sufficient for auth at the controller, but RLS-side INSERT-as-self is also fine; either works).
7. **Cross-modality contract** — the voice batch's T5.32 just calls `sendPushToSession({ sessionId, senderRole, payload: { title, body, tag, data: { sessionId, deeplink: `/c/voice/${sessionId}` } } })`. Same service.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch D](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T5 §T5.32](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)
- **Foundation invariant — `safe_uuid_sub()`:** [plan-f04](../../../../Product%20plans/text-consult/plan-f04-text-foundation-status.md).
- **Sibling parts:** [task-text-D6b](./task-text-D6b-push-subscribe-and-opt-in.md), [task-text-D6c](./task-text-D6c-push-end-to-end-verification.md).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Shipped (2026-05-24). Closed by D6c verification.
