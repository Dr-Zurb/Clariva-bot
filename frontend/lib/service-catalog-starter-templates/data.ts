/**
 * SFU-13: Raw starter catalogs. Validated in registry before export.
 * Prices are round-number placeholders in main currency (minor = main × 100); practices must adjust.
 */

import type { FollowUpPolicyV1, ServiceOfferingV1 } from "@/lib/service-catalog-schema";
function fuPercent(pct: number): FollowUpPolicyV1 {
  return {
    enabled: true,
    max_followups: 3,
    eligibility_window_days: 90,
    discount_type: "percent",
    discount_value: pct,
  };
}

function minor(main: number): number {
  return Math.round(main * 100);
}

/** Text, voice, video enabled — typical teleconsult mix. */
function modalitiesTriple(
  textMain: number,
  voiceMain: number,
  videoMain: number,
  videoFollowUp: FollowUpPolicyV1 | null = null
): ServiceOfferingV1["modalities"] {
  return {
    text: { enabled: true, price_minor: minor(textMain), followup_policy: null },
    voice: { enabled: true, price_minor: minor(voiceMain), followup_policy: null },
    video: {
      enabled: true,
      price_minor: minor(videoMain),
      followup_policy: videoFollowUp,
    },
  };
}

function offering(
  service_id: string,
  service_key: string,
  label: string,
  description: string,
  modalities: ServiceOfferingV1["modalities"]
): ServiceOfferingV1 {
  return {
    service_id,
    service_key,
    label,
    description,
    modalities,
    followup_policy: null,
  };
}

export type RawStarterRow = {
  id: string;
  specialtyLabel: string;
  title: string;
  description: string;
  services: ServiceOfferingV1[];
};

/**
 * All starter rows. Keep `specialtyLabel` in sync with `frontend/lib/medical-specialties.ts` (IN list).
 */
export const RAW_STARTER_TEMPLATE_ROWS: RawStarterRow[] = [
  {
    id: "in-general-medicine-basic",
    specialtyLabel: "General Medicine",
    title: "General medicine — common consults",
    description:
      "New visit, follow-up, and quick review slots with text, voice, and video. Adjust amounts to your fees.",
    services: [
      offering(
        "a1111111-0001-4abc-8def-000000000101",
        "new_patient_consult",
        "New patient consultation",
        "First comprehensive consult. Placeholder pricing — edit before saving.",
        modalitiesTriple(400, 650, 900, fuPercent(25))
      ),
      offering(
        "a1111111-0001-4abc-8def-000000000102",
        "follow_up_visit",
        "Follow-up visit",
        "Return visit within an episode of care.",
        modalitiesTriple(300, 500, 700, fuPercent(20))
      ),
      offering(
        "a1111111-0001-4abc-8def-000000000103",
        "quick_advice",
        "Brief / advice consult",
        "Short question or report review.",
        modalitiesTriple(200, 350, 500, null)
      ),
    ],
  },
  {
    id: "in-general-physician-basic",
    specialtyLabel: "General Physician",
    title: "General physician — OP-style teleconsults",
    description: "Typical outpatient-style teleconsult lines for a physician clinic.",
    services: [
      offering(
        "a2222222-0001-4abc-8def-000000000201",
        "gp_new_consult",
        "New consultation",
        "Initial assessment via teleconsult.",
        modalitiesTriple(350, 600, 850, fuPercent(25))
      ),
      offering(
        "a2222222-0001-4abc-8def-000000000202",
        "gp_follow_up",
        "Follow-up consultation",
        "Ongoing care follow-up.",
        modalitiesTriple(250, 450, 650, fuPercent(20))
      ),
      offering(
        "a2222222-0001-4abc-8def-000000000203",
        "gp_urgent_same_day",
        "Same-day urgent consult",
        "Acute symptoms — same-day slot. Placeholder fees.",
        modalitiesTriple(450, 750, 1000, fuPercent(15))
      ),
    ],
  },
  {
    id: "in-general-practice-basic",
    specialtyLabel: "General Practice",
    title: "General practice — starter pack",
    description: "Simple three-line catalog for a GP / family-style practice.",
    services: [
      offering(
        "a3333333-0001-4abc-8def-000000000301",
        "gp_standard_visit",
        "Standard consult",
        "Routine teleconsult.",
        modalitiesTriple(380, 620, 880, fuPercent(22))
      ),
      offering(
        "a3333333-0001-4abc-8def-000000000302",
        "gp_follow_up_care",
        "Follow-up care",
        "Continuing care visit.",
        modalitiesTriple(280, 480, 680, null)
      ),
      offering(
        "a3333333-0001-4abc-8def-000000000303",
        "gp_health_counselling",
        "Preventive counselling",
        "Lifestyle / preventive discussion.",
        modalitiesTriple(250, 400, 550, null)
      ),
    ],
  },
  {
    id: "in-family-medicine-basic",
    specialtyLabel: "Family Medicine",
    title: "Family medicine — teleconsult starter",
    description: "Family-oriented consult types; edit labels and prices for your clinic.",
    services: [
      offering(
        "a4444444-0001-4abc-8def-000000000401",
        "fm_individual_visit",
        "Individual visit",
        "Adult or youth consult.",
        modalitiesTriple(400, 650, 920, fuPercent(25))
      ),
      offering(
        "a4444444-0001-4abc-8def-000000000402",
        "fm_family_counselling",
        "Family counselling session",
        "Discussion with multiple household members (scheduling note only — same price slots).",
        modalitiesTriple(500, 800, 1100, fuPercent(18))
      ),
      offering(
        "a4444444-0001-4abc-8def-000000000403",
        "fm_chronic_care_review",
        "Chronic disease review",
        "Hypertension, diabetes, etc. follow-up.",
        modalitiesTriple(320, 550, 780, fuPercent(20))
      ),
    ],
  },
  {
    id: "in-pediatrics-basic",
    specialtyLabel: "Pediatrics",
    title: "Pediatrics — child teleconsult starter",
    description: "Common child health consult types; adjust for your practice.",
    services: [
      offering(
        "a5555555-0001-4abc-8def-000000000501",
        "peds_well_child",
        "Well-child / growth check",
        "Routine developmental and growth discussion.",
        modalitiesTriple(400, 680, 950, fuPercent(25))
      ),
      offering(
        "a5555555-0001-4abc-8def-000000000502",
        "peds_acute_illness",
        "Acute illness consult",
        "Fever, cough, GI symptoms, etc.",
        modalitiesTriple(380, 650, 900, fuPercent(22))
      ),
      offering(
        "a5555555-0001-4abc-8def-000000000503",
        "peds_follow_up",
        "Pediatric follow-up",
        "Return visit after prior consult.",
        modalitiesTriple(300, 520, 750, null)
      ),
    ],
  },
  {
    id: "in-dermatology-basic",
    specialtyLabel: "Dermatology",
    title: "Dermatology — skin consult starter",
    description: "Dermatology-leaning labels; video often primary — prices are placeholders.",
    services: [
      offering(
        "a6666666-0001-4abc-8def-000000000601",
        "derm_new_skin_consult",
        "New skin consultation",
        "Initial rash / lesion discussion (photos may be shared offline).",
        modalitiesTriple(450, 750, 1200, fuPercent(20))
      ),
      offering(
        "a6666666-0001-4abc-8def-000000000602",
        "derm_follow_up",
        "Dermatology follow-up",
        "Treatment review.",
        modalitiesTriple(350, 580, 900, fuPercent(18))
      ),
      offering(
        "a6666666-0001-4abc-8def-000000000603",
        "derm_acne_review",
        "Acne / cosmetic dermatology review",
        "Ongoing acne or similar programme visit.",
        modalitiesTriple(400, 700, 1000, null)
      ),
    ],
  },
  {
    id: "in-obgyn-basic",
    specialtyLabel: "Obstetrics and Gynaecology",
    title: "Obstetrics & gynaecology — teleconsult starter",
    description: "Antenatal / women’s health oriented starter lines (not a substitute for emergency care).",
    services: [
      offering(
        "a7777777-0001-4abc-8def-000000000701",
        "obg_antenatal_visit",
        "Antenatal consultation",
        "Routine pregnancy teleconsult.",
        modalitiesTriple(450, 750, 1000, fuPercent(22))
      ),
      offering(
        "a7777777-0001-4abc-8def-000000000702",
        "obg_postnatal_followup",
        "Postnatal follow-up",
        "After-delivery check-in.",
        modalitiesTriple(400, 680, 900, fuPercent(20))
      ),
      offering(
        "a7777777-0001-4abc-8def-000000000703",
        "obg_gynae_consult",
        "General gynaecology consult",
        "Non-urgent gynaecology discussion.",
        modalitiesTriple(400, 700, 950, null)
      ),
    ],
  },
  {
    id: "in-cardiology-basic",
    specialtyLabel: "Cardiology",
    title: "Cardiology — teleconsult starter",
    description: "Cardiology-oriented consult labels; urgent cardiac symptoms belong in emergency care.",
    services: [
      offering(
        "a8888888-0001-4abc-8def-000000000801",
        "card_new_cardiac_consult",
        "New cardiac consultation",
        "Initial assessment (stable patients suitable for teleconsult).",
        modalitiesTriple(600, 1000, 1500, fuPercent(18))
      ),
      offering(
        "a8888888-0001-4abc-8def-000000000802",
        "card_follow_up",
        "Cardiology follow-up",
        "Follow-up for known cardiac condition.",
        modalitiesTriple(450, 800, 1200, fuPercent(15))
      ),
      offering(
        "a8888888-0001-4abc-8def-000000000803",
        "card_rhythm_bp_review",
        "BP / medication review",
        "Medication or vitals review visit.",
        modalitiesTriple(400, 700, 1000, null)
      ),
    ],
  },
];
