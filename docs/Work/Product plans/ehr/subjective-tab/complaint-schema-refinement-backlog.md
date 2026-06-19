# Chief complaint schema refinement backlog

> **Purpose:** Living list of the most common patient-language chief complaints in Indian
> GP / OPD practice. Refine them **one at a time** — field labels, chip vocabularies,
> name-prefill defaults, parser tokens, and catalog synonyms.
>
> **Catalog source:** `backend/migrations/120_complaint_master_patient_language.sql`
> (+ `121`–`124` additions). **Schema code:**
> `frontend/lib/cockpit/complaint-schema.ts` · **Parser:**
> `frontend/lib/cockpit/parse-complaint-text.ts`
>
> **Created:** 2026-06-07 · **Status:** Active backlog (post subj-13/14)

---

## How to use this file

1. Pick the next item from **Suggested execution order** (or your clinic's top presenter).
2. Open the card in the app; note what feels wrong (contradicting chips, missing fields,
   medical words in the name, parser gaps).
3. For each item, decide:
   - **Bespoke override** (`COMPLAINT_SCHEMA_OVERRIDES_BY_NAME`) — when the name is
     specific and the category schema contradicts it (e.g. "Ear discharge" + "Discharge: none?").
   - **Category schema tweak** — when the whole family needs the same fields (e.g. all fever).
   - **Name-prefill only** — when the name already states a chip value (`Dry cough` → Type: dry).
   - **Catalog / synonym** — patient search phrases only; never shown in the dropdown.
4. Check off the item when shipped; add a one-line note under **Refinement log** at the bottom.

### Status legend

| Tag | Meaning |
|-----|---------|
| ✅ | **Bespoke override** — dedicated field list in `complaint-schema.ts` |
| 🟡 | **Category schema** — shared fields (pain / fever / cough / …); refine the category or add override |
| ⚪ | **Default (de-pained)** — generic Onset / Duration / Site / Severity; highest gap vs clinical need |
| 🔲 | Not yet refined in this backlog pass |

---

## Already bespoke (reference — do not regress)

These have name-keyed overrides today. Touch only when deliberately improving.

| Complaint cluster | Override schema |
|-------------------|-----------------|
| Headache / Migraine | `HEADACHE_FIELDS` |
| Heartburn / Acidity / Indigestion / Reflux / Gas trouble | `DYSPEPSIA_FIELDS` |
| Bite / Sting | `BITE_FIELDS` |
| Burn / Scald | `BURN_FIELDS` |
| Wound / Injury / Fracture / Sprain / Fall | `INJURY_FIELDS` |
| Vomiting | `VOMITING_FIELDS` |
| Constipation | `CONSTIPATION_FIELDS` |
| Sore throat / Hoarse voice | `THROAT_FIELDS` |
| Fainting / Loss of consciousness | `SYNCOPE_FIELDS` |
| Ringing in ears | `TINNITUS_FIELDS` |
| Ear discharge | `EAR_DISCHARGE_FIELDS` |
| Eye discharge / Sticky eyes | `EYE_DISCHARGE_FIELDS` |
| Vaginal / White discharge | `VAGINAL_DISCHARGE_FIELDS` |
| Nosebleed | `NOSEBLEED_FIELDS` |
| Something in eye / ear | `FOREIGN_BODY_FIELDS` |
| Blurred / Double vision | `VISION_FIELDS` |
| Hearing loss | `HEARING_LOSS_FIELDS` |
| Missed periods | `MISSED_PERIODS_FIELDS` |

**Pain category extras (not overrides):** 9-region abdomen grid, 0–10 pain scale + severity
bands, body-part laterality chips.

---

## Tier 1 — Bread-and-butter (every GP, every day)

Highest visit volume; refine these first.

| # | Complaint (catalog name) | Category | Status | Current fields (summary) | Known gaps / notes |
|---|--------------------------|----------|--------|--------------------------|-------------------|
| T1-01 | Fever | fever | ✅ 🟡 | Duration, Measured, Reported by (felt only), Temperature, Pattern, Chills | Felt only → grade + Patient/Attendant/Clinician; no exact temp |
| T1-02 | High fever / Mild fever | fever | ✅ 🟡 | Same as Fever | Name-prefill `feverGrade` (high / mild) |
| T1-03 | Fever with chills / Fever with shivering | fever | 🔲 🟡 | Same + chills prefill | — |
| T1-04 | Fever that comes and goes / Continuous fever | fever | 🔲 🟡 | Pattern prefill from name | — |
| T1-05 | Cough | cough | 🔲 🟡 | Type, Duration, Sputum, Worse, Notes | — |
| T1-06 | Dry cough / Cough with phlegm / Cough with blood | cough | 🔲 🟡 | Type/Sputum prefill from name | Blood → sputum chip |
| T1-07 | Night cough / Morning cough / Barking cough | cough | 🔲 🟡 | Worse/timing prefill | — |
| T1-08 | Cold / Cold and cough | cough | 🔲 🟡 | Cough schema (not URI-specific) | Consider URI override or ENT merge |
| T1-09 | Blocked nose / Runny nose / Sneezing | ent/cough | 🔲 🟡 | ENT: discharge colour, obstruction | Blocked/runny name-prefill exists |
| T1-10 | Sore throat | — | ✅ | Throat, Voice, Duration, … | Review only |
| T1-11 | Headache / Migraine | — | ✅ | Side, Where on head, SOCRATES, pain scale | Review only |
| T1-12 | Body ache | pain | 🔲 🟡 | Pain OLDCARTS + scale | No laterality — OK? |
| T1-13 | Loose stools | git | 🔲 🟡 | Onset, Duration, Episodes/day, Consistency | Blood/mucus, dehydration, travel |
| T1-14 | Vomiting | — | ✅ | Content, blood, duration, … | Review only |
| T1-15 | Stomach pain | pain | 🔲 🟡 | Abdomen 9-grid, SOCRATES, pain scale | Done for grid; refine chips |
| T1-16 | Acidity / Heartburn / Indigestion | — | ✅ | Dyspepsia schema | Review only |
| T1-17 | Weakness / Tiredness | default | 🔲 ⚪ | Onset, Duration, Site, Severity | Too generic — fatigue schema? |
| T1-18 | Nausea | default | 🔲 ⚪ | Generic default | Often paired with GIT — routing? |

---

## Tier 2 — Very common, specialty-relevant

| # | Complaint (catalog name) | Category | Status | Current fields (summary) | Known gaps / notes |
|---|--------------------------|----------|--------|--------------------------|-------------------|
| T2-01 | Chest pain | pain | 🔲 🟡 | Laterality (L/R/Central), SOCRATES, pain scale | Cardiac red flags, radiation |
| T2-02 | Chest discomfort | cardiac | 🔲 🟡 | Cardiac schema | Overlap with chest pain |
| T2-03 | Shortness of breath | respiratory | 🔲 🟡 | Onset, duration, pattern | Exertional, orthopnea, wheeze |
| T2-04 | Wheezing | respiratory | 🔲 🟡 | Respiratory schema | Often associated, not main CC |
| T2-05 | Burning urination | urinary | 🔲 🟡 | Character, frequency, … | UTI schema; character prefill |
| T2-06 | Frequent urination | urinary | 🔲 🟡 | Frequency prefill | Diabetes overlap |
| T2-07 | Back pain / Lower back pain | pain | 🔲 🟡 | Upper/Mid/Lower laterality | Sciatica words in synonyms only |
| T2-08 | Knee pain / Joint pain | pain | 🔲 🟡 | L/R/Both, SOCRATES, scale | Swelling, locking, injury |
| T2-09 | Dizziness | dizziness | 🔲 🟡 | Type, duration, … | vs Vertigo override |
| T2-10 | Spinning sensation | dizziness | 🔲 🟡 | Character prefill: spinning | — |
| T2-11 | Heart racing | cardiac | 🔲 🟡 | Onset, triggers, … | Palpitation duration |
| T2-12 | Constipation | — | ✅ | Bowel frequency, … | Review only |
| T2-13 | Ear pain | pain | 🔲 🟡 | Pain schema | Discharge/hearing cross-fields |
| T2-14 | Ear discharge | — | ✅ | Discharge type, ear pain, hearing | Review only |
| T2-15 | Blocked ear | ear | 🔲 🟡 | Ear category (migration 124) | Fullness vs hearing loss |
| T2-16 | Red eye / Watering eye | eye | 🔲 🟡 | Vision affected, discharge, … | vs Eye discharge override |
| T2-17 | Eye discharge / Itchy eyes | eye/override | 🔲 ✅/🟡 | Discharge override; itchy = eye cat | Itchy eyes → allergy fields? |
| T2-18 | Itching / Rash / Skin allergy | derm | 🔲 🟡 | Distribution, colour, … | Ringworm override (124) |
| T2-19 | Nosebleed | — | ✅ | Nostril, amount, triggers | Review only |

---

## Tier 3 — Common but under-modeled (⚪ default = biggest uplift)

| # | Complaint (catalog name) | Category | Status | Why refine |
|---|--------------------------|----------|--------|------------|
| T3-01 | Weight loss | default | 🔲 ⚪ | Duration, intentional?, appetite, red flags |
| T3-02 | Loss of appetite | default | 🔲 ⚪ | Duration, weight change, nausea |
| T3-03 | Swelling / Leg swelling | default/derm | 🔲 ⚪ | Site, pitting, breathlessness, urine |
| T3-04 | Numbness / Tingling | default | 🔲 ⚪ | Distribution, progressive, weakness |
| T3-05 | Difficulty sleeping | mental | 🔲 🟡 | Onset, pattern, snoring, anxiety link |
| T3-06 | Anxiety / Feeling low | mental | 🔲 🟡 | Duration, triggers, sleep, appetite |
| T3-07 | Acne / Hair fall | derm | 🔲 🟡 | Hair fall routed to derm (124) | Severity, distribution |
| T3-08 | Period pain | pain | 🔲 🟡 | Pain + gynae overlap | LMP, bleeding |
| T3-09 | Irregular / Heavy periods | gynae | 🔲 🟡 | Flow, clots, LMP | Name-prefill partial |
| T3-10 | Piles / Bleeding from back passage | default | 🔲 ⚪ | Pain, blood on paper, constipation |
| T3-11 | Yellowing of eyes or skin | default | 🔲 ⚪ | Duration, urine colour, pain, alcohol |
| T3-12 | Allergic reaction | default | 🔲 ⚪ | Hives, breathing, trigger, timing |
| T3-13 | Fits / Loss of consciousness | default/✅ | 🔲 ⚪/✅ | Fainting has override; fits does not |
| T3-14 | Toothache | pain | 🔲 🟡 | Tooth site, hot/cold, swelling | Dental-specific |
| T3-15 | Food poisoning | default | 🔲 ⚪ | Vomit + loose stools cluster | Often multi-card |

---

## Tier 4 — Catalog additions to consider (not in seed yet)

Lower priority unless your clinic sees them daily.

| Presenting complaint (patient language) | Suggested category | Notes |
|----------------------------------------|-------------------|-------|
| Throat clearing / Phlegm in throat | ent / cough | Mucus dripping exists |
| Pain on passing stool | git / default | Separate from piles |
| Breast lump | gynae / default | — |
| Testicular swelling | pain / default | Testicular pain exists |
| Mouth ulcer | default | In catalog; default schema |
| Ringworm | derm | Added migration 124 |
| Stye / Swollen eyelid | eye | Added migration 124 |
| Limp / Difficulty walking | default | Trauma vs neuro |

---

## Suggested execution order

Refine in this sequence unless clinic data says otherwise:

1. **T1-01 Fever** — highest volume; fix max-temp UX
2. **T1-05 Cough** — URI season workhorse
3. **T1-13 Loose stools** — GIT season + dehydration fields
4. **T2-03 Shortness of breath** — safety-critical
5. **T1-17 Weakness / Tiredness** — fix ⚪ default
6. **T2-01 Chest pain** — red-flag fields
7. **T2-05 Burning urination** — UTI completeness
8. **T1-08 Cold / URI cluster** — blocked nose, runny nose, sneezing together
9. **T3-03 Swelling / Leg swelling** — pitting, cardiac/renal cues
10. **T3-10 Piles / rectal bleeding** — bespoke override candidate

---

## Per-item refinement checklist (copy per session)

```markdown
### [Complaint name] — refinement session YYYY-MM-DD

- [ ] Card name is patient language only (no medical label in dropdown)
- [ ] Synonyms cover common phrasing ("pain in chest" → Chest pain)
- [ ] No contradicting chips (e.g. "Discharge: none" on a discharge complaint)
- [ ] Fields match what doctors ask in 30 seconds
- [ ] Chip labels are patient-friendly
- [ ] Name-prefill defaults wired (`COMPLAINT_NAME_FIELD_DEFAULTS`)
- [ ] Deterministic parser tokens (`parse-complaint-text.ts`)
- [ ] Associated symptom chips sensible (`ASSOCIATED_SYMPTOM_CHIPS_*`)
- [ ] Unit test in `complaint-schema.test.ts`
- [ ] Migration only if new catalog row or synonym batch
```

---

## Refinement log

| Date | Item | Change summary |
|------|------|----------------|
| 2026-06-07 | — | Backlog created |
| 2026-06-07 | Ear/Eye discharge, Nosebleed, Vaginal discharge | Bespoke overrides + migration 123–124 |
| 2026-06-07 | Stomach pain, pain scale, abdomen grid | Pain category + parser |
| 2026-06-07 | T1-01 Fever, T1-02 High/Mild fever | Linked temp ⇄ grade control, Measured chips, parser, associated chips |
| 2026-06-07 | T1-01 Felt only | Reported by chips (Patient / Attendant / Clinician); grade-only collapsed + HOPI |

---

## Code pointers (quick)

| What | Where |
|------|-------|
| Category field lists | `frontend/lib/cockpit/complaint-schema.ts` → `COMPLAINT_SCHEMAS` |
| Name overrides | `COMPLAINT_SCHEMA_OVERRIDES_BY_NAME` (same file) |
| Name → chip prefill | `COMPLAINT_NAME_FIELD_DEFAULTS` (same file) |
| Associated chips | `ASSOCIATED_SYMPTOM_CHIPS_BY_CATEGORY` / `_BY_NAME` |
| Catalog rows | `backend/migrations/120_*.sql`, `123`, `124` |
| Free-text parser | `frontend/lib/cockpit/parse-complaint-text.ts` |
| Tests | `frontend/lib/cockpit/__tests__/complaint-schema.test.ts` |
