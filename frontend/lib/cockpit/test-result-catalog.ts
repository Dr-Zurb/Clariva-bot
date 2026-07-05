/**
 * Static chip catalog for structured test-result fast entry (obj-21).
 *
 * Pure data — mirrors `exam-schema.ts` discipline. Chip vocabulary is UI
 * guidance only; obj-20 Zod does not enforce it. Free-text fallback always
 * available on every field.
 */

import type {
  TestResultInterpretation,
  TestResultSource,
} from "@/types/prescription";

export interface TestResultCatalogEntry {
  name: string;
  /** Suggested unit when the chip is tapped (type-aware where cheap). */
  defaultUnit?: string;
}

export const TEST_RESULT_INTERPRETATION_OPTIONS: readonly {
  value: TestResultInterpretation;
  label: string;
}[] = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
  { value: "abnormal", label: "Abnormal" },
];

export const TEST_RESULT_SOURCE_OPTIONS: readonly {
  value: TestResultSource;
  label: string;
}[] = [
  { value: "patient_report", label: "Patient report" },
  { value: "in_clinic_poc", label: "In-clinic POC" },
];

/** Common patient-brought / outside-lab report names. */
export const PATIENT_REPORT_TEST_CHIPS: readonly TestResultCatalogEntry[] = [
  { name: "CBC" },
  { name: "LFT" },
  { name: "KFT" },
  { name: "HbA1c", defaultUnit: "%" },
  { name: "Lipid profile" },
  { name: "Thyroid profile" },
  { name: "Urine routine" },
  { name: "Chest X-ray" },
  { name: "Ultrasound" },
];

/** Common in-clinic / bedside POC tests (exam-catalog §F). */
export const POC_TEST_CHIPS: readonly TestResultCatalogEntry[] = [
  { name: "Urine dipstick" },
  { name: "RBS / Glucometer", defaultUnit: "mg/dL" },
  { name: "Rapid antigen" },
  { name: "ECG note" },
  { name: "SpO₂", defaultUnit: "%" },
  { name: "Peak flow", defaultUnit: "L/min" },
];

export function testChipsForSource(
  source: TestResultSource,
): readonly TestResultCatalogEntry[] {
  return source === "patient_report" ? PATIENT_REPORT_TEST_CHIPS : POC_TEST_CHIPS;
}
