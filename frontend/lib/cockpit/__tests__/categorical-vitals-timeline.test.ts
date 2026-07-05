import { describe, expect, it } from "vitest";
import {
  buildCategoricalVitalTimelines,
  formatCategoricalVisitLabel,
} from "@/lib/cockpit/categorical-vitals-timeline";
import type { PrescriptionWithRelations } from "@/types/prescription";

function rx(
  created_at: string,
  vitals_json?: PrescriptionWithRelations["vitals_json"],
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
    vitals_json,
  } as PrescriptionWithRelations;
}

describe("buildCategoricalVitalTimelines (vit-12)", () => {
  it("returns no timelines for empty input", () => {
    expect(buildCategoricalVitalTimelines([])).toEqual([]);
    expect(buildCategoricalVitalTimelines(null)).toEqual([]);
  });

  it("never throws on malformed legacy rows", () => {
    expect(() =>
      buildCategoricalVitalTimelines([
        rx("2026-06-01T10:00:00.000Z", null),
        rx("2026-06-05T10:00:00.000Z", {
          vitalsPulseRhythm: "not_valid" as "regular",
        }),
      ]),
    ).not.toThrow();
  });

  it("projects categorical values oldest → newest and omits empty vitals", () => {
    const timelines = buildCategoricalVitalTimelines([
      rx("2026-06-10T10:00:00.000Z", {
        vitalsPulseRhythm: "irregular",
        vitalsAvpu: "alert",
      }),
      rx("2026-06-01T10:00:00.000Z", {
        vitalsPulseRhythm: "regular",
      }),
      rx("2026-06-05T10:00:00.000Z", {
        vitalsPulseRhythm: "regularly_irregular",
        vitalsGlucoseTiming: "fasting",
      }),
    ]);

    expect(timelines.map((t) => t.key)).toEqual([
      "vitalsPulseRhythm",
      "vitalsGlucoseTiming",
      "vitalsAvpu",
    ]);

    const rhythm = timelines.find((t) => t.key === "vitalsPulseRhythm")!;
    expect(rhythm.points.map((p) => p.label)).toEqual([
      "Regular",
      "Regularly irregular",
      "Irregular",
    ]);
    expect(rhythm.points.map((p) => p.at)).toEqual([
      "2026-06-01T10:00:00.000Z",
      "2026-06-05T10:00:00.000Z",
      "2026-06-10T10:00:00.000Z",
    ]);
    expect(rhythm.group).toBe("core");
  });

  it("formats visit labels for chip display", () => {
    expect(formatCategoricalVisitLabel("2026-06-15T10:00:00.000Z")).toMatch(/15/);
  });
});
