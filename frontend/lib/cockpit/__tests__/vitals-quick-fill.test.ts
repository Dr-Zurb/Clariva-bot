import { describe, expect, it } from "vitest";
import { createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";
import {
  BP_QUICK_FILL_PAIRS,
  applyWnlFillPlan,
  bpPrimaryReadingEmpty,
  buildWnlFillPlan,
  resolveTypicalNormalCanonical,
  resolveTypicalNormalGlucoseMgDl,
  resolveVitalQuickFillOptions,
  wnlFillPlanHasTargets,
} from "@/lib/cockpit/vitals-quick-fill";
import { resolveVital } from "@/lib/cockpit/vitals-schema";
import { cToF } from "@/lib/cockpit/vitals-derive";

describe("vitals-quick-fill", () => {
  it("exposes curated BP pairs", () => {
    expect(BP_QUICK_FILL_PAIRS.map((p) => p.label)).toEqual([
      "110/70",
      "120/80",
      "130/80",
      "140/90",
    ]);
  });

  it("resolves quick-fill options in the active display unit", () => {
    const cUnit = resolveVital("vitalsTempC").displayUnits[0]!;
    expect(resolveVitalQuickFillOptions("vitalsTempC", cUnit).map((o) => o.label)).toEqual([
      "36.8",
      "37",
      "37.5",
    ]);

    const fUnit = resolveVital("vitalsTempC").displayUnits[1]!;
    const fLabels = resolveVitalQuickFillOptions("vitalsTempC", fUnit).map((o) => o.label);
    expect(fLabels[0]).toBe(String(Math.round(cToF(36.8) * 10) / 10));
  });

  it("returns HR/RR/SpO2 chips and nothing for weight", () => {
    const hrUnit = resolveVital("vitalsHr").displayUnits[0]!;
    expect(resolveVitalQuickFillOptions("vitalsHr", hrUnit).map((o) => o.label)).toEqual([
      "72",
      "80",
      "88",
    ]);
    expect(resolveVitalQuickFillOptions("vitalsWtKg", hrUnit)).toEqual([]);
  });

  it("detects empty primary BP readings", () => {
    expect(bpPrimaryReadingEmpty(null, null)).toBe(true);
    expect(bpPrimaryReadingEmpty(120, null)).toBe(false);
    expect(bpPrimaryReadingEmpty(null, 80)).toBe(false);
  });

  it("builds a WNL plan for visible empty bandable vitals", () => {
    const fields = createEmptyRxFormFields();
    const visible = new Set([
      "vitalsHr",
      "vitalsRr",
      "vitalsTempC",
      "vitalsSpo2",
      "vitalsWtKg",
    ] as const);
    const plan = buildWnlFillPlan({
      fields,
      visibleNumericKeys: visible,
      showBp: true,
      showGlucose: true,
    });
    expect(wnlFillPlanHasTargets(plan)).toBe(true);
    expect(plan.vitals.map((v) => v.key)).toEqual([
      "vitalsHr",
      "vitalsRr",
      "vitalsTempC",
      "vitalsSpo2",
    ]);
    expect(plan.vitals.find((v) => v.key === "vitalsHr")?.canonicalValue).toBe(
      resolveTypicalNormalCanonical("vitalsHr"),
    );
    expect(plan.bp).toMatchObject({ systolic: 120, diastolic: 80 });
    expect(plan.glucose?.valueMgDl).toBe(resolveTypicalNormalGlucoseMgDl());
  });

  it("skips vitals that already have values in the WNL plan", () => {
    const fields = { ...createEmptyRxFormFields(), vitalsHr: 95 };
    const plan = buildWnlFillPlan({
      fields,
      visibleNumericKeys: new Set(["vitalsHr", "vitalsRr"] as const),
      showBp: false,
    });
    expect(plan.vitals.map((v) => v.key)).toEqual(["vitalsRr"]);
  });
});
