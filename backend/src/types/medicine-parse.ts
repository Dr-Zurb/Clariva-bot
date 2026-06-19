/**
 * Chart medicine free-text parse types (medical-history med redesign).
 *
 * Mirrors the frontend deterministic medicine-line parser so the AI output is a
 * drop-in alternate extractor: one structured medicine per detected drug. Non-PHI
 * lookup — the doctor's typed line is redacted before the prompt.
 */

/** Which model tier to use (mirrors config `MedicineParseModelTier`). */
export type MedicineParseTier = 'default' | 'escalation';

export interface ParseMedicineRequest {
  /** Doctor's free-typed medication line (PHI — redacted before the prompt). */
  text: string;
  /** Model tier; `default` (mini) auto-gate, `escalation` (flagship) on refine. */
  tier?: MedicineParseTier;
}

/**
 * One parsed medicine — keys mirror the frontend `ChartMedicationPatch` so the
 * client merges AI + deterministic output through one mapping path. All sig
 * fields are optional; the server drops anything off the bounded vocabularies.
 */
/** One ingredient of a fixed-dose combination ("600/300" → two entries). */
export interface AiParsedStrengthComponent {
  value: number;
  unit?: string | null;
}

export interface AiParsedMedicine {
  /** Generic/brand drug name in plain English (vernacular translated). */
  name: string;
  /** Strength quantity, e.g. 500 in "500 mg". */
  strengthValue?: number | null;
  /** Strength unit: mg | g | mcg | iu | pct. */
  strengthUnit?: string | null;
  /**
   * Fixed-dose-combination strength, one entry per active ingredient
   * (e.g. Rcinex "600/300" → [{600,mg},{300,mg}]). Set INSTEAD of
   * strengthValue/strengthUnit for combos. Null for single-ingredient drugs.
   */
  strengthComponents?: AiParsedStrengthComponent[] | null;
  /** Per-dose quantity, e.g. 2 in "2 tab". */
  doseQty?: number | null;
  /** Per-dose unit: tab | cap | ml | spoon | drops | puff | sachet | unit | application. */
  doseUnit?: string | null;
  /** Frequency code: OD | BID | … | Q12H | QW | PRN | STAT. */
  frequencyCode?: string | null;
  /** Dose timing pattern when stated inline, e.g. "1-0-1". */
  doseSchedule?: string | null;
  /** Pharmaceutical form (tablet, syrup, …). */
  form?: string | null;
  /** Adherence: regular | irregular | prn. */
  intakePattern?: string | null;
  /** Origin: prescribed | self. */
  source?: string | null;
  /** How long on the drug — e.g. 5 in "for 5 years". */
  startedAgoValue?: number | null;
  /** days | weeks | months | years */
  startedAgoUnit?: string | null;
  /** Lifecycle: "active" (default) | "past" when the drug was discontinued. */
  status?: string | null;
  /** Time since the drug was stopped — e.g. 2 in "stopped 2 months ago". */
  stoppedAgoValue?: number | null;
  /** days | weeks | months | years */
  stoppedAgoUnit?: string | null;
  /** Why it was stopped: resolved | side_effects | cost | patient_choice | other. */
  stopReason?: string | null;
  /** Unmodelled trailing free text → note. */
  instructions?: string | null;
  /** Food/timing: before_food | after_food | with_food | empty_stomach | bedtime. */
  foodTiming?: string | null;
}

export interface ParseMedicineResult {
  medicines: AiParsedMedicine[];
}
