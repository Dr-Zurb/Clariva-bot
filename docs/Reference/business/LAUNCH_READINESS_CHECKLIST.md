# Launch Readiness Checklist — "Safe to Start Selling"

> **Purpose.** The concrete gate that answers: *"What must be true before Clariva can safely sell to its first paying doctor/clinic in India?"* This is the operational counterpart to [`REGULATORY_AND_LAUNCH_STRATEGY.md`](./REGULATORY_AND_LAUNCH_STRATEGY.md) (the *why/what*) and [`COMPLIANCE.md`](../engineering/compliance/COMPLIANCE.md) (the engineering *how*).
>
> **Not legal advice.** Have an Indian health-tech lawyer + Company Secretary sign off the legal items. DPDP rules were still being operationalised in 2025–26 — confirm current status.
>
> **How to read the tags:**
> - **[P0]** = hard blocker. **Do NOT take a paying customer's real patient data until every P0 is ✅.**
> - **[P1]** = before/at your first paying customer onboarding (days, not weeks).
> - **[P2]** = within ~90 days of first sale.
>
> **Related:** [`REGULATORY_AND_LAUNCH_STRATEGY.md`](./REGULATORY_AND_LAUNCH_STRATEGY.md) · [`COMPLIANCE.md`](../engineering/compliance/COMPLIANCE.md) · [`SECURITY.md`](../engineering/compliance/SECURITY.md) · [`RLS_POLICIES.md`](../engineering/compliance/RLS_POLICIES.md) · [`DATA_RETENTION.md`](../engineering/compliance/DATA_RETENTION.md) · [`EXTERNAL_SERVICES.md`](../engineering/operations/EXTERNAL_SERVICES.md) · [`WEBHOOK_SECURITY.md`](../engineering/compliance/WEBHOOK_SECURITY.md)

---

## ⛔ The P0 gate (the short answer)

**You are "safe to start selling" only when all of these are true.** Everything below this box is the detail behind it.

- [ ] **Company exists & can contract** — Pvt Ltd incorporated; bank account; founder/contractor **IP assignment** signed.
- [ ] **Customer-facing legal live** — Terms of Service + Privacy Policy + **Data Processing Agreement (you = Processor)** published and in the signup flow.
- [ ] **"Tool, not the doctor" disclaimer** — Clariva does not practise medicine; the **RMP owns all clinical decisions** (in ToS + UI).
- [ ] **DPDP basics** — plain-language **notice + consent at collection**; a named, published **Grievance Officer**; a working **erasure** path.
- [ ] **Telemedicine prescribing is safe** — e-prescription **category rules enforced**; the **prohibited drug list is blocked** in the Rx flow.
- [ ] **Tenant isolation is DB-enforced** — **RLS on every PHI table**; the cross-tenant leak test (`task-rcp-24`) is green.
- [ ] **Encryption** — at rest (DB, backups, recordings) + **TLS 1.2+** in transit.
- [ ] **Doctor/staff accounts require MFA** (currently a gap — see §5).
- [ ] **Subprocessor agreements signed** with every PHI-touching vendor, with **no-train + zero-retention** confirmed for AI & voice (OpenAI/Anthropic, Deepgram, Twilio).
- [ ] **PHI pinned to an India region**; you can state where data lives.
- [ ] **PHI redacted before external AI** (`redactPhiForAI`) on every call path.
- [ ] **Breach response runbook** written and dry-run once, with the DPDP notification timeline.
- [ ] **Insurance bound** — cyber liability + tech E&O (errors & omissions).
- [ ] **Payments + tax** — gateway live (Razorpay) and **GST-compliant invoicing**.

> If any P0 is unchecked, you are not selling safely — you are selling exposure.

---

## 1. Corporate & contractual

- [ ] **[P0]** Private Limited company incorporated (MCA); PAN/TAN; current account.
- [ ] **[P0]** Founders' agreement + **IP assignment** (every founder/contractor assigns all code/IP to the company). Diligence-critical.
- [ ] **[P0]** GST registration (needed to invoice).
- [ ] **[P1]** Cap table / ESOP pool decided before raising.
- [ ] **[P2]** **DPIIT / Startup India** recognition (tax holiday, easier compliance).

## 2. Customer-facing legal documents

- [ ] **[P0]** **Terms of Service** (incl. acceptable use, liability cap, governing law = India).
- [ ] **[P0]** **Privacy Policy** — what's collected, why, retention, recipients, rights, Grievance Officer contact, **link to the subprocessor list**.
- [ ] **[P0]** **Data Processing Agreement (DPA)** positioning Clariva as **Processor** to the doctor/clinic (Fiduciary). See strategy §1.
- [ ] **[P0]** **"Tool, not a doctor" disclaimer** — Clariva provides software; the RMP is responsible for clinical decisions. In ToS + visible in-product.
- [ ] **[P0]** **Teleconsultation consent** copy/flow (patient consents to the remote consult per Telemedicine Guidelines).
- [ ] **[P1]** **Refund / cancellation policy** (tied to the payment flow).
- [ ] **[P1]** **Compliance-claim hygiene** — use *"designed to be DPDP-aligned / supports DPDPA principles"*; **never** "HIPAA certified" or "certified compliant" (mirrors `COMPLIANCE.md`).

## 3. DPDP (India data-protection) readiness

- [ ] **[P0]** **Notice + consent at collection** — itemised purposes, plain language, withdrawable. (Consent object + revocation exist via `consent_status` / `handleRevocation`; confirm the *notice copy* is shown.)
- [ ] **[P0]** **Grievance Officer** named, with a published contact channel + response process.
- [ ] **[P0]** **Erasure / right-to-delete** works end-to-end — confirm `account-deletion-controller.ts` / `account-deletion-worker.ts` / `account-deletion-pii-scrub.ts` cover **patient** data and that audit logs are **anonymised, not deleted** (per `COMPLIANCE.md`).
- [ ] **[P1]** **Access / correction / data-export** request workflow (DPDP + GDPR portability). Export was a "future task" in `COMPLIANCE.md` — verify or build.
- [ ] **[P1]** **Retention configured** per region (`regulatory-retention-service.ts` + [`DATA_RETENTION.md`](../engineering/compliance/DATA_RETENTION.md)); automated cleanup scheduled.
- [ ] **[P1]** **Children's data** decision — verifiable parental consent if minors are in scope (P0 if pediatrics is a core use case).
- [ ] **[P2]** Plan for **Significant Data Fiduciary** duties (DPO, DPIA, audits) if you scale into that tier.

## 4. Telemedicine compliance (Telemedicine Practice Guidelines 2020)

- [ ] **[P0]** **RMP registration captured & verifiable** per consulting doctor (ABDM HPR helps later).
- [ ] **[P0]** **E-prescription category rules enforced** — encode List O / A / B and **block the Prohibited List** (narcotics/psychotropics) in `prescription-service.ts` / `drug-master-service.ts`. A controlled drug on a video consult is a hard legal failure.
- [ ] **[P0]** **Teleconsult consent + patient/RMP identification** recorded per consult.
- [ ] **[P1]** **Consult record-keeping** retained per retention policy.
- [ ] **[P2]** Track **NMC** updates to the guidelines.

## 5. Security baseline (the technical "safe")

- [ ] **[P0]** **RLS enabled on ALL PHI tables**, enforced at the DB (not just app-level doctor-scoping). Cross-tenant leak test (`task-rcp-24`) green. See [`RLS_POLICIES.md`](../engineering/compliance/RLS_POLICIES.md).
- [ ] **[P0]** **Encryption at rest** (DB, backups, video/voice recordings) + **TLS 1.2+** in transit.
- [ ] **[P0]** **MFA enforced for doctor/staff accounts.** ⚠️ Appears unimplemented today (only the Supabase library supports factors). Supabase Auth supports TOTP/WebAuthn — enable + enforce before sale.
- [ ] **[P0]** **Secrets management** — all via `config/env.ts` (Zod-validated); none committed; service-role key server-side only; rotation plan.
- [ ] **[P0]** **No PHI in logs / errors / telemetry** (already enforced in task gates and `EXTERNAL_SERVICES.md`; keep the gate).
- [ ] **[P0]** **Webhook signature verification** on all inbound webhooks (Razorpay/Meta) — confirm coverage across `webhook-controller.ts` + adapters. See [`WEBHOOK_SECURITY.md`](../engineering/compliance/WEBHOOK_SECURITY.md).
- [ ] **[P1]** **Rate limiting** on all public + auth endpoints (verify coverage; `COMPLIANCE.md` listed it as a future task).
- [ ] **[P1]** **Backups encrypted + restore tested** (don't trust an untested backup).
- [ ] **[P1]** **Admin/support access** time-limited, justified, and audited (no "forever god-mode").
- [ ] **[P2]** **Field-level encryption** for the highest-risk PHI columns.
- [ ] **[P2]** Independent **VAPT / pen test** before scaling.

## 6. Subprocessors & vendor agreements (the #1 hidden risk)

For **every** vendor that can touch PHI: a signed **DPA** (BAA once US), data **region** confirmed, and a **no-train / zero-retention** term where the vendor sees patient content.

- [ ] **[P0]** **Supabase** — DPA + India region + RLS verified.
- [ ] **[P0]** **OpenAI / Anthropic** — DPA/data-processing terms + **no-training (API default)** + **zero-retention** where transcripts/PHI flow.
- [ ] **[P0]** **Deepgram** (`voice-transcription-deepgram.ts`) — DPA + no-retention of audio/transcripts.
- [ ] **[P0]** **Twilio** (`voice/video-session-twilio.ts`) — DPA; recordings stored in-region; retention controlled.
- [ ] **[P0]** **Meta (Instagram/WhatsApp)** — data-sharing minimised + disclosed in privacy policy.
- [ ] **[P0]** **Razorpay / PayPal** — only payment metadata stored; no card data (PCI handled by gateway).
- [ ] **[P1]** **Resend** (email) — DPA; no PII in templates/logs.
- [ ] **[P0]** **Subprocessor register published** and linked from the Privacy Policy (create `docs/Reference/engineering/compliance/SUBPROCESSORS.md`).

## 7. AI safety & governance

- [ ] **[P0]** **`redactPhiForAI` applied on every external AI call path** (`ai-service.ts` and call sites like `dm-turn-context.ts`).
- [ ] **[P0]** **Human-in-the-loop documented** — no autonomous diagnosis/prescription; doctor confirms Rx; staff review; unhideable safety strip. (Also your SaMD shield — strategy §9.)
- [ ] **[P1]** **AI interactions logged as metadata only** (model, tokens, redaction flag) — no raw prompts/responses with PHI.
- [ ] **[P2]** Regulatory read on **SaMD** before any feature lets AI decide/prescribe autonomously.

## 8. Operations & incident response

- [ ] **[P0]** **Breach-response runbook** written + dry-run once (roles, DPDP timeline, customer notification template).
- [ ] **[P1]** **Monitoring + alerting** live (auth failures, error-rate, cost spikes) per `COMPLIANCE.md §J`.
- [ ] **[P1]** **Support channel + response SLA** for customers.
- [ ] **[P1]** **On-call / escalation** path defined.
- [ ] **[P2]** Public **status / uptime** page.

## 9. Commercial readiness

- [ ] **[P0]** **Payment gateway live** (Razorpay, INR) + **GST-compliant invoicing**.
- [ ] **[P1]** **Pricing + order form / subscription contract** (with the DPA referenced).
- [ ] **[P1]** **SLA document** (uptime, support response) for clinic/hospital buyers.
- [ ] **[P1]** **Onboarding flow** (doctor verification, consent setup, data import if any).
- [ ] **[P2]** Define the **buyer** (solo RMP vs clinic vs hospital) — drives SSO/audit-export/cert priorities.

## 10. Insurance

- [ ] **[P0]** **Cyber liability** insurance bound.
- [ ] **[P0]** **Tech E&O (professional indemnity for software)** bound.
- [ ] **[P1]** Confirm policy covers PHI/health-data incidents and your subprocessor chain.

## 11. Documentation & scope hygiene

- [ ] **[P1]** Update [`COMPLIANCE.md`](../engineering/compliance/COMPLIANCE.md) product scope from *"administrative only"* → **clinical** (Rx/SOAP/interactions). See strategy §2.
- [ ] **[P1]** Marketing/website claims reviewed against the compliance-claim rule (no overclaiming).
- [ ] **[P2]** Start the **ISO 27001** path (first certification; recognised in India + globally).

---

## Sign-off (before first paying customer)

| Area | Owner | All P0 met? | Date |
|---|---|---|---|
| Corporate & legal docs | | ☐ | |
| DPDP + telemedicine | | ☐ | |
| Security + RLS | | ☐ | |
| Subprocessors + AI | | ☐ | |
| Incident response | | ☐ | |
| Insurance + commercial | | ☐ | |

**Launch decision:** _______________________  **Date:** ____________

---

**Created:** 2026-05-31.
**Owner:** Founder + Engineering + Compliance.
**Status:** `Draft` — working gate; refine with counsel.
**Note:** P0 items are the minimum bar to sell *safely*; P1/P2 reduce risk and unlock larger buyers. Re-run this checklist before each new jurisdiction (US/EU add their own P0s — strategy §8).
