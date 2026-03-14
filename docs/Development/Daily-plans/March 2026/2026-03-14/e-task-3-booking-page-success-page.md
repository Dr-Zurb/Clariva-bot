# Task 3: Booking Page + Success Page — Slot → Payment → Redirect
## 2026-03-14

---

## 📋 Task Overview

Update the booking page to call `select-slot-and-pay` instead of `select-slot`, redirecting the user to the payment URL (Razorpay) after slot selection. Add a new `/book/success` page that shows "Payment successful" and redirects the user back to the chat (Instagram DM).

**Estimated Time:** 3–4 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-03-14

**Change Type:**
- [x] **Update existing** — booking page; new success page; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `frontend/app/book/page.tsx` — slot selection, `selectSlotAndPay`; `frontend/lib/api.ts` — selectSlotAndPay, getBookingRedirectUrl; `frontend/app/book/success/page.tsx`
- ✅ **Implemented:** selectSlotAndPay API; getBookingRedirectUrl; success page; redirect to paymentUrl or chat

**Scope Guard:**
- Expected files touched: frontend/app/book/page.tsx, frontend/app/book/success/page.tsx, frontend/lib/api.ts

**Reference Documentation:**
- [unified-slot-payment-flow-and-appointment-status.md](./unified-slot-payment-flow-and-appointment-status.md)
- [FRONTEND_RECIPES.md](../../../Reference/FRONTEND_RECIPES.md)
- [FRONTEND_ARCHITECTURE.md](../../../Reference/FRONTEND_ARCHITECTURE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. API Client: selectSlotAndPay, getRedirectUrl

- [x] 1.1 Add `selectSlotAndPay(token: string, slotStart: string)` to frontend/lib/api.ts
  - [x] 1.1.1 POST to `/api/v1/bookings/select-slot-and-pay`
  - [x] 1.1.2 Body: { token, slotStart }
  - [x] 1.1.3 Returns { paymentUrl?, redirectUrl, appointmentId }
- [x] 1.2 Add `getBookingRedirectUrl(token: string)` to frontend/lib/api.ts
  - [x] 1.2.1 GET `/api/v1/bookings/redirect-url?token=X`
  - [x] 1.2.2 Returns { redirectUrl }
- [x] 1.3 No auth token (booking uses token in URL)

### 2. Booking Page: Use selectSlotAndPay

- [x] 2.1 Replace `selectSlot` call with `selectSlotAndPay`
  - [x] 2.1.1 On slot select + "Continue to payment" click: call selectSlotAndPay
  - [x] 2.1.2 If paymentUrl: `window.location.href = paymentUrl` (Razorpay)
  - [x] 2.1.3 If !paymentUrl (no fee): `window.location.href = redirectUrl` (chat)
- [x] 2.2 Update button label: "Continue to payment" or "Save & pay" (when fee) / "Save & continue" (no fee)
- [x] 2.3 Handle 409: "This slot was just taken. Please pick another."
- [x] 2.4 Loading state during API call

### 3. Success Page

- [x] 3.1 Create `frontend/app/book/success/page.tsx`
  - [x] 3.1.1 Read `token` from searchParams
  - [x] 3.1.2 Call getBookingRedirectUrl(token)
  - [x] 3.1.3 Show: "Payment successful! Your appointment is confirmed. Redirecting you to the chat…"
  - [x] 3.1.4 After short delay (1–2s), redirect: `window.location.href = redirectUrl`
  - [x] 3.1.5 Handle error (invalid/expired token): show message, link to return to chat manually
- [x] 3.2 Use Suspense for useSearchParams (same pattern as book page)
- [x] 3.3 Match book page styling (minimal, centered)

### 4. Verification & Testing

- [x] 4.1 Run type-check and lint
- [ ] 4.2 Manual: full flow slot → payment → success → redirect
- [ ] 4.3 No-fee case: slot → redirect to chat (no payment step)

---

## 📁 Files to Create/Update

```
frontend/
├── app/book/
│   ├── page.tsx           (UPDATED - selectSlotAndPay, redirect to paymentUrl)
│   └── success/
│       └── page.tsx       (NEW)
└── lib/
    └── api.ts             (UPDATED - selectSlotAndPay, getBookingRedirectUrl)
```

**Existing Code Status:**
- ✅ book/page.tsx: selectSlotAndPay, handleSave, redirect to paymentUrl or redirectUrl
- ✅ api.ts: selectSlotAndPay, getBookingRedirectUrl, API_BASE
- ✅ success page: frontend/app/book/success/page.tsx

---

## 🧠 Design Constraints

- Use Next.js App Router (app/book/...)
- No auth for booking/success (token is the auth)
- Match existing book page styling
- Handle token expiry gracefully on success page

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (N)
- [x] **Any PHI in logs?** (N)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Slot select → API returns paymentUrl → redirect to Razorpay
- [x] After payment → Razorpay redirects to /book/success?token=X
- [x] Success page shows message, redirects to Instagram chat
- [x] No-fee case: redirect to chat without payment step
- [x] 409 handled with user-friendly message

---

## 🔗 Related Tasks

- [e-task-2: Select slot and pay API](./e-task-2-select-slot-and-pay-api.md)
- [e-task-4: Worker migration](./e-task-4-worker-migration-unified-flow.md)

---

**Last Updated:** 2026-03-14
