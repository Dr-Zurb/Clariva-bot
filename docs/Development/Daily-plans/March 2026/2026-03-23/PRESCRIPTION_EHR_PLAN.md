# Prescription & EHR-Lite — Feature Plan

**Status:** 📝 **PLANNING** (Living document — will be updated through discussions)  
**Created:** 2026-03-24  
**Location:** Post video consultation — below video call UI; doctor creates prescription and sends to patient

---

## 🎯 Goal

After completing a video call, the doctor can:
1. Create a **structured prescription** (SOAP + medications) — digital documentation
2. OR upload a **photo** of their handwritten prescription (parchi / letterhead)
3. OR do **both** — structured note + attached handwritten image
4. **Send** the prescription to the patient (Instagram DM, email)
5. **Store** prescriptions under the patient — viewable in patient history; previous prescriptions visible when seeing the same patient again

---

## 🏥 SOAP Structure (Clinical Note Framework)

SOAP is the standard clinical documentation format. **S, O, A, P** are the four major headings. Each heading contains specific sub-fields.

### 1. Subjective (S)

*Patient-reported information — what the patient says and feels.*

| Sub-field | Description | Data type |
|-----------|-------------|-----------|
| **Chief Complaint (CC)** | Brief statement: why patient is seeking care (e.g. "chest pain", "fever 3 days") | Text |
| **History of Present Illness (HPI / HOPI)** | Elaboration on CC. Often organised by **OLDCARTS**: | Text |
| ↳ *Onset* | When did it begin? | — |
| ↳ *Location* | Where is it? | — |
| ↳ *Duration* | How long? | — |
| ↳ *Character* | How does patient describe it? | — |
| ↳ *Alleviating / Aggravating* | What makes it better/worse? | — |
| ↳ *Radiation* | Does it spread? | — |
| ↳ *Temporal* | Worse at certain time of day? | — |
| ↳ *Severity* | Scale 1–10 | — |
| **Past Medical History (PMH)** | Relevant current/past conditions | Text |
| **Past Surgical History (PSH)** | Surgeries (year, if known) | Text |
| **Family History (FH)** | Relevant family medical history | Text |
| **Social History (SH)** | Lifestyle, occupation, habits (smoking, alcohol, etc.) | Text |
| **Review of Systems (ROS)** | System-based symptom checklist — see [ROS Systems](#ros-systems) below | Text / checkbox |

#### ROS Systems (common categories)

*Subjective symptom review — patient reports by system.*

- General (weight change, fatigue, fever)
- HEENT (head, eyes, ears, nose, throat)
- Cardiovascular
- Respiratory
- Gastrointestinal
- Genitourinary
- Musculoskeletal
- Skin
- Neurological
- Psychiatric
- Endocrine
- Hematologic
- Allergic / Immunologic

| Sub-field | Description | Data type |
|-----------|-------------|-----------|
| **Current Medications** | What patient is already taking | List / Text |
| **Allergies** | Drug, food, other allergies — **critical for safety** | Text |

---

### 2. Objective (O)

*Measurable, observable findings — what the doctor observes and measures.*

| Sub-field | Description | Data type |
|-----------|-------------|-----------|
| **Vital signs** | BP, pulse, temp, RR, SpO₂, height, weight, BMI | Structured |
| **Physical examination** | Findings by body system — see [Systems Exam](#systems-exam) | Text / structured |
| **Lab results** | If available (from prior tests or ordered) | Text / link |
| **Imaging** | If available | Text / link |

#### Vital signs (suggested fields)

- Blood pressure (systolic / diastolic mmHg)
- Heart rate (bpm)
- Temperature (°C, with method if relevant)
- Respiratory rate
- SpO₂ (on room air / supplemental O₂)
- Height, weight, BMI (optional)

#### Systems exam (Objective)

*What the doctor objectively checks — by body system. For teleconsultation, many may be "not examined" or "NA" (video limits physical exam).*

| System | Example findings |
|--------|------------------|
| General | Appearance, distress |
| HEENT | Head, eyes, ears, nose, throat |
| Cardiovascular | Heart sounds, peripheral pulses |
| Respiratory | Chest auscultation, breathing |
| Gastrointestinal | Abdomen, bowel sounds |
| Genitourinary | If relevant |
| Musculoskeletal | Joints, range of motion |
| Skin | Rash, lesions |
| Neurological | Mental status, reflexes (if assessable) |
| Psychiatric | Mood, affect (if relevant) |

*Note: For video consult, doctor may document "Not examined — video" or abbreviated findings. Flexibility for telemedicine context.*

---

### 3. Assessment (A)

*Synthesis of S + O → clinical impression and diagnosis.*

| Sub-field | Description | Data type |
|-----------|-------------|-----------|
| **Provisional diagnosis** | Working diagnosis | Text |
| **Final diagnosis** | Confirmed diagnosis (if different) | Text |
| **Differential diagnosis** | Other possibilities, from most to least likely | Text |
| **Problem list** | List of problems in order of importance | List / Text |
| **Clinical reasoning** | Brief explanation of assessment (optional) | Text |

---

### 4. Plan (P)

*Actions to take — treatment, investigations, follow-up.*

| Sub-field | Description | Data type |
|-----------|-------------|-----------|
| **Medications** | Prescribed drugs — see [Medication structure](#medication-structure) | Structured list |
| **Investigations** | Labs, imaging ordered | Text / list |
| **Referrals** | Specialist referrals | Text |
| **Follow-up** | When to return, for what | Text |
| **Patient education** | Advice, lifestyle, coping | Text |
| **Clinical notes** | Any additional plan notes | Text |
| **Monitoring** | What to track, frequency | Text |

#### Medication structure (per medicine)

| Field | Example |
|-------|---------|
| Medicine name | Paracetamol |
| Dosage | 500 mg |
| Route | Oral, topical, IV, etc. |
| Frequency | BD, TDS, QID, SOS, etc. |
| Duration | 5 days, 2 weeks, etc. |
| Instructions | After food, at bedtime, etc. |

---

## 📷 Photo Upload (Parchi / Handwritten)

*For doctors who prefer handwritten prescriptions on their own letterhead.*

| Feature | Description |
|---------|-------------|
| **Upload** | One or multiple images (prescription, lab reports, referral letters) |
| **Storage** | Secure storage (Supabase Storage); path in DB |
| **Display** | Thumbnail + full view in patient history |
| **Delivery** | Send image(s) to patient via DM / email |

**Modes:**
- **Photo only** — Doctor uploads handwritten prescription; no structured template
- **Structured + photo** — Doctor fills template AND attaches photo (e.g. letterhead scan, lab)

---

## 🗄️ Data Model (Proposed)

### Tables

```
prescriptions
├── id (UUID, PK)
├── appointment_id (FK → appointments)
├── patient_id (FK → patients) — denormalized for queries
├── doctor_id (FK → auth.users)
├── type: 'structured' | 'photo' | 'both'
├── created_at, updated_at
├── sent_to_patient_at (TIMESTAMPTZ, nullable)
│
├── -- Subjective
├── cc (TEXT)
├── hopi (TEXT)
├── pmh (TEXT)
├── psh (TEXT)
├── family_history (TEXT)
├── social_history (TEXT)
├── ros (TEXT or JSONB — system-wise)
├── current_medications (TEXT)
├── allergies (TEXT)
│
├── -- Objective
├── vitals (JSONB — bp, pulse, temp, etc.)
├── physical_exam (TEXT or JSONB — by system)
├── lab_results (TEXT)
├── imaging (TEXT)
│
├── -- Assessment
├── provisional_diagnosis (TEXT)
├── final_diagnosis (TEXT)
├── differential_diagnosis (TEXT)
├── problem_list (TEXT or JSONB)
│
└── -- Plan (except meds — separate table)
    ├── investigations (TEXT)
    ├── referrals (TEXT)
    ├── follow_up (TEXT)
    ├── patient_education (TEXT)
    ├── clinical_notes (TEXT)
    └── monitoring (TEXT)

prescription_medicines
├── id (UUID, PK)
├── prescription_id (FK)
├── medicine_name (TEXT)
├── dosage (TEXT)
├── route (TEXT)
├── frequency (TEXT)
├── duration (TEXT)
├── instructions (TEXT)
└── sort_order (INT)

prescription_attachments  — photos (handwritten, labs, etc.)
├── id (UUID, PK)
├── prescription_id (FK)
├── file_path (TEXT) — Supabase Storage path
├── file_type (TEXT)
├── uploaded_at
└── caption (TEXT, optional)
```

---

## 📍 UI Placement

**Location:** Appointment detail page, below video call section, in "Post-consultation" block (alongside/existing Mark Completed).

```
┌─────────────────────────────────────────────────────────────────┐
│ Post-consultation                                                │
├─────────────────────────────────────────────────────────────────┤
│ Prescription & clinical note                                      │
│                                                                  │
│ Entry mode: ○ Structured   ○ Photo only   ○ Both                 │
│                                                                  │
│ ── If structured or both ──                                      │
│                                                                  │
│ ▾ Subjective                                                     │
│   CC:        [________________________________________]           │
│   HOPI:      [________________________________________]           │
│   [PMH] [PSH] [FH] [SH] [ROS] [Current meds] [Allergies]        │
│                                                                  │
│ ▾ Objective                                                      │
│   Vitals:    [BP] [Pulse] [Temp] [SpO₂] [Wt] [Ht]                │
│   Physical exam (by system): [________________________]          │
│                                                                  │
│ ▾ Assessment                                                     │
│   Provisional diagnosis: [________________________]               │
│   Differential:          [________________________]              │
│                                                                  │
│ ▾ Plan                                                           │
│   Medications: [+ Add]                                            │
│     • Paracetamol 500mg | Oral | BD | 5d | After food [x]        │
│   Investigations: [________________________]                      │
│   Follow-up:     [________________________]                       │
│   Patient education: [________________________]                   │
│                                                                  │
│ ── Attach photo(s) ──                                             │
│ [📷 Upload handwritten prescription / lab / referral]           │
│ [img1] [img2]                                                     │
│                                                                  │
│ [Save draft]  [Save & send to patient]  [Mark completed]          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 👤 Patient History — Previous Prescriptions

| Location | Purpose |
|----------|---------|
| **Patient profile** | "Prescriptions" tab — chronological list of all prescriptions for that patient |
| **Appointment detail** | "Previous prescriptions for this patient" — last 2–3, link to view all |
| **When writing new Rx** | Option to "Copy from previous" or reference last visit |

---

## 📤 Delivery to Patient

| Channel | Use |
|---------|-----|
| Instagram DM | Primary for many patients; send summary or image |
| Email | When patient email available |
| PDF | Optional — generate PDF of structured prescription |
| Secure link | Optional — patient views prescription via tokenised URL |

---

## 📋 Version Roadmap (V1 / V2 / V3)

*Prioritised by "sufficient for basic work" (V1) vs. enhanced UX (V2) vs. AI & advanced (V3).*

---

### V1 — MVP (Sufficient for Basic Work)

*Minimum viable prescription workflow. Launch with this.*

| Feature | Description |
|---------|-------------|
| **Structured template (core)** | CC, HOPI, Assessment (diagnosis), Plan — essential SOAP fields only |
| **Medications** | Add medicines: name, dosage, route, frequency, duration, instructions |
| **Photo upload** | Upload handwritten prescription (parchi / letterhead); store in Supabase |
| **Dual mode** | Structured only / Photo only / Both — doctor chooses |
| **Storage** | Prescription stored under patient; linked to appointment |
| **Previous prescriptions** | Last 2–3 visible on appointment view; link to view all |
| **Send to patient** | DM (Instagram), email — deliver prescription / image to patient |
| **Save draft** | Save without sending; edit later |
| **Mark completed** | Integrate with existing Mark Completed flow |

*Out of scope for V1:* Full SOAP (all sub-fields), drug checks, PDF, AI, formulary.

---

### V2 — Enhanced

*Better UX, safety, and documentation — implement after V1 is stable.*

| Feature | Description | Notes |
|---------|-------------|------|
| **Full SOAP template** | All sub-fields: PMH, PSH, FH, SH, ROS, vitals, systems exam, differential, etc. | Collapsible sections; many optional for teleconsult |
| **Allergy check** | Warn when prescribed drug matches patient allergies | Critical for safety; use stored allergies + manual entry |
| **Drug interaction check** | Basic drug–drug interaction alerts | Integrate DICP/MedCLIK or similar India APIs; flag major interactions |
| **Medicine formulary** | Search/autocomplete medicines (25k+ brands, generics) | Reduces typos; standardises names |
| **Copy from previous** | "Copy from last prescription" for repeat visits | Saves time; doctor reviews and edits |
| **Patient prescriptions tab** | Full chronological list on patient profile | View, filter, search |
| **PDF generation** | Generate downloadable PDF of structured prescription | Professional format; letterhead-style |
| **Clinical notes** | Free-text clinical notes in Plan | Already in data model; expose in UI |
| **Investigations & follow-up** | Structured fields for labs ordered, follow-up date | Plan section |

---

### V3 — AI & Advanced

*AI-powered documentation and smarter prescribing — future roadmap.*

| Feature | Description | Research / References |
|---------|-------------|------------------------|
| **AI scribe** | Transcribe consultation → draft SOAP (CC, HOPI, assessment) | MD Voice, Scribeable, NoteV — voice → SOAP in 60s; ~3 hr/day saved |
| **Auto-fill from conversation** | If consultation recorded: extract CC, HOPI, medications mentioned | Elation Note Assist, Buzzi.ai — real-time capture during visit |
| **Smart medication suggestions** | Suggest common regimens for diagnosis (e.g. URTI → paracetamol, antihistamine) | OrderAssist (CarePilot) — pre-fills from formulary + problem list |
| **Real-time drug interaction alerts** | Warn while typing medication (before adding) | Docsarthi, MedCLIK — India formulary + interaction DB |
| **Draft prescription from chat** | If patient chatted symptoms pre-call: use as HOPI seed | Unique to Clariva; bot context as input |
| **Templates by specialty** | Pre-built SOAP templates (e.g. general, dermatology, psychiatry) | Reduces blank-page friction |
| **ICD-10 / diagnosis codes** | Optional coding for billing / analytics | CarePilot, CureMD — auto-coding from note |
| **After-visit summary (AVS)** | Patient-friendly summary generated from SOAP | Scribeable — linked to clinical note |

*Considerations:* HIPAA/PHI compliance, cost of AI APIs, doctor trust in AI output (review before save).

---

### V4+ — Future / Integration

*Larger ecosystem integrations — defer until product-market fit.*

| Feature | Description |
|---------|-------------|
| **E-prescribing to pharmacy** | Send prescription directly to pharmacy (India ecosystem still evolving) |
| **Lab order integration** | Order labs; receive results in patient chart |
| **Patient portal** | Patient logs in to view prescriptions; download PDF |
| **Medication adherence reminders** | Remind patient to take meds (SMS/WhatsApp) |
| **Controlled substances (EPCS)** | If prescribing scheduled drugs — regulatory compliance |

---

## 🔄 Implementation Phases (Aligned to V1)

| Phase | Scope | Version | Status |
|-------|-------|---------|--------|
| **1** | Migrations (prescriptions, prescription_medicines, prescription_attachments), basic API | V1 | Not started |
| **2** | Structured form UI (core: CC, HOPI, assessment, plan, meds), save to DB | V1 | Not started |
| **3** | Photo upload + Supabase Storage, display in UI | V1 | Not started |
| **4** | Send to patient (DM, email) | V1 | Not started |
| **5** | Previous prescriptions on appointment view; link to list | V1 | Not started |
| **6** | Full SOAP template (all sub-fields), collapsible sections | V2 | Not started |
| **7** | Allergy check, drug interaction check (basic) | V2 | Not started |
| **8** | Medicine formulary / autocomplete | V2 | Not started |
| **9** | PDF generation, copy from previous | V2 | Not started |
| **10** | AI scribe / draft from conversation (if feasible) | V3 | Not started |

---

## 📝 Discussion Notes

_Use this section to capture decisions, open questions, and refinements from discussions._

- 


---

## 🔗 Related

- [Consultation Verification v2](./e-task-4-try-mark-verified-who-left-first.md)
- [MarkCompletedForm](../../../../frontend/components/consultation/MarkCompletedForm.tsx)
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md) — PHI, audit
- StatPearls: [SOAP Notes](https://www.ncbi.nlm.nih.gov/books/NBK482263/)

---

## 📚 Research References (V2 / V3 Features)

| Topic | Source |
|-------|--------|
| AI medical scribe, voice → SOAP | MD Voice, Scribeable, NoteV, CureMD |
| AI prescription drafting | OrderAssist (CarePilot), Elation Note Assist, Buzzi.ai |
| Drug interaction (India) | DICP (MSPC), MedCLIK, eMedify, Docsarthi |
| India e-prescription | Docsarthi, Prescribon (formulary, interaction checks) |
| EHR e-prescribing features | Tebra, Vozo, Veradigm ePrescribe |

---

**Last Updated:** 2026-03-24
