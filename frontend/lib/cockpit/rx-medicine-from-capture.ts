/**
 * Map capture-bar sources (parsed line / AI / drug_master) onto Plan
 * `RxMedicine`. Distinct from chart-med payloads — skips PMH-only fields
 * (condition link, active/past, started/stopped ago, source, intake).
 */

import { EMPTY_RX_MEDICINE, type RxMedicine } from "@/components/cockpit/rx/RxFormContext";
import type { AiParsedMedicine } from "@/lib/api/medicine-parse";
import {
  formatStrengthComponents,
  formatStrengthLabel,
  inferFormFromDoseUnit,
  nameWorthCatalogLookup,
  pickUnambiguousCatalogDrug,
  syncStrengthLegacy,
} from "@/lib/chart/chart-medication";
import type { ParsedMedicineLine } from "@/lib/cockpit/medicine-line-parse";
import {
  coerceRouteCode,
  composeRouteWithSite,
  defaultDoseUnitForForm,
  formatDurationLegacyLabel,
  getFrequencyLegacyLabel,
  getRouteLegacyLabel,
  resolveRouteSiteInput,
  routeCodeSupportsSite,
} from "@/lib/medicineCodes";
import type { DrugMasterRow } from "@/types/drug-master";
import type {
  DoseUnit,
  DurationUnit,
  FoodTiming,
  FrequencyCode,
  StrengthUnit,
} from "@/types/prescription";

export { nameWorthCatalogLookup, pickUnambiguousCatalogDrug };

export function rxMedicineFromDrugMaster(drug: DrugMasterRow): RxMedicine {
  return {
    ...EMPTY_RX_MEDICINE,
    medicineName: drug.generic_name,
    drugMasterId: drug.id,
    dosage: drug.strength ?? "",
    form: drug.form ?? null,
    doseUnit: defaultDoseUnitForForm(drug.form),
    route: drug.route_default ?? "",
    routeCode: drug.route_default ? coerceRouteCode(drug.route_default) : null,
  };
}

export function rxMedicineFromParsed(parsed: ParsedMedicineLine): RxMedicine {
  return {
    ...EMPTY_RX_MEDICINE,
    medicineName: parsed.medicineName,
    dosage: parsed.dosage,
    form: parsed.form,
    doseQty: parsed.doseQty,
    doseUnit: parsed.doseUnit,
    frequencyCode: parsed.frequencyCode,
    frequency: parsed.frequency,
    durationValue: parsed.durationValue,
    durationUnit: parsed.durationUnit,
    duration: parsed.duration,
    foodTiming: parsed.foodTiming,
    routeCode: parsed.routeCode,
    route: parsed.route,
    instructions: parsed.instructions,
  };
}

export function rxMedicineFromAiMedicine(aiMed: AiParsedMedicine): RxMedicine {
  const aiComponents =
    aiMed.strengthComponents && aiMed.strengthComponents.length >= 2
      ? aiMed.strengthComponents.map((c) => ({
          value: c.value,
          unit: (c.unit as StrengthUnit | null) ?? null,
        }))
      : null;
  const strengthValue = aiComponents ? null : (aiMed.strengthValue ?? null);
  const strengthUnit = aiComponents
    ? null
    : ((aiMed.strengthUnit as StrengthUnit | null) ?? null);
  const dosage = aiComponents
    ? formatStrengthComponents(aiComponents) || ""
    : syncStrengthLegacy(strengthValue, strengthUnit) ||
      formatStrengthLabel(strengthValue, strengthUnit) ||
      "";

  const frequencyCode = (aiMed.frequencyCode as FrequencyCode | null) ?? null;
  const doseUnit = (aiMed.doseUnit as DoseUnit | null) ?? null;
  let form = aiMed.form ?? null;
  if (!form && doseUnit) {
    form = inferFormFromDoseUnit(doseUnit);
  }

  const routeCode = aiMed.routeCode
    ? coerceRouteCode(String(aiMed.routeCode))
    : null;
  const rawSite = aiMed.routeSite?.trim() || null;
  const routeSite =
    routeCode && rawSite && routeCodeSupportsSite(routeCode)
      ? resolveRouteSiteInput(routeCode, rawSite) ?? rawSite
      : null;
  const route = routeCode
    ? routeCodeSupportsSite(routeCode)
      ? composeRouteWithSite(routeCode, routeSite)
      : getRouteLegacyLabel(routeCode)
    : "";

  const durationUnit = (aiMed.durationUnit as DurationUnit | null) ?? null;
  const durationValue =
    durationUnit && (durationUnit === "until-finished" || durationUnit === "continue")
      ? null
      : (aiMed.durationValue ?? null);
  const duration =
    durationUnit != null
      ? formatDurationLegacyLabel(durationValue, durationUnit)
      : "";

  return {
    ...EMPTY_RX_MEDICINE,
    medicineName: aiMed.name?.trim() || "",
    dosage,
    form,
    doseQty: aiMed.doseQty ?? null,
    doseUnit,
    frequencyCode,
    frequency: frequencyCode ? getFrequencyLegacyLabel(frequencyCode) : "",
    durationValue,
    durationUnit,
    duration,
    foodTiming: (aiMed.foodTiming as FoodTiming | null) ?? null,
    routeCode,
    route,
    instructions: aiMed.instructions?.trim() || "",
  };
}

/**
 * Overlay a catalog drug onto a parse-derived Rx row: canonical name +
 * drugMasterId always win; strength/form/dose defaults only fill blanks.
 */
export function mergeCatalogDrugIntoRxMedicine(
  base: RxMedicine,
  drug: DrugMasterRow,
): RxMedicine {
  const fromCatalog = rxMedicineFromDrugMaster(drug);
  const hasDosage = base.dosage.trim().length > 0;
  return {
    ...base,
    medicineName: drug.generic_name,
    drugMasterId: drug.id,
    dosage: hasDosage ? base.dosage : fromCatalog.dosage,
    form: base.form?.trim() ? base.form : fromCatalog.form,
    doseUnit: base.doseUnit ?? fromCatalog.doseUnit,
    route: base.route.trim() ? base.route : fromCatalog.route,
    routeCode: base.routeCode ?? fromCatalog.routeCode,
  };
}
