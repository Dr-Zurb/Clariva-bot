# Subjective section catalog — specialty presets (planning only)

> **Status:** Parked for later. No implementation in this note — catalog + design fork only.  
> **Captured:** 2026-06-18  
> **Backlog:** [`backlog.md`](backlog.md) · **Program:** [`../../Daily-plans/June 2026/03-06-2026/subjective-tab/`](../../Daily-plans/June%202026/03-06-2026/subjective-tab/)  
> **Related code:** `frontend/lib/cockpit/subjective-section-order.ts`, Phase 8–12 subjective-tab batches

## Why

Doctors take history differently by specialty and personal habit. Today the Subjective tab has a **fixed generalist spine** plus **doctor-defined custom sections**. Later we want:

1. A **broader catalog** of first-class or template-seeded history sections.
2. **Specialty-based defaults** — e.g. a gynaecologist sees menstrual + obstetric sections pre-selected.
3. **Per-doctor overrides** on top of specialty presets (order, visibility, collapse already ship in P8–P10).

## Already shipped (do not re-list as “new”)

| Section id | Label | Notes |
|---|---|---|
| `chief_complaints` | Chief complaints | Structured complaint cards (OLDCARTS) |
| `patient_background` | Patient background | Linked chart: PMH (POMR) + past surgical |
| `allergies` | Allergies | Linked chart |
| `past_surgical` | Past surgical history | Standalone when chart not linked |
| `family_history` | Family history | Structured + free text |
| `social_history` | Social / personal history | Rich clusters: substances, occupation, living, sleep, stress, sexual, travel, sick contact, wellbeing |
| `free_text_notes` | Free-text notes | Optional catch-all |
| `custom_subsections` | Custom sections | Doctor-defined headings + nested children; templates in P12 |

**Social history sub-clusters already in product** (inside `social_history`, not separate sections today): smoking, smokeless tobacco, alcohol, occupation + exposures, living situation, sleep, stress, sexual history, travel, sick contact, wellbeing.

---

## A. Generic sections — candidate additions (all specialties)

Use when expanding beyond the current spine. Each row is a **candidate top-level section** unless noted as a sub-cluster.

| # | Section | Captures | Priority | Notes |
|---|---|---|---|---|
| A1 | History of presenting illness (HPI) | Narrative / structured expansion of chief complaint | High | May overlap complaint cards — decide merge vs split |
| A2 | Review of systems (ROS) | System-by-system screen | High | Usually chip/checklist driven; large surface |
| A3 | Medication history (standalone) | Current meds, adherence, OTC, supplements | Medium | Partly in PMH today — split vs duplicate |
| A4 | Immunization / vaccination | Routine, travel, COVID/flu, childhood schedule | Medium | Cross-cutting (peds, travel, geriatrics) |
| A5 | Treatment / drug history | Prior treatments tried, response, adverse effects | Medium | Chronic disease, derm, psych |
| A6 | Nutritional / dietary history | Diet pattern, restrictions, appetite, weight change | Medium | GI, endo, renal, peds |
| A7 | Functional status / ADL | Mobility, independence, aids, caregiver support | Medium | Geriatrics, rehab, neuro |
| A8 | Psychiatric / mental health screen | Mood, anxiety, sleep, prior psych care, risk | Medium | Cross-cutting; overlap with social wellbeing |
| A9 | Pain history | Site, severity, character, triggers, relief | Medium | Pain, ortho, palliative |
| A10 | Red-flag / alarm symptoms | Danger signs by presentation | Low | Safety net; often complaint-scoped |
| A11 | Exposure history | Occupational, environmental, animal/insect, chemical | Low | Pulm, derm, ID; partial overlap social occupation |
| A12 | Developmental history | Milestones, schooling, behaviour | Low | Primarily peds; could live in peds pack only |
| A13 | Menstrual / reproductive screen (generic) | LMP, cycle, fertility intent | Low | Generic stub; full detail in gynae pack |

---

## B. Specialty packs — preselected section sets

Each pack = **visible + ordered** subset of catalog + specialty-only sections. Hidden sections remain available via Section Manager (P10).

### B1 — General medicine / GP (default baseline)

**Show:** chief complaints, patient background, allergies, family history, social history, free-text notes  
**Often hidden:** past surgical (if inside patient background), ROS, custom sections until doctor adds  
**Optional add:** A2 ROS, A3 medication history, A6 nutrition

### B2 — Gynaecology / obstetrics

**Preselect (specialty-only):**

| Section | Captures |
|---|---|
| Menstrual history | LMP, cycle length/regularity, flow, dysmenorrhea, intermenstrual bleeding |
| Obstetric history | G/P/L/A, deliveries, complications, mode, outcomes |
| Antenatal history | EDD, gravida details, dating scan, high-risk flags |
| Contraceptive history | Method, duration, side effects, intent |
| Cervical / breast screening | Pap, HPV, mammogram, self-exam, last dates |
| Gynae symptom screen | PV discharge, dyspareunia, pelvic pain, urinary symptoms |

**Also show from generic:** chief complaints, allergies, PMH, family history, social (sexual cluster), free-text  
**Often hide:** past surgical (unless relevant), ROS (unless internal medicine crossover)

### B3 — Paediatrics

| Section | Captures |
|---|---|
| Birth / perinatal history | Antenatal, natal, postnatal, NICU |
| Developmental milestones | Motor, speech, social, schooling |
| Immunization history | Schedule, catch-up, refusals |
| Feeding / nutrition | Breast/bottle, weaning, growth concerns |
| Growth history | Weight/height trend, percentiles |

**Also show:** chief complaints, allergies, family history, social (living, sick contact), free-text

### B4 — Psychiatry

| Section | Captures |
|---|---|
| Personal history | Birth order, schooling, occupation, relationships |
| Premorbid personality | Baseline temperament, coping |
| Detailed substance use | Beyond social cluster — pattern, withdrawal, treatment |
| Forensic / legal history | Prior admissions, legal issues (where appropriate) |
| Psychiatric symptom timeline | Onset, course, prior episodes, hospitalizations |

**Also show:** chief complaints, family history, social history, free-text

### B5 — Cardiology

| Section | Captures |
|---|---|
| Cardiac risk factors | HTN, DM, lipids, smoking, family CAD |
| Functional class / exercise tolerance | NYHA, angina pattern, exertional symptoms |

**Also show:** chief complaints, PMH, meds, family history, social (smoking), free-text

### B6 — Pulmonology / respiratory

| Section | Captures |
|---|---|
| Respiratory symptom screen | Cough, sputum, wheeze, haemoptysis |
| Smoking / pack-years | May extend social smoking cluster |
| Occupational / environmental exposure | Dust, biomass, birds, mould |
| Breathlessness grade | mMRC or equivalent |

**Also show:** chief complaints, PMH, allergies, family history, free-text

### B7 — Endocrinology / diabetes

| Section | Captures |
|---|---|
| Diabetes history | Onset, type, control, monitoring |
| Complication screen | Foot, eye, renal, neuropathy |
| Thyroid / endocrine symptom screen | As needed |

**Also show:** chief complaints, PMH, meds, family history, nutrition, free-text

### B8 — Gastroenterology

| Section | Captures |
|---|---|
| Bowel habit | Frequency, consistency, blood, mucus |
| GI symptom screen | Pain, reflux, nausea, weight change |
| Dietary triggers | Alcohol detail, spicy/fatty, lactose |

**Also show:** chief complaints, PMH, surgical, family history (IBD/CRC), free-text

### B9 — ENT

| Section | Captures |
|---|---|
| Hearing / vertigo / tinnitus | Onset, laterality, triggers |
| Nasal / sinus symptoms | Discharge, obstruction, smell |
| Throat / voice | Hoarseness, odynophagia |

### B10 — Ophthalmology

| Section | Captures |
|---|---|
| Vision history | Onset, laterality, correction, last refraction |
| Ocular surgery / trauma | Procedures, injuries |
| Systemic associations | DM, HTN, steroids |

### B11 — Dermatology

| Section | Captures |
|---|---|
| Lesion history | Onset, spread, itch, bleed, sun exposure |
| Topical / systemic treatment tried | Response |
| Allergy / contact exposure | Cosmetics, occupational |

### B12 — Orthopaedics / MSK

| Section | Captures |
|---|---|
| Injury mechanism | Trauma, sport, fall |
| Functional limitation | Work, sport, ADL |
| Prior imaging / intervention | Surgeries, injections |

**Also show:** pain history (A9), PMH, meds, free-text

### B13 — Nephrology / urology

| Section | Captures |
|---|---|
| Urinary symptoms | Frequency, hesitancy, haematuria, incontinence |
| Fluid / dialysis history | If applicable |
| Stone / UTI history | Recurrence, procedures |

### B14 — Oncology (symptom-focused subjective)

| Section | Captures |
|---|---|
| Cancer treatment history | Chemo, RT, surgery, lines of therapy |
| Symptom / toxicity screen | Nausea, fatigue, neuropathy |
| Support / functional status | ADL, caregiver |

---

## C. Implementation fork (decide before building)

| Approach | Pros | Cons |
|---|---|---|
| **C1 — First-class structured sections** (like `social_history`) | Typed data, chips, PDF derivation, templates per scope | Migration + schema + UI per section; slow to add many |
| **C2 — Specialty preset = order + visibility + seeded custom templates** (P7/P12) | Ships fast; no new JSONB columns; doctors can edit | Weaker structure; PDF is free-text blocks |
| **C3 — Hybrid** | High-value sections typed (gynae menstrual, obs G/P); long tail via custom templates | Two patterns to maintain |

**Recommendation for v1 of specialty presets:** **C3** — typed packs for 3–5 high-value specialties (gynae, peds, psych); everything else via **C2** seeded custom-section templates from `doctor_settings.specialty`.

**Wiring sketch (later):**

- Source specialty from existing doctor/practice profile.
- Apply preset once: `subjective_section_order` + `subjective_section_hidden` + seed `doctor_settings` custom subsections default.
- Doctor overrides persist on top (P8–P10 already store per-doctor layout).
- Optional: “Reset to specialty default” in Section Manager.

---

## D. Open questions (triage before a daily-plan)

- [ ] Is HPI (A1) separate from complaint cards or an expanded card view?
- [ ] Split medication history out of PMH or keep nested under patient background?
- [ ] ROS (A2) — full 12-system vs complaint-driven subset?
- [ ] Which specialties get **typed** sections vs **template-only** in v1?
- [ ] Region-specific packs (e.g. India OPD: sick contact, smokeless tobacco already in social)?
- [ ] Female / male / child visit-type variants within gynae (ANC vs gynae OPD)?

---

## E. Promotion path (when ready)

1. Triage this note → product plan amendment or new Phase 13+ batch under `subjective-tab/`.
2. Pick v1 specialties (suggest: **gynae**, **GP**, **peds**).
3. Decide C1/C2/C3 per section in v1 scope.
4. Add execution-order task files — **do not** start until Phase 12 close-gate and specialty field exist on doctor profile.
