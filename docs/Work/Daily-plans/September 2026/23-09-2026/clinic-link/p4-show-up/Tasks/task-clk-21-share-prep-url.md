# Task clk-21: Share the prep URL

## 📋 Task Overview

The person who booked can hand the prep link to the person who will attend. The shared URL is the history-form prep URL. The join URL stays on the hub.

**Program / Phase:** clinic-link · Phase 4 (show up ready)
**Batch:** [`plan-p4-clinic-link-show-up-batch.md`](../plan-p4-clinic-link-show-up-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-clinic-link-show-up.md`](./EXECUTION-ORDER-p4-clinic-link-show-up.md)
**Estimated Time:** 4 hours
**Status:** ✅ **DONE** (2026-09-27)

**Change Type:**
- [x] **New feature** — share control, and a mint that runs only when it is used

**Current State:**
- ✅ **What exists:** The prep page is already `/book/prep?t=` with a history-form token. `/my-visit` holds a consultation token. `GET /api/v1/bookings/session/snapshot?token=` is polled and cacheable. History-form mint and verify already exist.
- ❌ **What's missing:** a share control, and a way for the hub to obtain a prep path without putting that token on the poll.
- ⚠️ **Notes:** Waits on clk-20 so the prep page is not edited twice for unrelated copy. Minting from a join token is a downgrade. A prep token must not become a join token.

**Scope Guard:**
- Expected files touched: ≤ 6 (share control, one mint route, the hub, the prep page, `CONTRACTS.md`, one test)
- Do not put a prep token on the snapshot
- Do not share `/my-visit`, `/consult/join`, or `/book?token=`
- Do not log the token or the URL
- Do not add an SMS

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N — a new token for an appointment the join token already names
- [x] **RLS verified?** Y — service role after the consultation token resolves one appointment. No new policy.
- [x] **Any PHI in logs?** No — do not log the token or the path
- [x] **External API or AI call?** N — the Web Share API is the browser, not a server call
- [x] **Retention / deletion impact?** N — the prep token expires on the rule Phase 2 already uses

---

## ✅ Task Breakdown

### 1. Prep page
- [ ] 1.1 The share control sends the current prep URL.
- [ ] 1.2 Where the browser has no share sheet, the control copies that same URL.
- [ ] 1.3 The shared text is the URL only. No name, phone, reason, or medicine.

### 2. Visit hub
- [ ] 2.1 Tapping share calls a route that accepts the consultation token and returns `{ prepPath }`.
- [ ] 2.2 `prepPath` is `/book/prep?t=` with a new history-form token for that same appointment. The consultation token is not in the path.
- [ ] 2.3 A booking token and a history-form token on this route are 401. An expired or cancelled visit is 410, same as the other prep routes.
- [ ] 2.4 The snapshot handler does not call this mint. Its `Cache-Control` response stays free of a prep token.

### 3. Verification
- [ ] 3.1 Unit test: the returned path starts with `/book/prep?t=`, the body has no consultation token, and a booking token is 401
- [ ] 3.2 The snapshot builder’s source does not mint a history-form token
- [ ] 3.3 Typecheck and lint the touched files

---

## 📁 Files to Create/Update

- ⚠️ `frontend/app/book/prep/page.tsx` — EXISTS
- ⚠️ Visit hub session component — EXISTS
- ❌ Share-mint route — MISSING
- ⚠️ `CONTRACTS.md` — EXISTS

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Validate the consultation token with Zod before the service.
- Reuse the history-form mint. Do not invent a third token kind.
- The poll stays on `GET /api/v1/bookings/session/snapshot`. Share is a different request, fired by the tap.
- No PHI in logs.

---

## ✅ Acceptance & Verification Criteria

- [ ] From the prep page, share or copy yields the prep URL
- [ ] From the hub, share yields a prep URL and not the join URL
- [ ] A polled snapshot contains no prep token

---

## 📝 Notes

CLK-DL-12. This is the careful task in the batch: a join token may mint a prep token, and a prep token may not mint a join token.

---

## 🔗 Related Tasks

- [`task-clk-20-arrival-lines.md`](./task-clk-20-arrival-lines.md)
- [`task-clk-24-phase-4-gate.md`](./task-clk-24-phase-4-gate.md)

**Last Updated:** 2026-09-27
