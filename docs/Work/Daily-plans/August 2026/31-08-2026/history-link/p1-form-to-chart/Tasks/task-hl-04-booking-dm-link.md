# Task hl-04: Booking-confirmation DM link

> **Model: Sonnet / Auto.** One extra line. Do not invent a second campaign.

---

## 📋 Task Overview

The history-form URL rides **`buildPaymentConfirmationMessage`** (and the desk phone confirmation that shares that body minus the payment line). Not the slot-picker DM. Not a new previsit stage. Walk-ins stay skipped.

**Program / Phase:** history-link · Phase 1
**Batch:** [`plan-p1-history-link-form-to-chart-batch.md`](../plan-p1-history-link-form-to-chart-batch.md)
**Estimated Time:** ~1.5 hours
**Status:** ⏳ **PENDING**
**Completed:** —

**Change Type:**
- [x] **Update existing** — `dm-copy` + the notification caller that mints the token

**Current State:**
- ✅ `buildPaymentConfirmationMessage` / desk phone confirmation in `dm-copy.ts`; snap tests lock the body.
- ✅ Slot-picker DM (`formatBookingLinkDm`) and T−24h (`buildAppointmentReminder24hDm`) are **different** messages — T−24h is written to have no link.
- ✅ Desk phone confirmation **skips walk-ins**.
- ❌ No history URL in any DM.

**Scope Guard:** ≤ 4 files. No new DM stage. No previsit-ladder change. No desk button (Phase 2).

**Reference:** HL-DL-7

---

## ✅ Task Breakdown

### 1. Copy
- [ ] 1.1 One line + the URL, locale-aware, appended to `buildPaymentConfirmationMessage` (and the desk-phone sibling). Do not touch `formatBookingLinkDm` or the previsit ladder.
- [ ] 1.2 Snapshots updated; **everything above the new line stays byte-identical**.

### 2. Mint + send
- [ ] 2.1 Caller mints `kind: 'history-form'` with booked TTL (HL-DL-5) and passes the fully-qualified `/h/:id?t=` URL into the helper.
- [ ] 2.2 Walk-in / desk-skip path still sends no DM.
- [ ] 2.3 Cancelled appointments never mint.

### 3. Tests
- [ ] 3.1 Snap + unit: walk-in skip unchanged; booked confirmation contains `/h/` and `t=`.
- [ ] 3.2 URL contains no patient name or phone.

---

## 📁 Files

```
UPDATE: backend/src/utils/dm-copy.ts
UPDATE: the confirmation notification caller
UPDATE: dm-copy snap / unit tests
```

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Do not add a "please fill this" follow-up. One line on the message they already receive.
- Do not change join-link copy on voice/video confirmations beyond the extra line.

---

**Last Updated:** 2026-08-31
**Completed:** —
