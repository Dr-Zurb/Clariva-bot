# Webhook security — Instagram signature behavior & threat model

**RBH-08 (2026-03-28)** — Reference for security review, onboarding, and incident response.  
**Scope:** `POST /webhooks/instagram` signature handling in `backend/src/controllers/webhook-controller.ts`. Payment webhooks are **out of scope** for bypass (strict verification).

**Related:** [WEBHOOKS.md](./WEBHOOKS.md) · [COMPLIANCE.md](./COMPLIANCE.md) · [RECEPTIONIST_BOT_ENGINEERING.md](../Development/Daily-plans/March%202026/2026-03-25/Receptionist%20Bot%20improvements/RECEPTIONIST_BOT_ENGINEERING.md) §6

---

## 1. Why this document exists

Meta’s `X-Hub-Signature-256` verification **sometimes fails** for Instagram products (DM `message`, comment `changes`, read receipts, `message_edit`) even when the payload is legitimate—documented app tradeoff so production delivery continues. This doc records **exact controller branches**, **risk**, **mitigations**, and **when to re-audit**.

**Do not** paste live verify tokens, app secrets, or raw webhook bodies into tickets or docs.

---

## 2. Production risk acceptance (explicit)

| Decision | Rationale |
|----------|-----------|
| **Accepted:** Limited processing of some Instagram POSTs when HMAC verification fails, per classified payload shape (see §3). | Without this, users lose DMs/comments or Meta retries flood logs. |
| **Not accepted:** Disabling verification entirely for all payloads. | Unknown / non-exempt types still return **401** and security events are logged. |
| **Not accepted:** Logging full `req.body` on success or failure. | PHI/PII risk; see [STANDARDS.md](./STANDARDS.md). |

**Owners:** Engineering + (as applicable) security/ops sign-off on any **change** to bypass rules.

---

## 3. Code audit: `handleInstagramWebhook` (POST)

** Preconditions:** `req.rawBody` must exist (captured in `index.ts` before `express.json` for Instagram POST). If missing → **`webhook_raw_body_missing`** security event → **401** (signature path cannot run correctly).

### 3.1 When `verifyInstagramSignature` **succeeds**

Normal pipeline: comment early branch, non-actionable short-circuit, `message_edit` skip, echo skip, dedup, idempotency, queue DM job, **200** + audit metadata. (Same as design in [WEBHOOKS.md](./WEBHOOKS.md).)

### 3.2 When `verifyInstagramSignature` **fails** — response matrix

| Condition | HTTP | Queued? | Notes |
|-----------|------|--------|--------|
| `rawBody` length ~300–320 bytes **and** `isNonActionableInstagramEvent` (read/delivery style) | **200** | No | Stops Meta retries; no PHI processing. |
| `payloadType === 'message_edit'` (first messaging item is `message_edit`) | **200** | No | Intentionally not queued (see controller comment: race with `message`). |
| `payloadType` starts with `comment:` (`comments` / `live_comments`) | **200** *after* normal comment path | Yes (comment job) | **Bypass:** verification failure logged; processing continues so comment pipeline can run. |
| `payloadType === 'message'` (DM-style) | **200** *after* normal DM path | Yes (DM job) if not deduped/idempotent | **Bypass:** verification failure logged; DM pipeline can run. |
| `payloadType === 'unknown'` **and** `object === 'instagram'` **and** `entry[0]` has non-empty `messaging` array | **200** | No | Conservative “non-actionable” style exit; no queue. |
| **Else** (unknown shape / failed sig) | **401** | No | `webhook_signature_failed` security event. |

**401 path details:** For ~304-byte bodies that are *not* classified as non-actionable, controller may log **payload structure metadata only** (no message text) for debugging.

### 3.3 Payload type labels (diagnostic only)

Derived from parsed `req.body` (not trusted for security decisions beyond routing):

- **`message`** — `entry[0].messaging[0].message`
- **`message_edit`** — `entry[0].messaging[0].message_edit`
- **`comment:comments`** / **`comment:live_comments`** — `entry[0].changes[0].field`
- **`unknown`** — none of the above

---

## 4. Threat model

### 4.1 Attacker model

- **Internet-facing** `POST /webhooks/instagram` (also protected by **`webhookLimiter`** in `middleware/rate-limiters.ts`: high threshold, IP-keyed, 429 on abuse).
- Attacker can send arbitrary JSON **without** valid `X-Hub-Signature-256`.

### 4.2 Scenarios

| Scenario | Feasibility | Impact |
|----------|----------------|--------|
| **Spoofed DM `message`** (invalid sig, branch allows processing) | Anyone can POST | Worker resolves `doctor_id` from payload page IDs and uses **stored** Instagram access token. Meta Graph API calls fail or no-op if IDs/recipient invalid; cost mainly **queue/CPU/AI** if payload slips through. |
| **Spoofed comment** (invalid sig, branch allows) | Anyone can POST | Same as DM: comment pipeline needs valid media/page context; lead creation and API calls bound to resolved doctor. |
| **Read/delivery spoof** (invalid sig, 200 no queue) | Anyone can POST | **Minimal:** no job, no user-visible effect. |
| **Unknown payload** (invalid sig) | Anyone can POST | **401**; may log security event. |

### 4.3 What attacker does **not** get from this bypass alone

- **Instagram app secret** or doctor tokens (never in response; not derived from webhook body).
- **Guaranteed** delivery of a message to a real patient IG user without Meta accepting the downstream API call.

### 4.4 Mitigations (defense in depth)

1. **HMAC** still enforced for all non-exempt failure paths (unknown type → 401).
2. **Idempotency** (`webhook_idempotency`) reduces duplicate work from retries or replay.
3. **Rate limit** (`webhookLimiter`) on webhook routes.
4. **Worker** validates doctor/token and Graph errors; no trust in user-supplied text in logs.
5. **Payment webhooks** (`/webhooks/razorpay`, `/webhooks/paypal`): **no** Instagram-style bypass; invalid signature → 401.

---

## 5. Operational playbook

### 5.1 Staging checklist (signature pass/fail)

1. Configure **APP_SECRET** (or equivalent Meta app secret used by `verifyInstagramSignature`) and **INSTAGRAM_WEBHOOK_VERIFY_TOKEN** per `.env.example`.
2. Subscribe test app to `messages`, `messaging_postbacks` (as applicable), comments, etc.
3. **Happy path:** Send a real DM / comment → confirm **200**, job queued, **no** `webhook_signature_failed` for that request.
4. **Negative:** Send POST with wrong signature and **non-exempt** JSON shape → expect **401** and security audit entry.
5. **Logs:** Confirm diagnostics log **metadata only** (`correlationId`, `payloadType`, `rawBodyLength`, `hasRawBody`, etc.) — **never** full body or message text.

### 5.2 When to re-audit (triggers)

- Meta **Webhook** or **Instagram API** changelog affecting signing, payload shape, or product lines.
- Incident: spike in `webhook_signature_failed`, abuse reports, or unexpected DM/comment volume from single IPs.
- **Before** removing or tightening bypass branches: staging proof that verification **reliably passes** for all required event types.

### 5.3 Re-test procedure (short)

1. Deploy to staging with current controller.
2. Capture 10+ real events per type (DM text, comment, any optional read receipt if observable).
3. Record: pass/fail verification, branch taken, and whether product behavior is correct.
4. Update this doc’s §3 table if behavior changes.

---

## 6. Code pointer

- **Controller:** `backend/src/controllers/webhook-controller.ts` — `handleInstagramWebhook`
- **Verification helper:** `backend/src/utils/webhook-verification.ts`
- **Raw body:** `backend/src/index.ts` — middleware order for Instagram POST
- **Rate limit:** `backend/src/middleware/rate-limiters.ts` — `webhookLimiter`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-28 | RBH-08 initial publication. |
