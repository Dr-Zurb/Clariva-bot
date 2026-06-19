# Objective tab catalog — exam, vitals, specialty packs (planning only)

> **Status:** Parked for later. No implementation in this note — catalog + design fork only.  
> **Captured:** 2026-06-18  
> **Backlog:** [`backlog.md`](backlog.md)  
> **Related code:** `frontend/components/cockpit/rx/sections/ObjectiveSection.tsx`, `inputs/VitalsGrid.tsx`, `lib/cockpit/exam-findings.ts`, migration 103 vitals CHECK constraints

## Why

The Subjective tab is now a structured, fast-entry, template-aware surface. **Objective is still v1 rough:** a numeric vitals grid plus three free-text areas (general exam, systemic exam, patient-brought test results). Doctors examining patients — especially in telemed — need the same playbook: structured capture, specialty defaults, templates, layout persistence, and derived output that keeps PDF/SMS/snapshot stable.

**Core principle (mirror ST-D2):** structured objective data lives in JSONB (or typed form state); legacy text columns (`examination_findings`, `vitals_text`, `test_results`) are **derived mirrors** on save — zero downstream breakage.

---

## Already shipped (do not re-list as “new”)

| Area | What exists | Storage |
|------|-------------|---------|
| Vitals grid | BP sys/dia, HR, temp °C, SpO₂, weight kg, height cm, auto BMI badge | `vitals_*` columns (migration 103) |
| General examination | Single textarea | `examination_findings` (general half) |
| Systemic examination | Single textarea | `examination_findings` (systemic half via delimiter) |
| Test results | Single textarea | `test_results` |
| Legacy vitals | Collapsed free-text input | `vitals_text` (deprecated) |

**Delimiter format today:** `{general}\n--- SYSTEMIC ---\n{systemic}` — see `lib/cockpit/exam-findings.ts`.

---

## A. Structured physical examination — candidate system cards

Replace (or augment) the two exam textareas with **system-wise exam blocks** — the Objective analog of Subjective complaint cards.

### A1 — Core systems (all specialties)

| System id | Label | Normal one-liner (chip) | Common abnormal chips |
|-----------|--------|-------------------------|------------------------|
| `general` | General | Alert, oriented, no distress | Pallor, icterus, cyanosis, edema, lymphadenopathy |
| `cvs` | Cardiovascular | HS S1+S2 normal, no murmur | Murmur, gallop, JVP raised, peripheral edema |
| `resp` | Respiratory | Chest clear, NVBS bilaterally | Wheeze, crackles, reduced AE, dullness |
| `abd` | Abdomen | Soft, non-tender, no organomegaly | Tenderness, guarding, distension, hepatosplenomegaly |
| `cns` | CNS / Neuro | Conscious, oriented, no focal deficit | GCS ↓, cranial nerve deficit, power/sensory loss |
| `msk` | Musculoskeletal | No deformity, full ROM | Tenderness, swelling, limited ROM |
| `ent` | ENT | TM normal, throat clear | Otitis, pharyngitis, nasal polyps |
| `skin` | Skin | No rash, no lesions | Rash, lesion (link to structured lesion card later) |
| `breast` | Breast | No lump, no discharge | Lump, nipple discharge |
| `pv` | Per vaginum | *(gynae only)* | — |
| `pv_speculum` | Per speculum | *(gynae only)* | — |
| `pa` | Per abdomen (obstetric) | *(obs only)* | — |

### A2 — Interaction model (per system card)

- **Normal / Abnormal** toggle (or tri-state: not examined / normal / abnormal).
- **One-tap “within normal limits”** fills the normal one-liner.
- **Chip palette** for common findings; free-text for detail when abnormal.
- **“Mark entire exam normal”** express action at section header.
- **Collapse/expand** per system (feeds P3 layout engine).

### A3 — Derived output

Serialize structured exam → `examination_findings` text for PDF/API parity (same delimiter or evolved format with version marker). Must round-trip tolerate legacy rows (delimiter-only data loads as unstructured general).

---

## B. Vitals 2.0 — candidate fields & UX

### B1 — Additional vitals

| Field | Use | Notes |
|-------|-----|--------|
| Respiratory rate (RR) | Acute, peds, resp | /min |
| Pain score (0–10) | MSK, palliative, acute | NRS |
| Random / fasting glucose (BSL) | Endo, DM | mmol/L or mg/dL display toggle |
| GCS (E/V/M or total) | Neuro, trauma | Optional structured sub-fields |
| BP posture / limb | HTN workup | Sitting/standing, L/R arm |
| Head circumference (HC) | Peds | cm |
| MUAC | Peds, nutrition | cm |
| Waist circumference | Metabolic | cm |

### B2 — UX enhancements

- **Unit toggles** — °C/°F, kg/lb, cm/in (store canonical; display preference per doctor or region).
- **Reference-range flags** — icon/color when out of age/sex-aware range (not only BMI category badge).
- **Derived values** — MAP from BP; BSA for dosing; pediatric growth percentiles when DOB + sex available.
- **Last-visit ghost values** — show prior vitals as reference while entering (carry-forward lite).

### B3 — Trends (P6)

- Sparkline per vital across visits (inbox: BMI trend chart `[cpv follow-up]`).
- Growth chart for peds (weight/height/HC percentiles).

---

## C. Implementation fork (decide before building)

| Approach | Pros | Cons |
|----------|------|------|
| **C1 — Typed JSONB exam** (like `complaints`) | Chips, templates, PDF derivation, analytics | Migration + Zod + UI per system; slower |
| **C2 — Template-seeded text + layout presets only** | Fast; reuses P7/P12 custom sections | Weak structure; PDF is prose |
| **C3 — Hybrid** | Typed vitals + typed “headline” systems (CVS/Resp/Abd/CNS); long tail via custom sections / templates | Two patterns |

**Recommendation for v1:** **C3** — typed system cards for **5 core systems** (general, CVS, resp, abd, CNS) + vitals 2.0 additions; specialty systems (gynae, ortho ROM) via **templates + custom objective sections** until demand proves typed schema.

**Derived-text contract (binding):**

- New: `examination_json` (or `objective_json`) on `prescriptions`.
- On save: derive `examination_findings` string (and keep delimiter compatibility or version tag).
- PDF composer reads derived text until structured PDF blocks ship.
- Close-gate: byte-identical PDF for legacy-only rows.

---

## D. Reuse subjective layout engines (P3)

Port the subjective-tab infrastructure with an **objective section registry**:

| Engine | Subjective precedent | Objective section ids (draft) |
|--------|-------------------|------------------------------|
| Section order | `doctor_settings.subjective_section_order` | `vitals`, `general_exam`, `system_exam` → later per-system ids, `test_results`, `point_of_care`, `custom_objective`, `media` |
| Collapse map | `subjective_section_collapsed` | `objective_section_collapsed` |
| Hidden set | `subjective_section_hidden` | `objective_section_hidden` |
| Custom sections | `custom_subsections` + doctor default | `custom_objective_sections` (or reuse same JSONB with scope flag) |
| Templates | `rx_template` scopes | `objective_full`, `vitals`, `exam_cvs`, `exam_resp`, … |

**Do not copy blindly** — objective may want fewer default sections and different collapse defaults (vitals often stays open).

---

## E. Exam templates + specialty packs

### E1 — Template scopes (draft)

| Scope | Contents |
|-------|----------|
| `objective_full` | Vitals + all examined systems + test results |
| `vitals` | Numeric vitals only |
| `exam_general` | General exam block |
| `exam_system` | All systemic systems snapshot |
| Per-system | `exam_cvs`, `exam_resp`, `exam_abd`, … |
| `custom_block` | Single custom objective section (mirror subj P12) |

### E2 — Specialty exam packs (preselected)

| Specialty | Preselect / emphasize |
|-----------|----------------------|
| **GP / medicine** | Vitals, general, CVS, resp, abd |
| **Cardiology** | Vitals (+ BP detail), CVS, peripheral pulses, JVP |
| **Pulmonology** | Vitals (+ SpO₂, RR), resp, accessory muscle use |
| **Gynaecology** | Vitals, abd, **P/V, P/S, P/A**, breast |
| **Obstetrics** | Vitals, abd, obstetric exam, fetal heart (if in scope) |
| **Paediatrics** | Vitals (+ HC, growth), general, resp, abd, developmental observation |
| **Orthopaedics** | Vitals, MSK (joint-specific), neurovascular status |
| **Dermatology** | Skin/lesion exam, dermoscopy notes |
| **ENT** | ENT systems, neck nodes |
| **Ophthalmology** | Visual acuity, anterior/posterior segment (structured later) |
| **Psychiatry** | Mental state exam (MSE) — may be separate structured block |
| **Neurology** | GCS, cranial nerves, power, reflexes, sensation, gait |

---

## F. Point-of-care & test results

Split today’s single `test_results` textarea:

| Section | Examples |
|---------|----------|
| **Patient-brought reports** | Outside labs, imaging reports patient uploaded or brought |
| **In-clinic / POC** | Urine dipstick, glucometer, rapid antigen, ECG interpretation note |
| **Pending / ordered** | *(optional — may overlap Plan/Investigations pane)* |

Structured row model (later): test name, result value, unit, date, interpretation chip (normal/high/low).

---

## G. Media & telemed (Objective-native)

| Asset | Use |
|-------|-----|
| Wound / rash photo | Derm, surgical review |
| Throat / conjunctiva photo | ENT, ophthal (patient-captured on video) |
| ECG image | Cardio |
| Report scan | OCR / attach to patient-brought results |

Ties to cockpit **history-pane photo strip** follow-up (`inbox`: Photo thumbnail strip in Subjective pane — may belong under Objective instead).

**Modality-aware sections:**

| Consult type | Default emphasis |
|--------------|------------------|
| In-person / OPD | Full exam systems |
| Video | Observed on video (general appearance, resp effort, visible lesions), home vitals |
| Voice / async | Patient-reported measurements + uploaded reports only |

---

## H. Quick entry & carry-forward

| Feature | Subjective precedent |
|---------|-------------------|
| Carry-forward last visit | `CarryForwardButton` |
| Chip insert into exam text | `insertHistoryChip` pattern |
| “Normal exam” macro | One click fills all systems normal |
| Dictation / parse | Deferred AI parse (compliance gate — same as subj-14) |

---

## I. Open questions (triage before daily-plan)

- [ ] Single `objective_json` blob vs separate `examination_json` + extended vitals columns?
- [ ] Mental state exam (psych) — part of Objective or Assessment?
- [ ] Investigations ordered — stay in Plan pane only, or surface “pending results” in Objective?
- [ ] Photo strip — Objective pane vs Subjective vs shared Media pane?
- [ ] Region-specific vitals (e.g. India: prefer °C, kg, cm; smokeless tobacco not relevant here but MUAC might be)?
- [ ] Pediatric percentiles — require growth chart data source (WHO/CDC/Fenton)?
- [ ] Close-gate: match subjective `subj-10` byte-parity tests for `examination_findings` derivation?

---

## J. Promotion path (when ready)

1. Triage this note → new product plan `plan-objective-tab.md` under `docs/Work/Product plans/ehr/`.
2. Pick v1 scope: **P1 structured exam (5 systems) + P2 vitals RR/pain/glucose** is a strong MVP.
3. Decide C1/C2/C3 and modality defaults before migration.
4. Add `docs/Work/Daily-plans/.../objective-tab/` with execution-order tasks (`obj-01` prefix suggested).
5. Reuse subjective utilities where possible — do not fork reorder/collapse/visibility logic.

**Subjective tab program (reference):** [`../../Daily-plans/June 2026/03-06-2026/subjective-tab/`](../../Daily-plans/June%202026/03-06-2026/subjective-tab/)
