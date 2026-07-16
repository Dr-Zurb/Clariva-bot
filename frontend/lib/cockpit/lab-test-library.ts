/**
 * Static, versioned lab-test library (objective-reports · rpt-03).
 *
 * Pure data + pure helpers — mirrors `exam-schema.ts` / `test-result-catalog.ts`
 * discipline. Chip / library vocabulary is UI guidance only; Zod does not
 * enforce it. Free-text fallback stays available on every field.
 *
 * Reference ranges are **convenience defaults** (RPT-D5). They vary by lab /
 * method / population. Every entry carries `reviewed: true|false`; unreviewed
 * defaults are provisional until a clinical content pass signs off. The
 * printed range on a report always wins when present.
 *
 * Aliases are load-bearing for extraction matching (rpt-05).
 */

import type {
  LabReport,
  TestResultInterpretation,
  TestResultRow,
  TestResultSource,
} from "@/types/prescription";

/** Library schema version — bump when content shape changes. */
export const LAB_TEST_LIBRARY_VERSION = 7 as const;

export type LabAnalyteCategory =
  | "haematology"
  | "biochemistry"
  | "endocrine"
  | "urine"
  | "inflammatory"
  | "other";

export type LabSpecimen =
  | "whole_blood"
  | "serum"
  | "plasma"
  | "urine"
  | "other";

/** Adult reference range; sex-split when clinically relevant. */
export interface LabReferenceRange {
  low?: number | null;
  high?: number | null;
  /** Non-numeric range text, e.g. "Negative". */
  text?: string | null;
  /**
   * Clinical content-review status (RPT-D5). `false` = provisional convenience
   * default — do not treat as authoritative until reviewed.
   */
  reviewed: boolean;
}

export interface LabAnalyteDefinition {
  id: string;
  name: string;
  /** Extraction synonyms ("Hb", "Haemoglobin", "HGB"). Lowercased on lookup. */
  aliases: readonly string[];
  specimen: LabSpecimen;
  category: LabAnalyteCategory;
  unit: string;
  /** Accepted alternate units (display / matching hints only). */
  altUnits?: readonly string[];
  /** Unsexed / default adult range. */
  range?: LabReferenceRange | null;
  rangeMale?: LabReferenceRange | null;
  rangeFemale?: LabReferenceRange | null;
}

export interface LabPanelDefinition {
  id: string;
  name: string;
  /** Ordered analyte ids — missing ids are skipped at scaffold time. */
  analyteIds: readonly string[];
}

export type PatientSexForRange = "male" | "female" | null | undefined;

function trimOrNull(value: string | null | undefined): string | null {
  const t = typeof value === "string" ? value.trim() : "";
  return t || null;
}

function normalizeAliasKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function range(
  low: number | null,
  high: number | null,
  reviewed = false,
  text: string | null = null,
): LabReferenceRange {
  return { low, high, text, reviewed };
}

/**
 * Curated OPD analytes. ALL ranges ship `reviewed: false` until the clinical
 * content-review pass (task 4.3 / RPT-D5) signs them off. Values follow common
 * Indian outpatient lab conventions (mg/dL, g/dL, etc.) as provisional defaults.
 */
export const LAB_ANALYTES: readonly LabAnalyteDefinition[] = [
  // Haematology — CBC
  {
    id: "hb",
    name: "Haemoglobin",
    aliases: ["hb", "hemoglobin", "haemoglobin", "hgb", "haemoglobin (hb)"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "g/dL",
    altUnits: ["g/L"],
    rangeMale: range(13, 17),
    rangeFemale: range(12, 15),
    range: range(12, 17),
  },
  {
    id: "hct",
    name: "Haematocrit",
    aliases: ["hct", "hematocrit", "haematocrit", "pcv", "packed cell volume"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "%",
    rangeMale: range(40, 50),
    rangeFemale: range(36, 46),
    range: range(36, 50),
  },
  {
    id: "rbc",
    name: "RBC count",
    aliases: ["rbc", "rbc count", "red blood cell count", "erythrocyte count"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "million/µL",
    altUnits: ["10^6/µL", "×10^6/µL"],
    rangeMale: range(4.5, 5.5),
    rangeFemale: range(4.0, 5.0),
    range: range(4.0, 5.5),
  },
  {
    id: "wbc",
    name: "WBC count",
    aliases: ["wbc", "wbc count", "tlc", "total leukocyte count", "leukocyte count", "white blood cell count"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "/µL",
    altUnits: ["cells/µL", "×10^3/µL"],
    range: range(4000, 11000),
  },
  {
    id: "plt",
    name: "Platelet count",
    aliases: ["plt", "platelet", "platelet count", "platelets", "thrombocyte count"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "/µL",
    altUnits: ["×10^3/µL", "lakhs/cumm"],
    range: range(150000, 450000),
  },
  {
    id: "mcv",
    name: "MCV",
    aliases: ["mcv", "mean corpuscular volume"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "fL",
    range: range(80, 100),
  },
  {
    id: "mch",
    name: "MCH",
    aliases: ["mch", "mean corpuscular haemoglobin", "mean corpuscular hemoglobin"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "pg",
    range: range(27, 33),
  },
  {
    id: "mchc",
    name: "MCHC",
    aliases: ["mchc", "mean corpuscular haemoglobin concentration"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "g/dL",
    range: range(32, 36),
  },
  {
    id: "rdw",
    name: "RDW",
    aliases: ["rdw", "red cell distribution width"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "%",
    range: range(11.5, 14.5),
  },
  // Biochemistry — LFT
  {
    id: "tbil",
    name: "Total bilirubin",
    aliases: ["tbil", "total bilirubin", "bilirubin total", "bilirubin"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(0.2, 1.2),
  },
  {
    id: "dbil",
    name: "Direct bilirubin",
    aliases: ["dbil", "direct bilirubin", "conjugated bilirubin"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(0, 0.3),
  },
  {
    id: "sgot",
    name: "SGOT (AST)",
    aliases: ["sgot", "ast", "sgot (ast)", "aspartate aminotransferase", "aspartate transaminase"],
    specimen: "serum",
    category: "biochemistry",
    unit: "U/L",
    range: range(5, 40),
  },
  {
    id: "sgpt",
    name: "SGPT (ALT)",
    aliases: ["sgpt", "alt", "sgpt (alt)", "alanine aminotransferase", "alanine transaminase"],
    specimen: "serum",
    category: "biochemistry",
    unit: "U/L",
    range: range(5, 40),
  },
  {
    id: "alp",
    name: "Alkaline phosphatase",
    aliases: ["alp", "alkaline phosphatase", "alk phos"],
    specimen: "serum",
    category: "biochemistry",
    unit: "U/L",
    range: range(40, 129),
  },
  {
    id: "albumin",
    name: "Albumin",
    aliases: ["albumin", "serum albumin", "alb"],
    specimen: "serum",
    category: "biochemistry",
    unit: "g/dL",
    range: range(3.5, 5.0),
  },
  {
    id: "total_protein",
    name: "Total protein",
    aliases: ["total protein", "serum protein", "tp"],
    specimen: "serum",
    category: "biochemistry",
    unit: "g/dL",
    range: range(6.0, 8.3),
  },
  // Biochemistry — KFT / RFT
  {
    id: "urea",
    name: "Blood urea",
    aliases: ["urea", "blood urea", "bun", "blood urea nitrogen"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(15, 40),
  },
  {
    id: "creatinine",
    name: "Creatinine",
    aliases: ["creatinine", "serum creatinine", "s. creatinine", "creat", "scr"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    rangeMale: range(0.7, 1.3),
    rangeFemale: range(0.6, 1.1),
    range: range(0.6, 1.3),
  },
  {
    id: "uric_acid",
    name: "Uric acid",
    aliases: ["uric acid", "ua", "serum uric acid"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    rangeMale: range(3.5, 7.2),
    rangeFemale: range(2.6, 6.0),
    range: range(2.6, 7.2),
  },
  // Electrolytes
  {
    id: "sodium",
    name: "Sodium",
    aliases: ["sodium", "na", "na+", "serum sodium"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mEq/L",
    altUnits: ["mmol/L"],
    range: range(136, 145),
  },
  {
    id: "potassium",
    name: "Potassium",
    aliases: ["potassium", "k", "k+", "serum potassium"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mEq/L",
    altUnits: ["mmol/L"],
    range: range(3.5, 5.1),
  },
  {
    id: "chloride",
    name: "Chloride",
    aliases: ["chloride", "cl", "cl-", "serum chloride"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mEq/L",
    altUnits: ["mmol/L"],
    range: range(98, 107),
  },
  {
    id: "bicarbonate",
    name: "Bicarbonate",
    aliases: ["bicarbonate", "hco3", "tco2", "serum bicarbonate"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mEq/L",
    altUnits: ["mmol/L"],
    range: range(22, 29),
  },
  // Lipid
  {
    id: "total_cholesterol",
    name: "Total cholesterol",
    aliases: ["total cholesterol", "cholesterol", "tc", "chol"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(null, 200),
  },
  {
    id: "triglycerides",
    name: "Triglycerides",
    aliases: ["triglycerides", "tg", "triglyceride"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(null, 150),
  },
  {
    id: "hdl",
    name: "HDL cholesterol",
    aliases: ["hdl", "hdl-c", "hdl cholesterol", "good cholesterol"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    rangeMale: range(40, null),
    rangeFemale: range(50, null),
    range: range(40, null),
  },
  {
    id: "ldl",
    name: "LDL cholesterol",
    aliases: ["ldl", "ldl-c", "ldl cholesterol", "bad cholesterol"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(null, 100),
  },
  // Endocrine
  {
    id: "hba1c",
    name: "HbA1c",
    aliases: ["hba1c", "hb a1c", "glycosylated haemoglobin", "glycated hemoglobin", "a1c"],
    specimen: "whole_blood",
    category: "endocrine",
    unit: "%",
    range: range(null, 5.6),
  },
  {
    id: "tsh",
    name: "TSH",
    aliases: ["tsh", "thyroid stimulating hormone", "thyrotropin"],
    specimen: "serum",
    category: "endocrine",
    unit: "µIU/mL",
    altUnits: ["mIU/L"],
    range: range(0.4, 4.0),
  },
  {
    id: "ft4",
    name: "Free T4",
    aliases: ["ft4", "free t4", "free thyroxine"],
    specimen: "serum",
    category: "endocrine",
    unit: "ng/dL",
    range: range(0.8, 1.8),
  },
  {
    id: "ft3",
    name: "Free T3",
    aliases: ["ft3", "free t3", "free triiodothyronine"],
    specimen: "serum",
    category: "endocrine",
    unit: "pg/mL",
    range: range(2.0, 4.4),
  },
  // Iron studies
  {
    id: "serum_iron",
    name: "Serum iron",
    aliases: ["serum iron", "iron", "fe"],
    specimen: "serum",
    category: "biochemistry",
    unit: "µg/dL",
    rangeMale: range(65, 175),
    rangeFemale: range(50, 170),
    range: range(50, 175),
  },
  {
    id: "tibc",
    name: "TIBC",
    aliases: ["tibc", "total iron binding capacity"],
    specimen: "serum",
    category: "biochemistry",
    unit: "µg/dL",
    range: range(250, 450),
  },
  {
    id: "ferritin",
    name: "Ferritin",
    aliases: ["ferritin", "serum ferritin"],
    specimen: "serum",
    category: "biochemistry",
    unit: "ng/mL",
    rangeMale: range(30, 400),
    rangeFemale: range(15, 150),
    range: range(15, 400),
  },
  {
    id: "transferrin_sat",
    name: "Transferrin saturation",
    aliases: ["transferrin saturation", "tsat", "% transferrin saturation"],
    specimen: "serum",
    category: "biochemistry",
    unit: "%",
    range: range(20, 50),
  },
  // Vitamins
  {
    id: "vit_d",
    name: "Vitamin D (25-OH)",
    aliases: ["vitamin d", "vit d", "25-oh vitamin d", "25-hydroxy vitamin d", "cholecalciferol"],
    specimen: "serum",
    category: "biochemistry",
    unit: "ng/mL",
    range: range(30, 100),
  },
  {
    id: "vit_b12",
    name: "Vitamin B12",
    aliases: ["vitamin b12", "vit b12", "b12", "cobalamin"],
    specimen: "serum",
    category: "biochemistry",
    unit: "pg/mL",
    range: range(200, 900),
  },
  // Inflammatory
  {
    id: "crp",
    name: "CRP",
    aliases: ["crp", "c-reactive protein", "c reactive protein"],
    specimen: "serum",
    category: "inflammatory",
    unit: "mg/L",
    range: range(null, 5),
  },
  {
    id: "esr",
    name: "ESR",
    aliases: ["esr", "erythrocyte sedimentation rate", "sed rate"],
    specimen: "whole_blood",
    category: "inflammatory",
    unit: "mm/hr",
    rangeMale: range(null, 15),
    rangeFemale: range(null, 20),
    range: range(null, 20),
  },
  // Urine (common routine fields)
  {
    id: "urine_protein",
    name: "Urine protein",
    aliases: ["urine protein", "proteinuria", "urine albumin"],
    specimen: "urine",
    category: "urine",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "urine_glucose",
    name: "Urine glucose",
    aliases: ["urine glucose", "urine sugar", "glycosuria"],
    specimen: "urine",
    category: "urine",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "urine_rbc",
    name: "Urine RBC",
    aliases: ["urine rbc", "urine red blood cells", "haematuria", "hematuria"],
    specimen: "urine",
    category: "urine",
    unit: "/hpf",
    range: range(null, 2),
  },
  {
    id: "urine_wbc",
    name: "Urine WBC",
    aliases: ["urine wbc", "urine pus cells", "pyuria"],
    specimen: "urine",
    category: "urine",
    unit: "/hpf",
    range: range(null, 5),
  },
  // POC convenience (also in REPORT_TEST_CHIPS)
  {
    id: "rbs",
    name: "RBS",
    aliases: ["rbs", "random blood sugar", "random glucose", "glucometer", "rbs / glucometer"],
    specimen: "whole_blood",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(70, 140),
  },
  // Glucose / diabetes
  {
    id: "fbs",
    name: "FBS",
    aliases: ["fbs", "fasting blood sugar", "fasting glucose", "fpg"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(70, 100),
  },
  {
    id: "ppbs",
    name: "PPBS",
    aliases: ["ppbs", "postprandial blood sugar", "pp glucose", "2hr ppbs"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(null, 140),
  },
  // Extra LFT / enzymes
  {
    id: "ggt",
    name: "GGT",
    aliases: ["ggt", "gamma gt", "gamma glutamyl transferase", "ggtp"],
    specimen: "serum",
    category: "biochemistry",
    unit: "U/L",
    rangeMale: range(0, 55),
    rangeFemale: range(0, 38),
    range: range(0, 55),
  },
  {
    id: "amylase",
    name: "Amylase",
    aliases: ["amylase", "serum amylase"],
    specimen: "serum",
    category: "biochemistry",
    unit: "U/L",
    range: range(30, 110),
  },
  {
    id: "lipase",
    name: "Lipase",
    aliases: ["lipase", "serum lipase"],
    specimen: "serum",
    category: "biochemistry",
    unit: "U/L",
    range: range(0, 60),
  },
  // Minerals
  {
    id: "calcium",
    name: "Calcium",
    aliases: ["calcium", "serum calcium", "ca"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(8.5, 10.5),
  },
  {
    id: "phosphorus",
    name: "Phosphorus",
    aliases: ["phosphorus", "phosphate", "serum phosphorus", "po4"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(2.5, 4.5),
  },
  {
    id: "magnesium",
    name: "Magnesium",
    aliases: ["magnesium", "serum magnesium", "mg"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(1.7, 2.2),
  },
  // Cardiac / coag
  {
    id: "trop_i",
    name: "Troponin I",
    aliases: ["troponin i", "trop i", "trop-i", "ctni"],
    specimen: "serum",
    category: "biochemistry",
    unit: "ng/mL",
    range: range(null, 0.04),
  },
  {
    id: "ck_mb",
    name: "CK-MB",
    aliases: ["ck-mb", "ckmb", "creatine kinase mb"],
    specimen: "serum",
    category: "biochemistry",
    unit: "ng/mL",
    range: range(null, 5),
  },
  {
    id: "nt_probnp",
    name: "NT-proBNP",
    aliases: ["nt-probnp", "probnp", "bnp", "nt probnp"],
    specimen: "serum",
    category: "biochemistry",
    unit: "pg/mL",
    range: range(null, 125),
  },
  {
    id: "d_dimer",
    name: "D-dimer",
    aliases: ["d-dimer", "ddimer", "d dimer"],
    specimen: "plasma",
    category: "haematology",
    unit: "ng/mL",
    range: range(null, 500),
  },
  {
    id: "pt_inr",
    name: "PT / INR",
    aliases: ["pt", "inr", "pt/inr", "prothrombin time"],
    specimen: "plasma",
    category: "haematology",
    unit: "INR",
    range: range(0.8, 1.2),
  },
  {
    id: "aptt",
    name: "aPTT",
    aliases: ["aptt", "ptt", "activated partial thromboplastin time"],
    specimen: "plasma",
    category: "haematology",
    unit: "sec",
    range: range(25, 35),
  },
  // Vitamins / folate
  {
    id: "folate",
    name: "Folate",
    aliases: ["folate", "folic acid", "vitamin b9", "serum folate"],
    specimen: "serum",
    category: "biochemistry",
    unit: "ng/mL",
    range: range(3, 17),
  },
  // Serology / infection
  {
    id: "hbsag",
    name: "HBsAg",
    aliases: ["hbsag", "hepatitis b surface antigen", "hep b"],
    specimen: "serum",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "anti_hcv",
    name: "Anti-HCV",
    aliases: ["anti-hcv", "hcv", "hepatitis c antibody"],
    specimen: "serum",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "hiv",
    name: "HIV",
    aliases: ["hiv", "hiv 1/2", "hiv antibody"],
    specimen: "serum",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "dengue_ns1",
    name: "Dengue NS1",
    aliases: ["dengue ns1", "ns1", "dengue antigen"],
    specimen: "serum",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "dengue_igm",
    name: "Dengue IgM",
    aliases: ["dengue igm", "dengue igm antibody"],
    specimen: "serum",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "mp_smear",
    name: "MP smear",
    aliases: ["mp", "malaria parasite", "mp smear", "peripheral smear for mp"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "widal",
    name: "Widal",
    aliases: ["widal", "widal test", "typhoid serology"],
    specimen: "serum",
    category: "other",
    unit: "titre",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "aso",
    name: "ASO titre",
    aliases: ["aso", "aso titre", "anti streptolysin o"],
    specimen: "serum",
    category: "inflammatory",
    unit: "IU/mL",
    range: range(null, 200),
  },
  {
    id: "ra_factor",
    name: "RA factor",
    aliases: ["ra", "ra factor", "rheumatoid factor", "rf"],
    specimen: "serum",
    category: "inflammatory",
    unit: "IU/mL",
    range: range(null, 14),
  },
  {
    id: "anti_ccp",
    name: "Anti-CCP",
    aliases: ["anti-ccp", "anti ccp", "ccp antibodies"],
    specimen: "serum",
    category: "inflammatory",
    unit: "U/mL",
    range: range(null, 20),
  },
  {
    id: "procalcitonin",
    name: "Procalcitonin",
    aliases: ["procalcitonin", "pct"],
    specimen: "serum",
    category: "inflammatory",
    unit: "ng/mL",
    range: range(null, 0.5),
  },
  // Hormones
  {
    id: "prolactin",
    name: "Prolactin",
    aliases: ["prolactin", "prl"],
    specimen: "serum",
    category: "endocrine",
    unit: "ng/mL",
    range: range(4, 23),
  },
  {
    id: "fsh",
    name: "FSH",
    aliases: ["fsh", "follicle stimulating hormone"],
    specimen: "serum",
    category: "endocrine",
    unit: "mIU/mL",
    range: range(null, null, false, "Cycle-dependent"),
  },
  {
    id: "lh",
    name: "LH",
    aliases: ["lh", "luteinising hormone", "luteinizing hormone"],
    specimen: "serum",
    category: "endocrine",
    unit: "mIU/mL",
    range: range(null, null, false, "Cycle-dependent"),
  },
  {
    id: "beta_hcg",
    name: "Beta-HCG",
    aliases: ["beta hcg", "β-hcg", "hcg", "serum beta hcg"],
    specimen: "serum",
    category: "endocrine",
    unit: "mIU/mL",
    range: range(null, 5),
  },
  {
    id: "psa",
    name: "PSA",
    aliases: ["psa", "prostate specific antigen", "total psa"],
    specimen: "serum",
    category: "other",
    unit: "ng/mL",
    range: range(null, 4),
  },
  // Diff / other haem
  {
    id: "neutrophils",
    name: "Neutrophils",
    aliases: ["neutrophils", "neutrophil %", "neut"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "%",
    range: range(40, 70),
  },
  {
    id: "lymphocytes",
    name: "Lymphocytes",
    aliases: ["lymphocytes", "lymphocyte %", "lymph"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "%",
    range: range(20, 40),
  },
  {
    id: "eosinophils",
    name: "Eosinophils",
    aliases: ["eosinophils", "eosinophil %", "eos"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "%",
    range: range(1, 6),
  },
  {
    id: "monocytes",
    name: "Monocytes",
    aliases: ["monocytes", "monocyte %", "mono"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "%",
    range: range(2, 10),
  },
  {
    id: "basophils",
    name: "Basophils",
    aliases: ["basophils", "basophil %", "baso"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "%",
    range: range(0, 2),
  },
  {
    id: "anc",
    name: "Absolute neutrophil count",
    aliases: ["anc", "absolute neutrophil count", "absolute neutrophils"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "/µL",
    altUnits: ["×10^3/µL"],
    range: range(1500, 8000),
  },
  {
    id: "abs_lymphocytes",
    name: "Absolute lymphocyte count",
    aliases: ["alc", "absolute lymphocyte count", "absolute lymphocytes"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "/µL",
    altUnits: ["×10^3/µL"],
    range: range(1000, 4000),
  },
  {
    id: "peripheral_smear",
    name: "Peripheral smear",
    aliases: ["peripheral smear", "ps", "pbf", "peripheral blood film", "blood smear"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "",
    range: range(null, null, false, "See report"),
  },
  // LFT extras (inv-lib enrichment E1)
  {
    id: "ibil",
    name: "Indirect bilirubin",
    aliases: ["indirect bilirubin", "unconjugated bilirubin", "ibil", "ib"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(0.1, 0.8),
  },
  {
    id: "ag_ratio",
    name: "A/G ratio",
    aliases: ["a/g ratio", "ag ratio", "albumin globulin ratio"],
    specimen: "serum",
    category: "biochemistry",
    unit: "",
    range: range(1.0, 2.5),
  },
  // KFT extras
  {
    id: "egfr",
    name: "eGFR",
    aliases: ["egfr", "estimated gfr", "gfr", "glomerular filtration rate"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mL/min/1.73m²",
    range: range(90, null),
  },
  // Lipid extras
  {
    id: "vldl",
    name: "VLDL cholesterol",
    aliases: ["vldl", "vldl cholesterol", "vldl-c"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(null, 30),
  },
  {
    id: "non_hdl",
    name: "Non-HDL cholesterol",
    aliases: ["non-hdl", "non hdl", "non-hdl cholesterol", "non hdl-c"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(null, 130),
  },
  {
    id: "chol_hdl_ratio",
    name: "Cholesterol / HDL ratio",
    aliases: ["chol/hdl", "tc/hdl", "cholesterol hdl ratio", "total cholesterol/hdl"],
    specimen: "serum",
    category: "biochemistry",
    unit: "",
    range: range(null, 5),
  },
  // Thyroid extras
  {
    id: "tt3",
    name: "Total T3",
    aliases: ["total t3", "tt3", "t3 total", "triiodothyronine"],
    specimen: "serum",
    category: "endocrine",
    unit: "ng/dL",
    altUnits: ["nmol/L"],
    range: range(80, 200),
  },
  {
    id: "tt4",
    name: "Total T4",
    aliases: ["total t4", "tt4", "t4 total", "thyroxine"],
    specimen: "serum",
    category: "endocrine",
    unit: "µg/dL",
    altUnits: ["nmol/L"],
    range: range(5.0, 12.0),
  },
  {
    id: "anti_tpo",
    name: "Anti-TPO",
    aliases: ["anti-tpo", "anti tpo", "tpo antibody", "anti thyroid peroxidase", "thyroid peroxidase antibody"],
    specimen: "serum",
    category: "endocrine",
    unit: "IU/mL",
    range: range(null, 34),
  },
  {
    id: "anti_tg",
    name: "Anti-thyroglobulin",
    aliases: ["anti-tg", "anti tg", "anti thyroglobulin", "thyroglobulin antibody", "anti-thyroglobulin antibody"],
    specimen: "serum",
    category: "endocrine",
    unit: "IU/mL",
    range: range(null, 40),
  },
  // Urine routine extras
  {
    id: "urine_ph",
    name: "Urine pH",
    aliases: ["urine ph", "ph urine", "urinary ph"],
    specimen: "urine",
    category: "urine",
    unit: "",
    range: range(4.5, 8.0),
  },
  {
    id: "urine_sg",
    name: "Urine specific gravity",
    aliases: ["urine sg", "specific gravity", "urine specific gravity", "usg urine"],
    specimen: "urine",
    category: "urine",
    unit: "",
    range: range(1.005, 1.030),
  },
  {
    id: "urine_ketones",
    name: "Urine ketones",
    aliases: ["urine ketones", "ketones urine", "acetone urine", "ketonuria"],
    specimen: "urine",
    category: "urine",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "urine_nitrite",
    name: "Urine nitrite",
    aliases: ["urine nitrite", "nitrite urine", "nitrites"],
    specimen: "urine",
    category: "urine",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "urine_le",
    name: "Urine leukocyte esterase",
    aliases: ["urine le", "leukocyte esterase", "urine leukocyte esterase", "le urine"],
    specimen: "urine",
    category: "urine",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "urine_casts",
    name: "Urine casts",
    aliases: ["urine casts", "casts urine", "cast"],
    specimen: "urine",
    category: "urine",
    unit: "/hpf",
    range: range(null, null, false, "Nil"),
  },
  {
    id: "urine_epithelial",
    name: "Urine epithelial cells",
    aliases: ["urine epithelial cells", "epithelial cells urine", "epith cells"],
    specimen: "urine",
    category: "urine",
    unit: "/hpf",
    range: range(null, null, false, "0–5 /hpf"),
  },
  {
    id: "stool_occult_blood",
    name: "Stool occult blood",
    aliases: ["stool occult blood", "fobt", "guaiac", "occult blood"],
    specimen: "other",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  // --- inv-lib enrichment E2: fever / serology / cardiac / hormones ---
  {
    id: "dengue_igg",
    name: "Dengue IgG",
    aliases: ["dengue igg", "dengue igg antibody"],
    specimen: "serum",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "typhidot",
    name: "Typhidot",
    aliases: ["typhidot", "typhoid igm", "typhoid igg", "salmonella igm"],
    specimen: "serum",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "covid_ag",
    name: "COVID-19 antigen",
    aliases: ["covid antigen", "covid-19 antigen", "sars-cov-2 antigen", "covid ag", "rapid covid"],
    specimen: "other",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "mp_antigen",
    name: "Malaria antigen",
    aliases: ["malaria antigen", "mp antigen", "pf/pv antigen", "rapid malaria", "malaria card"],
    specimen: "whole_blood",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "blood_culture",
    name: "Blood culture",
    aliases: ["blood culture", "blood c/s", "blood cs"],
    specimen: "whole_blood",
    category: "other",
    unit: "",
    range: range(null, null, false, "No growth"),
  },
  {
    id: "urine_culture",
    name: "Urine culture",
    aliases: ["urine culture", "urine c/s", "urine cs", "urine culture and sensitivity"],
    specimen: "urine",
    category: "urine",
    unit: "",
    range: range(null, null, false, "No growth"),
  },
  {
    id: "vdrl",
    name: "VDRL / RPR",
    aliases: ["vdrl", "rpr", "vdrl/rpr", "syphilis serology"],
    specimen: "serum",
    category: "other",
    unit: "",
    range: range(null, null, false, "Non-reactive"),
  },
  {
    id: "anti_hbs",
    name: "Anti-HBs",
    aliases: ["anti-hbs", "anti hbs", "hbsab", "hepatitis b surface antibody"],
    specimen: "serum",
    category: "other",
    unit: "mIU/mL",
    range: range(10, null),
  },
  {
    id: "hbeag",
    name: "HBeAg",
    aliases: ["hbeag", "hbe ag", "hepatitis b e antigen"],
    specimen: "serum",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "trop_t",
    name: "Troponin T",
    aliases: ["troponin t", "trop t", "hstnt", "high sensitivity troponin t"],
    specimen: "serum",
    category: "biochemistry",
    unit: "ng/L",
    altUnits: ["ng/mL"],
    range: range(null, 14),
  },
  {
    id: "ck_total",
    name: "CK (total)",
    aliases: ["ck", "cpk", "creatine kinase", "ck total", "cpk total"],
    specimen: "serum",
    category: "biochemistry",
    unit: "U/L",
    rangeMale: range(30, 200),
    rangeFemale: range(30, 170),
    range: range(30, 200),
  },
  {
    id: "ldh",
    name: "LDH",
    aliases: ["ldh", "lactate dehydrogenase", "ld"],
    specimen: "serum",
    category: "biochemistry",
    unit: "U/L",
    range: range(140, 280),
  },
  {
    id: "estradiol",
    name: "Estradiol (E2)",
    aliases: ["estradiol", "e2", "oestradiol", "estradiol e2"],
    specimen: "serum",
    category: "endocrine",
    unit: "pg/mL",
    range: range(null, null, false, "Cycle-phase dependent"),
  },
  {
    id: "testosterone",
    name: "Testosterone (total)",
    aliases: ["testosterone", "total testosterone", "serum testosterone"],
    specimen: "serum",
    category: "endocrine",
    unit: "ng/dL",
    rangeMale: range(270, 1070),
    rangeFemale: range(15, 70),
    range: range(15, 1070),
  },
  {
    id: "amh",
    name: "AMH",
    aliases: ["amh", "anti mullerian hormone", "anti-müllerian hormone", "anti mullerian"],
    specimen: "serum",
    category: "endocrine",
    unit: "ng/mL",
    range: range(null, null, false, "Age-dependent"),
  },
  {
    id: "cortisol",
    name: "Cortisol (morning)",
    aliases: ["cortisol", "serum cortisol", "morning cortisol", "8 am cortisol"],
    specimen: "serum",
    category: "endocrine",
    unit: "µg/dL",
    range: range(5, 25),
  },
  // --- inv-lib enrichment E3: obgyn / peds / rheum ---
  {
    id: "blood_group",
    name: "Blood group & Rh",
    aliases: ["blood group", "abo rh", "blood group and rh", "blood typing", "abo/rh"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "",
    range: range(null, null, false, "See report"),
  },
  {
    id: "ict",
    name: "Indirect Coombs (ICT)",
    aliases: ["ict", "indirect coombs", "indirect antiglobulin test", "iat"],
    specimen: "serum",
    category: "haematology",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "dct",
    name: "Direct Coombs (DCT)",
    aliases: ["dct", "direct coombs", "direct antiglobulin test", "dat"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "gct_50",
    name: "GCT 50g (1 hour)",
    aliases: ["gct", "gct 50", "glucose challenge test", "50g gct", "o'sullivan test"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(null, 140),
  },
  {
    id: "ogtt_2h",
    name: "OGTT 2 hour",
    aliases: ["ogtt", "ogtt 2h", "oral glucose tolerance test", "gtt 2 hour"],
    specimen: "serum",
    category: "biochemistry",
    unit: "mg/dL",
    range: range(null, 140),
  },
  {
    id: "progesterone",
    name: "Progesterone",
    aliases: ["progesterone", "serum progesterone", "p4"],
    specimen: "serum",
    category: "endocrine",
    unit: "ng/mL",
    range: range(null, null, false, "Cycle-phase dependent"),
  },
  {
    id: "toxoplasma_igg",
    name: "Toxoplasma IgG",
    aliases: ["toxoplasma igg", "toxo igg"],
    specimen: "serum",
    category: "other",
    unit: "IU/mL",
    range: range(null, null, false, "See lab cut-off"),
  },
  {
    id: "toxoplasma_igm",
    name: "Toxoplasma IgM",
    aliases: ["toxoplasma igm", "toxo igm"],
    specimen: "serum",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "rubella_igg",
    name: "Rubella IgG",
    aliases: ["rubella igg", "german measles igg"],
    specimen: "serum",
    category: "other",
    unit: "IU/mL",
    range: range(10, null),
  },
  {
    id: "rubella_igm",
    name: "Rubella IgM",
    aliases: ["rubella igm"],
    specimen: "serum",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "cmv_igg",
    name: "CMV IgG",
    aliases: ["cmv igg", "cytomegalovirus igg"],
    specimen: "serum",
    category: "other",
    unit: "U/mL",
    range: range(null, null, false, "See lab cut-off"),
  },
  {
    id: "cmv_igm",
    name: "CMV IgM",
    aliases: ["cmv igm", "cytomegalovirus igm"],
    specimen: "serum",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "hsv_igg",
    name: "HSV IgG",
    aliases: ["hsv igg", "herpes igg", "hsv 1/2 igg"],
    specimen: "serum",
    category: "other",
    unit: "",
    range: range(null, null, false, "See lab cut-off"),
  },
  {
    id: "hsv_igm",
    name: "HSV IgM",
    aliases: ["hsv igm", "herpes igm"],
    specimen: "serum",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "g6pd",
    name: "G6PD",
    aliases: ["g6pd", "g6pd assay", "glucose-6-phosphate dehydrogenase"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "U/g Hb",
    range: range(null, null, false, "See lab method"),
  },
  {
    id: "sickling",
    name: "Sickling test",
    aliases: ["sickling", "sickling test", "sickle cell test", "solubility test"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "reticulocyte",
    name: "Reticulocyte count",
    aliases: ["retic", "reticulocyte", "reticulocyte count", "retic %"],
    specimen: "whole_blood",
    category: "haematology",
    unit: "%",
    range: range(0.5, 1.5),
  },
  {
    id: "stool_rm",
    name: "Stool R/M",
    aliases: ["stool r/m", "stool routine", "stool microscopy", "stool examination"],
    specimen: "other",
    category: "other",
    unit: "",
    range: range(null, null, false, "See report"),
  },
  {
    id: "ana",
    name: "ANA",
    aliases: ["ana", "antinuclear antibody", "ana if", "ana immunofluorescence"],
    specimen: "serum",
    category: "inflammatory",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "anti_dsdna",
    name: "Anti-dsDNA",
    aliases: ["anti-dsdna", "anti dsdna", "dsdna antibody", "double stranded dna"],
    specimen: "serum",
    category: "inflammatory",
    unit: "IU/mL",
    range: range(null, 30),
  },
  {
    id: "anca",
    name: "ANCA",
    aliases: ["anca", "c-anca", "p-anca", "antineutrophil cytoplasmic antibody"],
    specimen: "serum",
    category: "inflammatory",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
  {
    id: "c3",
    name: "Complement C3",
    aliases: ["c3", "complement c3", "serum c3"],
    specimen: "serum",
    category: "inflammatory",
    unit: "mg/dL",
    range: range(90, 180),
  },
  {
    id: "c4",
    name: "Complement C4",
    aliases: ["c4", "complement c4", "serum c4"],
    specimen: "serum",
    category: "inflammatory",
    unit: "mg/dL",
    range: range(10, 40),
  },
  {
    id: "hla_b27",
    name: "HLA-B27",
    aliases: ["hla-b27", "hla b27", "hlab27"],
    specimen: "whole_blood",
    category: "other",
    unit: "",
    range: range(null, null, false, "Negative"),
  },
];

/**
 * Ordered panels. Selecting a panel scaffolds all listed analytes under one
 * LabReport header (rpt-02 grouping). Plan orders reuse the same definitions.
 */
export const LAB_PANELS: readonly LabPanelDefinition[] = [
  {
    id: "cbc",
    name: "CBC",
    analyteIds: ["hb", "hct", "rbc", "wbc", "plt", "mcv", "mch", "mchc", "rdw"],
  },
  {
    id: "cbc_diff",
    name: "CBC with differential",
    analyteIds: [
      "hb",
      "hct",
      "rbc",
      "wbc",
      "plt",
      "mcv",
      "mch",
      "mchc",
      "rdw",
      "neutrophils",
      "lymphocytes",
      "eosinophils",
      "monocytes",
      "basophils",
      "anc",
      "abs_lymphocytes",
    ],
  },
  {
    id: "lft",
    name: "LFT",
    analyteIds: [
      "tbil",
      "dbil",
      "ibil",
      "sgot",
      "sgpt",
      "alp",
      "ggt",
      "albumin",
      "total_protein",
      "ag_ratio",
    ],
  },
  {
    id: "kft",
    name: "KFT / RFT",
    analyteIds: ["urea", "creatinine", "egfr", "uric_acid"],
  },
  {
    id: "lipid",
    name: "Lipid profile",
    analyteIds: [
      "total_cholesterol",
      "triglycerides",
      "hdl",
      "ldl",
      "vldl",
      "non_hdl",
      "chol_hdl_ratio",
    ],
  },
  {
    id: "thyroid",
    name: "Thyroid profile",
    analyteIds: ["tsh", "ft4", "ft3", "tt3", "tt4", "anti_tpo", "anti_tg"],
  },
  {
    id: "hba1c_panel",
    name: "HbA1c",
    analyteIds: ["hba1c"],
  },
  {
    id: "diabetes",
    name: "Diabetes panel",
    analyteIds: ["rbs", "fbs", "ppbs", "hba1c"],
  },
  {
    id: "urine_routine",
    name: "Urine routine",
    analyteIds: [
      "urine_ph",
      "urine_sg",
      "urine_protein",
      "urine_glucose",
      "urine_ketones",
      "urine_nitrite",
      "urine_le",
      "urine_rbc",
      "urine_wbc",
      "urine_epithelial",
      "urine_casts",
    ],
  },
  {
    id: "electrolytes",
    name: "Electrolytes",
    analyteIds: ["sodium", "potassium", "chloride", "bicarbonate"],
  },
  {
    id: "iron_studies",
    name: "Iron studies",
    analyteIds: ["serum_iron", "tibc", "ferritin", "transferrin_sat"],
  },
  {
    id: "vit_d_b12",
    name: "Vit D / B12",
    analyteIds: ["vit_d", "vit_b12"],
  },
  {
    id: "vitamins",
    name: "Vitamins panel",
    analyteIds: ["vit_d", "vit_b12", "folate"],
  },
  {
    id: "crp_esr",
    name: "CRP / ESR",
    analyteIds: ["crp", "esr"],
  },
  {
    id: "coagulation",
    name: "Coagulation",
    analyteIds: ["pt_inr", "aptt", "d_dimer"],
  },
  {
    id: "cardiac",
    name: "Cardiac markers",
    analyteIds: ["trop_i", "trop_t", "ck_mb", "ck_total", "nt_probnp", "ldh"],
  },
  {
    id: "fever",
    name: "Fever workup",
    analyteIds: [
      "hb",
      "wbc",
      "plt",
      "mp_smear",
      "mp_antigen",
      "widal",
      "typhidot",
      "dengue_ns1",
      "dengue_igm",
      "dengue_igg",
      "covid_ag",
      "crp",
      "blood_culture",
    ],
  },
  {
    id: "serology",
    name: "Viral serology",
    analyteIds: ["hbsag", "anti_hbs", "hbeag", "anti_hcv", "hiv", "vdrl"],
  },
  {
    id: "hormones",
    name: "Hormone panel",
    analyteIds: [
      "fsh",
      "lh",
      "prolactin",
      "estradiol",
      "testosterone",
      "amh",
      "beta_hcg",
      "cortisol",
      "progesterone",
      "psa",
    ],
  },
  {
    id: "anc_profile",
    name: "ANC profile",
    analyteIds: [
      "hb",
      "blood_group",
      "ict",
      "urine_protein",
      "urine_glucose",
      "gct_50",
      "hbsag",
      "hiv",
      "vdrl",
      "tsh",
      "rubella_igg",
    ],
  },
  {
    id: "torch",
    name: "TORCH panel",
    analyteIds: [
      "toxoplasma_igg",
      "toxoplasma_igm",
      "rubella_igg",
      "rubella_igm",
      "cmv_igg",
      "cmv_igm",
      "hsv_igg",
      "hsv_igm",
    ],
  },
  {
    id: "infertility",
    name: "Infertility panel",
    analyteIds: [
      "fsh",
      "lh",
      "prolactin",
      "amh",
      "estradiol",
      "progesterone",
      "testosterone",
      "tsh",
      "beta_hcg",
    ],
  },
  {
    id: "pediatric",
    name: "Pediatric workup",
    analyteIds: [
      "hb",
      "wbc",
      "plt",
      "g6pd",
      "sickling",
      "reticulocyte",
      "peripheral_smear",
      "tbil",
      "stool_rm",
    ],
  },
  {
    id: "arthritis",
    name: "Arthritis panel",
    analyteIds: ["ra_factor", "anti_ccp", "crp", "esr", "aso", "uric_acid", "hla_b27"],
  },
  {
    id: "autoimmune",
    name: "Autoimmune panel",
    analyteIds: [
      "ana",
      "anti_dsdna",
      "anca",
      "c3",
      "c4",
      "ra_factor",
      "anti_ccp",
      "crp",
      "esr",
    ],
  },
  {
    id: "pancreatic",
    name: "Pancreatic enzymes",
    analyteIds: ["amylase", "lipase"],
  },
  {
    id: "minerals",
    name: "Minerals",
    analyteIds: ["calcium", "phosphorus", "magnesium"],
  },
];

/** Plain-film view vocabulary (INV-D6) — used as imaging-basket members. */
export interface ImagingViewDefinition {
  id: string;
  name: string;
  aliases: readonly string[];
}

export const IMAGING_VIEWS: readonly ImagingViewDefinition[] = [
  { id: "pa", name: "PA", aliases: ["pa", "pa view", "posteroanterior"] },
  { id: "ap", name: "AP", aliases: ["ap", "ap view", "anteroposterior"] },
  { id: "lateral", name: "Lateral", aliases: ["lat", "lateral", "lateral view", "side view"] },
  { id: "oblique", name: "Oblique", aliases: ["oblique", "oblique view"] },
  {
    id: "both_oblique",
    name: "Both oblique",
    aliases: ["both oblique", "bilateral oblique", "obliques"],
  },
  { id: "lordotic", name: "Lordotic", aliases: ["lordotic", "ap lordotic"] },
  { id: "skyline", name: "Skyline", aliases: ["skyline", "merchant", "patellar skyline"] },
  {
    id: "flexion_extension",
    name: "Flexion / extension",
    aliases: ["flexion extension", "flex ext", "dynamic views"],
  },
  { id: "erect", name: "Erect", aliases: ["erect", "standing"] },
  { id: "supine", name: "Supine", aliases: ["supine", "lying"] },
];

/**
 * Imaging / bedside orders (Plan + Reports vocabulary).
 * Expandable when `viewIds`, `relatedIds`, and/or `requiresRequisition` are set.
 */
export type ImagingModality =
  | "xray"
  | "ct"
  | "mri"
  | "usg"
  | "echo"
  | "ecg"
  | "other";

export interface ImagingOrderDefinition {
  id: string;
  name: string;
  aliases: readonly string[];
  modality?: ImagingModality;
  /** Default views seeded into the basket (plain films). */
  viewIds?: readonly string[];
  /**
   * Related studies / regions offered as optional checklist members
   * (e.g. CT abdomen → pelvis). Not auto-selected on commit.
   */
  relatedIds?: readonly string[];
  /** Show contrast / site / indication / urgency fields on expand. */
  requiresRequisition?: boolean;
}

export const IMAGING_ORDERS: readonly ImagingOrderDefinition[] = [
  {
    id: "cxr",
    name: "Chest X-ray",
    aliases: ["chest x-ray", "cxr", "chest radiograph", "x-ray chest"],
    modality: "xray",
    viewIds: ["pa", "lateral"],
  },
  { id: "ecg", name: "ECG", aliases: ["ecg", "ekg", "electrocardiogram"], modality: "ecg" },
  {
    id: "usg_abdomen",
    name: "USG abdomen",
    aliases: ["usg abdomen", "ultrasound abdomen", "usg abd"],
    modality: "usg",
  },
  {
    id: "usg_pelvis",
    name: "USG pelvis",
    aliases: ["usg pelvis", "ultrasound pelvis"],
    modality: "usg",
  },
  {
    id: "usg_kub",
    name: "USG KUB",
    aliases: ["usg kub", "ultrasound kub", "kub ultrasound"],
    modality: "usg",
  },
  {
    id: "usg_thyroid",
    name: "USG thyroid",
    aliases: ["usg thyroid", "thyroid ultrasound", "thyroid usg"],
    modality: "usg",
  },
  {
    id: "usg_obstetric",
    name: "USG obstetric",
    aliases: ["usg obstetric", "ob usg", "antenatal usg", "pregnancy ultrasound"],
    modality: "usg",
  },
  {
    id: "usg_breast",
    name: "USG breast",
    aliases: ["usg breast", "breast ultrasound"],
    modality: "usg",
  },
  {
    id: "usg_scrotum",
    name: "USG scrotum",
    aliases: ["usg scrotum", "scrotal ultrasound", "usg testis"],
    modality: "usg",
  },
  {
    id: "echo",
    name: "2D Echo",
    aliases: ["2d echo", "echo", "echocardiography"],
    modality: "echo",
  },
  {
    id: "pft",
    name: "PFT",
    aliases: ["pft", "spirometry", "pulmonary function test"],
    modality: "other",
  },
  {
    id: "xray_kub",
    name: "X-ray KUB",
    aliases: ["x-ray kub", "kub xray", "plain kub"],
    modality: "xray",
    viewIds: ["ap", "erect"],
  },
  {
    id: "xray_spine",
    name: "X-ray spine",
    aliases: ["x-ray spine", "spine xray", "ls spine xray"],
    modality: "xray",
    viewIds: ["ap", "lateral"],
  },
  {
    id: "xray_knee",
    name: "X-ray knee",
    aliases: ["x-ray knee", "knee xray"],
    modality: "xray",
    viewIds: ["ap", "lateral"],
  },
  {
    id: "xray_ankle",
    name: "X-ray ankle",
    aliases: ["x-ray ankle", "ankle xray"],
    modality: "xray",
    viewIds: ["ap", "lateral"],
  },
  {
    id: "xray_shoulder",
    name: "X-ray shoulder",
    aliases: ["x-ray shoulder", "shoulder xray"],
    modality: "xray",
    viewIds: ["ap", "lateral"],
  },
  {
    id: "xray_pelvis",
    name: "X-ray pelvis",
    aliases: ["x-ray pelvis", "pelvis xray"],
    modality: "xray",
    viewIds: ["ap"],
  },
  {
    id: "xray_sinuses",
    name: "X-ray PNS",
    aliases: ["x-ray pns", "pns xray", "x-ray sinuses", "paranasal sinuses"],
    modality: "xray",
    viewIds: ["pa", "lateral"],
  },
  {
    id: "ct_brain",
    name: "CT brain",
    aliases: ["ct brain", "ct head", "ncct brain", "cect brain"],
    modality: "ct",
    requiresRequisition: true,
  },
  {
    id: "ct_neck",
    name: "CT neck",
    aliases: ["ct neck", "cect neck"],
    modality: "ct",
    requiresRequisition: true,
  },
  {
    id: "ct_chest",
    name: "CT chest",
    aliases: ["ct chest", "hrct chest", "ct thorax", "cect chest"],
    modality: "ct",
    requiresRequisition: true,
  },
  {
    id: "ct_abdomen",
    name: "CT abdomen",
    aliases: ["ct abdomen", "ct abd", "cect abdomen"],
    modality: "ct",
    requiresRequisition: true,
  },
  {
    id: "ct_pelvis",
    name: "CT pelvis",
    aliases: ["ct pelvis", "cect pelvis"],
    modality: "ct",
    requiresRequisition: true,
  },
  {
    id: "ct_kub",
    name: "CT KUB",
    aliases: ["ct kub", "ncct kub", "ct urography"],
    modality: "ct",
    requiresRequisition: true,
  },
  {
    id: "ct_spine",
    name: "CT spine",
    aliases: ["ct spine", "ct ls spine", "ct cervical spine"],
    modality: "ct",
    requiresRequisition: true,
    relatedIds: ["ct_cervical", "ct_dorsal", "ct_ls"],
  },
  {
    id: "ct_cervical",
    name: "CT cervical spine",
    aliases: ["ct cervical", "ct c-spine"],
    modality: "ct",
    requiresRequisition: true,
  },
  {
    id: "ct_dorsal",
    name: "CT dorsal spine",
    aliases: ["ct dorsal", "ct thoracic spine", "ct d-spine"],
    modality: "ct",
    requiresRequisition: true,
  },
  {
    id: "ct_ls",
    name: "CT LS spine",
    aliases: ["ct ls spine", "ct lumbar spine", "ct lumbosacral"],
    modality: "ct",
    requiresRequisition: true,
  },
  {
    id: "mri_brain",
    name: "MRI brain",
    aliases: ["mri brain", "mri head"],
    modality: "mri",
    requiresRequisition: true,
  },
  {
    id: "mri_orbit",
    name: "MRI orbit",
    aliases: ["mri orbit", "mri orbits"],
    modality: "mri",
    requiresRequisition: true,
  },
  {
    id: "mri_neck",
    name: "MRI neck",
    aliases: ["mri neck", "mri soft tissue neck"],
    modality: "mri",
    requiresRequisition: true,
  },
  {
    id: "mri_spine",
    name: "MRI spine",
    aliases: ["mri spine", "mri ls spine", "mri cervical spine"],
    modality: "mri",
    requiresRequisition: true,
    relatedIds: ["mri_cervical", "mri_dorsal", "mri_ls"],
  },
  {
    id: "mri_cervical",
    name: "MRI cervical spine",
    aliases: ["mri cervical", "mri c-spine"],
    modality: "mri",
    requiresRequisition: true,
  },
  {
    id: "mri_dorsal",
    name: "MRI dorsal spine",
    aliases: ["mri dorsal", "mri thoracic spine", "mri d-spine"],
    modality: "mri",
    requiresRequisition: true,
  },
  {
    id: "mri_ls",
    name: "MRI LS spine",
    aliases: ["mri ls spine", "mri lumbar", "mri lumbosacral"],
    modality: "mri",
    requiresRequisition: true,
  },
  {
    id: "mri_knee",
    name: "MRI knee",
    aliases: ["mri knee"],
    modality: "mri",
    requiresRequisition: true,
  },
  {
    id: "mri_shoulder",
    name: "MRI shoulder",
    aliases: ["mri shoulder"],
    modality: "mri",
    requiresRequisition: true,
  },
  {
    id: "mri_abdomen",
    name: "MRI abdomen",
    aliases: ["mri abdomen", "mri abd", "mrcp"],
    modality: "mri",
    requiresRequisition: true,
  },
  {
    id: "mri_pelvis",
    name: "MRI pelvis",
    aliases: ["mri pelvis"],
    modality: "mri",
    requiresRequisition: true,
  },
  {
    id: "doppler_ll",
    name: "Doppler lower limb",
    aliases: [
      "doppler lower limb",
      "arterial doppler",
      "venous doppler ll",
      "ll doppler",
    ],
    modality: "usg",
    requiresRequisition: true,
  },
  {
    id: "doppler_ul",
    name: "Doppler upper limb",
    aliases: ["doppler upper limb", "ul doppler", "upper limb doppler"],
    modality: "usg",
    requiresRequisition: true,
  },
  {
    id: "doppler_carotid",
    name: "Carotid Doppler",
    aliases: ["carotid doppler", "doppler carotid", "carotid usg"],
    modality: "usg",
    requiresRequisition: true,
  },
  {
    id: "doppler_obstetric",
    name: "Obstetric Doppler",
    aliases: ["obstetric doppler", "fetal doppler", "umbilical doppler"],
    modality: "usg",
    requiresRequisition: true,
  },
];

const ANALYTE_BY_ID: ReadonlyMap<string, LabAnalyteDefinition> = new Map(
  LAB_ANALYTES.map((a) => [a.id, a]),
);

const ALIAS_INDEX: ReadonlyMap<string, LabAnalyteDefinition> = (() => {
  const map = new Map<string, LabAnalyteDefinition>();
  for (const analyte of LAB_ANALYTES) {
    map.set(normalizeAliasKey(analyte.id), analyte);
    map.set(normalizeAliasKey(analyte.name), analyte);
    for (const alias of analyte.aliases) {
      const key = normalizeAliasKey(alias);
      if (!key || map.has(key)) continue;
      map.set(key, analyte);
    }
  }
  return map;
})();

const IMAGING_BY_ID: ReadonlyMap<string, ImagingOrderDefinition> = new Map(
  IMAGING_ORDERS.map((o) => [o.id, o]),
);

const IMAGING_VIEW_BY_ID: ReadonlyMap<string, ImagingViewDefinition> = new Map(
  IMAGING_VIEWS.map((v) => [v.id, v]),
);

const IMAGING_VIEW_ALIAS_INDEX: ReadonlyMap<string, ImagingViewDefinition> =
  (() => {
    const map = new Map<string, ImagingViewDefinition>();
    for (const view of IMAGING_VIEWS) {
      map.set(normalizeAliasKey(view.id), view);
      map.set(normalizeAliasKey(view.name), view);
      for (const alias of view.aliases) {
        const key = normalizeAliasKey(alias);
        if (!key || map.has(key)) continue;
        map.set(key, view);
      }
    }
    return map;
  })();

export function getLabAnalyteById(id: string): LabAnalyteDefinition | undefined {
  return ANALYTE_BY_ID.get(id);
}

export function getLabPanelById(id: string): LabPanelDefinition | undefined {
  return LAB_PANELS.find((p) => p.id === id);
}

export function getImagingOrderById(
  id: string,
): ImagingOrderDefinition | undefined {
  return IMAGING_BY_ID.get(id);
}

export function getImagingViewById(
  id: string,
): ImagingViewDefinition | undefined {
  return IMAGING_VIEW_BY_ID.get(id);
}

/** True when the imaging study ships default views (expandable basket). */
export function imagingOrderHasViews(
  order: ImagingOrderDefinition | null | undefined,
): boolean {
  return (order?.viewIds?.length ?? 0) > 0;
}

/** True when the study expands for views, related add-ons, and/or requisition. */
export function imagingOrderIsExpandable(
  order: ImagingOrderDefinition | null | undefined,
): boolean {
  if (!order) return false;
  return (
    imagingOrderHasViews(order) ||
    (order.relatedIds?.length ?? 0) > 0 ||
    order.requiresRequisition === true
  );
}

/** Related study options for an imaging basket checklist. */
export function imagingRelatedOptions(order: ImagingOrderDefinition): {
  id: string;
  label: string;
}[] {
  return (order.relatedIds ?? [])
    .map((id) => {
      const related = getImagingOrderById(id);
      return related ? { id: related.id, label: related.name } : null;
    })
    .filter((row): row is { id: string; label: string } => row != null);
}

export function lookupImagingViewByAlias(
  rawName: string | null | undefined,
): ImagingViewDefinition | undefined {
  if (!rawName || !rawName.trim()) return undefined;
  return IMAGING_VIEW_ALIAS_INDEX.get(normalizeAliasKey(rawName));
}

/**
 * Resolve a free-text / OCR name to a library analyte via id, display name, or
 * alias (case/whitespace-insensitive). Returns undefined when unmatched.
 */
export function lookupLabAnalyteByAlias(
  rawName: string | null | undefined,
): LabAnalyteDefinition | undefined {
  if (!rawName || !rawName.trim()) return undefined;
  return ALIAS_INDEX.get(normalizeAliasKey(rawName));
}

/** Pick the sex-appropriate range; falls back to unsexed `range`. */
export function resolveLabAnalyteRange(
  analyte: LabAnalyteDefinition,
  sex?: PatientSexForRange,
): LabReferenceRange | null {
  if (sex === "male" && analyte.rangeMale) return analyte.rangeMale;
  if (sex === "female" && analyte.rangeFemale) return analyte.rangeFemale;
  return analyte.range ?? analyte.rangeMale ?? analyte.rangeFemale ?? null;
}

export function isLabRangeProvisional(rangeValue: LabReferenceRange | null | undefined): boolean {
  if (!rangeValue) return false;
  return rangeValue.reviewed !== true;
}

/** Microcopy required whenever a library default range is shown (RPT-D5). */
export const LAB_RANGE_VARIES_MICROCOPY =
  "Default range — varies by lab / method. Printed report range wins when available.";

/**
 * Parse a numeric test value. Accepts plain numbers and common decorations
 * ("<", ">", trailing units stripped loosely by taking the first number).
 */
export function parseNumericTestValue(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const match = trimmed.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

export interface SuggestInterpretationInput {
  value: string | null | undefined;
  refLow?: number | null;
  refHigh?: number | null;
  /** When set, printed/text ranges skip numeric auto-flag (doctor judges). */
  refText?: string | null;
}

/**
 * Suggest `interpretation` from numeric value vs numeric range. Returns null
 * when value/range is non-numeric, incomplete, or only `refText` is present.
 * Always a **suggestion** — doctor may override; never hard-flags (RPT-D5).
 */
export function suggestInterpretationFromRange(
  input: SuggestInterpretationInput,
): TestResultInterpretation | null {
  const text = trimOrNull(input.refText ?? null);
  // Printed / qualitative range present → do not auto-derive numeric flag.
  if (text) return null;

  const value = parseNumericTestValue(input.value);
  if (value == null) return null;

  const low = typeof input.refLow === "number" && Number.isFinite(input.refLow) ? input.refLow : null;
  const high =
    typeof input.refHigh === "number" && Number.isFinite(input.refHigh) ? input.refHigh : null;
  if (low == null && high == null) return null;

  if (low != null && value < low) return "low";
  if (high != null && value > high) return "high";
  return "normal";
}

function rangeToRowFields(r: LabReferenceRange | null): Pick<
  TestResultRow,
  "refLow" | "refHigh" | "refText"
> {
  if (!r) return { refLow: null, refHigh: null, refText: null };
  return {
    refLow: typeof r.low === "number" ? r.low : null,
    refHigh: typeof r.high === "number" ? r.high : null,
    refText: trimOrNull(r.text ?? null),
  };
}

/** Prefill unit + default range fields from a library analyte. */
export function analyteToRowPrefill(
  analyte: LabAnalyteDefinition,
  sex?: PatientSexForRange,
): Pick<TestResultRow, "name" | "unit" | "refLow" | "refHigh" | "refText"> {
  const r = resolveLabAnalyteRange(analyte, sex);
  return {
    name: analyte.name,
    unit: analyte.unit || null,
    ...rangeToRowFields(r),
  };
}

export interface ScaffoldPanelOptions {
  source?: TestResultSource;
  sex?: PatientSexForRange;
  /** Optional report date stamped on the header. */
  reportDate?: string | null;
  /** Optional factory override (tests). Defaults to `crypto.randomUUID`. */
  createId?: () => string;
}

export interface ScaffoldedLabPanel {
  report: LabReport;
  rows: TestResultRow[];
}

/**
 * Scaffold a panel: one `LabReport` header + ordered analyte rows linked via
 * `reportId`, with unit + default range prefilled. Skips unknown analyte ids.
 */
export function scaffoldLabPanel(
  panelId: string,
  options: ScaffoldPanelOptions = {},
): ScaffoldedLabPanel | null {
  const panel = getLabPanelById(panelId);
  if (!panel) return null;

  const createId = options.createId ?? (() => crypto.randomUUID());
  const source: TestResultSource = options.source ?? "patient_report";
  const reportId = createId();

  const report: LabReport = {
    id: reportId,
    kind: "lab",
    title: panel.name,
    reportDate: trimOrNull(options.reportDate ?? null),
    labName: null,
    attachmentIds: [],
    findings: null,
    entryMethod: "manual",
  };

  const rows: TestResultRow[] = [];
  for (const analyteId of panel.analyteIds) {
    const analyte = getLabAnalyteById(analyteId);
    if (!analyte) continue;
    const prefill = analyteToRowPrefill(analyte, options.sex);
    rows.push({
      id: createId(),
      source,
      name: prefill.name,
      value: null,
      unit: prefill.unit,
      date: null,
      interpretation: null,
      notes: null,
      reportId,
      refLow: prefill.refLow,
      refHigh: prefill.refHigh,
      refText: prefill.refText,
    });
  }

  return { report, rows };
}

/** Empty free-text custom analyte row (v1 — doctor library persist is rpt-06). */
export function createCustomTestResultRow(
  source: TestResultSource = "patient_report",
  createId: () => string = () => crypto.randomUUID(),
): TestResultRow {
  return {
    id: createId(),
    source,
    name: "",
    value: null,
    unit: null,
    date: null,
    interpretation: null,
    notes: null,
    reportId: null,
    refLow: null,
    refHigh: null,
    refText: null,
  };
}

/** Prefill a single catalog/library analyte as one ungrouped row. */
export function scaffoldLabAnalyteRow(
  analyteIdOrAlias: string,
  options: ScaffoldPanelOptions = {},
): TestResultRow | null {
  const analyte =
    getLabAnalyteById(analyteIdOrAlias) ?? lookupLabAnalyteByAlias(analyteIdOrAlias);
  if (!analyte) return null;
  const createId = options.createId ?? (() => crypto.randomUUID());
  const prefill = analyteToRowPrefill(analyte, options.sex);
  return {
    id: createId(),
    source: options.source ?? "patient_report",
    name: prefill.name,
    value: null,
    unit: prefill.unit,
    date: null,
    interpretation: null,
    notes: null,
    reportId: null,
    refLow: prefill.refLow,
    refHigh: prefill.refHigh,
    refText: prefill.refText,
  };
}
