# Deferred: Payout Operational Setup (Razorpay Route)

**Status:** ⏸️ **DEFERRED**  
**Reason:** Focus on core app first; company not yet registered with Razorpay  
**Resume when:** App has traction; ready to pay doctors; company registration complete  
**Date deferred:** 2026-03-24  

---

## What's Already Done (Code)

- ✅ Payout service (`processPayoutForPayment`, `processBatchedPayouts`)
- ✅ Razorpay Route adapter (`createTransferFromPayment`)
- ✅ Migrations 024 (payments payout columns), 025 (doctor payout settings)
- ✅ Cron endpoint `POST /cron/payouts` (CRON_SECRET)
- ✅ Doctor payout settings API (GET/PATCH `payout_schedule`, `payout_minor`)

**The app code is ready.** Only operational setup is deferred.

---

## Prerequisites (Before Resuming)

1. **Company Registration** in Razorpay Dashboard (tab visible in top nav)
2. **Onboarding complete** – no "Onboarding Pending" on account
3. **App has paying users** – consultations happening, payments captured

---

## Step-by-Step When You Resume

### 1. Razorpay Company Registration

- Go to Razorpay Dashboard → **Company Registration** (top nav)
- Complete business details, documents, bank account
- Finish KYC and any verification steps

### 2. Enable Route

- After company registration, Route may appear under **Payments** → sidebar → **Route** (under PAYMENT PRODUCTS)
- If not: contact Razorpay support; request Route for split payments/vendor payouts
- Route landing: [razorpay.com/route](https://razorpay.com/route)

### 3. Create Linked Accounts for Doctors

- In Route → **Accounts** → **+ Add Account**
- For each doctor: Account name, email, bank details (IFSC, account number, beneficiary)
- Complete KYC form
- Wait for penny test verification

### 4. Get Linked Account IDs

- Route → Accounts → open each account
- Copy `acc_xxxxxxxxxxxx` (razorpay_linked_account_id)
- Store in `doctor_settings.razorpay_linked_account_id` via SQL or admin tool

```sql
UPDATE doctor_settings
SET razorpay_linked_account_id = 'acc_xxx',
    payout_schedule = 'per_appointment'
WHERE doctor_id = 'DOCTOR_UUID';
```

### 5. Environment (Render)

| Variable | Status |
|----------|--------|
| `CRON_SECRET` | ✅ Set |
| `RAZORPAY_KEY_ID` | Set from Dashboard → Account & Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | Set from same place |

### 6. Apply Migrations

Run in Supabase SQL Editor if not done:

- `024_payments_payout_columns.sql`
- `025_doctor_settings_payout.sql`

### 7. Render Cron Job

- Create cron service
- Schedule: `30 20 * * *` (02:00 IST daily)
- Command: `curl -X POST https://YOUR-API.onrender.com/cron/payouts -H "Authorization: Bearer $CRON_SECRET"`

---

## Quick Reference

- **Route docs:** [razorpay.com/docs/payments/route](https://razorpay.com/docs/payments/route/)
- **Linked Accounts:** [razorpay.com/docs/payments/route/linked-account](https://razorpay.com/docs/payments/route/linked-account/)
- **Our payout code:** `backend/src/services/payout-service.ts`, `backend/src/adapters/razorpay-route-adapter.ts`

---

**Last Updated:** 2026-03-24
