export type FamilyHistoryCatalogCondition =
  | "htn"
  | "dm"
  | "cad"
  | "stroke"
  | "early-cardiac-death"
  | "cancer"
  | "epilepsy"
  | "asthma"
  | "psychiatric"
  | "ckd"
  | "thyroid"
  | "tb"
  | "dyslipidemia"
  | "obesity"
  | "dementia"
  | "autoimmune"
  | "anemia"
  | "gout";

export interface FamilyHistoryConditionDef {
  value: FamilyHistoryCatalogCondition;
  label: string;
  searchTerms: readonly string[];
}

export const FAMILY_HISTORY_CONDITION_CATALOG: readonly FamilyHistoryConditionDef[] = [
  {
    value: "htn",
    label: "Hypertension",
    searchTerms: ["htn", "hypertension", "high blood pressure", "hbp", "bp"],
  },
  {
    value: "dm",
    label: "Diabetes mellitus",
    searchTerms: ["dm", "diabetes", "diabetes mellitus", "t2dm", "type 2 diabetes", "sugar"],
  },
  {
    value: "cad",
    label: "Coronary artery disease",
    searchTerms: ["cad", "coronary artery disease", "ihd", "ischemic heart disease", "heart disease", "angina", "mi", "heart attack"],
  },
  {
    value: "stroke",
    label: "Stroke",
    searchTerms: ["stroke", "cva", "cerebrovascular", "brain attack"],
  },
  {
    value: "early-cardiac-death",
    label: "Early cardiac death",
    searchTerms: ["early cardiac death", "sudden cardiac death", "scd", "sudden death", "premature cardiac death"],
  },
  {
    value: "cancer",
    label: "Cancer",
    searchTerms: ["cancer", "malignancy", "carcinoma", "tumor", "tumour", "ca"],
  },
  {
    value: "epilepsy",
    label: "Epilepsy",
    searchTerms: ["epilepsy", "seizure", "seizures", "convulsion"],
  },
  {
    value: "asthma",
    label: "Asthma",
    searchTerms: ["asthma", "bronchial asthma", "reactive airway"],
  },
  {
    value: "psychiatric",
    label: "Psychiatric illness",
    searchTerms: ["psychiatric", "mental illness", "depression", "anxiety", "bipolar", "schizophrenia", "psychosis"],
  },
  {
    value: "ckd",
    label: "Chronic kidney disease",
    searchTerms: ["ckd", "chronic kidney disease", "kidney disease", "renal failure", "nephropathy"],
  },
  {
    value: "thyroid",
    label: "Thyroid disorder",
    searchTerms: ["thyroid", "hypothyroid", "hyperthyroid", "goitre", "goiter"],
  },
  {
    value: "tb",
    label: "Tuberculosis",
    searchTerms: ["tb", "tuberculosis", "tbc"],
  },
  {
    value: "dyslipidemia",
    label: "Dyslipidemia",
    searchTerms: ["dyslipidemia", "hyperlipidemia", "high cholesterol", "cholesterol", "lipid"],
  },
  {
    value: "obesity",
    label: "Obesity",
    searchTerms: ["obesity", "obese", "overweight"],
  },
  {
    value: "dementia",
    label: "Dementia",
    searchTerms: ["dementia", "alzheimer", "alzheimers", "memory loss", "cognitive decline"],
  },
  {
    value: "autoimmune",
    label: "Autoimmune disease",
    searchTerms: ["autoimmune", "lupus", "sle", "rheumatoid", "ra", "psoriasis", "scleroderma"],
  },
  {
    value: "anemia",
    label: "Anemia",
    searchTerms: ["anemia", "anaemia", "thalassemia", "sickle cell"],
  },
  {
    value: "gout",
    label: "Gout",
    searchTerms: ["gout", "hyperuricemia"],
  },
] as const;

const CONDITION_BY_VALUE = new Map(
  FAMILY_HISTORY_CONDITION_CATALOG.map((def) => [def.value, def] as const),
);

const ALIAS_TO_CONDITION = new Map<string, FamilyHistoryCatalogCondition>();
for (const def of FAMILY_HISTORY_CONDITION_CATALOG) {
  for (const term of def.searchTerms) {
    ALIAS_TO_CONDITION.set(term.trim().toLowerCase(), def.value);
  }
  ALIAS_TO_CONDITION.set(def.value, def.value);
  ALIAS_TO_CONDITION.set(def.label.trim().toLowerCase(), def.value);
}

export function familyHistoryConditionLabel(value: FamilyHistoryCatalogCondition): string {
  return CONDITION_BY_VALUE.get(value)?.label ?? value;
}

export function familyHistoryConditionMatchesQuery(
  def: FamilyHistoryConditionDef,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (def.label.toLowerCase().includes(q)) return true;
  if (def.value.includes(q)) return true;
  return def.searchTerms.some((term) => term.toLowerCase().includes(q));
}

export function resolveFamilyHistoryCatalogCondition(
  query: string,
): FamilyHistoryCatalogCondition | undefined {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return undefined;

  const direct = ALIAS_TO_CONDITION.get(trimmed);
  if (direct) return direct;

  for (const def of FAMILY_HISTORY_CONDITION_CATALOG) {
    if (familyHistoryConditionMatchesQuery(def, trimmed)) {
      const exact = def.searchTerms.some((term) => term.toLowerCase() === trimmed);
      const exactLabel = def.label.toLowerCase() === trimmed;
      if (exact || exactLabel || def.label.toLowerCase().startsWith(trimmed)) {
        return def.value;
      }
    }
  }

  const singleMatch = FAMILY_HISTORY_CONDITION_CATALOG.filter((def) =>
    familyHistoryConditionMatchesQuery(def, trimmed),
  );
  if (singleMatch.length === 1) return singleMatch[0]!.value;

  return undefined;
}

export function filterFamilyHistoryConditionCatalog(
  options: readonly FamilyHistoryConditionDef[],
  query: string,
): FamilyHistoryConditionDef[] {
  const q = query.trim();
  if (!q) return [...options];
  return options.filter((def) => familyHistoryConditionMatchesQuery(def, q));
}
