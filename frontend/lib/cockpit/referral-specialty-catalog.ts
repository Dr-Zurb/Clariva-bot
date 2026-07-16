/**
 * Referral specialty catalog — searchable list + short chip strip (Plan referral).
 * Static UI vocabulary; free-text `referral` remains the source of truth.
 */

export interface ReferralSpecialtyOption {
  /** Stable token for combobox value. */
  value: string;
  /** Patient-facing / Rx label. */
  label: string;
  /** Extra search tokens (aliases, abbreviations). */
  searchTerms?: readonly string[];
}

/**
 * Full OPD specialty catalog for the searchable picker.
 * Labels match common Indian clinic / Rx wording.
 */
export const REFERRAL_SPECIALTY_CATALOG: readonly ReferralSpecialtyOption[] = [
  { value: "ent", label: "ENT", searchTerms: ["ear", "nose", "throat", "otolaryngology"] },
  { value: "ophthalmology", label: "Ophthalmology", searchTerms: ["eye", "retina"] },
  { value: "orthopaedics", label: "Orthopaedics", searchTerms: ["ortho", "orthopedics", "bone"] },
  { value: "dermatology", label: "Dermatology", searchTerms: ["skin", "derm"] },
  { value: "cardiology", label: "Cardiology", searchTerms: ["heart", "cardio"] },
  { value: "pulmonology", label: "Pulmonology", searchTerms: ["chest", "respiratory", "lung"] },
  {
    value: "gastroenterology",
    label: "Gastroenterology",
    searchTerms: ["gastro", "gi", "liver"],
  },
  { value: "neurology", label: "Neurology", searchTerms: ["neuro", "brain"] },
  { value: "psychiatry", label: "Psychiatry", searchTerms: ["mental", "psych"] },
  { value: "gynaecology", label: "Gynaecology", searchTerms: ["gynae", "obgyn", "ob/gyn"] },
  { value: "paediatrics", label: "Paediatrics", searchTerms: ["pediatrics", "child"] },
  {
    value: "general-surgery",
    label: "General Surgery",
    searchTerms: ["surgery", "surgical"],
  },
  { value: "urology", label: "Urology", searchTerms: ["uro", "kidney stone"] },
  { value: "nephrology", label: "Nephrology", searchTerms: ["kidney", "renal"] },
  {
    value: "endocrinology",
    label: "Endocrinology",
    searchTerms: ["endocrine", "diabetes", "thyroid"],
  },
  { value: "rheumatology", label: "Rheumatology", searchTerms: ["rheum", "arthritis"] },
  { value: "oncology", label: "Oncology", searchTerms: ["cancer", "onc"] },
  {
    value: "haematology",
    label: "Haematology",
    searchTerms: ["hematology", "blood"],
  },
  {
    value: "plastic-surgery",
    label: "Plastic Surgery",
    searchTerms: ["plastic", "cosmetic"],
  },
  {
    value: "neurosurgery",
    label: "Neurosurgery",
    searchTerms: ["brain surgery", "spine surgery"],
  },
  {
    value: "vascular-surgery",
    label: "Vascular Surgery",
    searchTerms: ["vascular", "vein"],
  },
  {
    value: "cardiothoracic-surgery",
    label: "Cardiothoracic Surgery",
    searchTerms: ["ctvs", "cardiac surgery"],
  },
  { value: "dentistry", label: "Dentistry", searchTerms: ["dental", "dentist"] },
  {
    value: "oral-maxillofacial",
    label: "Oral & Maxillofacial Surgery",
    searchTerms: ["omfs", "jaw"],
  },
  { value: "physiotherapy", label: "Physiotherapy", searchTerms: ["pt", "physio"] },
  { value: "dietitian", label: "Dietitian", searchTerms: ["nutrition", "diet"] },
  {
    value: "internal-medicine",
    label: "Internal Medicine",
    searchTerms: ["medicine", "physician", "gp"],
  },
  {
    value: "family-medicine",
    label: "Family Medicine",
    searchTerms: ["family", "gp"],
  },
  { value: "geriatrics", label: "Geriatrics", searchTerms: ["elderly", "geriatric"] },
  {
    value: "infectious-diseases",
    label: "Infectious Diseases",
    searchTerms: ["id", "infection"],
  },
  { value: "allergy", label: "Allergy / Immunology", searchTerms: ["allergy", "immune"] },
  { value: "pain-medicine", label: "Pain Medicine", searchTerms: ["pain"] },
  {
    value: "palliative",
    label: "Palliative Care",
    searchTerms: ["palliative", "hospice"],
  },
  { value: "radiology", label: "Radiology", searchTerms: ["imaging", "radio"] },
  {
    value: "interventional-radiology",
    label: "Interventional Radiology",
    searchTerms: ["ir"],
  },
  { value: "pathology", label: "Pathology", searchTerms: ["path"] },
  { value: "anaesthesiology", label: "Anaesthesiology", searchTerms: ["anesthesia", "anaesthesia"] },
  { value: "emergency", label: "Emergency Medicine", searchTerms: ["er", "casualty", "a&e"] },
  { value: "icu", label: "Critical Care / ICU", searchTerms: ["icu", "intensive"] },
  { value: "neonatology", label: "Neonatology", searchTerms: ["nicu", "newborn"] },
  {
    value: "paediatric-surgery",
    label: "Paediatric Surgery",
    searchTerms: ["pediatric surgery"],
  },
  { value: "andrology", label: "Andrology", searchTerms: ["male infertility"] },
  {
    value: "reproductive",
    label: "Reproductive Medicine / IVF",
    searchTerms: ["ivf", "fertility"],
  },
  { value: "speech-therapy", label: "Speech Therapy", searchTerms: ["slt", "speech"] },
  {
    value: "occupational-therapy",
    label: "Occupational Therapy",
    searchTerms: ["ot"],
  },
  { value: "audiology", label: "Audiology", searchTerms: ["hearing"] },
  { value: "psychology", label: "Clinical Psychology", searchTerms: ["psychologist"] },
] as const;

/** Top OPD commons for one-tap chips — majors first (subset of catalog labels). */
export const REFERRAL_SPECIALTY_QUICK_PICK_LABELS: readonly string[] = [
  "Internal Medicine",
  "General Surgery",
  "Gynaecology",
  "Orthopaedics",
  "ENT",
  "Cardiology",
  "Dermatology",
  "Neurology",
] as const;

function specialtyHaystack(opt: ReferralSpecialtyOption): string {
  return [opt.label, opt.value, ...(opt.searchTerms ?? [])]
    .join(" ")
    .toLowerCase();
}

export function filterReferralSpecialtyCatalog(
  options: readonly ReferralSpecialtyOption[],
  query: string,
): ReferralSpecialtyOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  return options.filter((opt) => specialtyHaystack(opt).includes(q));
}

/** Exact / alias resolve for combobox catalog-match (no custom row when hit). */
export function resolveReferralSpecialtyCatalog(
  query: string,
): string | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  for (const opt of REFERRAL_SPECIALTY_CATALOG) {
    if (opt.label.toLowerCase() === q || opt.value === q) return opt.value;
    if (opt.searchTerms?.some((t) => t.toLowerCase() === q)) return opt.value;
  }
  return undefined;
}

export function referralSpecialtyLabelForValue(value: string): string | undefined {
  return REFERRAL_SPECIALTY_CATALOG.find((o) => o.value === value)?.label;
}

export function referralSpecialtyOptionsForCombobox(): {
  value: string;
  label: string;
}[] {
  return REFERRAL_SPECIALTY_CATALOG.map((o) => ({
    value: o.value,
    label: o.label,
  }));
}
