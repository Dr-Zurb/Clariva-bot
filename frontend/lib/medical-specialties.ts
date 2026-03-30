/**
 * Region-scoped specialty labels for Practice Info (API: free string, max 200 chars).
 *
 * **IN** — India-first: AYUSH, common clinic signage, NMC-style broad specialties,
 * MD/DNB/MS names, major DM/MCh branches, and common MDS subspecialties. Curated, not statutory.
 *
 * Add more regions (e.g. `US`, `AE`) as separate arrays; UI can pick by tenant/locale later.
 */

export type MedicalSpecialtyRegionCode = keyof typeof MEDICAL_SPECIALTIES_BY_REGION_RAW;

/** Default region until product reads locale/tenant. */
export const DEFAULT_MEDICAL_SPECIALTY_REGION: MedicalSpecialtyRegionCode = "IN";

function sortedUnique(strings: readonly string[]): readonly string[] {
  const uniq = Array.from(new Set(strings.map((s) => s.trim()).filter(Boolean)));
  return uniq.sort((a, b) => a.localeCompare(b));
}

/**
 * Unsorted source lists per region. Keep strings stable once saved in DB (display equality).
 */
const MEDICAL_SPECIALTIES_BY_REGION_RAW = {
  IN: [
    // —— AYUSH & integrative (India) ——
    "Ayurveda",
    "Homeopathy",
    "Siddha Medicine",
    "Sowa-Rigpa (Amchi)",
    "Unani Medicine",
    "Yoga and Naturopathy",
    // —— Primary care / common outpatient labels ——
    "General Physician",
    "General Practice",
    "General Medicine",
    "Family Medicine",
    // —— Core clinical & diagnostics (India tertiary + district) ——
    "Addiction Medicine",
    "Adolescent Medicine",
    "Allergy and Immunology",
    "Anatomic Pathology",
    "Anesthesiology",
    "Andrology",
    "Biochemistry",
    "Cardiac Surgery",
    "Cardiology",
    "Cardiothoracic and Vascular Surgery",
    "Cardiothoracic Surgery",
    "Child and Adolescent Psychiatry",
    "Clinical Genetics",
    "Clinical Microbiology",
    "Colon and Rectal Surgery",
    "Community Medicine",
    "Critical Care Medicine",
    "Dentistry",
    "Dermatology",
    "Diabetology",
    "Diabetes and Metabolism",
    "Emergency Medicine",
    "Endocrine Surgery",
    "Endocrinology",
    "Forensic Medicine",
    "Gastroenterology",
    "Gastrointestinal Surgery",
    "General Surgery",
    "Geriatric Medicine",
    "Geriatric Psychiatry",
    "Gynecologic Oncology",
    "Hematology",
    "Hepatobiliary and Pancreatic Surgery",
    "Hospital Medicine",
    "Hospice and Palliative Medicine",
    "Infectious Disease",
    "Internal Medicine",
    "Interventional Cardiology",
    "Interventional Radiology",
    "Maternal-Fetal Medicine",
    "Medical Genetics",
    "Medical Oncology",
    "Neonatology",
    "Nephrology",
    "Neurology",
    "Neuromuscular Medicine",
    "Neuropathology",
    "Neuropsychiatry",
    "Neurosurgery",
    "Nuclear Medicine",
    "Obstetrics and Gynaecology",
    "Occupational Medicine",
    "Ophthalmology",
    "Oral and Maxillofacial Surgery",
    "Oral Medicine and Radiology",
    "Oral Pathology and Microbiology",
    "Orthodontics",
    "Orthopedics",
    "Otolaryngology (ENT)",
    "Pain Medicine",
    "Pathology",
    "Pediatric Cardiology",
    "Pediatric Critical Care",
    "Pediatric Dentistry",
    "Pediatric Emergency Medicine",
    "Pediatric Endocrinology",
    "Pediatric Gastroenterology",
    "Pediatric Hematology-Oncology",
    "Pediatric Infectious Disease",
    "Pediatric Nephrology",
    "Pediatric Neurology",
    "Pediatric Pulmonology",
    "Pediatric Surgery",
    "Pediatrics",
    "Periodontics",
    "Physical Medicine and Rehabilitation",
    "Plastic Surgery",
    "Preventive Medicine",
    "Prosthodontics",
    "Psychiatry",
    "Public Health",
    "Public Health Dentistry",
    "Pulmonology",
    "Radiation Oncology",
    "Radiology",
    "Reproductive Endocrinology and Infertility",
    "Rheumatology",
    "Sexual Medicine",
    "Sleep Medicine",
    "Sports Medicine",
    "Surgical Oncology",
    "Thoracic Surgery",
    "Transfusion Medicine",
    "Transplant Hepatology",
    "Transplant Surgery",
    "Trauma Surgery",
    "Tuberculosis and Respiratory Medicine",
    "Urgent Care",
    "Urology",
    "Vascular Neurology",
    "Vascular Surgery",
    // —— Dentistry (common MDS programme names) ——
    "Conservative Dentistry and Endodontics",
  ],
} as const;

/** Sorted, deduped lists per region (safe for `<select>` / combobox). */
export const MEDICAL_SPECIALTIES_BY_REGION: {
  readonly [K in MedicalSpecialtyRegionCode]: readonly string[];
} = {
  IN: sortedUnique([...MEDICAL_SPECIALTIES_BY_REGION_RAW.IN]),
};

/**
 * Active list for the default region (`IN`). Prefer `MEDICAL_SPECIALTIES_BY_REGION[code]`
 * when wiring locale.
 */
export const MEDICAL_SPECIALTIES: readonly string[] =
  MEDICAL_SPECIALTIES_BY_REGION[DEFAULT_MEDICAL_SPECIALTY_REGION];

export const MEDICAL_SPECIALTY_COUNT = MEDICAL_SPECIALTIES.length;

export function getMedicalSpecialties(
  region: MedicalSpecialtyRegionCode = DEFAULT_MEDICAL_SPECIALTY_REGION
): readonly string[] {
  return MEDICAL_SPECIALTIES_BY_REGION[region];
}
