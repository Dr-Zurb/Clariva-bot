# Founding-doctor pilot agreement

> **Purpose.** The short, signable paper for your first five doctors — before the full ToS / Privacy Policy / DPA stack exists. Deliberately one page: an Indian doctor will sign a plain-language letter and will not read a 40-page MSA.
>
> **Not legal advice.** Have an Indian health-tech lawyer read this before the first signature. The clauses below are a starting draft, not counsel's work.
>
> **Related:** [`LAUNCH_READINESS_CHECKLIST.md`](./LAUNCH_READINESS_CHECKLIST.md) · [`PRICING_MODEL_DECISIONS.md`](./PRICING_MODEL_DECISIONS.md) · [`PRICING_AND_UNIT_ECONOMICS.md`](./PRICING_AND_UNIT_ECONOMICS.md) · [`ONBOARDING_RUNBOOK.md`](./ONBOARDING_RUNBOOK.md) · [`plan-00-billing-roadmap.md`](../../Work/Product%20plans/billing/plan-00-billing-roadmap.md)

---

## ⛔ Read this before you send it to anyone

Your own launch gate says: *"Do NOT take a paying customer's real patient data until every P0 is ✅."* A pilot with real patients **is** taking real patient data. Calling it a pilot does not change that.

Realistically you will not clear all 14 P0 items before doctor #1. So split them. **My read** of which genuinely cannot wait, and which can — confirm with counsel:

| Cannot start a pilot without | Can reasonably follow during the pilot |
|---|---|
| RLS on every PHI table + cross-tenant leak test green | Cyber liability + tech E&O insurance bound |
| Encryption at rest + TLS 1.2+ | ISO 27001 path, VAPT / pen test |
| `redactPhiForAI` on every external AI call path | Full published subprocessor register |
| Consent notice + teleconsult consent shown to patients | DPIIT / Startup India recognition |
| A working erasure path | Formal SLA document |
| No PHI in logs, errors, or telemetry | GST-compliant invoicing (if pilot is unpaid or personally invoiced) |
| E-prescription rules — prohibited drug list blocked | Grievance Officer *published* (name one internally now) |
| Doctor/staff MFA — flagged as a gap in §5 of the checklist | |

The left column protects patients. The right column protects you. Never trade the left one for a signature.

---

## Who signs

The company is incorporated (COI received 2026-08-20). Sign as the company — fill `[COMPANY LEGAL NAME]` from the COI, not your personal name. The old assignment-to-a-future-company clause is gone.

GST registration is still outstanding. Until it lands, invoices can go out as pro-forma with the GST line noted as pending, or wait one filing cycle. Do not invent a GSTIN.

---

## The agreement

> Copy from here down. Replace every `[BRACKET]`.

---

**HALO AID — FOUNDING DOCTOR PILOT**

Between **[COMPANY LEGAL NAME]** ("Halo Aid") and **Dr. [DOCTOR NAME]**, [CLINIC NAME], [CITY] ("the Doctor").
Start date: **[DATE]**. Initial term: **[3] months**, continuing month to month afterwards.

**1. What Halo Aid provides.** Software that answers patient enquiries on Instagram and Facebook, books appointments, sends reminders, runs video consultations, and records prescriptions and consultation notes. Support by WhatsApp and email, best effort, same working day. Connecting a payment gateway is optional — the Doctor may keep their own UPI / cash rail.

**2. What Halo Aid is not.** Halo Aid is software. It does not practise medicine. The Doctor is the Registered Medical Practitioner and remains solely responsible for every clinical decision, diagnosis, and prescription. The automated assistant does not give medical advice; it schedules, reminds, and hands off to the Doctor. In an emergency the assistant directs the patient to **112 / 108** or the nearest hospital; it does not triage or grade severity.

**3. Price (founding ten).** For the first three months the ₹999 monthly base is waived. The Doctor pays **₹49 (ex-GST) per completed teleconsult** (text, voice, or video — one rate), and the bill can never exceed **₹12,499 (ex-GST) / ₹14,749 (incl. GST)** in a calendar month. After month three the standard sheet applies: **₹999 per doctor per month covering unlimited in-clinic visits and the first 20 teleconsults, ₹49 per completed teleconsult after, same cap.** GST extra on every invoice. A teleconsult bills only when it actually happened (patient joined a session, or the Doctor sent a clinical reply on a *new* async consult). In-clinic visits, no-shows, cancellations, bot-only messages, documentation, reconnects, and follow-up messages inside an already-billed visit are free. Extra clinicians pay another ₹999; desk and front-office logins are free. **These founding levels are locked for 12 months from the start date**, including after the published price rises, provided the subscription is not broken.

**3a. Patient money.** The patient pays the Doctor directly. Halo Aid is never merchant of record and never deducts a fee from a patient payment. When the Doctor has connected their own payment gateway, Halo Aid may create payment links and, on the Doctor's policy, initiate refunds on that account. Halo Aid does not hold, advance, or guarantee patient funds.

**3b. Refunds the Doctor must honour (non-negotiable floor).** 100% refund to the patient, initiated automatically where the gateway is connected, when: the Doctor cancels; an emergency is flagged in the thread or on the intake form; or a platform / technical failure (double payment, slot gone). Patient-initiated cancellations and no-shows follow the policy shown on the booking page before payment. Launch default for patient cancellations is 100% if cancelled 24 hours or more before the slot.

**4. Cancellation.** Either side may end this with 30 days' written notice, for any reason, with no penalty. On termination the Doctor receives a complete export of their data within 14 days.

**5. Patient data.** Patient data belongs to the Doctor. Halo Aid processes it only to provide the service and on the Doctor's instructions. It is stored in India, encrypted in transit and at rest, and is never sold or used to train third-party AI models. Halo Aid will delete or return it on request. The Doctor is responsible for obtaining patient consent to the teleconsultation and to the use of this software; Halo Aid provides the consent flow in-product.

**6. Confidentiality.** Each side keeps the other's non-public information confidential.

**7. What Halo Aid asks in return.** This is a founding-ten seat, and the waived base reflects it. The Doctor agrees to: a **[30]**-minute feedback conversation each month; one written case study Halo Aid may publish (draft shared for approval); **two warm introductions** to other doctors who might use the product; permission to be contacted as a reference by prospective customers; and reasonable tolerance for bugs, with prompt reporting rather than silent abandonment. Use of the Doctor's name or clinic in public marketing beyond the agreed case study requires separate written consent.

**8. Liability.** Halo Aid's total liability under this agreement is capped at the fees paid in the preceding three months. Neither side is liable for indirect or consequential loss. Nothing here limits liability that cannot be limited under Indian law.

**9. Changes.** This will be replaced by Halo Aid's standard Terms of Service, Privacy Policy, and Data Processing Agreement when published. The Doctor will get 30 days' notice, and the founding price in clause 3 survives that replacement.

**10. Governing law.** India. Courts at **[CITY]**.

Signed,

`_______________________`  `_______________________`
For [COMPANY LEGAL NAME]            Dr. [DOCTOR NAME]
Date:                            Date:

---

## Notes on the clauses that matter

**Clause 2 is your most important sentence.** It is the "tool, not the doctor" disclaimer the launch checklist lists as P0, and it is the thing standing between you and a clinical negligence claim. Do not soften it to make the product sound more capable.

**Clause 3's twelve-month lock is deliberate.** It is what makes a waived base a commitment device rather than a discount you have to claw back. It costs you little — ten doctors — and it converts price resistance into loyalty. After twelve months the published sheet applies; do not silently reprice a founding doctor mid-lock.

**Clause 7 is what you are actually buying** with the discount. A cheap pilot that gives you no feedback and no reference is worse than no pilot, because you have anchored your price low for nothing.

**Clause 8's cap is low** because you have no insurance yet. Once cyber liability and tech E&O are bound, counsel will likely want this renegotiated upward for larger clinic deals.

---

**Created:** 2026-08-16.
**Owner:** Founder (commercial).
**Last updated:** 2026-08-22 — company incorporated; clause 3 rewritten to the locked ₹999 / 20 / ₹49 / ₹12,499 sheet and founding-ten terms; refund floor and "not in the patient's money" added as 3a/3b.
**Status:** `Draft` — unreviewed by counsel. Do not sign until a lawyer has read clauses 2, 3a, 3b, 5, and 8.
