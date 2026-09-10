import { describe, expect, it } from "vitest";
import {
  collectBackgroundMeds,
  selectActiveChartMeds,
} from "@/hooks/usePatientRibbonData";
import type {
  MedicalBackgroundGrouped,
  PatientMedication,
} from "@/types/patient-chart";

function med(
  overrides: Partial<PatientMedication> & Pick<PatientMedication, "id" | "drug_name">,
): PatientMedication {
  return {
    doctor_id: "doc-1",
    patient_id: "pat-1",
    dose: null,
    frequency: null,
    status: "active",
    intake_pattern: null,
    source: null,
    started_on: null,
    stopped_on: null,
    note: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    strength: null,
    dose_qty: null,
    dose_unit: null,
    frequency_code: null,
    form: null,
    drug_master_id: null,
    stopped_ago_value: null,
    stopped_ago_unit: null,
    started_ago_value: null,
    started_ago_unit: null,
    stop_reason: null,
    dose_schedule: null,
    strength_value: null,
    strength_unit: null,
    strength_components: null,
    food_timing: null,
    ...overrides,
  };
}

describe("selectActiveChartMeds", () => {
  it("keeps only active, non-archived chart medications", () => {
    const rows = [
      med({
        id: "m1",
        drug_name: "Atorvastatin",
        status: "active",
        strength: "10 mg",
        frequency: "OD",
      }),
      med({ id: "m2", drug_name: "Stopped drug", status: "past" }),
      med({
        id: "m3",
        drug_name: "Archived drug",
        status: "active",
        archived_at: "2026-06-01T00:00:00.000Z",
      }),
      med({
        id: "m4",
        drug_name: "Telmisartan",
        status: "active",
        dose_schedule: "1-0-1",
      }),
    ];

    expect(selectActiveChartMeds(rows)).toEqual([
      { id: "m1", name: "Atorvastatin", detail: "10 mg · OD" },
      { id: "m4", name: "Telmisartan", detail: "1-0-1" },
    ]);
  });

  it("returns an empty list when nothing is active", () => {
    expect(
      selectActiveChartMeds([
        med({ id: "m1", drug_name: "Old", status: "past" }),
      ]),
    ).toEqual([]);
  });
});

describe("collectBackgroundMeds", () => {
  it("dedupes condition-linked and unlinked chart medications", () => {
    const linked = med({ id: "m1", drug_name: "Metformin" });
    const extra = med({ id: "m2", drug_name: "Aspirin" });
    const bg: MedicalBackgroundGrouped = {
      conditions: [
        {
          id: "c1",
          doctor_id: "doc-1",
          patient_id: "pat-1",
          condition: "T2DM",
          status: "active",
          diagnosed_on: null,
          diagnosed_ago_value: null,
          diagnosed_ago_unit: null,
          resolved_ago_value: null,
          resolved_ago_unit: null,
          on_treatment: true,
          acuity: null,
          code: null,
          code_title: null,
          note: null,
          archived_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          medications: [linked],
        },
      ],
      unlinkedMedications: [linked, extra],
      links: [],
      notes: null,
    };

    expect(collectBackgroundMeds(bg).map((row) => row.id).sort()).toEqual([
      "m1",
      "m2",
    ]);
  });
});
