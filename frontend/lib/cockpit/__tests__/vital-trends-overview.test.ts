import { describe, expect, it } from "vitest";
import { buildVitalsTrendSeries, indexVitalsTrendSeries } from "@/lib/cockpit/vitals-trends";
import {
  collectNumericTrendItemsWithHistory,
  countVitalsWithTrendHistory,
  groupTrendOverviewItems,
  vitalTrendsOverviewPreview,
} from "@/lib/cockpit/vital-trends-overview";
import { buildCategoricalVitalTimelines } from "@/lib/cockpit/categorical-vitals-timeline";
import type { PrescriptionWithRelations } from "@/types/prescription";

function rx(created_at: string, vitals: Partial<PrescriptionWithRelations>): PrescriptionWithRelations {
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

describe("vital-trends-overview helpers (vit-12)", () => {
  it("collectNumericTrendItemsWithHistory omits empty series", () => {
    const byMetric = indexVitalsTrendSeries(buildVitalsTrendSeries([]));
    expect(collectNumericTrendItemsWithHistory(byMetric)).toEqual([]);
  });

  it("includes only vitals with ≥1 reading", () => {
    const byMetric = indexVitalsTrendSeries(
      buildVitalsTrendSeries([
        rx("2026-06-01T10:00:00.000Z", { vitals_hr: 72, vitals_wt_kg: 70, vitals_ht_cm: 170 }),
        rx("2026-06-05T10:00:00.000Z", { vitals_hr: 74 }),
      ]),
    );
    const items = collectNumericTrendItemsWithHistory(byMetric);
    expect(items.some((i) => i.metric === "vitalsHr")).toBe(true);
    expect(items.some((i) => i.metric === "bmi")).toBe(true);
    expect(items.some((i) => i.metric === "vitalsSpo2")).toBe(false);
  });

  it("groups numeric and categorical items by clinical group", () => {
    const prescriptions = [
      rx("2026-06-01T10:00:00.000Z", {
        vitals_hr: 72,
        vitals_json: { vitalsPulseRhythm: "regular" },
      }),
    ];
    const numeric = collectNumericTrendItemsWithHistory(
      indexVitalsTrendSeries(buildVitalsTrendSeries(prescriptions)),
    );
    const categorical = buildCategoricalVitalTimelines(prescriptions);
    const grouped = groupTrendOverviewItems(numeric, categorical);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.group).toBe("core");
    expect(grouped[0]?.numeric).toHaveLength(1);
    expect(grouped[0]?.categorical).toHaveLength(1);
  });

  it("preview reflects history count", () => {
    expect(vitalTrendsOverviewPreview(0)).toBe("No prior readings");
    expect(vitalTrendsOverviewPreview(1)).toBe("1 vital with history");
    expect(vitalTrendsOverviewPreview(3)).toBe("3 vitals with history");
  });

  it("countVitalsWithTrendHistory sums numeric and categorical", () => {
    const numeric = [{ metric: "vitalsHr" }] as ReturnType<
      typeof collectNumericTrendItemsWithHistory
    >;
    const categorical = buildCategoricalVitalTimelines([
      rx("2026-06-01T10:00:00.000Z", { vitals_json: { vitalsAvpu: "alert" } }),
    ]);
    expect(countVitalsWithTrendHistory(numeric, categorical)).toBe(2);
  });
});
