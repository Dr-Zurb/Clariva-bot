import { describe, it, expect } from "vitest";
import {
  buildVitalsTrendSeries,
  getVitalTrendSeries,
  indexVitalsTrendSeries,
} from "@/lib/cockpit/vitals-trends";
import type { PrescriptionWithRelations, VitalsJson } from "@/types/prescription";
import { VITALS_REGISTRY } from "@/lib/cockpit/vitals-schema";

function rx(
  created_at: string,
  vitals: Partial<
    Pick<
      PrescriptionWithRelations,
      | "vitals_bp_systolic"
      | "vitals_bp_diastolic"
      | "vitals_hr"
      | "vitals_temp_c"
      | "vitals_wt_kg"
      | "vitals_ht_cm"
      | "vitals_spo2"
    >
  > & { vitals_json?: VitalsJson | null },
): PrescriptionWithRelations {
  return {
    id: `rx-${created_at}`,
    appointment_id: "appt-1",
    patient_id: "patient-1",
    doctor_id: "doctor-1",
    type: "standard",
    cc: null,
    hopi: null,
    provisional_diagnosis: null,
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
    sent_to_patient_at: null,
    created_at,
    updated_at: created_at,
    ...vitals,
  } as PrescriptionWithRelations;
}

describe("buildVitalsTrendSeries (obj-25)", () => {
  it("returns empty points for every metric when input is empty", () => {
    const series = buildVitalsTrendSeries([]);
    expect(series.length).toBeGreaterThan(0);
    for (const s of series) {
      expect(s.points).toEqual([]);
      expect(s.unit).toBeTruthy();
    }
  });

  it("never throws for null/undefined input", () => {
    expect(() => buildVitalsTrendSeries(null)).not.toThrow();
    expect(() => buildVitalsTrendSeries(undefined)).not.toThrow();
    expect(buildVitalsTrendSeries(null).every((s) => s.points.length === 0)).toBe(true);
  });

  it("sorts multi-visit points oldest → newest per metric", () => {
    const series = buildVitalsTrendSeries([
      rx("2026-06-10T10:00:00.000Z", { vitals_hr: 80 }),
      rx("2026-06-01T10:00:00.000Z", { vitals_hr: 72 }),
      rx("2026-06-05T10:00:00.000Z", { vitals_hr: 76 }),
    ]);
    const hr = getVitalTrendSeries(series, "vitalsHr");
    expect(hr.points.map((p) => p.value)).toEqual([72, 76, 80]);
    expect(hr.points.map((p) => p.at)).toEqual([
      "2026-06-01T10:00:00.000Z",
      "2026-06-05T10:00:00.000Z",
      "2026-06-10T10:00:00.000Z",
    ]);
    expect(hr.unit).toBe("bpm");
  });

  it("drops null vitals per metric while keeping others on sparse rows", () => {
    const series = buildVitalsTrendSeries([
      rx("2026-06-01T10:00:00.000Z", { vitals_hr: 70, vitals_temp_c: 36.8 }),
      rx("2026-06-05T10:00:00.000Z", { vitals_hr: 74 }),
      rx("2026-06-10T10:00:00.000Z", { vitals_temp_c: 37.1 }),
    ]);
    expect(getVitalTrendSeries(series, "vitalsHr").points).toHaveLength(2);
    expect(getVitalTrendSeries(series, "vitalsTempC").points).toHaveLength(2);
    expect(getVitalTrendSeries(series, "vitalsSpo2").points).toHaveLength(0);
  });

  it("derives BMI, MAP, and BSA from co-present vitals", () => {
    const series = buildVitalsTrendSeries([
      rx("2026-06-01T10:00:00.000Z", {
        vitals_bp_systolic: 120,
        vitals_bp_diastolic: 80,
        vitals_ht_cm: 170,
        vitals_wt_kg: 70,
      }),
    ]);
    expect(getVitalTrendSeries(series, "bmi").points).toEqual([
      { value: 24.2, at: "2026-06-01T10:00:00.000Z" },
    ]);
    expect(getVitalTrendSeries(series, "map").points).toEqual([
      { value: 93.3, at: "2026-06-01T10:00:00.000Z" },
    ]);
    expect(getVitalTrendSeries(series, "bsa").points).toEqual([
      { value: 1.82, at: "2026-06-01T10:00:00.000Z" },
    ]);
    expect(getVitalTrendSeries(series, "bmi").unit).toBe("kg/m²");
  });

  it("omits derived metrics when inputs are incomplete", () => {
    const series = buildVitalsTrendSeries([
      rx("2026-06-01T10:00:00.000Z", { vitals_wt_kg: 70 }),
      rx("2026-06-05T10:00:00.000Z", { vitals_ht_cm: 170 }),
    ]);
    expect(getVitalTrendSeries(series, "bmi").points).toHaveLength(0);
    expect(getVitalTrendSeries(series, "bsa").points).toHaveLength(0);
    expect(getVitalTrendSeries(series, "map").points).toHaveLength(0);
  });

  it("returns a single-point series for one visit", () => {
    const series = buildVitalsTrendSeries([
      rx("2026-06-01T10:00:00.000Z", { vitals_spo2: 98 }),
    ]);
    expect(getVitalTrendSeries(series, "vitalsSpo2").points).toEqual([
      { value: 98, at: "2026-06-01T10:00:00.000Z" },
    ]);
  });

  it("indexVitalsTrendSeries exposes every metric key", () => {
    const indexed = indexVitalsTrendSeries(buildVitalsTrendSeries([]));
    expect(indexed.vitalsHr.points).toEqual([]);
    expect(indexed.bmi.unit).toBe("kg/m²");
    expect(indexed.vitalsO2FlowLMin.points).toEqual([]);
    expect(indexed.vitalsO2FlowLMin.unit).toBe("L/min");
  });

  it("returns a series for every catalog metric including json-backed vitals", () => {
    const series = buildVitalsTrendSeries([]);
    expect(series).toHaveLength(VITALS_REGISTRY.length + 3);
    expect(series.some((s) => s.metric === "vitalsFio2Pct")).toBe(true);
    expect(series.some((s) => s.metric === "vitalsFundalHeightCm")).toBe(true);
  });

  it("projects json-backed vitals across visits in chronological order", () => {
    const series = buildVitalsTrendSeries([
      rx("2026-06-10T10:00:00.000Z", {
        vitals_json: { vitalsO2FlowLMin: 4, vitalsFio2Pct: 40 },
      }),
      rx("2026-06-01T10:00:00.000Z", {
        vitals_json: { vitalsO2FlowLMin: 2 },
      }),
      rx("2026-06-05T10:00:00.000Z", {
        vitals_json: { vitalsO2FlowLMin: 3, vitalsBloodKetonesMmolL: 0.4 },
      }),
    ]);
    const o2 = getVitalTrendSeries(series, "vitalsO2FlowLMin");
    expect(o2.points.map((p) => p.value)).toEqual([2, 3, 4]);
    expect(o2.points.map((p) => p.at)).toEqual([
      "2026-06-01T10:00:00.000Z",
      "2026-06-05T10:00:00.000Z",
      "2026-06-10T10:00:00.000Z",
    ]);
    expect(o2.unit).toBe("L/min");
    expect(getVitalTrendSeries(series, "vitalsFio2Pct").points).toEqual([
      { value: 40, at: "2026-06-10T10:00:00.000Z" },
    ]);
    expect(getVitalTrendSeries(series, "vitalsBloodKetonesMmolL").points).toEqual([
      { value: 0.4, at: "2026-06-05T10:00:00.000Z" },
    ]);
  });

  it("keeps column vitals unchanged when json vitals are present on the same row", () => {
    const series = buildVitalsTrendSeries([
      rx("2026-06-01T10:00:00.000Z", {
        vitals_hr: 72,
        vitals_json: { vitalsO2FlowLMin: 2 },
      }),
    ]);
    expect(getVitalTrendSeries(series, "vitalsHr").points).toEqual([
      { value: 72, at: "2026-06-01T10:00:00.000Z" },
    ]);
    expect(getVitalTrendSeries(series, "vitalsO2FlowLMin").points).toEqual([
      { value: 2, at: "2026-06-01T10:00:00.000Z" },
    ]);
  });

  it("skips absent json keys on sparse rows without affecting other metrics", () => {
    const series = buildVitalsTrendSeries([
      rx("2026-06-01T10:00:00.000Z", {
        vitals_json: { vitalsO2FlowLMin: 2, vitalsFio2Pct: 28 },
      }),
      rx("2026-06-05T10:00:00.000Z", { vitals_json: { vitalsO2FlowLMin: 3 } }),
      rx("2026-06-10T10:00:00.000Z", {}),
    ]);
    expect(getVitalTrendSeries(series, "vitalsO2FlowLMin").points).toHaveLength(2);
    expect(getVitalTrendSeries(series, "vitalsFio2Pct").points).toHaveLength(1);
    expect(getVitalTrendSeries(series, "vitalsPefrLMin").points).toHaveLength(0);
  });

  it("never throws when vitals_json is null or malformed on legacy rows", () => {
    expect(() =>
      buildVitalsTrendSeries([
        rx("2026-06-01T10:00:00.000Z", { vitals_json: null }),
        rx("2026-06-05T10:00:00.000Z", {
          vitals_json: { vitalsO2FlowLMin: "bad" as unknown as number },
        }),
      ]),
    ).not.toThrow();
    const series = buildVitalsTrendSeries([
      rx("2026-06-01T10:00:00.000Z", { vitals_json: null }),
    ]);
    expect(getVitalTrendSeries(series, "vitalsO2FlowLMin").points).toHaveLength(0);
  });
});
