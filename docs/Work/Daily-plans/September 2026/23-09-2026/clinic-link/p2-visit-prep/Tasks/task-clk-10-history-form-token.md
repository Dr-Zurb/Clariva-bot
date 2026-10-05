# Task clk-10: History-form token

## 📋 Task Overview

Mint and verify a token whose only job is prep on one appointment. Booking tokens and join tokens must not pass.

**Program / Phase:** clinic-link · Phase 2 (visit-prep)
**Batch:** [`plan-p2-clinic-link-visit-prep-batch.md`](../plan-p2-clinic-link-visit-prep-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-clinic-link-visit-prep.md`](./EXECUTION-ORDER-p2-clinic-link-visit-prep.md)
**Estimated Time:** 3 hours
**Status:** ✅ **DONE** (2026-09-24)

**Change Type:**
- [x] **New feature** — this kind does not exist

**Current State:**
- ✅ **What exists:** `booking-token.ts` binds `conversationId` + `doctorId`. Join and Rx-share tokens are other kinds. HL-DL-4 and HL-DL-5 in [`plan-history-link.md`](../../../../../../Product%20plans/plan-history-link.md) specify `kind: 'history-form'`.
- ❌ **What's missing:** a minter and a verifier for that kind.
- ⚠️ **Notes:** Do not start until `clk-08` is green. Do not reuse `booking-token.ts`. The URL carries the appointment id and the token only.

**Scope Guard:**
- Expected files touched: ≤ 4 (token helper, config only if a secret must be named, one test, a short contract note)
- Do not build the form or the POST
- Do not log the token
- Do not put a name, phone, age, or clinical text in the payload

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [plan-history-link.md](../../../../../../Product%20plans/plan-history-link.md) — HL-DL-4, HL-DL-5

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N — sign and verify only
- [x] **RLS verified?** N/A — no table write
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Mint
- [x] 1.1 Payload is appointment id, expiry, and `kind: 'history-form'`
- [x] 1.2 Booked visit: valid until scheduled end plus 2 hours. Cancelled or no-show: verify fails. Expired: the same not-available result the share links use
- [x] 1.3 Secret comes from validated config. Do not read `process.env` in the helper

### 2. Reject the wrong key
- [x] 2.1 A booking token does not verify as history-form
- [x] 2.2 A join token does not verify as history-form
- [x] 2.3 A tampered signature fails

### 3. Verification
- [x] 3.1 Unit test for the three rejects, expiry, and cancelled
- [x] 3.2 Typecheck and lint the touched files

---

## 📁 Files to Create/Update

- ❌ History-form token helper — MISSING
- ⚠️ `booking-token.ts` — EXISTS, do not extend it
- ❌ Unit test — MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Own helper. Kind check is mandatory.
- Reuse the existing booking-token secret only if a second secret is unnecessary. A new secret, if required, is a named config key with no value invented in the task.
- PHI never in the URL or the logs.
- Re-presentable until expiry. After submit, read-only behavior is `clk-12`, not this task.

---

## ✅ Acceptance & Verification Criteria

- [x] A fresh history-form token resolves one appointment id
- [x] Booking, join, expired, and cancelled tokens do not
- [x] The URL has no name, phone, or reason

---

## 📝 Notes

CLK-DL-12, HL-DL-4, HL-DL-5. The write that consumes this token is `clk-11`.

---

## 🔗 Related Tasks

- [`task-clk-09-prep-columns.md`](./task-clk-09-prep-columns.md) — parallel
- [`task-clk-11-patient-history-write.md`](./task-clk-11-patient-history-write.md)

**Last Updated:** 2026-09-23
