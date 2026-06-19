import { describe, it, expect } from "vitest";
import {
  buildRxPayload,
  createEmptyRxFormFields,
  rxFormFieldsFromPrescription,
} from "@/components/cockpit/rx/RxFormContext";
import type { PrescriptionWithRelations } from "@/types/prescription";

describe("Vitals 2.0 form state (obj-05 / migration 151)", () => {
  it("defaults every extended vital to null", () => {
    const fields = createEmptyRxFormFields();
    expect(fields.vitalsRr).toBeNull();
    expect(fields.vitalsPainScore).toBeNull();
    expect(fields.vitalsGlucoseMgDl).toBeNull();
    expect(fields.vitalsGcsTotal).toBeNull();
    expect(fields.vitalsBpPosture).toBeNull();
    expect(fields.vitalsBpLimb).toBeNull();
    expect(fields.vitalsHeadCircumferenceCm).toBeNull();
    expect(fields.vitalsMuacCm).toBeNull();
    expect(fields.vitalsWaistCm).toBeNull();
  });

  it("maps extended vitals into the payload as canonical values", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsRr = 18;
    fields.vitalsPainScore = 4;
    fields.vitalsGlucoseMgDl = 110.5;
    fields.vitalsGcsTotal = 15;
    fields.vitalsBpPosture = "sitting";
    fields.vitalsBpLimb = "left_arm";
    fields.vitalsHeadCircumferenceCm = 35.2;
    fields.vitalsMuacCm = 24.1;
    fields.vitalsWaistCm = 82.4;

    const payload = buildRxPayload(fields);
    expect(payload.vitalsRr).toBe(18);
    expect(payload.vitalsPainScore).toBe(4);
    expect(payload.vitalsGlucoseMgDl).toBe(110.5);
    expect(payload.vitalsGcsTotal).toBe(15);
    expect(payload.vitalsBpPosture).toBe("sitting");
    expect(payload.vitalsBpLimb).toBe("left_arm");
    expect(payload.vitalsHeadCircumferenceCm).toBe(35.2);
    expect(payload.vitalsMuacCm).toBe(24.1);
    expect(payload.vitalsWaistCm).toBe(82.4);
  });

  it("emits null extended vitals when unset", () => {
    const payload = buildRxPayload(createEmptyRxFormFields());
    expect(payload.vitalsRr).toBeNull();
    expect(payload.vitalsBpPosture).toBeNull();
    expect(payload.vitalsWaistCm).toBeNull();
  });

  it("hydrates extended vitals from a loaded prescription", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      vitals_rr: 16,
      vitals_pain_score: 2,
      vitals_glucose_mg_dl: 98,
      vitals_gcs_total: 14,
      vitals_bp_posture: "supine",
      vitals_bp_limb: "right_arm",
      vitals_head_circumference_cm: 40,
      vitals_muac_cm: 22.5,
      vitals_waist_cm: 90,
    } as unknown as PrescriptionWithRelations;

    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.vitalsRr).toBe(16);
    expect(fields.vitalsPainScore).toBe(2);
    expect(fields.vitalsGlucoseMgDl).toBe(98);
    expect(fields.vitalsGcsTotal).toBe(14);
    expect(fields.vitalsBpPosture).toBe("supine");
    expect(fields.vitalsBpLimb).toBe("right_arm");
    expect(fields.vitalsHeadCircumferenceCm).toBe(40);
    expect(fields.vitalsMuacCm).toBe(22.5);
    expect(fields.vitalsWaistCm).toBe(90);
  });

  it("defaults extended vitals to null when absent on the prescription", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
    } as unknown as PrescriptionWithRelations;

    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.vitalsRr).toBeNull();
    expect(fields.vitalsBpPosture).toBeNull();
    expect(fields.vitalsWaistCm).toBeNull();
  });

  it("leaves the existing 7 vitals intact when extended vitals are set", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      vitals_bp_systolic: 120,
      vitals_bp_diastolic: 80,
      vitals_hr: 72,
      vitals_temp_c: 37,
      vitals_spo2: 98,
      vitals_wt_kg: 70,
      vitals_ht_cm: 170,
      vitals_rr: 16,
    } as unknown as PrescriptionWithRelations;

    const payload = buildRxPayload(rxFormFieldsFromPrescription(rx));
    expect(payload.vitalsBpSystolic).toBe(120);
    expect(payload.vitalsBpDiastolic).toBe(80);
    expect(payload.vitalsHr).toBe(72);
    expect(payload.vitalsTempC).toBe(37);
    expect(payload.vitalsSpo2).toBe(98);
    expect(payload.vitalsWtKg).toBe(70);
    expect(payload.vitalsHtCm).toBe(170);
    expect(payload.vitalsRr).toBe(16);
  });
});
