import { parseMedicineLine } from "@/lib/cockpit/medicine-line-parse";
import {
  chartMedFormLocksDoseUnit,
  chartMedLockedDoseUnitLabel,
  chartMedPatchFromFormInput,
  chartMedPayloadFromDrugMaster,
  chartMedUsesApplyDose,
  chartMedPatchToLocalPatch,
  chartMedPatchFromParsed,
  chartMedStartedAgoFromParsed,
  chartMedPayloadFromAiMedicine,
  chartMedPayloadFromParsed,
  chartMedSourceFromDb,
  chartMedSourceLabel,
  chartMedSourceToDb,
  doseQtyFromSchedule,
  doseScheduleForFrequencyChange,
  doseScheduleOptionsForFrequency,
  formatChartMedicationSig,
  formatStoppedAgoSummary,
  formatStrengthComponents,
  formatStrengthLabel,
  frequencyUiModeFromCode,
  isComboStrength,
  isCustomDoseUnit,
  isIntervalFrequency,
  MEAL_TO_HOUR_SLOT_MAP,
  parseStrengthComponents,
  parseStrengthText,
  resolveStrengthFields,
  resolveDoseUnitInput,
  resolveFrequencyMoreInput,
  isKnownChartMedForm,
  resolveFormInput,
  resolveStrengthUnitInput,
  chartMedPatchToApiPayload,
  stoppedSinceLabel,
  nameWorthCatalogLookup,
  pickUnambiguousCatalogDrug,
  mergeCatalogDrugIntoPayload,
  medicationListHasDuplicate,
  findDuplicateMedication,
  duplicateMedicationNoticeText,
  normalizeMedicationDrugKey,
} from "@/lib/chart/chart-medication";
import type { PatientMedication } from "@/types/patient-chart";
import type { DrugMasterRow } from "@/types/drug-master";

function baseMed(overrides: Partial<PatientMedication> = {}): PatientMedication {
  return {
    id: "m1",
    doctor_id: "d1",
    patient_id: "p1",
    drug_name: "Metformin",
    dose: "500 mg",
    frequency: "BID",
    status: "active",
    intake_pattern: "regular",
    source: "prescribed",
    started_on: null,
    stopped_on: null,
    note: null,
    archived_at: null,
    created_at: "",
    updated_at: "",
    strength: "500 mg",
    strength_value: 500,
    strength_unit: "mg",
    dose_qty: 1,
    dose_unit: "tab",
    frequency_code: "BID",
    form: null,
    drug_master_id: null,
    stopped_ago_value: null,
    stopped_ago_unit: null,
    started_ago_value: null,
    started_ago_unit: null,
    stop_reason: null,
    dose_schedule: null,
    strength_components: null,
    food_timing: null,
    ...overrides,
  };
}

describe("chartMedPayloadFromParsed", () => {
  it("maps parsed line to structured create payload with SOS frequency", () => {
    const parsed = parseMedicineLine("metformin 500 mg 2 tab bd");
    expect(parsed).not.toBeNull();
    const payload = chartMedPayloadFromParsed(parsed!, { conditionIds: ["c1"] });
    expect(payload.drugName).toBe("metformin");
    expect(payload.strength).toBe("500 mg");
    expect(payload.strengthValue).toBe(500);
    expect(payload.strengthUnit).toBe("mg");
    expect(payload.doseQty).toBe(2);
    expect(payload.doseUnit).toBe("tab");
    expect(payload.frequencyCode).toBe("BID");
    expect(payload.conditionIds).toEqual(["c1"]);
  });

  it("sets intakePattern prn for SOS lines", () => {
    const parsed = parseMedicineLine("paracetamol 500 mg 1 tab sos");
    expect(parsed?.frequencyCode).toBe("PRN");
    const payload = chartMedPayloadFromParsed(parsed!);
    expect(payload.intakePattern).toBe("prn");
    expect(payload.frequency).toBe("SOS");
  });

  it("carries dose schedule from parsed 1-0-1 lines", () => {
    const parsed = parseMedicineLine("metformin 500 mg 1 tab 1-0-1");
    expect(parsed?.doseSchedule).toBe("1-0-1");
    const payload = chartMedPayloadFromParsed(parsed!);
    expect(payload.doseSchedule).toBe("1-0-1");
    expect(payload.frequencyCode).toBe("BID");
  });

  it("maps food timing from parsed lines", () => {
    const parsed = parseMedicineLine("glimepiride 2 mg 1 tab bd after food");
    expect(parsed?.foodTiming).toBe("after_food");
    const payload = chartMedPayloadFromParsed(parsed!);
    expect(payload.foodTiming).toBe("after_food");
  });

  it("maps interval frequency without dose schedule", () => {
    const parsed = parseMedicineLine("paracetamol 500 mg 1 tab q6h");
    expect(parsed?.frequencyCode).toBe("Q6H");
    const payload = chartMedPayloadFromParsed(parsed!);
    expect(payload.frequencyCode).toBe("Q6H");
    expect(payload.doseSchedule).toBeNull();
  });

  it("maps weekly frequency", () => {
    const parsed = parseMedicineLine("vitamin d 60000 iu 1 cap once weekly");
    expect(parsed?.frequencyCode).toBe("QW");
  });

  it("defaults status to active for a plain line", () => {
    const payload = chartMedPayloadFromParsed(parseMedicineLine("amlodipine 5 mg od")!);
    expect(payload.status).toBe("active");
    expect(payload.stopReason).toBeNull();
  });

  it("carries past status + stop-timing from a parsed stop line", () => {
    const parsed = parseMedicineLine("amlodipine stopped 2 months ago");
    const payload = chartMedPayloadFromParsed(parsed!);
    expect(payload.status).toBe("past");
    expect(payload.stoppedAgoValue).toBe(2);
    expect(payload.stoppedAgoUnit).toBe("months");
  });

  it("inherits past from a resolved condition when the line is silent", () => {
    const parsed = parseMedicineLine("amlodipine 5 mg od");
    const payload = chartMedPayloadFromParsed(parsed!, { conditionStatus: "resolved" });
    expect(payload.status).toBe("past");
    expect(payload.stopReason).toBe("resolved");
  });

  it("stays active under an active condition", () => {
    const parsed = parseMedicineLine("amlodipine 5 mg od");
    const payload = chartMedPayloadFromParsed(parsed!, { conditionStatus: "active" });
    expect(payload.status).toBe("active");
  });

  it("lets an explicit parsed past override an active condition", () => {
    const parsed = parseMedicineLine("amlodipine stopped 2 months ago");
    const payload = chartMedPayloadFromParsed(parsed!, { conditionStatus: "active" });
    expect(payload.status).toBe("past");
    expect(payload.stoppedAgoValue).toBe(2);
  });
});

describe("formatChartMedicationSig", () => {
  it("joins strength, dose, frequency, and source", () => {
    const sig = formatChartMedicationSig(baseMed());
    expect(sig).toContain("500 mg");
    expect(sig).toContain("1 tab");
    expect(sig).toContain("BID");
    expect(sig).toContain("Prescribed");
  });

  it("shows SOS label for PRN frequency code", () => {
    const sig = formatChartMedicationSig(
      baseMed({ frequency_code: "PRN", frequency: "SOS" }),
    );
    expect(sig).toContain("SOS");
  });

  it("uses Apply instead of application count for topicals", () => {
    const sig = formatChartMedicationSig(
      baseMed({
        form: "gel",
        dose_unit: "application",
        dose_qty: 2,
        frequency_code: "BID",
      }),
    );
    expect(sig).toContain("Apply");
    expect(sig).not.toContain("application");
    expect(sig).not.toContain("2 application");
  });

  it("includes dose schedule in sig", () => {
    const sig = formatChartMedicationSig(baseMed({ dose_schedule: "1-0-1" }));
    expect(sig).toContain("1-0-1");
  });

  it("uses structured strength fields when set", () => {
    const sig = formatChartMedicationSig(
      baseMed({ strength: null, dose: null, strength_value: 250, strength_unit: "mg" }),
    );
    expect(sig).toContain("250 mg");
  });

  it("includes the intake pattern (Regular / Irregular)", () => {
    expect(formatChartMedicationSig(baseMed({ intake_pattern: "regular" }))).toContain("Regular");
    expect(formatChartMedicationSig(baseMed({ intake_pattern: "irregular" }))).toContain(
      "Irregular",
    );
  });

  it("omits the intake pattern for prn (SOS frequency already conveys it)", () => {
    const sig = formatChartMedicationSig(
      baseMed({ intake_pattern: "prn", frequency_code: "PRN", frequency: "SOS" }),
    );
    expect(sig).not.toMatch(/Regular|Irregular/);
  });
});

describe("chartMedSource helpers", () => {
  it("maps UI self-started to DB self", () => {
    expect(chartMedSourceToDb("self_started")).toBe("self");
    expect(chartMedSourceToDb("prescribed")).toBe("prescribed");
  });

  it("treats otc legacy as self-started in UI", () => {
    expect(chartMedSourceFromDb("otc")).toBe("self_started");
    expect(chartMedSourceLabel("otc")).toBe("Self-started");
  });

  it("returns null when source is unset", () => {
    expect(chartMedSourceFromDb(null)).toBeNull();
    expect(chartMedSourceLabel(null)).toBe("");
  });
});

describe("chartMedPatch mappers", () => {
  it("mirrors strength into legacy dose on API payload", () => {
    const api = chartMedPatchToApiPayload({ strength: "250 mg" });
    expect(api.strength).toBe("250 mg");
    expect(api.dose).toBe("250 mg");
  });

  it("maps structured strength fields to API payload", () => {
    const api = chartMedPatchToApiPayload({ strengthValue: 500, strengthUnit: "mg" });
    expect(api.strengthValue).toBe(500);
    expect(api.strengthUnit).toBe("mg");
  });

  it("maps camelCase patch to snake_case local row", () => {
    const local = chartMedPatchToLocalPatch({
      doseQty: 2,
      doseUnit: "tab",
      frequencyCode: "TID",
      strengthValue: 500,
      strengthUnit: "mg",
      stoppedAgoValue: 3,
      stoppedAgoUnit: "months",
      stopReason: "side_effects",
    });
    expect(local.dose_qty).toBe(2);
    expect(local.dose_unit).toBe("tab");
    expect(local.frequency_code).toBe("TID");
    expect(local.strength_value).toBe(500);
    expect(local.strength_unit).toBe("mg");
    expect(local.stopped_ago_value).toBe(3);
    expect(local.stop_reason).toBe("side_effects");
  });
});

describe("strength helpers", () => {
  it("parses mg strength text", () => {
    expect(parseStrengthText("500 mg")).toEqual({
      strengthValue: 500,
      strengthUnit: "mg",
      legacy: "500 mg",
    });
  });

  it("parses glued mg strength", () => {
    expect(parseStrengthText("500mg").strengthUnit).toBe("mg");
  });

  it("formats structured strength label", () => {
    expect(formatStrengthLabel(10, "iu")).toBe("10 IU");
    expect(formatStrengthLabel(2, "pct")).toBe("2%");
  });
});

describe("frequency UI mode and More combobox", () => {
  it("defaults to meals for BID and hours for Q6H", () => {
    expect(frequencyUiModeFromCode("BID")).toBe("meals");
    expect(frequencyUiModeFromCode("Q6H")).toBe("hours");
  });

  it("maps meal slots to hour slots", () => {
    expect(MEAL_TO_HOUR_SLOT_MAP.BID).toBe("Q12H");
  });

  it("resolves typed frequency More to enum or CUSTOM", () => {
    expect(resolveFrequencyMoreInput("Q4H")).toEqual({
      code: "Q4H",
      frequency: "Q4H",
    });
    expect(resolveFrequencyMoreInput("alternate days")).toEqual({
      code: "CUSTOM",
      frequency: "alternate days",
    });
  });
});

describe("unit More combobox resolvers", () => {
  it("normalizes strength unit aliases", () => {
    expect(resolveStrengthUnitInput("IU")).toBe("iu");
    expect(resolveStrengthUnitInput("5 mg/ml")).toBe("custom");
  });

  it("normalizes dose unit aliases", () => {
    expect(resolveDoseUnitInput("ml")).toBe("ml");
    expect(resolveDoseUnitInput("neb")).toBe("custom");
  });
});

describe("custom dose and strength helpers", () => {
  it("detects custom dose unit from legacy dose text", () => {
    expect(
      isCustomDoseUnit({ dose_qty: 1, dose_unit: null, dose: "neb" }),
    ).toBe(true);
    expect(
      isCustomDoseUnit({ dose_qty: 1, dose_unit: "tab", dose: "500 mg" }),
    ).toBe(false);
  });

  it("formats sig with custom dose unit", () => {
    const sig = formatChartMedicationSig(
      baseMed({
        dose_qty: 1,
        dose_unit: null,
        dose: "neb",
        strength: "500 mg",
        strength_value: 500,
        strength_unit: "mg",
      }),
    );
    expect(sig).toContain("1 neb");
    expect(sig).toContain("500 mg");
  });
});

describe("dose schedule helpers", () => {
  it("returns corrected schedule options for meal frequencies", () => {
    expect(doseScheduleOptionsForFrequency("OD")).toEqual(["1-0-0", "0-1-0", "0-0-1"]);
    expect(doseScheduleOptionsForFrequency("BID")).toContain("1-0-1");
    expect(doseScheduleOptionsForFrequency("TID")).toEqual(["1-1-1"]);
    expect(doseScheduleOptionsForFrequency("QID")).toEqual(["1-1-1-1"]);
    expect(doseScheduleOptionsForFrequency("PRN")).toEqual([]);
    expect(doseScheduleOptionsForFrequency("Q6H")).toEqual([]);
  });

  it("treats interval codes as non-schedulable", () => {
    expect(isIntervalFrequency("Q6H")).toBe(true);
    expect(isIntervalFrequency("BID")).toBe(false);
  });

  it("infers dose qty from uniform schedule patterns", () => {
    expect(doseQtyFromSchedule("1-0-1")).toBe(1);
    expect(doseQtyFromSchedule("2-0-2")).toBe(2);
  });

  it("auto-selects schedule when frequency has only one option", () => {
    expect(doseScheduleForFrequencyChange("TID", null)).toBe("1-1-1");
    expect(doseScheduleForFrequencyChange("QID", null)).toBe("1-1-1-1");
    expect(doseScheduleForFrequencyChange("QHS", null)).toBe("0-0-1");
    expect(doseScheduleForFrequencyChange("BID", null)).toBeNull();
    expect(doseScheduleForFrequencyChange("BID", "1-0-1")).toBe("1-0-1");
  });
});

describe("chartMedPatchFromParsed — form + since", () => {
  it("maps started ago and inferred form from parser output", () => {
    const parsed = parseMedicineLine("metformin 500 mg 1 tab bd for 5 years")!;
    const patch = chartMedPatchFromParsed(parsed);
    expect(patch.startedAgoValue).toBe(5);
    expect(patch.startedAgoUnit).toBe("years");
    expect(patch.form).toBe("tablet");
  });

  it("includes form and since in collapsed sig", () => {
    const sig = formatChartMedicationSig({
      ...baseMed(),
      form: "tablet",
      started_ago_value: 5,
      started_ago_unit: "years",
      strength_value: 500,
      strength_unit: "mg",
      frequency_code: "BID",
    });
    expect(sig).toContain("Tab");
    expect(sig).toContain("~5 years");
    expect(sig).toContain("BID");
  });

  it("includes food timing in collapsed sig", () => {
    const sig = formatChartMedicationSig(
      baseMed({ food_timing: "with_food", form: "tablet" }),
    );
    expect(sig).toContain("With food");
  });
});

describe("chartMedPayloadFromAiMedicine", () => {
  it("maps structured AI fields, syncing legacy strength + interval handling", () => {
    const payload = chartMedPayloadFromAiMedicine({
      name: "Metformin",
      strengthValue: 500,
      strengthUnit: "mg",
      doseQty: 1,
      doseUnit: "tab",
      frequencyCode: "BID",
      source: "self",
      intakePattern: "irregular",
      instructions: "with breakfast",
    });
    expect(payload.drugName).toBe("Metformin");
    expect(payload.strengthValue).toBe(500);
    expect(payload.strengthUnit).toBe("mg");
    expect(payload.strength).toBe("500 mg");
    expect(payload.frequencyCode).toBe("BID");
    expect(payload.source).toBe("self");
    expect(payload.intakePattern).toBe("irregular");
    expect(payload.note).toBe("with breakfast");
    expect(payload.status).toBe("active");
  });

  it("auto-selects a single-option schedule and forces prn intake for PRN", () => {
    const tid = chartMedPayloadFromAiMedicine({ name: "Drug", frequencyCode: "TID" });
    expect(tid.doseSchedule).toBe("1-1-1");

    const prn = chartMedPayloadFromAiMedicine({ name: "Drug", frequencyCode: "PRN" });
    expect(prn.intakePattern).toBe("prn");
    expect(prn.frequency).toBe("SOS");
  });

  it("keeps interval frequencies schedule-free", () => {
    const payload = chartMedPayloadFromAiMedicine({ name: "Drug", frequencyCode: "Q8H" });
    expect(payload.doseSchedule).toBeNull();
    expect(payload.frequencyCode).toBe("Q8H");
  });

  it("carries the requested status + condition links", () => {
    const payload = chartMedPayloadFromAiMedicine(
      { name: "Drug" },
      { status: "past", conditionIds: ["c1"] },
    );
    expect(payload.status).toBe("past");
    expect(payload.conditionIds).toEqual(["c1"]);
  });

  it("honours an AI-detected past status with stop-timing + reason", () => {
    const payload = chartMedPayloadFromAiMedicine({
      name: "Amlodipine",
      status: "past",
      stoppedAgoValue: 2,
      stoppedAgoUnit: "months",
      stopReason: "side_effects",
    });
    expect(payload.status).toBe("past");
    expect(payload.stoppedAgoValue).toBe(2);
    expect(payload.stoppedAgoUnit).toBe("months");
    expect(payload.stopReason).toBe("side_effects");
  });

  it("drops stop fields when the AI says active", () => {
    const payload = chartMedPayloadFromAiMedicine({
      name: "Amlodipine",
      status: "active",
      stoppedAgoValue: 2,
      stoppedAgoUnit: "months",
    });
    expect(payload.status).toBe("active");
    expect(payload.stoppedAgoValue).toBeNull();
    expect(payload.stoppedAgoUnit).toBeNull();
  });

  it("inherits past from a resolved condition when the AI is silent", () => {
    const payload = chartMedPayloadFromAiMedicine(
      { name: "Amlodipine" },
      { conditionStatus: "resolved" },
    );
    expect(payload.status).toBe("past");
    expect(payload.stopReason).toBe("resolved");
  });
});

describe("stop timing labels", () => {
  it("uses resolved wording for resolved conditions", () => {
    expect(stoppedSinceLabel("resolved")).toContain("resolved");
  });

  it("formats relative stop summary", () => {
    expect(formatStoppedAgoSummary(2, "weeks")).toBe("~2 weeks");
    expect(formatStoppedAgoSummary(null, "weeks")).toBe("");
  });
});

describe("medicationListHasDuplicate", () => {
  const rows = [{ drug_name: "Amlodipine", drug_master_id: "dm-1" as string | null, id: "m0" }];

  it("matches case-insensitively on drug name", () => {
    expect(medicationListHasDuplicate(rows, { drugName: "amlodipine" })).toBe(true);
    expect(medicationListHasDuplicate(rows, { drugName: "Metformin" })).toBe(false);
  });

  it("matches on drug_master_id even when names differ in casing", () => {
    expect(
      medicationListHasDuplicate([{ drug_name: "amlo", drug_master_id: "dm-1", id: "m1" }], {
        drugName: "Amlodipine",
        drugMasterId: "dm-1",
      }),
    ).toBe(true);
  });

  it("findDuplicateMedication returns the existing row", () => {
    const hit = findDuplicateMedication(
      [{ drug_name: "Amlodipine", drug_master_id: "dm-1", id: "med-42" }],
      { drugName: "amlodipine" },
    );
    expect(hit).toEqual({ id: "med-42", drug_name: "Amlodipine" });
  });

  it("formats duplicate notice copy", () => {
    expect(duplicateMedicationNoticeText("Amlodipine")).toBe(
      "Amlodipine is already on this list.",
    );
  });

  it("normalizes drug name keys", () => {
    expect(normalizeMedicationDrugKey("  Amlodipine ")).toBe("amlodipine");
  });
});

describe("form-first helpers", () => {
  it("resolves form aliases to canonical values", () => {
    expect(resolveFormInput("tab")).toBe("tablet");
    expect(resolveFormInput("Tablet")).toBe("tablet");
    expect(resolveFormInput("")).toBeNull();
    expect(resolveFormInput("lozenge")).toBe("custom");
  });

  it("detects known catalog forms", () => {
    expect(isKnownChartMedForm("tablet")).toBe(true);
    expect(isKnownChartMedForm("lozenge")).toBe(false);
    expect(isKnownChartMedForm(null)).toBe(false);
  });

  it("locks dose unit when form maps to a default unit", () => {
    expect(chartMedFormLocksDoseUnit(baseMed({ form: "tablet", dose_unit: "tab" }))).toBe(true);
    expect(chartMedFormLocksDoseUnit(baseMed({ form: "tablet", dose_unit: null }))).toBe(true);
    expect(chartMedFormLocksDoseUnit(baseMed({ form: "tablet", dose_unit: "cap" }))).toBe(false);
    expect(chartMedFormLocksDoseUnit(baseMed({ form: "lozenge", dose_unit: "tab" }))).toBe(false);
  });

  it("shows locked dose unit label from form when dose_unit unset", () => {
    expect(chartMedLockedDoseUnitLabel(baseMed({ form: "tablet", dose_unit: null }))).toBe("tab");
    expect(chartMedLockedDoseUnitLabel(baseMed({ form: "capsule", dose_unit: "cap" }))).toBe("cap");
  });

  it("patches form input with auto dose unit for known forms", () => {
    expect(chartMedPatchFromFormInput("tab")).toEqual({ form: "tablet", doseUnit: "tab" });
    expect(chartMedPatchFromFormInput("gel")).toEqual({
      form: "gel",
      doseUnit: "application",
      doseQty: null,
    });
    expect(chartMedPatchFromFormInput("lozenge")).toEqual({ form: "lozenge" });
    expect(chartMedPatchFromFormInput("")).toEqual({ form: null });
  });

  it("detects topical apply-style dosing", () => {
    expect(chartMedUsesApplyDose(baseMed({ form: "gel", dose_unit: "application" }))).toBe(true);
    expect(chartMedUsesApplyDose(baseMed({ form: "ointment", dose_unit: null }))).toBe(true);
    expect(chartMedUsesApplyDose(baseMed({ form: "gel", dose_unit: "ml" }))).toBe(false);
    expect(chartMedUsesApplyDose(baseMed({ form: "tablet", dose_unit: "tab" }))).toBe(false);
  });

  it("shows Apply label for locked topical dose unit", () => {
    expect(chartMedLockedDoseUnitLabel(baseMed({ form: "gel", dose_unit: "application" }))).toBe(
      "Apply",
    );
  });

  it("sets dose unit from drug master form on payload", () => {
    const payload = chartMedPayloadFromDrugMaster({
      id: "d1",
      generic_name: "Metformin",
      strength: "500 mg",
      form: "tablet",
      brand_names: [],
      route_default: null,
      created_at: "",
      updated_at: "",
    });
    expect(payload.form).toBe("tablet");
    expect(payload.doseUnit).toBe("tab");
  });

  it("captures a combo strength from a drug master FDC row", () => {
    const payload = chartMedPayloadFromDrugMaster({
      id: "d2",
      generic_name: "Rifampicin + Isoniazid",
      strength: "600/300",
      form: "tablet",
      brand_names: ["Rcinex"],
      route_default: null,
      created_at: "",
      updated_at: "",
    });
    expect(payload.strengthComponents).toEqual([
      { value: 600, unit: null },
      { value: 300, unit: null },
    ]);
    expect(payload.strengthValue).toBeNull();
    expect(payload.strength).toBe("600/300");
  });
});

describe("combo (fixed-dose-combination) strength", () => {
  it("parses a unitless ratio and shares no unit", () => {
    expect(parseStrengthComponents("600/300")).toEqual([
      { value: 600, unit: null },
      { value: 300, unit: null },
    ]);
  });

  it("back-fills a single trailing unit across all components", () => {
    expect(parseStrengthComponents("600/300 mg")).toEqual([
      { value: 600, unit: "mg" },
      { value: 300, unit: "mg" },
    ]);
  });

  it("parses per-component glued units", () => {
    expect(parseStrengthComponents("500mg/125mg")).toEqual([
      { value: 500, unit: "mg" },
      { value: 125, unit: "mg" },
    ]);
  });

  it("handles 4-drug FDCs (e.g. TB regimen)", () => {
    expect(parseStrengthComponents("75/150/400/275 mg")).toEqual([
      { value: 75, unit: "mg" },
      { value: 150, unit: "mg" },
      { value: 400, unit: "mg" },
      { value: 275, unit: "mg" },
    ]);
  });

  it("returns null for single strengths and concentration ratios", () => {
    expect(parseStrengthComponents("500 mg")).toBeNull();
    expect(parseStrengthComponents("0.05%")).toBeNull();
    expect(parseStrengthComponents("250 mg/5 ml")).toBeNull();
    expect(parseStrengthComponents(null)).toBeNull();
  });

  it("formats shared and mixed-unit components", () => {
    expect(
      formatStrengthComponents([
        { value: 600, unit: "mg" },
        { value: 300, unit: "mg" },
      ]),
    ).toBe("600/300 mg");
    expect(
      formatStrengthComponents([
        { value: 600, unit: null },
        { value: 300, unit: null },
      ]),
    ).toBe("600/300");
    expect(
      formatStrengthComponents([
        { value: 1, unit: "g" },
        { value: 500, unit: "mg" },
      ]),
    ).toBe("1 g / 500 mg");
  });

  it("resolveStrengthFields nulls the scalar for combos but keeps single strengths", () => {
    const combo = resolveStrengthFields("600/300 mg");
    expect(combo.strengthComponents).toEqual([
      { value: 600, unit: "mg" },
      { value: 300, unit: "mg" },
    ]);
    expect(combo.strengthValue).toBeNull();
    expect(combo.strength).toBe("600/300 mg");

    const single = resolveStrengthFields("500 mg");
    expect(single.strengthComponents).toBeNull();
    expect(single.strengthValue).toBe(500);
    expect(single.strengthUnit).toBe("mg");
  });

  it("maps a typed combo line to a structured payload", () => {
    const parsed = parseMedicineLine("rcinex 600/300 1-0-1");
    expect(parsed).not.toBeNull();
    const payload = chartMedPayloadFromParsed(parsed!);
    expect(payload.drugName).toBe("rcinex");
    expect(payload.strengthComponents).toEqual([
      { value: 600, unit: null },
      { value: 300, unit: null },
    ]);
    expect(payload.strengthValue).toBeNull();
    expect(payload.strength).toBe("600/300");
  });

  it("maps an AI-detected combo, ignoring any stray scalar", () => {
    const payload = chartMedPayloadFromAiMedicine({
      name: "Augmentin",
      strengthValue: 625,
      strengthUnit: "mg",
      strengthComponents: [
        { value: 500, unit: "mg" },
        { value: 125, unit: "mg" },
      ],
    });
    expect(payload.strengthComponents).toEqual([
      { value: 500, unit: "mg" },
      { value: 125, unit: "mg" },
    ]);
    expect(payload.strengthValue).toBeNull();
    expect(payload.strength).toBe("500/125 mg");
  });

  it("renders the combo strength in the collapsed sig", () => {
    const sig = formatChartMedicationSig(
      baseMed({
        strength: "600/300 mg",
        strength_value: null,
        strength_unit: null,
        strength_components: [
          { value: 600, unit: "mg" },
          { value: 300, unit: "mg" },
        ],
        dose_qty: null,
        dose_unit: null,
        frequency_code: "OD",
        dose: null,
      }),
    );
    expect(sig.startsWith("600/300 mg")).toBe(true);
  });

  it("isComboStrength reflects the component array", () => {
    expect(isComboStrength(baseMed({ strength_components: null }))).toBe(false);
    expect(
      isComboStrength(
        baseMed({
          strength_components: [
            { value: 600, unit: "mg" },
            { value: 300, unit: "mg" },
          ],
        }),
      ),
    ).toBe(true);
  });
});

describe("chart-med started-ago from parsed (Rx-course → on-drug fold)", () => {
  it("folds a parsed course duration into started-ago (for 30 days)", () => {
    const patch = chartMedPatchFromParsed(parseMedicineLine("amlodipine for 30 days")!);
    expect(patch.startedAgoValue).toBe(30);
    expect(patch.startedAgoUnit).toBe("days");
  });

  it("folds 'for 2 months' into started-ago months", () => {
    const ago = chartMedStartedAgoFromParsed(parseMedicineLine("amlodipine for 2 months")!);
    expect(ago.value).toBe(2);
    expect(ago.unit).toBe("months");
  });

  it("keeps explicit started-ago over any course duration", () => {
    const ago = chartMedStartedAgoFromParsed(parseMedicineLine("amlodipine for 2 years")!);
    expect(ago.value).toBe(2);
    expect(ago.unit).toBe("years");
  });

  it("leaves started-ago empty when no duration is present", () => {
    const ago = chartMedStartedAgoFromParsed(parseMedicineLine("amlodipine 5 mg od")!);
    expect(ago.value).toBeNull();
    expect(ago.unit).toBeNull();
  });

  it("does not fold open-ended 'continue'", () => {
    const ago = chartMedStartedAgoFromParsed(parseMedicineLine("amlodipine 5 mg od continue")!);
    expect(ago.value).toBeNull();
    expect(ago.unit).toBeNull();
  });
});

describe("catalog short-form resolution", () => {
  function drug(overrides: Partial<DrugMasterRow> = {}): DrugMasterRow {
    return {
      id: "d-1",
      generic_name: "Amlodipine",
      brand_names: [],
      strength: "5 mg",
      form: "tablet",
      route_default: "oral",
      created_at: "",
      updated_at: "",
      ...overrides,
    };
  }

  describe("nameWorthCatalogLookup", () => {
    it("flags short single-token short forms", () => {
      expect(nameWorthCatalogLookup("amlo")).toBe(true);
      expect(nameWorthCatalogLookup("met")).toBe(true);
      expect(nameWorthCatalogLookup("atorva")).toBe(true);
    });

    it("skips long generics and multi-word names (commit instantly)", () => {
      expect(nameWorthCatalogLookup("metformin")).toBe(false);
      expect(nameWorthCatalogLookup("amlodipine")).toBe(false);
      expect(nameWorthCatalogLookup("vitamin d3")).toBe(false);
      expect(nameWorthCatalogLookup("")).toBe(false);
    });
  });

  describe("pickUnambiguousCatalogDrug", () => {
    it("returns null when there are no results", () => {
      expect(pickUnambiguousCatalogDrug("amlo", [])).toBeNull();
    });

    it("expands a unique prefix match (amlo → Amlodipine)", () => {
      const match = pickUnambiguousCatalogDrug("amlo", [drug()]);
      expect(match?.generic_name).toBe("Amlodipine");
    });

    it("does not guess when a short form maps to several generics (met)", () => {
      const results = [
        drug({ id: "d-1", generic_name: "Metformin" }),
        drug({ id: "d-2", generic_name: "Metoprolol" }),
      ];
      expect(pickUnambiguousCatalogDrug("met", results)).toBeNull();
    });

    it("prefers an exact generic match even when combos share the prefix", () => {
      const results = [
        drug({ id: "d-1", generic_name: "Amlodipine" }),
        drug({ id: "d-2", generic_name: "Amlodipine + Atenolol" }),
      ];
      expect(pickUnambiguousCatalogDrug("amlodipine", results)?.id).toBe("d-1");
    });

    it("is case-insensitive", () => {
      expect(pickUnambiguousCatalogDrug("AMLO", [drug()])?.id).toBe("d-1");
    });
  });

  describe("mergeCatalogDrugIntoPayload", () => {
    it("expands the name + attaches drugMasterId and catalog defaults", () => {
      const base = chartMedPayloadFromParsed(parseMedicineLine("t amlo bd")!);
      const merged = mergeCatalogDrugIntoPayload(base, drug());
      expect(merged.drugName).toBe("Amlodipine");
      expect(merged.drugMasterId).toBe("d-1");
      expect(merged.strength).toBe("5 mg");
      expect(merged.form).toBe("tablet");
    });

    it("never clobbers a strength the doctor already typed", () => {
      const base = chartMedPayloadFromParsed(parseMedicineLine("t amlo 10 mg bd")!);
      const merged = mergeCatalogDrugIntoPayload(base, drug({ strength: "5 mg" }));
      expect(merged.strength).toBe("10 mg");
      expect(merged.drugName).toBe("Amlodipine");
    });
  });
});
