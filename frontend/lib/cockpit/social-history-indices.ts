import {
  DEFAULT_SOCIAL_HISTORY_THRESHOLDS,
  SOCIAL_HISTORY_THRESHOLDS,
} from "@/lib/cockpit/social-history-thresholds";

export type SocialHistoryDurationUnit = "years" | "months" | "days";

export const SOCIAL_HISTORY_DURATION_UNITS = [
  { value: "years" as const, label: "Years" },
  { value: "months" as const, label: "Months" },
  { value: "days" as const, label: "Days" },
] as const satisfies readonly { value: SocialHistoryDurationUnit; label: string }[];

/** Serialize duration for derived TEXT (e.g. `5 yr`, `18 mo`, `14 d`). */
export function formatSocialHistoryDurationSuffix(
  value: number,
  unit?: SocialHistoryDurationUnit,
): string {
  if (unit === "months") return `${value} mo`;
  if (unit === "days") return `${value} d`;
  return `${value} yr`;
}

/** Parse duration token from derived TEXT. */
export function parseSocialHistoryDurationSuffix(
  raw: string,
): { value: number; unit: SocialHistoryDurationUnit } | null {
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(yr|mo|d)$/i);
  if (!match) return null;
  const token = match[2].toLowerCase();
  return {
    value: Number(match[1]),
    unit: token === "mo" ? "months" : token === "d" ? "days" : "years",
  };
}

export function parseDurationToken(token: string): SocialHistoryDurationUnit {
  const lower = token.toLowerCase();
  if (lower === "mo") return "months";
  if (lower === "d") return "days";
  return "years";
}

export function maxForDurationUnit(unit: SocialHistoryDurationUnit = "years"): number {
  if (unit === "months") return 1200;
  if (unit === "days") return 365;
  return 100;
}

export function durationUnitChipLabel(unit: SocialHistoryDurationUnit): string {
  if (unit === "months") return "Mo";
  if (unit === "days") return "D";
  return "Yr";
}

/** Persist only non-default units (years is implied when omitted). */
export function normalizeStoredDurationUnit(
  unit?: SocialHistoryDurationUnit | null,
): SocialHistoryDurationUnit | undefined {
  if (unit === "months" || unit === "days") return unit;
  return undefined;
}

export interface CageAnswers {
  cutDown: boolean;
  annoyed: boolean;
  guilty: boolean;
  eyeOpener: boolean;
  /** When true, the CAGE block is expanded in the UI. */
  enabled?: boolean;
}

export interface AuditCAnswers {
  /** Q1 — drinking frequency (0–4). */
  frequency?: number | null;
  /** Q2 — typical quantity per drinking day (0–4). */
  typicalQuantity?: number | null;
  /** Q3 — ≥6-drink binge frequency (0–4). */
  bingeFrequency?: number | null;
  /** When true, the AUDIT-C block is expanded in the UI. */
  enabled?: boolean;
}

/** WHO AUDIT Q4–Q10 extension (Q1–Q3 live on {@link AuditCAnswers}). */
export interface AuditFullAnswers {
  /** Q4 — unable to stop once started (0–4). */
  unableToStop?: number | null;
  /** Q5 — failed to meet expectations (0–4). */
  failedExpectations?: number | null;
  /** Q6 — morning drink after heavy session (0–4). */
  morningDrink?: number | null;
  /** Q7 — guilt or remorse (0–4). */
  guiltRemorse?: number | null;
  /** Q8 — blackout / memory loss (0–4). */
  blackout?: number | null;
  /** Q9 — injury to self or others (0, 2, or 4). */
  injury?: number | null;
  /** Q10 — others concerned / suggested cut down (0, 2, or 4). */
  othersConcerned?: number | null;
  /** When true, the AUDIT-10 block is expanded in the UI. */
  enabled?: boolean;
}

export type AuditFullSeverity = "low" | "hazardous" | "harmful" | "dependence";

export const AUDIT_FULL_SEVERITY_LABELS: Record<AuditFullSeverity, string> = {
  low: "low risk",
  hazardous: "hazardous",
  harmful: "harmful",
  dependence: "possible dependence",
};

export interface AuditCScoreOption {
  score: number;
  label: string;
}

export interface AuditCQuestion {
  key: keyof Pick<AuditCAnswers, "frequency" | "typicalQuantity" | "bingeFrequency">;
  prompt: string;
  options: readonly AuditCScoreOption[];
}

/** Standard CAGE alcohol screen — tap = patient answered yes. */
export const CAGE_QUESTIONS = [
  {
    key: "cutDown" as const,
    letter: "C",
    label: "Cut down",
    fullQuestion: "Have you ever felt you should cut down on your drinking?",
  },
  {
    key: "annoyed" as const,
    letter: "A",
    label: "Annoyed",
    fullQuestion: "Have people annoyed you by criticizing your drinking?",
  },
  {
    key: "guilty" as const,
    letter: "G",
    label: "Guilty",
    fullQuestion: "Have you ever felt guilty about your drinking?",
  },
  {
    key: "eyeOpener" as const,
    letter: "E",
    label: "Eye-opener",
    fullQuestion:
      "Have you ever had a drink first thing in the morning (eye-opener) to steady nerves or a hangover?",
  },
] as const;

export const CAGE_SCREEN_HELPER =
  "Mark yes for each question the patient endorses. ≥2/4 = screen positive.";

/** WHO AUDIT-C — three 0–4 questions; total 0–12. */
export const AUDIT_C_QUESTIONS: readonly AuditCQuestion[] = [
  {
    key: "frequency",
    prompt: "How often do you have a drink containing alcohol?",
    options: [
      { score: 0, label: "Never" },
      { score: 1, label: "Monthly or less" },
      { score: 2, label: "2–4 times a month" },
      { score: 3, label: "2–3 times a week" },
      { score: 4, label: "4+ times a week" },
    ],
  },
  {
    key: "typicalQuantity",
    prompt: "How many drinks do you have on a typical day when drinking?",
    options: [
      { score: 0, label: "1–2" },
      { score: 1, label: "3–4" },
      { score: 2, label: "5–6" },
      { score: 3, label: "7–9" },
      { score: 4, label: "10+" },
    ],
  },
  {
    key: "bingeFrequency",
    prompt: "How often do you have six or more drinks on one occasion?",
    options: [
      { score: 0, label: "Never" },
      { score: 1, label: "Less than monthly" },
      { score: 2, label: "Monthly" },
      { score: 3, label: "Weekly" },
      { score: 4, label: "Daily or almost daily" },
    ],
  },
] as const;

export const AUDIT_C_SCREEN_HELPER =
  "Select the best-fitting answer for each question (0–4). ≥4/12 = screen positive.";

/** Standard WHO AUDIT frequency scale (Q1–Q8). */
export const AUDIT_STANDARD_FREQUENCY_OPTIONS: readonly AuditCScoreOption[] = [
  { score: 0, label: "Never" },
  { score: 1, label: "Less than monthly" },
  { score: 2, label: "Monthly" },
  { score: 3, label: "Weekly" },
  { score: 4, label: "Daily or almost daily" },
] as const;

/** WHO AUDIT Q9–Q10 yes/no with timeframe (scores 0, 2, 4). */
export const AUDIT_YES_NO_LAST_YEAR_OPTIONS: readonly AuditCScoreOption[] = [
  { score: 0, label: "No" },
  { score: 2, label: "Yes, but not in the last year" },
  { score: 4, label: "Yes, during the last year" },
] as const;

export type AuditFullQuestionKey = keyof Omit<AuditFullAnswers, "enabled">;

export interface AuditFullQuestion {
  key: AuditFullQuestionKey;
  number: number;
  prompt: string;
  options: readonly AuditCScoreOption[];
}

/** WHO AUDIT Q4–Q10 (consumption Q1–Q3 reuse {@link AUDIT_C_QUESTIONS}). */
export const AUDIT_10_EXTENDED_QUESTIONS: readonly AuditFullQuestion[] = [
  {
    key: "unableToStop",
    number: 4,
    prompt: "How often during the last year have you been unable to stop drinking once you had started?",
    options: AUDIT_STANDARD_FREQUENCY_OPTIONS,
  },
  {
    key: "failedExpectations",
    number: 5,
    prompt:
      "How often during the last year have you failed to do what was normally expected of you because of drinking?",
    options: AUDIT_STANDARD_FREQUENCY_OPTIONS,
  },
  {
    key: "morningDrink",
    number: 6,
    prompt:
      "How often during the last year have you needed a first drink in the morning to get yourself going after a heavy drinking session?",
    options: AUDIT_STANDARD_FREQUENCY_OPTIONS,
  },
  {
    key: "guiltRemorse",
    number: 7,
    prompt: "How often during the last year have you had a feeling of guilt or remorse after drinking?",
    options: AUDIT_STANDARD_FREQUENCY_OPTIONS,
  },
  {
    key: "blackout",
    number: 8,
    prompt:
      "How often during the last year have you been unable to remember what happened the night before because of your drinking?",
    options: AUDIT_STANDARD_FREQUENCY_OPTIONS,
  },
  {
    key: "injury",
    number: 9,
    prompt: "Have you or someone else been injured because of your drinking?",
    options: AUDIT_YES_NO_LAST_YEAR_OPTIONS,
  },
  {
    key: "othersConcerned",
    number: 10,
    prompt:
      "Has a relative, friend, doctor, or other health worker been concerned about your drinking or suggested you cut down?",
    options: AUDIT_YES_NO_LAST_YEAR_OPTIONS,
  },
] as const;

export const AUDIT_10_SCREEN_HELPER =
  "Full WHO AUDIT (10 questions). Q1–Q3 match AUDIT-C. Total 0–40: ≥8 hazardous · ≥16 harmful · ≥20 possible dependence.";

/** @deprecated Read `SOCIAL_HISTORY_THRESHOLDS.auditCPositive` for runtime value. */
export const AUDIT_C_POSITIVE_THRESHOLD = DEFAULT_SOCIAL_HISTORY_THRESHOLDS.auditCPositive;

/** Converts a duration value + unit to fractional years (months ÷ 12, days ÷ 365.25). */
export function durationToYears(
  value?: number,
  unit: SocialHistoryDurationUnit = "years",
): number | null {
  if (value == null || value <= 0) return null;
  if (unit === "months") return value / 12;
  if (unit === "days") return value / 365.25;
  return value;
}

/** Pack-years = (cigarettes per day ÷ 20) × years smoked; 1 decimal place. */
export function packYears(
  perDay?: number,
  duration?: number,
  durationUnit: SocialHistoryDurationUnit = "years",
): number | null {
  const years = durationToYears(duration, durationUnit);
  if (perDay == null || years == null) return null;
  if (perDay <= 0) return null;
  return Math.round((perDay / 20) * years * 10) / 10;
}

/** CAGE score from four yes/no answers; ≥2 is screen positive. */
export function cageScore(cage?: CageAnswers): { score: number; positive: boolean } | null {
  if (!cage) return null;
  const score = [cage.cutDown, cage.annoyed, cage.guilty, cage.eyeOpener].filter(Boolean).length;
  return { score, positive: score >= SOCIAL_HISTORY_THRESHOLDS.cagePositive };
}

function isAuditCAnswerScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
}

/** AUDIT-C score from three 0–4 answers; all three required for a total. */
export function auditCScore(
  auditC?: AuditCAnswers | null,
): { score: number; positive: boolean } | null {
  if (!auditC) return null;
  const { frequency, typicalQuantity, bingeFrequency } = auditC;
  if (
    !isAuditCAnswerScore(frequency) ||
    !isAuditCAnswerScore(typicalQuantity) ||
    !isAuditCAnswerScore(bingeFrequency)
  ) {
    return null;
  }
  const score = frequency + typicalQuantity + bingeFrequency;
  return { score, positive: score >= SOCIAL_HISTORY_THRESHOLDS.auditCPositive };
}

/** Non-diagnostic hint when AUDIT-C is screen positive. */
export function auditCClinicalHint(
  result: { positive: boolean } | null | undefined,
): string | null {
  if (!result?.positive) return null;
  return "AUDIT-C positive: consider brief intervention and further assessment.";
}

/** True when a CAGE object carries saved answers (incl. 0/4). */
export function cageHasPersistedData(cage?: CageAnswers | null): boolean {
  return cage != null && cageScore(cage) != null;
}

/** Expand CAGE when explicitly opened or carry-forward has answers (unless collapsed). */
export function isCagePanelOpen(cage?: CageAnswers | null): boolean {
  if (!cage) return false;
  if (cage.enabled === false) return false;
  if (cage.enabled === true) return true;
  return cageHasPersistedData(cage);
}

/** True when any AUDIT-C answer is stored. */
export function auditCHasPersistedData(auditC?: AuditCAnswers | null): boolean {
  if (!auditC) return false;
  return (
    auditC.frequency != null ||
    auditC.typicalQuantity != null ||
    auditC.bingeFrequency != null
  );
}

/** Expand AUDIT-C when explicitly opened or carry-forward has answers (unless collapsed). */
export function isAuditCPanelOpen(auditC?: AuditCAnswers | null): boolean {
  if (!auditC) return false;
  if (auditC.enabled === false) return false;
  if (auditC.enabled === true) return true;
  return auditCHasPersistedData(auditC);
}

const AUDIT_FULL_EXTENSION_KEYS: readonly AuditFullQuestionKey[] = [
  "unableToStop",
  "failedExpectations",
  "morningDrink",
  "guiltRemorse",
  "blackout",
  "injury",
  "othersConcerned",
];

function isAuditFullExtensionScore(key: AuditFullQuestionKey, value: unknown): value is number {
  if (typeof value !== "number" || !Number.isInteger(value)) return false;
  if (key === "injury" || key === "othersConcerned") {
    return value === 0 || value === 2 || value === 4;
  }
  return value >= 0 && value <= 4;
}

/** True when any AUDIT Q4–Q10 answer is stored. */
export function auditFullHasPersistedData(auditFull?: AuditFullAnswers | null): boolean {
  if (!auditFull) return false;
  return AUDIT_FULL_EXTENSION_KEYS.some((key) => auditFull[key] != null);
}

/** Expand AUDIT-10 when explicitly opened or carry-forward has Q4–Q10 answers. */
export function isAuditFullPanelOpen(
  auditFull?: AuditFullAnswers | null,
  auditC?: AuditCAnswers | null,
): boolean {
  if (!auditFull && !auditC) return false;
  if (auditFull?.enabled === false) return false;
  if (auditFull?.enabled === true) return true;
  if (auditFullHasPersistedData(auditFull)) return true;
  return auditFullScore(auditC, auditFull) != null;
}

/** WHO AUDIT-10 severity band from total score (0–40). */
export function auditFullSeverity(score: number): AuditFullSeverity {
  const { auditFullDependence, auditFullHarmful, auditFullHazardous } = SOCIAL_HISTORY_THRESHOLDS;
  if (score >= auditFullDependence) return "dependence";
  if (score >= auditFullHarmful) return "harmful";
  if (score >= auditFullHazardous) return "hazardous";
  return "low";
}

/** Full AUDIT-10 score; null until all 10 questions answered. */
export function auditFullScore(
  auditC?: AuditCAnswers | null,
  auditFull?: AuditFullAnswers | null,
): { score: number; severity: AuditFullSeverity } | null {
  const consumption = auditCScore(auditC);
  if (!consumption || !auditFull) return null;

  let extensionTotal = 0;
  for (const key of AUDIT_FULL_EXTENSION_KEYS) {
    const value = auditFull[key];
    if (!isAuditFullExtensionScore(key, value)) return null;
    extensionTotal += value;
  }

  const score = consumption.score + extensionTotal;
  return { score, severity: auditFullSeverity(score) };
}

/** Non-diagnostic hint for elevated full AUDIT severity (null for low risk). */
export function auditFullClinicalHint(
  result: { severity: AuditFullSeverity } | null | undefined,
): string | null {
  if (!result || result.severity === "low") return null;
  const label = AUDIT_FULL_SEVERITY_LABELS[result.severity];
  return `AUDIT-10 ${label}: consider structured assessment and brief intervention.`;
}

/** Collect Q1–Q10 answer scores in order for serialize/parse. */
export function auditFullAnswerVector(
  auditC?: AuditCAnswers | null,
  auditFull?: AuditFullAnswers | null,
): number[] | null {
  const result = auditFullScore(auditC, auditFull);
  if (!result || !auditC || !auditFull) return null;
  return [
    auditC.frequency!,
    auditC.typicalQuantity!,
    auditC.bingeFrequency!,
    auditFull.unableToStop!,
    auditFull.failedExpectations!,
    auditFull.morningDrink!,
    auditFull.guiltRemorse!,
    auditFull.blackout!,
    auditFull.injury!,
    auditFull.othersConcerned!,
  ];
}

/** @deprecated Read `SOCIAL_HISTORY_THRESHOLDS.packYearsElevated` for runtime value. */
export const PACK_YEARS_ELEVATED_THRESHOLD = DEFAULT_SOCIAL_HISTORY_THRESHOLDS.packYearsElevated;

/** @deprecated Read `SOCIAL_HISTORY_THRESHOLDS.packYearsLdct` for runtime value. */
export const PACK_YEARS_LDCT_THRESHOLD = DEFAULT_SOCIAL_HISTORY_THRESHOLDS.packYearsLdct;

/** Non-diagnostic clinical hint for computed pack-years (null when below thresholds). */
export function packYearsClinicalHint(packYearsValue: number | null): string | null {
  if (packYearsValue == null) return null;
  const { packYearsLdct, packYearsElevated } = SOCIAL_HISTORY_THRESHOLDS;
  if (packYearsValue >= packYearsLdct) {
    return `≥${packYearsLdct} pack-years — consider LDCT lung cancer screening eligibility (age-dependent).`;
  }
  if (packYearsValue >= packYearsElevated) {
    return `≥${packYearsElevated} pack-years — elevated COPD and cardiovascular risk.`;
  }
  return null;
}
