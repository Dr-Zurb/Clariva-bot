import { describe, it, expect } from "vitest";
import {
  buildRxPayload,
  createEmptyRxFormFields,
  rxFormFieldsFromPrescription,
} from "@/components/cockpit/rx/RxFormContext";
import type { PrescriptionWithRelations } from "@/types/prescription";

describe("Assessment impression + acuity form state (dormant visit-level acuity)", () => {
  it("defaults impression note to empty and acuity to null", () => {
    const fields = createEmptyRxFormFields();
    expect(fields.assessmentNote).toBe("");
    expect(fields.assessmentAcuity).toBeNull();
  });

  it("emits the trimmed impression note but keeps visit-level acuity null (dormant)", () => {
    const fields = createEmptyRxFormFields();
    fields.assessmentNote = "  Likely viral URI; low bacterial suspicion.  ";
    fields.assessmentAcuity = "improving";

    const payload = buildRxPayload(fields);
    expect(payload.assessmentNote).toBe("Likely viral URI; low bacterial suspicion.");
    expect(payload.assessmentAcuity).toBeNull();
  });

  it("emits null when the impression note is blank/whitespace", () => {
    const fields = createEmptyRxFormFields();
    fields.assessmentNote = "   ";

    const payload = buildRxPayload(fields);
    expect(payload.assessmentNote).toBeNull();
  });

  it("hydrates visit-level fields for back-compat but seeds primary card acuity", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      provisional_diagnosis: "Viral URI",
      assessment_note: "Stable; continue current plan.",
      assessment_acuity: "stable",
    } as unknown as PrescriptionWithRelations;

    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.assessmentNote).toBe("Stable; continue current plan.");
    expect(fields.assessmentAcuity).toBe("stable");
    expect(fields.diagnoses[0]?.acuity).toBe("stable");
  });

  it("does not overwrite an existing per-diagnosis acuity from visit-level", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      assessment_acuity: "worsening",
      diagnoses_json: [
        {
          id: "dx-1",
          label: "Asthma",
          kind: "primary",
          certainty: "confirmed",
          status: "ongoing",
          acuity: "improving",
        },
      ],
    } as unknown as PrescriptionWithRelations;

    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.diagnoses[0]?.acuity).toBe("improving");
  });

  it("round-trips per-diagnosis acuity through hydrate → payload", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      diagnoses_json: [
        {
          id: "dx-1",
          label: "Viral URI",
          kind: "primary",
          certainty: "provisional",
          status: "new",
          acuity: "worsening",
        },
      ],
    } as unknown as PrescriptionWithRelations;

    const payload = buildRxPayload(rxFormFieldsFromPrescription(rx));
    expect(payload.assessmentNote).toBeNull();
    expect(payload.assessmentAcuity).toBeNull();
    expect(payload.diagnosesJson?.[0]?.acuity).toBe("worsening");
  });
});
