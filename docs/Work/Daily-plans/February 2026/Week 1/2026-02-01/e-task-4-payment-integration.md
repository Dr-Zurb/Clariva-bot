# Task 4: Payment Integration
## February 1, 2026 - Week 3: Booking System & Payments Day 4–5

---

## 📋 Task Overview

Set up **dual payment gateway** (Razorpay for India + PayPal for International) for best customer experience. Create payment service with **gateway abstraction** for future Stripe migration. Build payment link generation, region-specific routing (doctor country → gateway), and integrate with booking flow. Implement webhook security (signature verification, idempotency, async processing). Update appointment status after payment; store payment information; send confirmation to both parties.

**Why dual gateway?** Stripe is preferred for international (lower fees ~2.9%, better API) but invite-only in India. Razorpay + PayPal enables global launch from day 1; gateway abstraction allows swapping PayPal → Stripe when Stripe opens.

**Estimated Time:** 5–6 hours (dual gateway + abstraction)  
**Status:** ✅ **DONE**  
**Completed:** 2026-02-01

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** appointment-service; instagram-service (send DM); webhook patterns (signature verification, idempotency); payment-service with gateway abstraction; Razorpay + PayPal adapters; payment link generation; payment webhooks (Razorpay + PayPal); payments table; appointment status update on payment
- ❌ **What's missing:** (none)
- ⚠️ **Notes:** COMPLIANCE: webhook signature verification (H); idempotency (H); no PII in logs. PCI: store only minimal (order_id, status, amount_minor, currency, gateway_ref). Per BUSINESS_PLAN: best customer experience via region-specific checkout.

**Scope Guard:**
- Expected files touched: ≤ 15 (dual gateway + abstraction)
- Any expansion requires explicit approval

**Reference Documentation:**
- [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) - Zod for input; asyncHandler; webhook security
- [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) - Controller pattern; services handle logic
- [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) - Section H: webhook signature, idempotency
- [WEBHOOKS.md](../../Reference/engineering/operations/WEBHOOKS.md) - Idempotency strategy; raw body for signature verification
- [EXTERNAL_SERVICES.md](../../Reference/engineering/operations/EXTERNAL_SERVICES.md) - Payment gateway patterns; retry, rate limits
- [RECIPES.md](../../Reference/engineering/development/RECIPES.md) - R-WEBHOOK-001 (webhook pattern); Zod validation
- [ERROR_CATALOG.md](../../Reference/engineering/development/ERROR_CATALOG.md) - UnauthorizedError (invalid signature); ValidationError
- [TESTING.md](../../Reference/engineering/development/TESTING.md) - Fake placeholders; no real payment data in tests
- [DB_SCHEMA.md](../../Reference/engineering/architecture/DB_SCHEMA.md) - payments table; webhook_idempotency provider 'razorpay'/'paypal'

---

## ✅ Task Breakdown (Hierarchical)

### 1. Gateway Abstraction (Future Stripe Migration)
- [x] 1.1 Define `PaymentGateway` interface: createPaymentLink(), verifyWebhook(), parseSuccessPayload()
- [x] 1.2 Implement Razorpay adapter; implement PayPal adapter; payment-service uses adapter by doctor country
- [x] 1.3 Route by doctor.country or doctor.currency: India → Razorpay; US/UK/EU → PayPal

### 2. Payment Gateway Setup
- [x] 2.1 **Razorpay:** India (INR); env RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET; amount in paise
- [x] 2.2 **PayPal:** International (USD/EUR/GBP); env PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET; amount in cents/smallest unit
- [x] 2.3 Document both in .env.example and EXTERNAL_SERVICES; create config/payment.ts

### 3. Payment Service
- [x] 3.1 Create `payment-service.ts`: createPaymentLink(appointmentId, amountMinor, currency, doctorCountry, patientId, doctorId, correlationId)
- [x] 3.2 Select gateway by doctor country; call adapter; return payment URL; store order mapping for webhook reconciliation
- [x] 3.3 Zod schemas: amount in smallest unit (paise for INR, cents for USD); currency; doctorCountry

### 4. Integration with Booking Flow (Task 3)
- [x] 4.1 **Flow change:** After bookAppointment, create payment link (route by doctor country) → send link via DM → appointment stays 'pending'
- [x] 4.2 On payment webhook success: update appointment status to 'confirmed'; send confirmation DM (or Task 5)
- [x] 4.3 MVP: create-link called by webhook-worker after bookAppointment; API endpoint for doctor to resend link (optional)

### 5. Payment Webhooks (Dual)
- [x] 5.1 Add `POST /webhooks/razorpay` — signature X-Razorpay-Signature; raw body; idempotency provider='razorpay'
- [x] 5.2 Add `POST /webhooks/paypal` — signature via PayPal Verify API or headers (X-PAYPAL-*); raw body; idempotency provider='paypal'
- [x] 5.3 Async processing: queue payload; worker processes; update appointment on success
- [x] 5.4 On payment success: update appointment status to 'confirmed'; store payment record; trigger notification (Task 5)

### 6. Database
- [x] 6.1 Create `payments` table: id, appointment_id, gateway (razorpay|paypal), gateway_order_id, gateway_payment_id, amount_minor, currency, status, created_at
- [x] 6.2 Migration 008_payments.sql; document in DB_SCHEMA; RLS doctor-only read
- [x] 6.3 Update webhook_idempotency: provider CHECK includes 'razorpay', 'paypal'
- [x] 6.4 Never store card data (PCI); only gateway_ref, amount_minor, currency, status

### 7. API Endpoints
- [x] 7.1 `POST /api/v1/payments/create-link` — create payment link (doctor auth or worker); route by doctor country
- [x] 7.2 `GET /api/v1/payments/:id` — get payment status by payment ID (doctor auth)
- [x] 7.3 Auth: doctor JWT for API; webhook uses signature only; document access model

### 8. Compliance & Logging
- [x] 8.1 No PII in logs; no raw payment payloads; no card data ever (PCI)
- [x] 8.2 Audit: log payment events with metadata only (order_id, status, amount_minor, gateway; no card/gateway secrets)

### 9. Testing & Verification
- [x] 9.1 Unit tests for payment-service; mock both Razorpay and PayPal; fake placeholders per TESTING.md
- [x] 9.2 Test routing: India doctor → Razorpay; US doctor → PayPal
- [x] 9.3 Test duplicate webhook → idempotent 200, no double-update (both gateways)
- [x] 9.4 Type-check and lint

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── payment-service.ts         (NEW - createPaymentLink, gateway routing, webhook processing)
├── adapters/
│   ├── payment-gateway.interface.ts  (NEW - PaymentGateway interface for Stripe migration)
│   ├── razorpay-adapter.ts        (NEW - Razorpay createLink, verifyWebhook)
│   └── paypal-adapter.ts          (NEW - PayPal createLink, verifyWebhook)
├── controllers/
│   └── payment-controller.ts      (NEW - createLink, getStatus; webhook handlers)
├── routes/
│   ├── webhooks.ts                (UPDATE - add POST /webhooks/razorpay, POST /webhooks/paypal)
│   └── api/v1/
│       ├── payments.ts            (NEW - POST /create-link, GET /:id)
│       └── index.ts               (UPDATE - mount payments at /payments)
├── types/
│   └── payment.ts                 (NEW)
├── config/
│   └── payment.ts                 (NEW - Razorpay + PayPal config)
├── utils/
│   ├── razorpay-verification.ts   (NEW - Razorpay signature verification)
│   └── paypal-verification.ts     (NEW - PayPal signature verification)
└── migrations/
    └── 008_payments.sql           (NEW)
```

**Existing Code Status:**
- ✅ Webhook patterns - EXISTS (instagram: verification, idempotency, queue, dead-letter)
- ✅ webhook_idempotency table - supports provider 'razorpay', 'paypal'
- ✅ payment-service - DONE (createPaymentLink, processPaymentSuccess, getPaymentById)
- ✅ payments table - DONE (migration 008_payments.sql)
- ✅ payment webhooks (Razorpay, PayPal) - DONE (POST /webhooks/razorpay, POST /webhooks/paypal)
- ✅ gateway adapters - DONE (RazorpayAdapter, PayPalAdapter)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Gateway abstraction:** PaymentGateway interface; Razorpay + PayPal adapters; enables future Stripe swap
- **Region routing:** doctor.country (or currency) → Razorpay (India) vs PayPal (International)
- **Webhook signature verification** MUST (COMPLIANCE H); use raw request body (req.rawBody) for both gateways
- **Idempotency** MUST (COMPLIANCE H); reuse webhook_idempotency with provider='razorpay' or 'paypal'
- **No PCI data** in logs or DB (card numbers, CVV); store only order_id, gateway_ref, amount_minor, currency, status
- Use gateway's secure link; never store card data
- Amount in smallest unit: paise (INR), cents (USD), pence (GBP); currency per region

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y - appointments, payments) → [x] **RLS verified?** (Y - payments doctor-only read)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API?** (Y - Razorpay + PayPal APIs) → [x] **Consent + redaction confirmed?** (Y - no payment payload in logs)
- [x] **Retention / deletion impact?** (N)
- [x] **Auth/RLS:** Payment webhooks use signature only (no JWT); API endpoints doctor auth

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] **Dual gateway:** Razorpay (India) + PayPal (International) with region routing
- [x] **Gateway abstraction:** PaymentGateway interface; adapters for Razorpay and PayPal; future Stripe swap path
- [x] Payment link generated for appointment (after bookAppointment in Task 3 flow); routed by doctor country
- [x] Both payment webhooks verified (signature); idempotent; async (queue)
- [x] Appointment status updated on payment success ('pending' → 'confirmed')
- [x] No PCI data stored or logged
- [x] Unit tests cover both gateways (mock Razorpay, mock PayPal); fake placeholders per TESTING.md
- [x] Type-check and lint pass

---

## 🐛 Issues Encountered & Resolved

- **TypeScript:** Razorpay SDK strict types → used type assertion with eslint-disable for `paymentLink.create`. PayPal `verifyWebhook` returns `Promise<boolean>`; interface updated.
- **RLS:** `getPaymentById` uses admin client + manual ownership check (`appointment.doctor_id === userId`) per existing patterns.

---

## 📝 Notes

- **Payment flow:** book (status=pending) → create link (route by doctor country) → send link via DM → patient pays → webhook → update status to confirmed → send confirmation DM
- **Task 3 integration:** Modify Task 3 worker: after bookAppointment, call createPaymentLink (route by doctor.country); send payment link via DM; confirmation comes after payment
- **Amount source:** Phase 0: fixed amount (env) or configurable per doctor; Phase 1: doctor settings
- **Razorpay:** India (INR); amount in paise (₹100 = 10000 paise); UPI, cards, netbanking
- **PayPal:** International (USD/EUR/GBP); amount in cents; cards, Apple Pay, PayPal balance; trusted globally for best customer experience
- **Stripe migration:** When Stripe opens in India or US entity exists → add Stripe adapter; swap PayPal for Stripe for international; gateway abstraction enables single adapter swap
- **Raw body:** Both payment webhooks need raw body for signature verification; same pattern as Instagram (see WEBHOOKS.md)
- Retry queues for failed payment webhooks per EXTERNAL_SERVICES; reuse existing BullMQ/dead-letter

---

## 🔗 Related Tasks

- [Task 3: Booking Flow & Instagram Confirmation](./e-task-3-booking-flow-and-instagram-confirmation.md)
- [Task 4.1: Per-Doctor Payment Settings](./e-task-4.1-per-doctor-payment-settings.md) – Follow-on: fee/currency from doctor settings (backend/DB)
- [Task 5: Notifications System](./e-task-5-notifications-system.md)

---

**Last Updated:** 2026-02-01  
**Completed:** 2026-02-01  
**Related Learning:** `docs/Archive/learning/2026-02-01/l-task-4-payment-integration.md`  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 1.2.0
