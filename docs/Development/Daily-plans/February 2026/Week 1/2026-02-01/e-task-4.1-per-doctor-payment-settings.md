# Task 4.1: Per-Doctor Payment Settings (Payment Integration 2.0)
## February 1, 2026 – Follow-on to e-task-4

---

## 📋 Task Overview

Move **appointment fee and currency** from global environment variables to **per-doctor settings** stored in the backend/database. The booking and payment flow will use each doctor’s fee and currency (and existing region-based gateway: Razorpay for India, PayPal for international). A frontend for doctors to set their fee is **out of scope** for this task; this task delivers the backend/DB and internal usage so that when the frontend exists it can read/write the same settings.

**Why:** Per business vision, there is no fixed appointment fee; each doctor chooses their own fee (to be set in a future frontend). The bot asks the patient for that doctor’s fee when they book. Current code uses a single env-based fee (Phase 0); this task aligns behavior with the desired model: **regional gateway + region-appropriate currency + per-doctor fee from doctor settings**.

**Estimated Time:** 3–4 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-01-30

**Change Type:**
- [ ] **New feature** — Add code only (no change to existing behavior)
- [x] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** `payment-service.createPaymentLink(appointmentId, amountMinor, currency, doctorCountry, …)` already accepts `amountMinor` and `currency`; gateway selection by `doctorCountry` (Razorpay/PayPal) is unchanged. **webhook-worker** (after `bookAppointment`) reads `env.APPOINTMENT_FEE_MINOR` and `env.APPOINTMENT_FEE_CURRENCY` and passes them into `createPaymentLink`. **config/env.ts** and **.env.example** define `APPOINTMENT_FEE_MINOR`, `APPOINTMENT_FEE_CURRENCY`. No per-doctor fee/currency stored in DB today; `appointments` has `doctor_id` → `auth.users`; there is no dedicated doctor profile/settings table yet.
- ❌ **What's missing:** A place in the backend/DB to store per-doctor appointment fee (e.g. amount in minor units) and currency (and optionally country if not derivable elsewhere); worker (and any API) must load fee/currency from that store and pass to `createPaymentLink`; env-based fee usage in the worker must be replaced (or env kept as optional fallback for doctors without settings).
- ⚠️ **Notes:** Gateway abstraction and region routing from e-task-4 stay as-is. Stripe migration remains future work. Frontend for doctors to set fee is a separate task.

**Scope Guard:**
- Expected files touched: ≤ 10 (DB migration, config, service call sites, worker, tests, docs)
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md) - Audit, impact, remove obsolete, update tests/docs
- [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md) - Task execution
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Layers; config → service → worker
- [DB_SCHEMA.md](../../Reference/DB_SCHEMA.md) - Schema and migrations
- [MIGRATIONS_AND_CHANGE.md](../../Reference/MIGRATIONS_AND_CHANGE.md) - Migration rules
- [STANDARDS.md](../../Reference/STANDARDS.md) - Validation, naming
- [TESTING.md](../../Reference/TESTING.md) - Unit tests; no real payment data
- [EXTERNAL_SERVICES.md](../../Reference/EXTERNAL_SERVICES.md) - Payment gateway usage (unchanged)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Audit & Impact (CODE_CHANGE_RULES)
- [x] 1.1 Audit: List all files that read or use `APPOINTMENT_FEE_MINOR` / `APPOINTMENT_FEE_CURRENCY` (config/env, worker, tests, .env.example).
- [x] 1.2 Audit: List all call sites of `createPaymentLink` (worker, controller) and what currently passes `amountMinor` / `currency`.
- [x] 1.3 Map impact: Document which files will change (DB migration, env/config, worker, controller if applicable, types, tests, docs) and whether env vars become optional fallback or are removed.

### 2. Database: Doctor Fee/Currency Storage
- [x] 2.1 Add storage for per-doctor appointment fee and currency (e.g. new table `doctor_settings` or `doctor_profiles`, or columns on an existing table keyed by doctor id). Fields needed at minimum: doctor identifier, appointment_fee_minor, appointment_fee_currency; optionally country/region if not already available elsewhere.
- [x] 2.2 Add migration following MIGRATIONS_AND_CHANGE; document in DB_SCHEMA.md.
- [x] 2.3 Define RLS/access so only the doctor (or service role for worker) can read/update their own settings.

### 3. Backend: Use Doctor Settings in Payment Flow
- [x] 3.1 In the code path that creates a payment link after booking (webhook-worker): load the doctor’s fee and currency from the new storage (by doctor_id); pass them to `createPaymentLink`. If no settings exist, use env fallback (or fail with clear behavior per product decision).
- [x] 3.2 Ensure gateway selection still uses doctor country/region (existing behavior); only the amount and currency source change.
- [x] 3.3 Keep `createPaymentLink` signature and behavior unchanged where possible; caller supplies amountMinor/currency from doctor settings instead of env.

### 4. Config / Env Cleanup (CODE_CHANGE_RULES)
- [x] 4.1 Decide: keep `APPOINTMENT_FEE_MINOR` / `APPOINTMENT_FEE_CURRENCY` as optional fallback for doctors without settings, or remove after migration. Update config/env and .env.example accordingly; remove or document any obsolete usage.

### 5. API / Controller (if applicable)
- [x] 5.1 If `POST /api/v1/payments/create-link` (or similar) is called with doctor context and currently uses env for amount/currency, update it to use doctor settings from DB. If it receives amount/currency in the request body, document that this task only affects the worker path; no change to API contract unless required.

### 6. Tests & Verification
- [x] 6.1 Update unit tests that relied on env-based fee (e.g. payment-service or webhook-worker tests) to use doctor settings (mocked or test fixtures).
- [x] 6.2 Add or update tests for “fee and currency from doctor settings” and, if applicable, “fallback to env when doctor has no settings.”
- [x] 6.3 Run type-check and lint; ensure no PHI in logs (TESTING.md, COMPLIANCE).

### 7. Documentation
- [x] 7.1 Update DB_SCHEMA.md with new table/columns and RLS.
- [x] 7.2 Update .env.example if env vars are kept as fallback or removed.
- [x] 7.3 If RECIPES or STANDARDS are affected by the pattern (e.g. “fee from doctor settings”), update them per CODE_CHANGE_RULES.

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 00X_doctor_payment_settings.sql   (NEW or similar - per-doctor fee/currency)
├── src/
│   ├── config/
│   │   └── env.ts                         (UPDATE - optional fallback or remove fee vars)
│   ├── services/
│   │   └── payment-service.ts            (CHECK - likely no signature change; caller passes fee)
│   ├── workers/
│   │   └── webhook-worker.ts             (UPDATE - load fee/currency from DB; pass to createPaymentLink)
│   └── (types, helpers for doctor settings as needed)
├── tests/
│   └── unit/
│       ├── services/payment-service.test.ts   (UPDATE - doctor settings / fallback)
│       └── workers/webhook-worker.test.ts     (UPDATE if exists - fee from DB)
docs/Reference/
└── DB_SCHEMA.md                         (UPDATE - new table/columns, RLS)
backend/.env.example                     (UPDATE - document fallback or remove fee vars)
```

**Existing Code Status:**
- ✅ `payment-service.ts` - createPaymentLink already takes amountMinor, currency; no change to signature unless we add optional fallback inside service.
- ✅ `webhook-worker.ts` - reads env.APPOINTMENT_FEE_MINOR, env.APPOINTMENT_FEE_CURRENCY; calls createPaymentLink; MUST be updated to load from DB and pass.
- ✅ `config/env.ts` - defines APPOINTMENT_FEE_MINOR, APPOINTMENT_FEE_CURRENCY; update to optional or remove.
- ✅ `payment-service.test.ts` - tests createPaymentLink with input; update to reflect fee from caller (and optionally fallback).
- ⚠️ No doctor settings table/columns yet - MUST be created in this task.

**When updating existing code:** (MANDATORY – Change Type = Update existing)
- [x] Audit current implementation (files, callers, config/env) — see [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)
- [x] Map desired change to concrete code changes (what to add, change, remove)
- [x] Remove obsolete code and config (env, defaults, dead branches) or document optional fallback
- [x] Update tests and docs/env per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Architecture:** Follow ARCHITECTURE.md; data source change (env → DB) in config/worker layer; service layer continues to receive amount/currency from caller.
- **Compliance:** No PHI in logs; no PCI data; payment flow remains compliant per e-task-4 and COMPLIANCE.
- **Gateway behavior:** Region-based gateway selection (Razorpay vs PayPal) and gateway abstraction remain unchanged; only the source of amount and currency changes.
- **RLS:** New doctor settings storage must enforce doctor-only access (or service role for worker) per RLS_POLICIES / DB_SCHEMA.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – new doctor settings, possibly appointments/payments read for context)
  - If Yes → [x] **RLS verified?** (Y – doctor-only for settings; existing RLS for payments)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (N – no new external calls; payment gateways unchanged)
- [x] **Retention / deletion impact?** (Y/N – document if doctor settings are deleted with doctor account)

**Rationale:** Ensures global compliance and audit trail.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Payment link creation after booking uses **per-doctor** fee and currency from backend/DB (not global env), with defined behavior when doctor has no settings (e.g. env fallback or explicit failure).
- [x] Region-based gateway selection (India → Razorpay, international → PayPal) and existing payment webhooks/flow are unchanged.
- [x] No regression: existing payment-service and webhook tests pass; new or updated tests cover “fee from doctor settings” (and fallback if applicable).
- [x] DB migration and schema are documented in DB_SCHEMA.md; .env.example reflects env var usage.
- [x] CODE_CHANGE_RULES checklist (audit, impact, remove obsolete, update tests/docs) is satisfied.

**See also:** [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md).

---

**Audit summary (1.1–1.3):** `APPOINTMENT_FEE_*` read in `config/env.ts` (with defaults), `webhook-worker.ts` (fallback after doctor settings), `.env.example` (documented). Single call site of `createPaymentLink`: webhook-worker after booking; it now passes `amountMinor`/`currency` from `getDoctorSettings(doctorId)` with env fallback. Impact: migration 009, doctor-settings-service, worker, env (optional fallback), types, tests, DB_SCHEMA.md.

---

## 🐛 Issues Encountered & Resolved

- **Test mock type:** `doctor-settings-service.test.ts` mockResolvedValue(response) caused TS2345; fixed with `response as never`.
- **Migration trigger:** Reused existing `update_updated_at_column()` from 001_initial_schema.sql instead of creating a new function.

---

## 📝 Notes

- **Frontend:** UI for doctors to set their fee is out of scope; this task only provides backend storage and usage. A future task can add an API and frontend to read/write the same settings.
- **Stripe:** Migration from PayPal to Stripe is still future; no change in this task.
- **Vision alignment:** Matches “regional gateway + region-appropriate currency + per-doctor fee from doctor settings (frontend/backend later).”

---

## 🔗 Related Tasks

- [Task 4: Payment Integration](./e-task-4-payment-integration.md) – Foundation (dual gateway, env-based fee); this task builds on it.
- (Future) Doctor settings UI / frontend for fee and currency.

---

**Last Updated:** 2026-01-30  
**Completed:** 2026-01-30  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md) | [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md)

---

**Version:** 1.1.0
