/**
 * Prescription Types (Prescription V1)
 *
 * Types for prescriptions, prescription_medicines, prescription_attachments.
 * PHI: diagnosis, medications, clinical notes.
 */

export type PrescriptionType = 'structured' | 'photo' | 'both';

/**
 * Structured follow-up unit (cockpit-v2 / migration 103, DL-28).
 *
 * Lifted from the migration's CHECK constraint
 * (`prescriptions_follow_up_unit_chk`) to keep TS in lockstep with
 * the DB. If you change either side, change both. `as_needed` carries
 * no numeric value (the pairing CHECK enforces this).
 */
export type FollowUpUnit = 'days' | 'weeks' | 'months' | 'as_needed';

/** BP measurement posture (objective-tab Vitals 2.0 / migration 151). */
export type VitalsBpPosture = 'sitting' | 'standing' | 'supine';

/** BP measurement limb (objective-tab Vitals 2.0 / migration 151). */
export type VitalsBpLimb = 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg';

/** Severity on a structured complaint card (subjective-tab / migration 116). */
// `minimal` is retained only for legacy stored cards; the UI offers
// mild/moderate/severe/very_severe (subj-14 refine).
export type ComplaintSeverity =
  | 'minimal'
  | 'mild'
  | 'moderate'
  | 'severe'
  | 'very_severe'
  | number;

/**
 * One chief-complaint card stored in `prescriptions.complaints` JSONB.
 * Validated app-side; JSONB stays flexible for forward-compatible attrs.
 */
export type PrescriptionComplaintCategory =
  | 'pain'
  | 'fever'
  | 'cough'
  | 'git'
  | 'urinary'
  | 'respiratory'
  | 'ent'
  | 'derm'
  | 'eye'
  | 'ear'
  | 'cardiac'
  | 'dizziness'
  | 'gynae'
  | 'mental'
  | 'trauma'
  | 'default';

export interface PrescriptionComplaint {
  id: string;
  name: string;
  onset?: string | null;
  duration?: string | null;
  location?: string | null;
  character?: string | null;
  radiation?: string | null;
  severity?: ComplaintSeverity | null;
  timing?: string | null;
  aggravating?: string | null;
  relieving?: string | null;
  /** Laterality / position (subj-14). */
  laterality?: string | null;
  /** Numeric pain rating 0–10 (NRS) — pain-category cards. */
  painScore?: number | null;
  /** Exact fever reading (1 decimal) — fever-category cards. */
  temperature?: number | null;
  temperatureUnit?: 'F' | 'C' | null;
  feverGrade?: 'mild' | 'moderate' | 'high' | 'very_high' | null;
  measuredBy?: string | null;
  /** Who reported subjective fever — fever cards with felt-only measurement. */
  reportedBy?: 'Patient' | 'Attendant' | 'Clinician' | string | null;
  /** Episodes or frequency (GIT / urinary). */
  frequency?: string | null;
  /** Colour / content (sputum, stool, urine, discharge). */
  color?: string | null;
  associated?: string[] | null;
  /** Nested associated complaint cards (one level; subj-12). */
  associatedComplaints?: PrescriptionAssociatedComplaint[] | null;
  notes?: string | null;
  /** Schema category from complaint_master (subj-06); optional metadata. */
  category?: PrescriptionComplaintCategory | null;
}

/** Leaf associated complaint — cannot nest further. */
export type PrescriptionAssociatedComplaint = Omit<
  PrescriptionComplaint,
  'associatedComplaints'
>;

/** Per-system exam status (objective-tab / migration 150). */
export type ExamSystemStatus = 'normal' | 'abnormal';

/**
 * One structured per-system examination finding stored in
 * `prescriptions.examination_json` JSONB (objective-tab / migration 150).
 * `examination_findings` TEXT is derived from this on save (OBJ-D2). The
 * `systemId` vocabulary + ordering is frozen by obj-02's exam registry.
 */
export interface ExamSystemFinding {
  systemId: string;
  status: ExamSystemStatus;
  findings?: string[];
  notes?: string | null;
}

/** Leaf custom sub-subsection — cannot nest further (subj-19 / migration 144). */
export interface CustomSubsectionChild {
  id: string;
  title: string;
  body?: string | null;
}

/** Doctor-defined custom subsection with optional sub-subsections (depth 2). */
export interface CustomSubsection {
  id: string;
  title: string;
  body?: string | null;
  children: CustomSubsectionChild[];
}

/** Smoking / smokeless / alcohol status (social-history v2 / migration 125). */
export type SocialHistorySmokingStatus = 'never' | 'current' | 'ex';

export type FamilyHistoryCondition =
  | 'htn'
  | 'dm'
  | 'cad'
  | 'stroke'
  | 'early-cardiac-death'
  | 'cancer'
  | 'epilepsy'
  | 'asthma'
  | 'psychiatric'
  | 'ckd'
  | 'thyroid'
  | 'tb'
  | 'dyslipidemia'
  | 'obesity'
  | 'dementia'
  | 'autoimmune'
  | 'anemia'
  | 'gout';

export type FamilyHistoryRelativeKey =
  | 'father'
  | 'mother'
  | 'sibling'
  | 'child'
  | 'grandparent';

export interface FamilyHistorySiblingDetail {
  sex?: 'brother' | 'sister' | null;
  order?: 'older' | 'younger' | 'twin' | null;
}

export interface FamilyHistoryGrandparentDetail {
  side?: 'maternal' | 'paternal' | null;
  sex?: 'grandfather' | 'grandmother' | null;
}

export interface FamilyHistoryRelativesMeta {
  sibling?: FamilyHistorySiblingDetail | null;
  grandparent?: FamilyHistoryGrandparentDetail | null;
}

export interface FamilyHistoryEntry {
  id?: string | null;
  condition: FamilyHistoryCondition | 'other';
  conditionOther?: string | null;
  notes?: string | null;
}

export interface FamilyHistorySiblingCard {
  id: string;
  detail?: FamilyHistorySiblingDetail | null;
  entries: FamilyHistoryEntry[];
}

/** Structured family history stored in `prescriptions.family_history_structured` JSONB. */
export interface FamilyHistoryStructured {
  none?: boolean | null;
  relatives?: {
    father?: FamilyHistoryEntry[] | null;
    mother?: FamilyHistoryEntry[] | null;
    /** @deprecated Legacy — migrated to `siblings[]` on read. */
    sibling?: FamilyHistoryEntry[] | null;
    child?: FamilyHistoryEntry[] | null;
    grandparent?: FamilyHistoryEntry[] | null;
  } | null;
  siblings?: FamilyHistorySiblingCard[] | null;
  relativesMeta?: FamilyHistoryRelativesMeta | null;
  other?: string | null;
  otherRelativeEntries?: FamilyHistoryEntry[] | null;
  notes?: string | null;
}

/** Catalog procedure slugs for past surgical history (mirrors frontend catalog). */
export const PAST_SURGICAL_CATALOG_PROCEDURE_SLUGS = [
  'appendectomy',
  'lscs',
  'cholecystectomy',
  'hernia-repair',
  'turp',
  'cabg',
  'cataract',
  'tonsillectomy',
  'hysterectomy',
  'hysteroscopy',
  'tkr',
  'thyroidectomy',
  'varicose-vein-surgery',
  'fracture-fixation',
  'piles',
  'circumcision',
  'thr',
  'shoulder-replacement',
  'arthroscopy',
  'acl-reconstruction',
  'spinal-surgery',
  'laminectomy',
  'discectomy',
  'amputation',
  'carpal-tunnel-release',
  'laparotomy',
  'laparoscopy',
  'colectomy',
  'gastrectomy',
  'splenectomy',
  'fundoplication',
  'liver-resection',
  'whipple',
  'bariatric-surgery',
  'mastectomy',
  'lumpectomy',
  'angioplasty',
  'pacemaker',
  'valve-replacement',
  'carotid-endarterectomy',
  'peripheral-bypass',
  'nephrectomy',
  'prostatectomy',
  'pcnl',
  'ureteroscopy',
  'vasectomy',
  'kidney-transplant',
  'av-fistula',
  'turbt',
  'myomectomy',
  'oophorectomy',
  'tubal-ligation',
  'd-and-c',
  'ovarian-cystectomy',
  'adenoidectomy',
  'septoplasty',
  'fess',
  'tympanoplasty',
  'parotidectomy',
  'mastoidectomy',
  'tracheostomy',
  'craniotomy',
  'vp-shunt',
  'lipoma-excision',
  'abscess-drainage',
  'skin-graft',
  'anal-fistula',
  'pilonidal-sinus',
  'hydrocele-repair',
  'varicocele-repair',
  'fissure-surgery',
  'thoracotomy',
  'lobectomy',
  'peg-tube',
] as const;

export type PastSurgicalCatalogProcedure = (typeof PAST_SURGICAL_CATALOG_PROCEDURE_SLUGS)[number];

export interface PastSurgicalProcedureEntry {
  id: string;
  procedure: PastSurgicalCatalogProcedure | 'other';
  procedureOther?: string | null;
  agoValue?: number | null;
  agoUnit?: 'days' | 'weeks' | 'months' | 'years' | null;
  notes?: string | null;
}

/** Structured past surgical history stored in `prescriptions.past_surgical_history_structured` JSONB. */
export interface PastSurgicalHistoryStructured {
  none?: boolean | null;
  procedures?: PastSurgicalProcedureEntry[] | null;
  notes?: string | null;
}

/**
 * Structured social / personal history stored in
 * `prescriptions.social_history_structured` JSONB (Phase 1 keys).
 * Validated app-side; JSONB stays flexible for Phase 2 dimensions.
 */
export interface TobaccoProductRow {
  id: string;
  type: string;
  typeOther?: string | null;
  perDay?: number | null;
  perDayUnit?: string | null;
  perDayUnitOther?: string | null;
  frequency?: number | null;
  frequencyUnit?: 'day' | 'week' | 'fortnight' | 'month' | 'interval' | 'occasional' | null;
  years?: number | null;
  yearsUnit?: 'years' | 'months' | 'days' | null;
  phase?: 'current' | 'past' | null;
  quitYearsAgo?: number | null;
  quitYearsUnit?: 'years' | 'months' | 'days' | null;
}

export interface AlcoholDrinkRow {
  id: string;
  type: string;
  typeOther?: string | null;
  amount?: number | null;
  amountUnit?: string | null;
  amountUnitOther?: string | null;
  frequency?: number | null;
  frequencyUnit?: 'day' | 'week' | 'fortnight' | 'month' | 'interval' | null;
  years?: number | null;
  yearsUnit?: 'years' | 'months' | 'days' | null;
  phase?: 'current' | 'past' | null;
  quitYearsAgo?: number | null;
  quitYearsUnit?: 'years' | 'months' | 'days' | null;
  /** Optional ABV override (0–100 %). */
  abv?: number | null;
}

export interface SocialHistoryStructured {
  smoking?: {
    status: SocialHistorySmokingStatus;
    products: TobaccoProductRow[];
    years?: number | null;
    yearsUnit?: 'years' | 'months' | 'days' | null;
    quitYearsAgo?: number | null;
    quitYearsUnit?: 'years' | 'months' | 'days' | null;
  } | null;
  smokeless?: {
    status: SocialHistorySmokingStatus;
    products: TobaccoProductRow[];
    years?: number | null;
    yearsUnit?: 'years' | 'months' | 'days' | null;
    quitYearsAgo?: number | null;
    quitYearsUnit?: 'years' | 'months' | 'days' | null;
  } | null;
  alcohol?: {
    status: SocialHistorySmokingStatus;
    drinks: AlcoholDrinkRow[];
    /** @deprecated Use drink row frequency; stripped on normalize. */
    pattern?: 'occasional' | 'weekend' | 'daily' | 'binge' | null;
    cage?: {
      cutDown: boolean;
      annoyed: boolean;
      guilty: boolean;
      eyeOpener: boolean;
      enabled?: boolean | null;
    } | null;
    auditC?: {
      frequency?: number | null;
      typicalQuantity?: number | null;
      bingeFrequency?: number | null;
      enabled?: boolean | null;
    } | null;
    auditFull?: {
      unableToStop?: number | null;
      failedExpectations?: number | null;
      morningDrink?: number | null;
      guiltRemorse?: number | null;
      blackout?: number | null;
      injury?: number | null;
      othersConcerned?: number | null;
      enabled?: boolean | null;
    } | null;
    maxPerSession?: {
      amount: number;
      amountUnit?: string | null;
      amountUnitOther?: string | null;
    } | null;
    /** @deprecated Migrated to drinks[] on normalize. */
    types?: string[];
    /** @deprecated Migrated to drinks[] on normalize. */
    unitsPerWeek?: number | null;
    quitYearsAgo?: number | null;
    quitYearsUnit?: 'years' | 'months' | 'days' | null;
  } | null;
  notes?: string | null;
  /** Phase 2 — substances / lifestyle / context / wellbeing (sh-05). */
  substances?: {
    status?: 'never' | 'current' | 'ex' | null;
    items?: Array<{
      id: string;
      type: string;
      typeOther?: string | null;
      route?: 'oral' | 'inhaled' | 'iv' | 'snorted' | 'smoked' | 'other' | null;
      routeOther?: string | null;
      amount?: number | null;
      amountUnit?: string | null;
      amountUnitOther?: string | null;
      /** Legacy coarse enum or count per frequencyUnit. */
      frequency?: 'daily' | 'weekly' | 'occasional' | number | null;
      frequencyUnit?: 'day' | 'week' | 'fortnight' | 'month' | 'interval' | 'occasional' | null;
      years?: number | null;
      yearsUnit?: 'years' | 'months' | 'days' | null;
      phase?: 'current' | 'past' | null;
    }>;
    notes?: string | null;
    /** @deprecated Legacy flat shape. */
    uses?: string[];
    route?: 'oral' | 'inhaled' | 'iv' | null;
  } | null;
  diet?: {
    type?: 'regular' | 'vegetarian' | 'non-vegetarian' | 'eggetarian' | 'vegan' | 'other' | null;
    /** `regular` deprecated — stripped on frontend normalize. */
    typeOther?: string | null;
    notes?: string | null;
    /** @deprecated Nested caffeine — prefer top-level caffeine. */
    caffeineAmount?: number | null;
    caffeineSource?: 'tea' | 'coffee' | 'energy' | 'other' | null;
    caffeineSourceOther?: string | null;
    caffeineFrequency?: number | null;
    caffeineFrequencyUnit?: 'day' | 'times_per_day' | 'week' | 'fortnight' | 'month' | 'interval' | 'occasional' | null;
    caffeineCupsPerDay?: number | null;
  } | null;
  caffeine?: {
    status?: 'never' | 'current' | 'ex' | null;
    items?: Array<{
      id: string;
      type?: 'tea' | 'coffee' | 'energy' | 'other' | null;
      typeOther?: string | null;
      amount?: number | null;
      amountUnit?: string | null;
      amountUnitOther?: string | null;
      strength?: 'light' | 'regular' | 'strong' | 'custom' | null;
      caffeineMg?: number | null;
      frequency?: number | null;
      frequencyUnit?:
        | 'day'
        | 'times_per_day'
        | 'week'
        | 'fortnight'
        | 'month'
        | 'interval'
        | 'occasional'
        | null;
      years?: number | null;
      yearsUnit?: 'years' | 'months' | 'days' | null;
      phase?: 'current' | 'past' | null;
      quitYearsAgo?: number | null;
      quitYearsUnit?: 'years' | 'months' | 'days' | null;
    }> | null;
    notes?: string | null;
    /** @deprecated Legacy flat shape — still accepted for stored rows. */
    amount?: number | null;
    source?: 'tea' | 'coffee' | 'energy' | 'other' | null;
    sourceOther?: string | null;
    frequency?: number | null;
    frequencyUnit?: 'day' | 'times_per_day' | 'week' | 'fortnight' | 'month' | 'interval' | 'occasional' | null;
    strength?: 'light' | 'regular' | 'strong' | 'custom' | null;
  } | null;
  activity?: {
    level?: 'sedentary' | 'light' | 'moderate' | 'vigorous' | null;
    jobActivity?: 'sedentary' | 'light' | 'moderate' | 'heavy' | null;
    daysPerWeek?: number | null;
    minutesPerSession?: number | null;
    types?: Array<
      'walking' | 'yoga' | 'gym' | 'sport' | 'household' | 'commute' | 'other'
    > | null;
    items?: Array<{
      id: string;
      type?: string | null;
      typeOther?: string | null;
      daysPerWeek?: number | null;
      minutesPerSession?: number | null;
    }> | null;
    limitedByHealth?: boolean | null;
    barriers?: string | null;
    notes?: string | null;
  } | null;
  occupation?: {
    text?: string | null;
    exposures: string[];
  } | null;
  living?: {
    situation?: 'alone' | 'with-family' | 'institutional' | null;
    notes?: string | null;
  } | null;
  travel?: {
    recent?: boolean | null;
    place?: string | null;
    vectorRisk?: boolean | null;
    /** @deprecated Migrated to sickContact on read. */
    sickContacts?: boolean | null;
  } | null;
  sickContact?: {
    present?: boolean | null;
    types?: Array<
      | 'flu-covid-cold'
      | 'tb-cough'
      | 'measles-chickenpox'
      | 'gi-contact'
      | 'skin-scabies'
      | 'unknown'
      | 'other'
      | 'fever-dengue-malaria'
      | 'respiratory'
      | 'gi'
      | 'rash-measles'
    > | null;
    context?: Array<
      'household' | 'workplace' | 'travel' | 'travel-companion' | 'healthcare-setting' | 'other'
    > | null;
    notes?: string | null;
  } | null;
  sleep?: {
    hoursPerNight?: number | null;
    quality?: 'good' | 'fair' | 'poor' | null;
    snoring?: boolean | null;
    shiftWork?: boolean | null;
    notes?: string | null;
  } | null;
  stress?: {
    level?: 'low' | 'moderate' | 'high' | null;
    support?: 'good' | 'limited' | 'none' | null;
    sources?: Array<'work' | 'family' | 'health' | 'money' | 'other'> | null;
    notes?: string | null;
  } | null;
  sexual?: {
    enabled: boolean;
    active?: boolean | null;
    partners?: 'single' | 'multiple' | null;
    protection?: 'always' | 'sometimes' | 'never' | null;
    notes?: string | null;
  } | null;
}

export interface Prescription {
  id: string;
  appointment_id: string;
  episode_id: string | null;
  patient_id: string | null;
  doctor_id: string;
  type: PrescriptionType;
  cc: string | null;
  hopi: string | null;
  provisional_diagnosis: string | null;
  /**
   * Investigations / tests the doctor has ORDERED (e.g. "CBC, LFT").
   * Renamed from `investigations` in migration 103 (cockpit-v2). Distinct
   * from `test_results`, which carries the doctor's interpretation of
   * returned results.
   */
  investigations_orders: string | null;
  /**
   * Legacy free-text follow-up. STAYS for the cockpit-v2 deprecation
   * window — the new structured form populates it on send as the
   * rendered "<value> <unit>" string. Phase 3 drops it.
   */
  follow_up: string | null;
  patient_education: string | null;
  clinical_notes: string | null;
  sent_to_patient_at: string | null;
  created_at: string;
  updated_at: string;

  // --------------------------------------------------------------------------
  // cockpit-v2 / migration 103 / DL-28 — structured SOAP fields.
  // All NULLABLE: doctor mid-call can save a draft with only CC + Dx.
  // --------------------------------------------------------------------------

  // Objective — structured vitals (replaces the free-text vitals tracker).
  vitals_bp_systolic: number | null;
  vitals_bp_diastolic: number | null;
  vitals_hr: number | null;
  vitals_temp_c: number | null;
  vitals_spo2: number | null;
  vitals_wt_kg: number | null;
  vitals_ht_cm: number | null;

  // objective-tab / migration 151 — Vitals 2.0 extended vitals (canonical units).
  vitals_rr: number | null;
  vitals_pain_score: number | null;
  vitals_glucose_mg_dl: number | null;
  vitals_gcs_total: number | null;
  vitals_bp_posture: VitalsBpPosture | null;
  vitals_bp_limb: VitalsBpLimb | null;
  vitals_head_circumference_cm: number | null;
  vitals_muac_cm: number | null;
  vitals_waist_cm: number | null;

  // Objective — free-text examination findings.
  examination_findings: string | null;

  // objective-tab / migration 150 — structured per-system exam findings.
  // `examination_findings` is derived from this on save (OBJ-D2).
  examination_json: ExamSystemFinding[];

  // Assessment — differential-diagnosis list. NULL = not recorded;
  // the cockpit coerces empty array `[]` → NULL on save.
  differential_diagnosis: string[] | null;

  // Plan — advice, structured follow-up, referral, test_results.
  advice: string | null;
  follow_up_value: number | null;
  follow_up_unit: FollowUpUnit | null;
  referral: string | null;
  test_results: string | null;

  // subjective-tab / migration 116 — structured complaints + owned histories.
  complaints: PrescriptionComplaint[];
  family_history: string | null;
  family_history_structured: FamilyHistoryStructured | null;
  social_history: string | null;
  /** social-history v2 / migration 125 — JSONB source; TEXT is derived on save. */
  social_history_structured: SocialHistoryStructured | null;
  past_surgical_history: string | null;
  /** past surgical history v2 / migration 127 — JSONB source; TEXT is derived on save. */
  past_surgical_history_structured: PastSurgicalHistoryStructured | null;
  /** custom subsections / migration 144 — JSONB source; derived TEXT mirror on save. */
  custom_subsections: CustomSubsection[];
}

/**
 * EHR Sub-batch B1 / T2-D4 enums. Lifted from the migration 090
 * CHECK constraint to keep TS in lockstep with the DB. If you change
 * either side, change both.
 */
export type FrequencyCode =
  | 'OD'
  | 'BID'
  | 'TID'
  | 'QID'
  | 'QHS'
  | 'PRN'
  | 'STAT'
  | 'CUSTOM'
  | 'Q4H'
  | 'Q6H'
  | 'Q8H'
  | 'Q12H'
  | 'Q24H'
  | 'QW';

export type StrengthUnit = 'mg' | 'g' | 'mcg' | 'iu' | 'pct';

export type DurationUnit =
  | 'days'
  | 'weeks'
  | 'months'
  | 'until-finished'
  | 'continue';

export type RouteCode =
  | 'oral'
  | 'IV'
  | 'IM'
  | 'SC'
  | 'topical'
  | 'inhaled'
  | 'rectal'
  | 'nasal'
  | 'sublingual'
  | 'other';

/** Per-dose unit (migration 133 — medicine card redesign). */
export type DoseUnit =
  | 'tab'
  | 'cap'
  | 'ml'
  | 'spoon'
  | 'drops'
  | 'puff'
  | 'sachet'
  | 'unit'
  | 'application';

/** Structured food/timing instruction (migration 133). */
export type FoodTiming =
  | 'before_food'
  | 'after_food'
  | 'with_food'
  | 'empty_stomach'
  | 'bedtime';

export interface PrescriptionMedicine {
  id: string;
  prescription_id: string;
  medicine_name: string;
  dosage: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  sort_order: number;
  created_at: string;
  // EHR Sub-batch B1 / T2.9 — structured columns. NULL on legacy rows
  // and on rows where the doctor entered free-text without picking
  // structured values.
  drug_master_id: string | null;
  frequency_code: FrequencyCode | null;
  duration_value: number | null;
  duration_unit: DurationUnit | null;
  route_code: RouteCode | null;
  // Migration 133 — dose details for the medicine card redesign.
  dose_qty: number | null;
  dose_unit: DoseUnit | null;
  form: string | null;
  food_timing: FoodTiming | null;
}

export interface PrescriptionAttachment {
  id: string;
  prescription_id: string;
  file_path: string;
  file_type: string | null;
  caption: string | null;
  uploaded_at: string;
}

export interface PrescriptionWithRelations extends Prescription {
  prescription_medicines?: PrescriptionMedicine[];
  prescription_attachments?: PrescriptionAttachment[];
}

export interface LastSubjectiveForPatient {
  sourcePrescriptionId: string;
  sourceCreatedAt: string;
  complaints: PrescriptionComplaint[];
  familyHistory: string | null;
  familyHistoryStructured: FamilyHistoryStructured | null;
  socialHistory: string | null;
  socialHistoryStructured: SocialHistoryStructured | null;
  pastSurgicalHistory: string | null;
  pastSurgicalHistoryStructured: PastSurgicalHistoryStructured | null;
}

/**
 * Lightweight summary row for the EHR "Previous prescriptions" panel
 * (T1.6). Excludes full body fields (cc/hopi/investigations_orders/
 * follow_up/patient_education/clinical_notes) and per-medicine detail; the panel
 * only renders the headline + medicine count + a link / expand affordance
 * that hits the existing detail endpoint.
 *
 * The shape is locked because B1's "copy from last visit" task (T2.14)
 * is expected to reuse this same surface — see master batch §B1.
 */
export interface PrescriptionRecentSummary {
  id: string;
  appointment_id: string;
  created_at: string;
  provisional_diagnosis: string | null;
  sent_to_patient_at: string | null;
  medicine_count: number;
}

/**
 * Input shape for a single medicine row (camelCase). T2.9 added the
 * structured fields; all are optional + nullable so legacy callers
 * (which only know about the free-text fields) remain valid payloads.
 */
export interface MedicineInput {
  medicineName: string;
  dosage?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
  sortOrder?: number;
  // T2.9 structured fields
  drugMasterId?: string | null;
  frequencyCode?: FrequencyCode | null;
  durationValue?: number | null;
  durationUnit?: DurationUnit | null;
  routeCode?: RouteCode | null;
  // Migration 133 — dose details
  doseQty?: number | null;
  doseUnit?: DoseUnit | null;
  form?: string | null;
  foodTiming?: FoodTiming | null;
}

/**
 * cockpit-v2 / migration 103 / DL-28 — shared structured-SOAP input
 * shape. Used by both create and update inputs to keep the camelCase
 * cockpit form payload in lockstep with the snake_case DB row. All
 * fields nullable / optional: cv2-05's section components can save
 * partial drafts.
 */
/** Subjective-tab structured fields (camelCase API). */
export interface SubjectiveInput {
  complaints?: PrescriptionComplaint[];
  familyHistory?: string | null;
  familyHistoryStructured?: FamilyHistoryStructured | null;
  socialHistory?: string | null;
  socialHistoryStructured?: SocialHistoryStructured | null;
  pastSurgicalHistory?: string | null;
  pastSurgicalHistoryStructured?: PastSurgicalHistoryStructured | null;
  customSubsections?: CustomSubsection[];
  /** Derived plain-text mirror for PDF/SMS (computed on save; not persisted). */
  customSubsectionsText?: string | null;
}

export interface StructuredSoapInput {
  // Objective — vitals
  vitalsBpSystolic?: number | null;
  vitalsBpDiastolic?: number | null;
  vitalsHr?: number | null;
  vitalsTempC?: number | null;
  vitalsSpo2?: number | null;
  vitalsWtKg?: number | null;
  vitalsHtCm?: number | null;

  // objective-tab / migration 151 — Vitals 2.0 extended vitals (canonical units).
  vitalsRr?: number | null;
  vitalsPainScore?: number | null;
  vitalsGlucoseMgDl?: number | null;
  vitalsGcsTotal?: number | null;
  vitalsBpPosture?: VitalsBpPosture | null;
  vitalsBpLimb?: VitalsBpLimb | null;
  vitalsHeadCircumferenceCm?: number | null;
  vitalsMuacCm?: number | null;
  vitalsWaistCm?: number | null;

  // Objective — exam findings
  examinationFindings?: string | null;
  // objective-tab / migration 150 — structured per-system exam findings.
  examinationJson?: ExamSystemFinding[];

  // Assessment — DDx
  differentialDiagnosis?: string[] | null;

  // Plan — advice / structured follow-up / referral / test results
  advice?: string | null;
  followUpValue?: number | null;
  followUpUnit?: FollowUpUnit | null;
  referral?: string | null;
  testResults?: string | null;
}

/** Input for creating a prescription (camelCase from API) */
export interface CreatePrescriptionInput extends StructuredSoapInput, SubjectiveInput {
  appointmentId: string;
  patientId?: string | null;
  type: PrescriptionType;
  cc?: string | null;
  hopi?: string | null;
  provisionalDiagnosis?: string | null;
  /**
   * Investigations / tests ORDERED by the doctor. Camel-case public-API
   * field name stays as `investigations` for the cockpit-v2 deprecation
   * window even though the DB column is now `investigations_orders`;
   * `TODO(cv2-07)` renames the field to `investigationsOrders` once the
   * cockpit form & all external callers migrate.
   */
  investigations?: string | null;
  /**
   * Legacy free-text follow-up. STAYS for backwards-compat; new clients
   * should populate `followUpValue` + `followUpUnit` instead. Phase 3
   * drops both this field and the underlying column.
   */
  followUp?: string | null;
  patientEducation?: string | null;
  clinicalNotes?: string | null;
  medicines?: MedicineInput[];
}

/** Input for updating a prescription (partial) */
export interface UpdatePrescriptionInput extends StructuredSoapInput, SubjectiveInput {
  cc?: string | null;
  hopi?: string | null;
  provisionalDiagnosis?: string | null;
  /** See `CreatePrescriptionInput.investigations` — same deprecation note. */
  investigations?: string | null;
  /** See `CreatePrescriptionInput.followUp` — same deprecation note. */
  followUp?: string | null;
  patientEducation?: string | null;
  clinicalNotes?: string | null;
  medicines?: MedicineInput[];
}
