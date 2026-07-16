import { describe, expect, it } from "vitest";
import {
  buildRxPayload,
  createEmptyRxFormFields,
  rxFormFieldsFromPrescription,
  rxFormReducer,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import type { DiagnosisRow, PrescriptionWithRelations } from "@/types/prescription";

function baseState(fields: RxFormFields) {
  return {
    fields,
    isDirty: false,
    isSaving: false,
    isSubmitting: false,
    lastSavedAt: null,
    submitError: null,
  };
}

const PRIMARY: DiagnosisRow = {
  id: "dx-1",
  label: "Viral URI",
  kind: "primary",
  certainty: "provisional",
  status: "new",
  note: null,
  conditionId: null,
};

describe("structured diagnoses form state (asmt-03 / migration 161)", () => {
  it("defaults diagnoses to an empty array", () => {
    expect(createEmptyRxFormFields().diagnoses).toEqual([]);
  });

  it("derives provisionalDiagnosis from the primary label when diagnoses are set", () => {
    const fields = createEmptyRxFormFields();
    fields.diagnoses = [PRIMARY];
    fields.provisionalDiagnosis = "stale";
    const payload = buildRxPayload(fields);
    expect(payload.provisionalDiagnosis).toBe("Viral URI");
    expect(payload.diagnosesJson).toEqual([
      expect.objectContaining({ id: "dx-1", label: "Viral URI", kind: "primary" }),
    ]);
  });

  it("keeps legacy free-text passthrough when diagnoses are empty (ASMT-D4)", () => {
    const fields = createEmptyRxFormFields();
    fields.provisionalDiagnosis = "Legacy Dx";
    const payload = buildRxPayload(fields);
    expect(payload.provisionalDiagnosis).toBe("Legacy Dx");
    expect(payload.diagnosesJson).toEqual([]);
  });

  it("is byte-identical for a single-diagnosis visit vs legacy free-text path", () => {
    const label = "Acute pharyngitis";
    const legacy = createEmptyRxFormFields();
    legacy.provisionalDiagnosis = label;
    const structured = createEmptyRxFormFields();
    structured.diagnoses = [{ ...PRIMARY, label }];
    expect(buildRxPayload(structured).provisionalDiagnosis).toBe(
      buildRxPayload(legacy).provisionalDiagnosis,
    );
  });

  it("hydrates diagnoses_json when present", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      provisional_diagnosis: "ignored when json present",
      diagnoses_json: [PRIMARY, { ...PRIMARY, id: "dx-2", label: "GERD", kind: "secondary" }],
    } as unknown as PrescriptionWithRelations;
    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.diagnoses).toHaveLength(2);
    expect(fields.diagnoses[0].kind).toBe("primary");
    expect(fields.provisionalDiagnosis).toBe("Viral URI");
  });

  it("seeds one primary row from legacy provisional_diagnosis when json is empty", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      provisional_diagnosis: "Asthma",
      diagnoses_json: [],
    } as unknown as PrescriptionWithRelations;
    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.diagnoses).toHaveLength(1);
    expect(fields.diagnoses[0]).toMatchObject({
      label: "Asthma",
      kind: "primary",
      certainty: "provisional",
    });
    expect(fields.provisionalDiagnosis).toBe("Asthma");
  });

  it("promotes a secondary to primary and demotes the old primary", () => {
    const fields = createEmptyRxFormFields();
    fields.diagnoses = [
      PRIMARY,
      { ...PRIMARY, id: "dx-2", label: "GERD", kind: "secondary" },
    ];
    const next = rxFormReducer(baseState(fields), {
      type: "UPDATE_DIAGNOSIS",
      id: "dx-2",
      patch: { kind: "primary" },
    });
    expect(next.fields.diagnoses.find((d) => d.id === "dx-2")?.kind).toBe("primary");
    expect(next.fields.diagnoses.find((d) => d.id === "dx-1")?.kind).toBe("secondary");
    expect(next.fields.provisionalDiagnosis).toBe("GERD");
  });

  it("syncs strip provisionalDiagnosis edits into the primary row", () => {
    const fields = createEmptyRxFormFields();
    fields.diagnoses = [PRIMARY];
    const next = rxFormReducer(baseState(fields), {
      type: "SET_FIELD",
      key: "provisionalDiagnosis",
      value: "Updated URI",
    });
    expect(next.fields.diagnoses[0].label).toBe("Updated URI");
    expect(next.fields.provisionalDiagnosis).toBe("Updated URI");
  });

  it("persists conditionId via diagnosesJson and never invents chart writes (ASMT-D6)", () => {
    const conditionId = "550e8400-e29b-41d4-a716-446655440099";
    const fields = createEmptyRxFormFields();
    fields.diagnoses = [{ ...PRIMARY, conditionId }];
    const payload = buildRxPayload(fields);
    expect(payload.diagnosesJson).toEqual([
      expect.objectContaining({ id: "dx-1", conditionId }),
    ]);
    // Prescription payload has no chart-condition create/update fields.
    expect(payload).not.toHaveProperty("createPatientCondition");
    expect(payload).not.toHaveProperty("conditionIds");
    expect(JSON.stringify(payload)).not.toMatch(/patient_chronic_conditions/);
  });

  it("round-trips conditionId through hydrate", () => {
    const conditionId = "550e8400-e29b-41d4-a716-446655440099";
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      provisional_diagnosis: "Viral URI",
      diagnoses_json: [{ ...PRIMARY, conditionId }],
    } as unknown as PrescriptionWithRelations;
    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.diagnoses[0].conditionId).toBe(conditionId);
  });
});

describe("ICD-11 coding round-trip (asmt-06)", () => {
  it("round-trips code + codeTitle through hydrate → buildRxPayload", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      provisional_diagnosis: "Hypertension",
      diagnoses_json: [
        {
          ...PRIMARY,
          label: "Hypertension",
          code: "BA00",
          codeTitle: "Essential hypertension",
        },
      ],
    } as unknown as PrescriptionWithRelations;
    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.diagnoses[0].code).toBe("BA00");
    expect(fields.diagnoses[0].codeTitle).toBe("Essential hypertension");

    const payload = buildRxPayload(fields);
    expect(payload.diagnosesJson).toEqual([
      expect.objectContaining({
        label: "Hypertension",
        code: "BA00",
        codeTitle: "Essential hypertension",
      }),
    ]);
  });

  it("hydrates old (uncoded) rows unchanged — code defaults to null", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      provisional_diagnosis: "Viral URI",
      diagnoses_json: [PRIMARY],
    } as unknown as PrescriptionWithRelations;
    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.diagnoses[0].code).toBeNull();
    expect(fields.diagnoses[0].codeTitle).toBeNull();
  });

  it("keeps derived provisional/differential TEXT byte-identical (coding is additive)", () => {
    const label = "Hypertension";
    const uncoded = createEmptyRxFormFields();
    uncoded.diagnoses = [{ ...PRIMARY, label }];
    const coded = createEmptyRxFormFields();
    coded.diagnoses = [
      { ...PRIMARY, label, code: "BA00", codeTitle: "Essential hypertension" },
    ];
    expect(buildRxPayload(coded).provisionalDiagnosis).toBe(
      buildRxPayload(uncoded).provisionalDiagnosis,
    );
    expect(buildRxPayload(coded).differentialDiagnosis).toEqual(
      buildRxPayload(uncoded).differentialDiagnosis,
    );
  });
});

describe("differential fold (asmt-05 / ASMT-D4′)", () => {
  it("derives differentialDiagnosis from non-excluded differential cards", () => {
    const fields = createEmptyRxFormFields();
    fields.diagnoses = [
      PRIMARY,
      {
        ...PRIMARY,
        id: "ddx-1",
        label: "Pneumonia",
        kind: "differential",
      },
      {
        ...PRIMARY,
        id: "ddx-2",
        label: "TB",
        kind: "differential",
        certainty: "excluded",
      },
    ];
    fields.differentialDiagnosis = ["stale"];
    const payload = buildRxPayload(fields);
    expect(payload.differentialDiagnosis).toEqual(["Pneumonia"]);
    expect(payload.diagnosesJson).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "ddx-2", certainty: "excluded" }),
      ]),
    );
    expect(payload.provisionalDiagnosis).toBe("Viral URI");
  });

  it("is byte-identical to legacy chip DDx for equal content", () => {
    const labels = ["Pneumonia", "Asthma"];
    const legacy = createEmptyRxFormFields();
    legacy.differentialDiagnosis = labels;
    const structured = createEmptyRxFormFields();
    structured.diagnoses = [
      PRIMARY,
      ...labels.map((label, i) => ({
        ...PRIMARY,
        id: `ddx-${i}`,
        label,
        kind: "differential" as const,
      })),
    ];
    expect(buildRxPayload(structured).differentialDiagnosis).toEqual(
      buildRxPayload(legacy).differentialDiagnosis,
    );
  });

  it("keeps provisional_diagnosis byte-identical when differentials are present", () => {
    const fields = createEmptyRxFormFields();
    fields.diagnoses = [
      PRIMARY,
      {
        ...PRIMARY,
        id: "ddx-1",
        label: "Pneumonia",
        kind: "differential",
      },
    ];
    expect(buildRxPayload(fields).provisionalDiagnosis).toBe("Viral URI");
  });

  it("hydrates legacy differential_diagnosis into differential cards", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      provisional_diagnosis: "Viral URI",
      diagnoses_json: [PRIMARY],
      differential_diagnosis: ["Pneumonia", "TB"],
    } as unknown as PrescriptionWithRelations;
    const fields = rxFormFieldsFromPrescription(rx);
    const ddx = fields.diagnoses.filter((d) => d.kind === "differential");
    expect(ddx.map((d) => d.label)).toEqual(["Pneumonia", "TB"]);
    expect(fields.differentialDiagnosis).toEqual(["Pneumonia", "TB"]);
  });

  it("does not re-seed differentials already present in diagnoses_json", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      provisional_diagnosis: "Viral URI",
      diagnoses_json: [
        PRIMARY,
        {
          ...PRIMARY,
          id: "ddx-1",
          label: "Pneumonia",
          kind: "differential",
        },
      ],
      differential_diagnosis: ["Pneumonia", "TB"],
    } as unknown as PrescriptionWithRelations;
    const fields = rxFormFieldsFromPrescription(rx);
    const ddx = fields.diagnoses.filter((d) => d.kind === "differential");
    expect(ddx.map((d) => d.label)).toEqual(["Pneumonia", "TB"]);
    expect(ddx).toHaveLength(2);
  });

  it("keeps the derived DDx mirror in sync when cards change", () => {
    const fields = createEmptyRxFormFields();
    fields.diagnoses = [PRIMARY];
    const next = rxFormReducer(baseState(fields), {
      type: "ADD_DIAGNOSIS",
      diagnosis: {
        ...PRIMARY,
        id: "ddx-1",
        label: "Pneumonia",
        kind: "differential",
      },
    });
    expect(next.fields.differentialDiagnosis).toEqual(["Pneumonia"]);
    const excluded = rxFormReducer(next, {
      type: "UPDATE_DIAGNOSIS",
      id: "ddx-1",
      patch: { certainty: "excluded" },
    });
    expect(excluded.fields.differentialDiagnosis).toEqual([]);
    expect(
      excluded.fields.diagnoses.find((d) => d.id === "ddx-1")?.certainty,
    ).toBe("excluded");
  });

  it("does not auto-pick a differential as primary when enforcing", () => {
    const fields = createEmptyRxFormFields();
    fields.diagnoses = [
      {
        ...PRIMARY,
        id: "ddx-1",
        label: "Pneumonia",
        kind: "differential",
      },
      { ...PRIMARY, id: "dx-2", label: "GERD", kind: "secondary" },
    ];
    const next = rxFormReducer(baseState(fields), {
      type: "SET_DIAGNOSES",
      diagnoses: fields.diagnoses,
    });
    expect(next.fields.diagnoses.find((d) => d.id === "ddx-1")?.kind).toBe(
      "differential",
    );
    expect(next.fields.diagnoses.find((d) => d.id === "dx-2")?.kind).toBe(
      "primary",
    );
    expect(next.fields.provisionalDiagnosis).toBe("GERD");
  });
});
