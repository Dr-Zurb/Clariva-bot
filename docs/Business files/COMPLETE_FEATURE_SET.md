# Complete Feature Set (Living Document)
## Clariva — Digital infra for Instagram-growing doctors

**Purpose:** Single inventory of **everything the product is or could be**—grouped by domain—with a **status** so the team can see gaps at a glance. This is **not** a prioritization doc; for ordering work use **[FEATURE_PRIORITY.md](./FEATURE_PRIORITY.md)**.

**How to use:** When you ship or scope something, update the relevant row (status + one-line note + date in the changelog). Keep “Planned” honest; move items to **Deferred** with a pointer to [Development/deferred/](../Development/deferred/) when you pause them.

---

## Status legend

| Status | Meaning |
|--------|--------|
| **Shipped** | In production, Doctors/patients can use it end-to-end for the stated scope. |
| **Partial** | Exists but incomplete, basic v1, or missing edge cases/docs/tests. |
| **In progress** | Actively being built (optional: link to task doc). |
| **Planned** | Agreed direction, not built yet. |
| **Deferred** | Intentionally paused; operational or business blocker. |
| **Exploring** | Idea under evaluation; may drop or merge elsewhere. |

---

## 1. Channel & acquisition (social → product)

| Capability | Status | Notes |
|------------|--------|-------|
| Instagram DM webhook (receive/send) | Partial | Core path; token expiry / edge cases need ongoing care. |
| Instagram comments → engagement / routing | Partial | Align with Meta policy and doctor workflow. |
| AI intent detection & conversation flow | Partial | Basic version shipped; refinement ongoing. |
| Patient data collection in chat (name, phone, reason, etc.) | Partial | Extend as intake/consent matures (see §5). |
| Multi-channel (WhatsApp / Facebook) | Planned / Exploring | Business plan mentions phase-wise expansion. |
| Bot pause / human handoff | Partial | RBH-09: dashboard toggle + DM handoff + comment outreach pause; run migration 033. |
| IG connection health in dashboard (disconnect, errors) | Partial | RBH-10: Meta `debug_token` + 5m cache on Integrations card; migration 034; last DM success time. |

---

## 2. Scheduling & queue (OPD)

| Capability | Status | Notes |
|------------|--------|-------|
| Doctor availability & time slots | Shipped / Partial | Slot mode; refine policies & exceptions. |
| Appointment booking (create, confirm, lifecycle) | Partial | Happy path + payments/cancel rules refinement. |
| OPD modes: **slot** vs **queue** (tokens, ETA, session snapshot) | Shipped / Partial | Initiative documented complete 2026-03-24; real-world QA ongoing. |
| Public booking links + bot-driven book flows | Partial | Per mode; keep copy and errors consistent. |
| Double-booking / concurrency guarantees | Partial | Harden per mode and payment state. |
| Reschedule / cancel rules & UI | Partial | Tie to payment and queue fairness. |

---

## 3. Visits & teleconsultation

| Capability | Status | Notes |
|------------|--------|-------|
| Teleconsultation (join flow, Twilio/video) | Partial | Room lifecycle, late join, failures. |
| Visit state linked to appointment / consult record | Partial | Foundation for chart + billing narrative. |
| Screen share / device support (if in scope) | Exploring | Market-dependent. |

---

## 4. Clinical: prescription, notes, chart, documents

| Capability | Status | Notes |
|------------|--------|-------|
| Basic prescription (create, deliver to patient) | Partial | Next: format, Signature, versioning, audit. |
| **Patient chart** (longitudinal view: visits, Rx, key facts) | Planned | *Major infra layer* — timeline + continuity across IG/book/dashboard. |
| **Encounter / clinical note** (even minimal SOAP/A&P) | Planned | Medico-legal + handoff; distinct from “Rx only.” |
| Allergies / active problems / chronic meds (structured) | Planned / Exploring | Start minimal if chart ships. |
| **Documents** (prior reports, Rx scans, uploads per patient) | Planned | *Major capability* for many specialties. |
| **E-prescribing / pharmacy integration** | Exploring | *Market-specific* major effort—separate from “basic Rx.” |
| Labs & diagnostics | Exploring | Usually post-core chart. |

---

## 5. Patient experience, identity & portal

| Capability | Status | Notes |
|------------|--------|-------|
| Patient identity & matching (IG ↔ phone ↔ record) | Partial / Planned | See [PATIENT_IDENTITY_AND_MATCHING.md](../Development/Future%20Planning/PATIENT_IDENTITY_AND_MATCHING.md). |
| **Patient “home”** (appointments, join links, Rx list, profile) | Planned | Unifies fragments into one logged-in experience. |
| **Intake & consent** (telehealth eligibility, chief complaint, disclosures) | Planned | Compliance + quality; separate from bot smalltalk. |
| Post-visit summaries (optional) | Exploring | |

---

## 6. Doctor dashboard & practice ops

| Capability | Status | Notes |
|------------|--------|-------|
| Appointments list / filters / actions | Partial | |
| Doctor settings (fees, availability, OPD mode/policies, etc.) | Partial | Validation + migrations must stay in sync with prod DB. |
| **Multi-user clinic** (roles: doctor, staff, shared inbox) | Exploring | Major when targeting multi-doctor clinics. |
| Analytics (booking funnel, no-shows, basic KPIs) | Partial / Planned | FEATURE_PRIORITY references basic analytics. |
| Payout settings UI / schedule (product surface) | Partial | Code paths exist; Route ops deferred (see §8 money). |

---

## 7. Money: patient pay, platform fee, doctor payouts

| Capability | Status | Notes |
|------------|--------|-------|
| Patient payment capture (consult / booking) | Partial | Refine failure, refund, and “hold slot” rules. |
| Platform fee configuration | Partial | |
| **Doctor payouts (Razorpay Route, batch cron)** | Deferred | Product code largely ready; **operational setup** deferred — [PAYOUT_OPERATIONAL_SETUP_2026-03.md](../Development/deferred/PAYOUT_OPERATIONAL_SETUP_2026-03.md). |
| Invoicing / receipts (patient-facing) | Planned / Exploring | |

---

## 8. Communications beyond Instagram

| Capability | Status | Notes |
|------------|--------|-------|
| SMS / WhatsApp / email reminders & deep links | Partial / Planned | Reliability for time-sensitive healthcare logistics. |
| In-app / OPD hints (e.g. turn soon) | Shipped / Partial | Polling + snapshot; push optional. |
| Email notifications | Partial / Planned | |

---

## 9. Trust, compliance, security & operations

| Capability | Status | Notes |
|------------|--------|-------|
| Privacy policy / terms / regional compliance | Partial | See [LEGAL_COMPLIANCE.md](./LEGAL_COMPLIANCE.md). |
| Audit trail (who changed Rx, appointments, sensitive fields) | Partial / Planned | Minimum serious baseline for healthcare. |
| RLS / access control testing | Deferred | [Development/deferred/](../Development/deferred/) — resume when auth surfaces stable. |
| Observability (logs, metrics, runbooks) | Partial | OPD observability patterns; extend product-wide. |
| Error catalog / support runbooks | Partial | e.g. `OPD_SUPPORT_RUNBOOK.md`; grow by domain. |

---

## 10. Platform, integrations & developer experience

| Capability | Status | Notes |
|------------|--------|-------|
| API design & versioning | Partial | |
| Migrations & Supabase/DB governance | Partial | |
| CI / tests (unit + critical integration) | Partial | |
| Monitoring / alerting (e.g. Sentry) | Deferred / Partial | See deferred Sentry task in Development docs. |

---

## Spinal summary (product narrative)

**Instagram attention → AI receptionist → book (slot/queue) → teleconsult → Rx → (payments) → (payouts later).**  
Everything above either **supports that spine** or **moves you from “feature list” to “practice-grade infra”** (chart, notes, intake, documents, patient home, identity, money edge cases, comms, security).

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-28 | Initial version: master inventory + status placeholders; includes planned layers (chart, notes, intake, documents, patient home, e-Rx, clinic ops, identity, comms, compliance). |

---

**Last updated:** 2026-03-28  
**Owner:** Product / engineering (update on merge or release)
