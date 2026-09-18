# Task fbm-04: `facebook` channel adapter (parse + send)

> **Links:** batch [`../plan-p1-facebook-connect-messenger-batch.md`](../plan-p1-facebook-connect-messenger-batch.md) · exec [`./EXECUTION-ORDER-p1-facebook-connect-messenger.md`](./EXECUTION-ORDER-p1-facebook-connect-messenger.md)

---

## 📋 Task Overview

Implement `ChannelAdapter` for Facebook Messenger: parse inbound `object: page` messaging; send replies with Page token via `graph.facebook.com`.

**Program / Phase:** facebook-messenger-channel · p1 · Wave 3  
**Estimated Time:** ~2–4 hours  
**Status:** ⏳ PENDING  
**Change Type:** New feature  
**Model:** Sonnet  
**Depends on:** `fbm-02` types; mirror `workers/channels/instagram/`

---

## ✅ Task Breakdown

### 1. Types + registry
- [ ] 1.1 `ChannelId = 'instagram' | 'whatsapp' | 'facebook'`.
- [ ] 1.2 Register adapter in `channels/registry.ts`.

### 2. Parse + send
- [ ] 2.1 `parse-inbound.ts`: extract Page id, PSID, text, mid; skip echoes / delivery / read.
- [ ] 2.2 Resolve doctor via `doctor_facebook.facebook_page_id`.
- [ ] 2.3 `send.ts`: Messenger Send API with Page token; respect throttle helpers if shared.
- [ ] 2.4 Unit tests for parse skip reasons + send happy path (mocked axios).

---

## 📁 Files

```
UPDATE: backend/src/workers/channels/types.ts
UPDATE: backend/src/workers/channels/registry.ts
CREATE: backend/src/workers/channels/facebook/index.ts
CREATE: backend/src/workers/channels/facebook/parse-inbound.ts
CREATE: backend/src/workers/channels/facebook/send.ts
CREATE: backend/tests/unit/workers/channels/facebook-*.test.ts
DO NOT TOUCH: run-conversation-turn internals (call through existing port only)
```

---

## ✅ Acceptance Criteria

- [ ] Registry resolves `'facebook'`.
- [ ] Echo / read do not produce inbound messages.
- [ ] Send uses Page token on graph.facebook.com (not IG graph).

---

**Created:** 2026-07-26.
