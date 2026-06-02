# Deferred: Payout Operational Setup (Razorpay Route)

**Status:** ⏸️ **DEFERRED**  
**Reason:** Focus on core app first; **Route is not only “company registration”** — Razorpay also gates Route on **financials (turnover)** and **payer–payee transparency** (RBI-style marketplace checks). See **§ Razorpay Route activation criteria (2026-03)** below.  
**Resume when:** Company/onboarding stable; **turnover or declaration** acceptable to Razorpay; **transparency UX** documented; ready to pay doctors.  
**Date deferred:** 2026-03-24  

---

## Razorpay Route activation criteria (reply 2026-03-24)

**Ticket:** #18459536 · Submit to: **routepriority@razorpay.com** · Review ~1 week.

Route enablement is **separate from** “complete KYC / company details” alone. Support listed:

### 1. Financials check

| Path | What they want |
|------|----------------|
| **Domestic** | **GST-3B** returns showing cumulative **taxable revenue > ₹40L** |
| **Export** | Bank **FIRC** with INR equivalent **> ₹5L** |
| **New / no GST** | **Written declaration** of turnover if GST not applicable or first year without filed returns |

Until you meet one of these (or they accept your declaration), Route may stay off even if dashboard KYC is “complete.”

### 2. Payer–payee transparency check

For platforms paying **third parties** (doctors), the **actual payee** must be clear to the customer **before and during payment**.

They ask (reply **Yes** or **No**):

> Do the third-party accounts linked in Route **interact directly with customers** to provide goods/services?

- **Clariva:** Typically **Yes** — patients interact with the **doctor/clinic** (e.g. Instagram, consult). The platform facilitates booking/payment; the **service is the doctor’s**.  
- If **Yes:** send a **short description** of how that interaction works + how the **payee (doctor/clinic)** is shown on checkout / payment screens.

---

## Draft email to routepriority@razorpay.com

Use after you attach GST/declaration and align product copy.

**Subject:** Re: Route activation – Ticket #18459536 – Clariva – financials + payer-payee transparency

**Body (edit placeholders):**

> Hi,  
>   
> **Ticket ID:** #18459536  
> **Merchant:** [legal name / Razorpay MID]  
>   
> **1) Financials**  
> Attached: [GST-3B / FIRC / signed turnover declaration per your guidelines].  
>   
> **2) Payer–payee transparency**  
> **Q: Do linked accounts (doctors) interact directly with customers?** **Yes.**  
>   
> Patients communicate with the **individual doctor or clinic** (e.g. Instagram DM). Clariva provides **software** for scheduling and payments. The **consultation / appointment** is provided by the **named doctor/clinic**.  
>   
> On payment, we show **[describe: doctor name / clinic name on Razorpay receipt, order notes, checkout description, or booking page]** so the payer knows they are paying **that provider**. [Attach screenshots if requested.]  
>   
> Please enable **Route** for split transfers / linked accounts for doctor settlements.  
>   
> Regards,  
> [Name]

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

1. **Razorpay onboarding** – KYC / business profile usable; **Company Registration** tab completed as required by dashboard
2. **Route gate:** **Financial proof** (GST-3B >₹40L domestic, or FIRC export path, or **written turnover declaration**) sent to **routepriority@razorpay.com**
3. **Route gate:** **Transparency** — payee (doctor/clinic) identifiable on **browse + pay**; **Yes** + description emailed as above
4. **App has paying users** – consultations happening, payments captured (helps both review and ops)

---

## Step-by-Step When You Resume

### 1. Razorpay Company Registration

- Go to Razorpay Dashboard → **Company Registration** (top nav)
- Complete business details, documents, bank account
- Finish KYC and any verification steps

### 2. Enable Route

- Satisfy **§ Razorpay Route activation criteria** (financials + email to **routepriority@razorpay.com**)
- After approval, Route may appear under **Payments** → **Route** (PAYMENT PRODUCTS)
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

**Last Updated:** 2026-03-28 (Route reply: financials ₹40L / FIRC / declaration + payer-payee transparency; not registration-only)
