# Regulatory & Launch Strategy

> **What this is.** The founder/business-facing map of the laws, certifications, and operational steps Clariva must navigate to launch in **India first** and then go **global** — and how that maps onto the product and the engineering compliance work already done.
>
> **What this is NOT.** This is not the engineering rulebook. Code-level constraints (PHI-in-logs, RLS, audit fields, redaction) live in [`COMPLIANCE.md`](../engineering/compliance/COMPLIANCE.md) and its siblings, and `COMPLIANCE.md` remains the system-constraint source of truth. This file is the *regulatory + business strategy* that those controls serve.
>
> **Not legal advice.** This is an engineering/strategy planning document. Engage an Indian health-tech lawyer (DPDP + telemedicine) and a Company Secretary before relying on any specific filing, policy, or claim below. DPDP Rules were being operationalised through 2025–26 — confirm current status before launch.
>
> **Related:** [`COMPLIANCE.md`](../engineering/compliance/COMPLIANCE.md) · [`PRIVACY_BY_DESIGN.md`](../engineering/compliance/PRIVACY_BY_DESIGN.md) · [`SECURITY.md`](../engineering/compliance/SECURITY.md) · [`RLS_POLICIES.md`](../engineering/compliance/RLS_POLICIES.md) · [`DATA_RETENTION.md`](../engineering/compliance/DATA_RETENTION.md) · [`EXTERNAL_SERVICES.md`](../engineering/operations/EXTERNAL_SERVICES.md) · [`WEBHOOK_SECURITY.md`](../engineering/compliance/WEBHOOK_SECURITY.md) · [`FRONTEND_COMPLIANCE.md`](../engineering/compliance/FRONTEND_COMPLIANCE.md)

---

## TL;DR — the five things that prevent "legal drama"

1. **Decide your role: Data Fiduciary vs Data Processor** (§1). For a B2B SaaS sold to doctors, the doctor/clinic is usually the *Fiduciary* and Clariva is the *Processor* — until you train AI on patient data, at which point you become a Fiduciary for that purpose. This single decision shapes liability and contracts.
2. **DPDP Act 2023 is your real legal floor for the India launch** (§4) — not HIPAA. HIPAA only matters once you serve US healthcare entities.
3. **Your AI/voice subprocessors are the biggest hidden risk** (§6). Sending consult transcripts to OpenAI/Deepgram/Twilio without no-train / zero-retention + a DPA (BAA in the US) is the most common fatal gap for AI-health startups.
4. **You are now a clinical product, not "administrative only"** (§2). Telemedicine prescription rules and the SaMD question (§9) now apply.
5. **Build global, launch local** (§8). The architecture is region-ready; turn on one jurisdiction at a time, with the certification that market demands.

---

## §1 — The core mental model: Data Fiduciary vs Data Processor

This is the most important distinction in the whole document. (GDPR calls these *controller* / *processor*; DPDP calls them *Data Fiduciary* / *Data Processor*.)

| Role | Who decides *why* data is processed | Who it usually is for Clariva |
|---|---|---|
| **Data Fiduciary / Controller** | Determines the purpose and means | The **doctor / clinic** (they collect patients for care) |
| **Data Processor** | Processes on the Fiduciary's instructions | **Clariva** (we provide the tooling) |

**Why it matters:** as a Processor, your direct statutory liability is materially lower, the *patient consent* is owned by your customer (the doctor), and your obligation to them is contractual — a **Data Processing Agreement (DPA)**.

**The trap:** the moment Clariva uses patient data for *its own* purposes — most likely **training the `service-match-learning-*` / AI models on real patient text**, or building analytics products — Clariva becomes a **Fiduciary for that purpose** and takes on the full obligation set (notice, consent, rights, breach duties).

**Decision to lock (RLS-DL-1):** Clariva is a **Processor** for clinical data; any AI training/analytics runs on **de-identified** data only, unless a separate, explicitly-consented basis exists. Write this into the ToS + DPA. → enforced in code via redaction (`redactPhiForAI` in `ai-service.ts`) and the anonymisation patterns in [`PRIVACY_BY_DESIGN.md`](../engineering/compliance/PRIVACY_BY_DESIGN.md).

---

## §2 — Scope reality check (read before anything else)

[`COMPLIANCE.md`](../engineering/compliance/COMPLIANCE.md) still declares: *"administrative workflow tools only … MUST NOT claim diagnosis, prescription, or clinical decision support."* **That is no longer true of the product.** The cockpit now does prescriptions (`prescription-service.ts`), SOAP notes, drug-interaction / allergy checks (`drug-interactions-service.ts`, the anchored safety strip), and AI triage.

⚠️ **Consequence:** Clariva is a **clinical** product. Three regimes that don't apply to a pure booking tool now apply:

- **Telemedicine Practice Guidelines 2020** — including the **prescription category rules** (§4.2).
- **Software-as-a-Medical-Device (SaMD)** assessment for the AI features (§9).
- A **clinician-responsibility / "tool, not the doctor"** disclaimer becomes load-bearing (§7).

**Action:** update `COMPLIANCE.md`'s "Product Scope / Compliance Scope & Product Boundaries" to reflect clinical workflows, and keep the *"Clariva does not replace clinician judgement; the RMP is responsible for all clinical decisions"* line — it is now doing real regulatory work.

---

## §3 — Jurisdiction & jargon map

| Term | What it actually is | Applies to Clariva? |
|---|---|---|
| **DPDP Act 2023** | India's primary data-protection law ("India's GDPR"). Consent, data-principal rights, breach notice to the Data Protection Board, penalties up to ₹250 cr. | **Yes — primary legal obligation for the India launch.** |
| **SPDI Rules / IT Act §43A** | Older India regime; names health/medical records as "sensitive personal data," ISO 27001 as "reasonable security." Being superseded by DPDP. | Transitionally yes. Practical takeaway: **pursue ISO 27001**. |
| **Telemedicine Practice Guidelines 2020** | Makes remote consults legal in India (RMP identification, consent, e-prescription rules). Under NMC. | **Yes — core to a telemed-first clinical product.** |
| **ABDM** (Ayushman Bharat Digital Mission) | India's national digital-health network: ABHA health ID, doctor/facility registries, consent-based record exchange, FHIR standards. | **Optional but strategic** (§5). Not required to operate. |
| **DISHA** | A 2018 draft health-data law. | No — folded into DPDP. Don't chase it. |
| **HIPAA** | A **US** law for healthcare providers ("covered entities") and their "Business Associates." | **Only when serving US healthcare entities.** Not for the India launch. |
| **GDPR / UK GDPR** | EU/UK data law; health = "special category," needs explicit consent + transfer safeguards. | Only when serving EU/UK. |
| **SaMD** | "Software as a Medical Device" — AI that diagnoses/decides may be a regulated device (CDSCO / FDA / CE). | **Watch** — AI triage & interaction checks flirt with this (§9). |
| **SOC 2 / ISO 27001 / HITRUST** | Voluntary security certifications buyers demand. ISO 27001 = global; SOC 2 = US B2B; HITRUST = US healthcare. | Sales enablers, not laws. Sequence them (§7). |

**Two myths to kill:** (1) "We must be HIPAA compliant to launch" — false for India. (2) "ABDM compliance is legally mandatory" — false; it's an interoperability/trust play.

---

## §4 — India launch: the legal floor

### 4.1 DPDP Act 2023 (the real obligation)

Roles: **Data Principal** (patient) · **Data Fiduciary** · **Data Processor** · **Consent Manager** (registered intermediary) · **Significant Data Fiduciary** (SDF — higher bar: DPO, DPIA, audits).

| Obligation | What Clariva needs | Status in code |
|---|---|---|
| Notice + consent (purpose-limited, withdrawable) | Plain-language notice at collection; itemised purposes | Consent object + revocation exist (`consent_status`, `handleRevocation`); **verify the *notice* copy exists** |
| Data-principal rights (access, correction, erasure, grievance, nomination) | A request workflow + a named **Grievance Officer** | Export/erasure are "future tasks" in `COMPLIANCE.md` — **build before launch** |
| Children's data | Verifiable parental consent; no behavioural tracking | Relevant if pediatrics — **gap** |
| Security safeguards | Encryption, access control, audit | Strong: RLS, `audit-logger.ts`, `validateNoPHI` |
| **Breach notification** to the Data Protection Board + affected principals | A written, tested incident-response runbook with the DPDP timeline | `COMPLIANCE.md §J` has the rules; **the runbook itself is a gap** |
| Retention limits | Region-configurable retention | `regulatory-retention-service.ts` + [`DATA_RETENTION.md`](../engineering/compliance/DATA_RETENTION.md) |

If you grow large/sensitive enough you may be designated a **Significant Data Fiduciary** (extra duties). Plan for it; don't pre-build it.

### 4.2 Telemedicine Practice Guidelines 2020 (makes the core legal)

- **RMP-only:** only a Registered Medical Practitioner may consult. Capture + display registration number (the ABDM **HPR** helps later, §5).
- **Prescription category rules are a hard product constraint.** Telemedicine defines medicine lists — **List O** (safe, any mode), **List A** (first video consult / refill), **List B** (refill), and a **Prohibited List** (narcotics, psychotropics, etc.) that **may never be e-prescribed.** The Rx flow (`prescription-service.ts`, `drug-master-service.ts`) should encode these categories and **block the prohibited list**. A controlled substance going out on a video consult is exactly the kind of event that becomes legal drama.
- **Consent + identification + record-keeping** of the teleconsult.
- Track **NMC** updates (the guidelines have seen regulatory flux).

### 4.3 SPDI / IT Act (transitional) → pursue ISO 27001

ISO 27001 satisfies the "reasonable security practice" standard and is your first certification anyway (§7).

### 4.4 Entity & business setup

- **Private Limited company** via MCA.
- **DPIIT / Startup India** recognition (tax-holiday eligibility, simpler compliance, investor-friendly).
- **Founder + contractor IP assignment** — all code/IP assigned to the company. Non-negotiable for funding diligence.
- GST registration; standard accounting.

---

## §5 — ABDM: optional, but architect for it now (cheaply)

You don't need ABDM to launch, but make it nearly free to add later by aligning the data model to **FHIR R4 (India IG)** and standard code systems (**SNOMED CT / ICD-10 / LOINC**) as you build.

**Building blocks:**
- **ABHA** — Ayushman Bharat Health Account (the patient's portable health ID + address).
- **HPR** — Healthcare Professionals Registry (verify your RMPs).
- **HFR** — Health Facility Registry.
- **HIE-CM** — Health Information Exchange & Consent Manager (consent-based record sharing).
- **UHI** — Unified Health Interface (open network for discovery/booking/teleconsult — "UPI for health services").

**Integration path:** register on the **ABDM Sandbox**, then certify in milestones (roughly: M1 = ABHA creation/verification; M2 = share records as a Health Information Provider; M3 = fetch records as a Health Information User). Privacy backbone is the **Health Data Management (HDM) Policy**.

**Why bother:** credibility, and it unlocks government/hospital procurement. Treat as a Phase-1 (post-launch) item.

---

## §6 — Product development with compliance baked in

### Already strong (keep doing this)

- Consent + revocation that anonymises PHI (`consent_status`, `handleRevocation`, consent-namespace work in `receptionist-rearchitecture`).
- Audit logging with a no-PHI guard (`audit-logger.ts`, `validateNoPHI`, `redactionApplied: true`, enums/opaque IDs only).
- Tenant-scoping discipline (`listAppointmentsForPatient(patientId, doctorId)`; the cross-tenant leak test gate in `task-rcp-24`).
- Retention service (`regulatory-retention-service.ts`) + [`DATA_RETENTION.md`](../engineering/compliance/DATA_RETENTION.md).
- "PHI never touches logs/telemetry" enforced in task acceptance gates.
- Human-in-the-loop on clinical actions (staff review, doctor confirms Rx, unhideable safety strip) — a **regulatory asset** (§9).

### Gaps to close (priority order)

1. **Subprocessor data agreements — #1 risk.** Patient data flows to: **Supabase** (DB/auth), **Meta** (Instagram/WhatsApp), **OpenAI/Anthropic** (`ai-service.ts`), **Deepgram** (`voice-transcription-deepgram.ts`), **Twilio** (`voice/video-session-twilio.ts`), **Razorpay/PayPal** (payments), **Resend** (email). For each PHI-touching vendor you need a signed **DPA** (+ **BAA** once US), **no-training / zero-retention** terms, and a **region** that keeps data where it should be. Maintain a **subprocessor register** (§12). See [`EXTERNAL_SERVICES.md`](../engineering/operations/EXTERNAL_SERVICES.md).
2. **Data residency.** For the India launch, pin PHI storage/compute to an **India region** (e.g. Supabase ap-south). DPDP allows transfers fairly liberally (negative-list model), but health expectations and global customers later demand per-region pinning. Architect "region as configuration."
3. **DB-level tenant isolation (RLS), not just app-level scoping.** A single missed `WHERE doctor_id` leaks across clinics (`task-rcp-24` calls this "the one real hazard"). Enforce Supabase **RLS** so the database refuses cross-tenant reads even if app code slips. See [`RLS_POLICIES.md`](../engineering/compliance/RLS_POLICIES.md).
4. **Encryption + key management.** Confirm at-rest (DB, backups, recordings) + in-transit everywhere; field-level encryption for the highest-risk columns (already a "future task" in `COMPLIANCE.md`).
5. **Access auditing + RBAC + MFA.** Audit *access* ("who viewed which patient"), not just events; enforce roles; require **MFA** for doctors/staff.
6. **Incident-response / breach runbook.** Written + tested, with the DPDP notification timeline. You have the audit data; you need the playbook.
7. **De-identification pipeline** for anything feeding analytics or AI training (ties to §1).
8. **Consult-consent artifacts** (record the patient consented to the teleconsultation, per §4.2).

---

## §7 — Business development journey

- **Contracts:** Terms of Service · Privacy Policy · **DPA** (Clariva-as-Processor) · clinic/doctor onboarding agreement · subprocessor list · SLA. Have counsel localise to DPDP.
- **Insurance:** **Cyber liability** + **Tech E&O (errors & omissions)**. The ToS must make clear Clariva is a *tool*; the **RMP carries clinical responsibility** (medical indemnity is the doctor's). This disclaimer is load-bearing.
- **Certifications as sales weapons — sequenced, not all at once:**
  1. **ISO 27001** (recognised in India + globally) — first.
  2. **SOC 2 Type II** — when chasing US/enterprise.
  3. **ABDM milestone certification** — for Indian hospital/government credibility.
  4. **HITRUST** — only if large US health systems demand it.
- **Funding & diligence:** serious health-tech investors will diligence exactly §6 (subprocessor BAAs, residency, RLS, breach plan, IP assignment). Having the register + runbook ready turns diligence from a scramble into a checkbox.
- **GTM clarity:** decide the buyer — solo RMPs vs clinics vs hospitals. Solo doctors want self-serve + ABHA convenience; hospitals want SSO, audit exports, SOC 2, and procurement paperwork.

---

## §8 — Going global (build global, launch local)

Turn on one jurisdiction at a time against an architecture that already assumes regionalisation.

| Market | What "switches on" |
|---|---|
| **US** | HIPAA → sign **BAAs** with customers *and* subprocessors; SOC 2 Type II; US data residency; breach-notification rules. |
| **EU / UK** | GDPR/UK GDPR → explicit consent for health ("special category"); DPAs; **SCCs** for transfers; possibly an **EU representative** + a **DPO**. |
| **Any** | Local **data residency**; local medical-practice/teleconsult rules; a fresh **SaMD** check if the AI got more autonomous. |

**Enabling architecture (build once, reuse per market):** region-pinned data · DB-enforced tenant isolation · consent-as-an-object · audit everywhere · a subprocessor abstraction so you can swap a region-appropriate vendor. Clariva is already most of the way here — which is why "global" is realistic.

---

## §9 — SaMD watch (keep the human in the loop, on purpose)

The drug-interaction/allergy safety strip, AI triage, and `service-match` autobook could be read as **clinical decision support**. The cleanest way to stay *out* of medical-device regulation in most jurisdictions is to ensure **a clinician can independently review the basis and makes the final call** — which "doctor confirms Rx," "staff review," and the unhideable safety chrome already do.

**Action:** document this human-in-the-loop posture as a deliberate regulatory stance, and get a one-time read from a regulatory consultant (CDSCO in India) **before** any feature lets the AI prescribe/decide autonomously.

---

## §10 — Phased roadmap

| Phase | Focus | Key items |
|---|---|---|
| **Phase 0 — India launch (now)** | Legal floor + plug the gaps | Pvt Ltd + DPIIT + IP assignment · DPDP notice/consent + grievance + breach runbook · ISO 27001 path started · **subprocessor DPAs + no-train/zero-retention locked** · PHI pinned to India region · **RLS at the DB** · Telemedicine prescription rules enforced (block the prohibited list) · subprocessor register + data-flow map |
| **Phase 1 — India scale/credibility** | Trust + interoperability | ABDM integration (ABHA/HPR/HFR/HIE-CM, FHIR-aligned) · SOC 2 if going enterprise · access-audit + MFA + de-id pipeline hardened |
| **Phase 2 — first global market** | Pick ONE (likely US) | HIPAA + BAAs + SOC 2/HITRUST + US residency; then EU with GDPR + SCCs; re-run the SaMD check per market |

---

## §11 — Top risks ("don't get burned")

1. **Lock down AI/voice subprocessor terms before launch** (no-train, zero-retention, DPA/BAA). Highest-risk gap.
2. **Decide Fiduciary vs Processor and write it down** — keep AI training on de-identified data (§1).
3. **Enforce tenant isolation at the database (RLS)**, not just in query code (§6.3).
4. **Encode telemedicine prescription rules** so a prohibited drug can't go out on a remote consult (§4.2).
5. **Don't pursue HIPAA for India** — it does nothing until you have US customers.
6. **Keep the human in the loop and document it** to stay clear of medical-device regulation (§9).
7. **Write the breach runbook now**, while it's cheap.

---

## §12 — Near-term artifacts to create

- [ ] **Subprocessor register** — table of every PHI-touching vendor: data shared · region · DPA/BAA status · no-train/zero-retention confirmed. (Candidate: `docs/Reference/engineering/compliance/SUBPROCESSORS.md`.)
- [ ] **Data-flow map** — what PHI goes where, which region, which vendor (a diagram + table).
- [ ] **Incident-response / breach runbook** — with the DPDP notification timeline and roles.
- [ ] **Privacy Policy + ToS + DPA** templates, localised to DPDP by counsel.
- [ ] **Record of Processing** (RoPA-style) — purposes, categories, recipients, retention.
- [ ] Update [`COMPLIANCE.md`](../engineering/compliance/COMPLIANCE.md) product scope from "administrative only" → clinical (§2).

---

## Open questions (answer in-thread, then lock here)

- **RLS-Q1 — Fiduciary or Processor for AI training?** Lean **Processor; de-identified only** (§1). Lock before any model trains on real patient text.
- **RLS-Q2 — Launch hosting region?** Lean **India (ap-south)** for Phase 0. Lock before production data.
- **RLS-Q3 — First certification?** Lean **ISO 27001** first, SOC 2 when US enterprise appears. Lock before sales motion.
- **RLS-Q4 — ABDM timing?** Lean **Phase 1** (post-launch); FHIR-align the data model now regardless. Lock after Phase 0.
- **RLS-Q5 — Buyer / GTM wedge?** Solo RMP vs clinic vs hospital — drives auth, exports, and certification order. Lock before pricing.

---

**Created:** 2026-05-31.
**Owner:** Founder + Engineering + Compliance.
**Status:** `Draft` — strategic reference; refine with counsel.
**Relationship:** Sits above [`COMPLIANCE.md`](../engineering/compliance/COMPLIANCE.md) (engineering constraints). This file = *why/what regulations + launch journey*; `COMPLIANCE.md` = *how code satisfies them*.
