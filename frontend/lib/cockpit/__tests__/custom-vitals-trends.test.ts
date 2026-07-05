import { describe, expect, it } from "vitest";
import {
  buildCustomVitalTextTimelines,
  buildCustomVitalTrendSeries,
  enrichCustomVitalTrendGroups,
  indexCustomVitalTrendSeries,
} from "@/lib/cockpit/custom-vitals-trends";
import type { CustomVitalDef } from "@/lib/cockpit/vitals-custom";
import type { PrescriptionWithRelations, VitalsJson } from "@/types/prescription";

function rx(
  created_at: string,
  vitals_json?: VitalsJson | null,
): PrescriptionWithRelations {
  return {
    id: `rx-${created_at}`,
    appointment_id: "appt-1",
    patient_id: "patient-1",
    doctor_id: "doctor-1",
    type: "standard",
    created_at,
    updated_at: created_at,
    vitals_json,
  } as PrescriptionWithRelations;
}

const girthDef: CustomVitalDef = {
  id: "custom_girth",
  label: "Abdominal girth",
  unit: "cm",
  kind: "numeric",
  group: "metabolic",
};

const gaitDef: CustomVitalDef = {
  id: "custom_gait",
  label: "Gait",
  unit: null,
  kind: "text",
  group: "neuro",
};

describe("buildCustomVitalTrendSeries", () => {
  it("returns empty for prescriptions without custom vitals", () => {
    expect(buildCustomVitalTrendSeries([])).toEqual([]);
    expect(buildCustomVitalTrendSeries(null)).toEqual([]);
  });

  it("projects numeric custom vitals oldest → newest with latest label/unit", () => {
    const series = buildCustomVitalTrendSeries([
      rx("2026-06-01T10:00:00.000Z", {
        vitalsCustom: [
          {
            id: "custom_girth",
            label: "Girth",
            unit: "cm",
            kind: "numeric",
            value: 90,
          },
        ],
      }),
      rx("2026-06-05T10:00:00.000Z", {
        vitalsCustom: [
          {
            id: "custom_girth",
            label: "Abdominal girth",
            unit: "cm",
            kind: "numeric",
            value: 92,
          },
        ],
      }),
    ]);

    expect(series).toHaveLength(1);
    expect(series[0]?.label).toBe("Abdominal girth");
    expect(series[0]?.points.map((p) => p.value)).toEqual([90, 92]);
  });

  it("ignores text custom vitals", () => {
    expect(
      buildCustomVitalTrendSeries([
        rx("2026-06-01T10:00:00.000Z", {
          vitalsCustom: [
            { id: "custom_gait", label: "Gait", kind: "text", value: "Steady" },
          ],
        }),
      ]),
    ).toEqual([]);
  });

  it("enriches groups from doctor definitions", () => {
    const indexed = indexCustomVitalTrendSeries(
      enrichCustomVitalTrendGroups(
        buildCustomVitalTrendSeries([
          rx("2026-06-01T10:00:00.000Z", {
            vitalsCustom: [
              { id: "custom_girth", label: "Girth", unit: "cm", kind: "numeric", value: 90 },
            ],
          }),
        ]),
        [girthDef],
      ),
    );
    expect(indexed.custom_girth?.group).toBe("metabolic");
  });
});

describe("buildCustomVitalTextTimelines", () => {
  it("projects text custom vitals as chip timelines", () => {
    const timelines = buildCustomVitalTextTimelines([
      rx("2026-06-01T10:00:00.000Z", {
        vitalsCustom: [{ id: "custom_gait", label: "Gait", kind: "text", value: "Steady" }],
      }),
      rx("2026-06-05T10:00:00.000Z", {
        vitalsCustom: [{ id: "custom_gait", label: "Gait", kind: "text", value: "Ataxic" }],
      }),
    ], [gaitDef]);

    expect(timelines).toHaveLength(1);
    expect(timelines[0]?.group).toBe("neuro");
    expect(timelines[0]?.points.map((p) => p.label)).toEqual(["Steady", "Ataxic"]);
  });
});
