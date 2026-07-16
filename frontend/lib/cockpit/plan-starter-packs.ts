/**
 * Built-in Plan starter packs (plan-p3).
 *
 * Static one-tap bundles for common OPD plans. Pure data + pure merge helpers —
 * no DB / migration. Doctor Rx templates remain the personalised long-term store;
 * these packs are the cold-start surface.
 */

import {
  EMPTY_RX_MEDICINE,
  type FollowUpUnit,
  type RxFormFields,
  type RxMedicine,
} from "@/components/cockpit/rx/RxFormContext";
import {
  appendUniquePlanPhrase,
} from "@/lib/cockpit/plan-quick-picks";
import {
  parseInvestigationsOrders,
  serializeInvestigationsOrders,
} from "@/components/cockpit/rx/inputs/investigations-orders-format";

export interface PlanStarterPack {
  id: string;
  name: string;
  /** One-line hint under the chip. */
  description: string;
  medicines: readonly RxMedicine[];
  investigationsOrders: string;
  advice: string;
  patientEducation: string;
  referral: string;
  followUp: string;
  followUpValue: number | null;
  followUpUnit: FollowUpUnit | null;
}

function med(
  partial: Partial<RxMedicine> & Pick<RxMedicine, "medicineName">,
): RxMedicine {
  return { ...EMPTY_RX_MEDICINE, ...partial };
}

/** Curated OPD starter packs — symptomatic / workup oriented (no antibiotic packs). */
export const PLAN_STARTER_PACKS: readonly PlanStarterPack[] = [
  {
    id: "viral_uri",
    name: "Viral URI",
    description: "PCM · rest · fluids · F/U 3d",
    medicines: [
      med({
        medicineName: "Paracetamol",
        dosage: "500 mg",
        frequency: "Three times daily",
        frequencyCode: "TID",
        duration: "5 days",
        durationValue: 5,
        durationUnit: "days",
        foodTiming: "after_food",
        instructions: "For fever or body ache",
      }),
    ],
    investigationsOrders: "",
    advice: "Rest\nPlenty of fluids\nSteam inhalation",
    patientEducation: "Return if symptoms worsen",
    referral: "",
    followUp: "",
    followUpValue: 3,
    followUpUnit: "days",
  },
  {
    id: "gastritis",
    name: "Gastritis",
    description: "PPI · soft diet · F/U 5d",
    medicines: [
      med({
        medicineName: "Pantoprazole",
        dosage: "40 mg",
        frequency: "Once daily",
        frequencyCode: "OD",
        duration: "7 days",
        durationValue: 7,
        durationUnit: "days",
        foodTiming: "before_food",
        instructions: "Morning, empty stomach",
      }),
    ],
    investigationsOrders: "",
    advice: "Soft / bland diet\nAvoid oily and spicy food",
    patientEducation: "Return if symptoms worsen",
    referral: "",
    followUp: "",
    followUpValue: 5,
    followUpUnit: "days",
  },
  {
    id: "fever_workup",
    name: "Fever workup",
    description: "CBC · PCM · hydrate · F/U 2d",
    medicines: [
      med({
        medicineName: "Paracetamol",
        dosage: "500 mg",
        frequency: "Three times daily",
        frequencyCode: "TID",
        duration: "3 days",
        durationValue: 3,
        durationUnit: "days",
        foodTiming: "after_food",
        instructions: "For fever",
      }),
    ],
    investigationsOrders: "CBC",
    advice: "Plenty of fluids\nRest",
    patientEducation: "Return if symptoms worsen",
    referral: "",
    followUp: "",
    followUpValue: 2,
    followUpUnit: "days",
  },
  {
    id: "sprain",
    name: "Soft-tissue sprain",
    description: "NSAID · RICE · F/U 5d",
    medicines: [
      med({
        medicineName: "Ibuprofen",
        dosage: "400 mg",
        frequency: "Twice daily",
        frequencyCode: "BID",
        duration: "5 days",
        durationValue: 5,
        durationUnit: "days",
        foodTiming: "after_food",
        instructions: "With food; stop if stomach pain",
      }),
    ],
    investigationsOrders: "",
    advice: "Rest\nIce and elevation as tolerated",
    patientEducation: "Return if symptoms worsen",
    referral: "Orthopaedics",
    followUp: "",
    followUpValue: 5,
    followUpUnit: "days",
  },
] as const;

export interface PlanStarterPackApplyResult {
  fields: Pick<
    RxFormFields,
    | "investigationsOrders"
    | "advice"
    | "patientEducation"
    | "referral"
    | "referralSpecialties"
    | "followUp"
    | "followUpValue"
    | "followUpUnit"
    | "medicines"
  >;
  /** True when pack medicines replace (or seed) the medicines list. */
  replacedMedicines: boolean;
}

function medicineListHasNamedRow(medicines: readonly RxMedicine[]): boolean {
  return medicines.some((m) => m.medicineName.trim().length > 0);
}

function mergeInvestigationOrders(existing: string, incoming: string): string {
  const incomingChips = parseInvestigationsOrders(incoming);
  if (incomingChips.length === 0) return existing;
  const current = parseInvestigationsOrders(existing);
  const next = [...current];
  for (const chip of incomingChips) {
    if (!next.includes(chip)) next.push(chip);
  }
  return serializeInvestigationsOrders(next);
}

function mergeMultilineAdvice(existing: string, packAdvice: string): string {
  let next = existing;
  for (const line of packAdvice.split("\n")) {
    next = appendUniquePlanPhrase(next, line);
  }
  return next;
}

/**
 * Merge a starter pack into current Plan fields.
 *
 * - Text fields: append / union when pack has content (does not wipe doctor text).
 * - Structured F/U: fill only when both value+unit currently empty.
 * - Medicines: replace when the form has no named rows; otherwise append pack meds
 *   in front (same prepend orientation as ADD_MEDICINE).
 */
export function applyPlanStarterPack(
  fields: RxFormFields,
  pack: PlanStarterPack,
): PlanStarterPackApplyResult {
  const hasNamedMeds = medicineListHasNamedRow(fields.medicines);
  const packMeds = pack.medicines.map((m) => ({ ...m }));
  let medicines: RxMedicine[];
  let replacedMedicines = false;

  if (packMeds.length === 0) {
    medicines = fields.medicines;
  } else if (!hasNamedMeds) {
    medicines = packMeds;
    replacedMedicines = true;
  } else {
    medicines = [...packMeds, ...fields.medicines];
  }

  const followUpEmpty =
    !fields.followUp.trim() &&
    fields.followUpValue == null &&
    fields.followUpUnit == null;

  return {
    replacedMedicines,
    fields: {
      medicines,
      investigationsOrders: mergeInvestigationOrders(
        fields.investigationsOrders,
        pack.investigationsOrders,
      ),
      advice: (() => {
        let next = pack.advice
          ? mergeMultilineAdvice(fields.advice, pack.advice)
          : fields.advice;
        if (pack.patientEducation) {
          next = appendUniquePlanPhrase(next, pack.patientEducation);
        }
        return next;
      })(),
      patientEducation: fields.patientEducation,
      referral: fields.referral,
      referralSpecialties: pack.referral
        ? fields.referralSpecialties.includes(pack.referral)
          ? fields.referralSpecialties
          : [...fields.referralSpecialties, pack.referral]
        : fields.referralSpecialties,
      followUp:
        followUpEmpty && pack.followUp.trim()
          ? pack.followUp.trim()
          : fields.followUp,
      followUpValue:
        followUpEmpty && pack.followUpValue != null
          ? pack.followUpValue
          : fields.followUpValue,
      followUpUnit:
        followUpEmpty && pack.followUpUnit != null
          ? pack.followUpUnit
          : fields.followUpUnit,
    },
  };
}

export function getPlanStarterPack(id: string): PlanStarterPack | undefined {
  return PLAN_STARTER_PACKS.find((p) => p.id === id);
}
