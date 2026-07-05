import { describe, it, expect } from "vitest";
import {
  buildRxPayload,
  createEmptyRxFormFields,
  rxFormFieldsFromPrescription,
} from "@/components/cockpit/rx/RxFormContext";
import { JSON_VITAL_FORM_KEYS } from "@/lib/cockpit/vitals-json";
import type { PrescriptionWithRelations } from "@/types/prescription";

/** Snapshot of a column-only payload before vit-04 (no vitalsJson key). */
const COLUMN_ONLY_FIXTURE = {
  vitalsBpSystolic: 128,
  vitalsBpDiastolic: 82,
  vitalsHr: 76,
  vitalsTempC: 37.1,
  vitalsSpo2: 98,
  vitalsWtKg: 71.5,
  vitalsHtCm: 172,
  vitalsRr: 18,
  vitalsPainScore: 4,
  vitalsGlucoseMgDl: 110,
  vitalsGcsTotal: 15,
  vitalsBpPosture: "sitting" as const,
  vitalsBpLimb: "left_arm" as const,
  vitalsHeadCircumferenceCm: 35.2,
  vitalsMuacCm: 24.1,
  vitalsWaistCm: 82.4,
};

describe("vit-04 · json vitals form-state + payload wiring", () => {
  it("defaults every json-backed vital to null", () => {
    const fields = createEmptyRxFormFields();
    for (const key of JSON_VITAL_FORM_KEYS) {
      expect(fields[key]).toBeNull();
    }
  });

  it("seeds in-clinic provenance defaults from consultation type", () => {
    expect(createEmptyRxFormFields(undefined, { consultationType: "in_clinic" }).vitalsMeasurementContext).toEqual({
      measuredBy: "nurse",
      setting: "clinic",
    });
    expect(createEmptyRxFormFields().vitalsMeasurementContext).toEqual({
      measuredBy: "patient",
      setting: "home",
    });
  });

  it("keeps column-only buildRxPayload byte-identical (vitalsJson omitted when empty)", () => {
    const before = buildRxPayload(createEmptyRxFormFields());
    const after = buildRxPayload({ ...createEmptyRxFormFields(), ...COLUMN_ONLY_FIXTURE });
    expect(after).not.toHaveProperty("vitalsJson");
    expect(JSON.stringify(after)).toBe(
      JSON.stringify({ ...before, ...COLUMN_ONLY_FIXTURE }),
    );
  });

  it("writes json vitals into vitalsJson and never duplicates column vitals", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsO2FlowLMin = 4;
    fields.vitalsFio2Pct = 40;
    fields.vitalsO2DeliveryMethod = "nasal_cannula";
    fields.vitalsAvpu = "alert";
    fields.vitalsBpSystolic = 120;

    const payload = buildRxPayload(fields);
    expect(payload.vitalsBpSystolic).toBe(120);
    expect(payload.vitalsJson).toEqual({
      vitalsO2FlowLMin: 4,
      vitalsFio2Pct: 40,
      vitalsO2DeliveryMethod: "nasal_cannula",
      vitalsAvpu: "alert",
    });
    expect(payload.vitalsJson).not.toHaveProperty("vitalsBpSystolic");
  });

  it("hydrates json vitals from vitals_json and round-trips load→save→reload→save", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      vitals_bp_systolic: 118,
      vitals_json: {
        vitalsPefrLMin: 420,
        vitalsGcsE: 4,
        vitalsGcsV: 5,
        vitalsGcsM: 6,
        vitalsGlucoseTiming: "fasting",
        vitalsPulseRhythm: "irregular",
      },
    } as unknown as PrescriptionWithRelations;

    const loaded = rxFormFieldsFromPrescription(rx);
    expect(loaded.vitalsBpSystolic).toBe(118);
    expect(loaded.vitalsPefrLMin).toBe(420);
    expect(loaded.vitalsGcsE).toBe(4);
    expect(loaded.vitalsGlucoseTiming).toBe("fasting");
    expect(loaded.vitalsPulseRhythm).toBe("irregular");

    const saved = buildRxPayload(loaded);
    const reloaded = rxFormFieldsFromPrescription({
      ...rx,
      vitals_json: saved.vitalsJson,
    });
    expect(buildRxPayload(reloaded)).toEqual(saved);
  });

  it("stores canonical numeric units in payload (no display-unit leakage)", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsHipCm = 95.5;
    fields.vitalsBloodKetonesMmolL = 0.4;
    const payload = buildRxPayload(fields);
    expect(payload.vitalsJson?.vitalsHipCm).toBe(95.5);
    expect(payload.vitalsJson?.vitalsBloodKetonesMmolL).toBe(0.4);
  });

  it("omits vitalsJson when all json fields are null after hydration", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      vitals_json: {},
    } as unknown as PrescriptionWithRelations;
    const payload = buildRxPayload(rxFormFieldsFromPrescription(rx));
    expect(payload).not.toHaveProperty("vitalsJson");
  });

  it("vit-14 · writes entered custom vitals into vitalsJson.vitalsCustom", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsCustomDefs = [
      { id: "custom_girth", label: "Abdominal girth", unit: "cm", kind: "numeric", group: "core" },
      { id: "custom_gait", label: "Gait", unit: null, kind: "text", group: "neuro" },
      { id: "custom_unused", label: "Unused", unit: null, kind: "text", group: "core" },
    ];
    fields.vitalsCustomValues = {
      custom_girth: 92,
      custom_gait: "steady",
      custom_unused: null,
    };

    const payload = buildRxPayload(fields);
    expect(payload.vitalsJson?.vitalsCustom).toEqual([
      { id: "custom_girth", label: "Abdominal girth", unit: "cm", kind: "numeric", value: 92 },
      { id: "custom_gait", label: "Gait", unit: null, kind: "text", value: "steady" },
    ]);
  });

  it("vit-14 · round-trips custom vitals load→save→reload, retaining a removed definition", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      vitals_json: {
        vitalsCustom: [
          { id: "custom_girth", label: "Abdominal girth", unit: "cm", kind: "numeric", value: 88 },
        ],
      },
    } as unknown as PrescriptionWithRelations;

    const loaded = rxFormFieldsFromPrescription(rx);
    expect(loaded.vitalsCustomValues.custom_girth).toBe(88);
    expect(loaded.vitalsCustomDefs.find((d) => d.id === "custom_girth")?.label).toBe(
      "Abdominal girth",
    );

    const saved = buildRxPayload(loaded);
    const reloaded = rxFormFieldsFromPrescription({ ...rx, vitals_json: saved.vitalsJson });
    expect(buildRxPayload(reloaded)).toEqual(saved);
  });
});
