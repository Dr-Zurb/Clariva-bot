# Task hl-02: History-form HMAC token

> **Model: Sonnet / Auto.** Copy the locked Rx-share pattern. Do not invent a token table.

---

## 📋 Task Overview

Mint and verify `kind: 'history-form'` tokens bound to `appointmentId`. A consultation-join token or Rx-share token must fail here.

**Program / Phase:** history-link · Phase 1
**Batch:** [`plan-p1-history-link-form-to-chart-batch.md`](../plan-p1-history-link-form-to-chart-batch.md)
**Estimated Time:** ~3 hours
**Status:** ⏳ **PENDING**
**Completed:** —

**Change Type:**
- [x] **New feature**

**Current State:**
- ✅ `consultation-token.ts` — `{ appointmentId, exp, role: 'patient' }`, 24h, `CONSULTATION_TOKEN_SECRET`.
- ✅ `prescription-token-service.ts` — `{ rxId, exp, kind: 'rx-share' }`, own secret, `wrong_kind` / `wrong_rx_id`. **Copy this one.**
- ❌ No `history-form` kind.

**Scope Guard:** ≤ 3 files (`env.ts` + new service + tests). **Do not change** join-token verify behaviour except adding a test that join tokens fail the history verifier.

**Reference:** HL-DL-4, HL-DL-5, HL-Q2

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 HL-Q2 decided (own secret vs shared).
- [ ] 1.2 Read both existing token modules end to end.

### 2. Mint / verify
- [ ] 2.1 Payload `{ appointmentId, exp, kind: 'history-form' }`. Wire format identical to Rx-share.
- [ ] 2.2 TTL: booked = until scheduled end + 2h; desk/walk-in = 2h from mint. Expiry is computed by the caller; this module takes `expiresInSeconds`.
- [ ] 2.3 Verify: missing / malformed / bad sig / wrong kind / wrong appointment id / expired. Expired is a distinct reason so the route can 410.
- [ ] 2.4 Env: `HISTORY_FORM_TOKEN_SECRET` (or the HL-Q2 alternative), ≥ 16 chars, via `config/env.ts` — never `process.env`.

### 3. Tests
- [ ] 3.1 Round-trip mint/verify.
- [ ] 3.2 Consultation-join token → `wrong_kind`.
- [ ] 3.3 Rx-share token → `wrong_kind`.
- [ ] 3.3.1 Booking token (`booking-token.ts`) → `wrong_kind`. Do not reuse that helper.
- [ ] 3.4 Expired → expired reason.
- [ ] 3.5 Appointment-id swap (URL id ≠ payload) fails.

---

## 📁 Files

```
CREATE: backend/src/services/history-form-token-service.ts
CREATE: backend/tests/unit/services/history-form-token-service.test.ts
UPDATE: backend/src/config/env.ts
```

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Stateless. No token table.
- PHI never in the payload (id + exp + kind only).
- Do not reuse `role: 'patient'` as the discriminator — that is how a join token would pass.

---

**Last Updated:** 2026-08-31
**Completed:** —
