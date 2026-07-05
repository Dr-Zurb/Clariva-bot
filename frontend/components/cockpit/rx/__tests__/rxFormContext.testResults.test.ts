import { describe, it, expect } from "vitest";
import {
  buildRxPayload,
  createEmptyRxFormFields,
  rxFormFieldsFromPrescription,
  rxFormReducer,
  type RxFormFields,
  type RxFormState,
  type TestResultRow,
} from "@/components/cockpit/rx/RxFormContext";
import { deriveTestResults } from "@/lib/cockpit/test-results";
import type { PrescriptionWithRelations } from "@/types/prescription";

function baseState(fields: RxFormFields = createEmptyRxFormFields()): RxFormState {
  return {
    fields,
    isDirty: false,
    isSaving: false,
    isSubmitting: false,
    lastSavedAt: null,
    submitError: null,
  };
}

const HBA1C: TestResultRow = {
  id: "r1",
  source: "patient_report",
  name: "HbA1c",
  value: "7.8",
  unit: "%",
  date: "2026-06-10",
  interpretation: "high",
  notes: "fasting",
};

const RBS: TestResultRow = {
  id: "r2",
  source: "in_clinic_poc",
  name: "RBS",
  value: "180",
  unit: "mg/dL",
  date: null,
  interpretation: null,
  notes: null,
};

describe("buildRxPayload test-results derivation (OBJ-D2)", () => {
  it("leaves testResults byte-identical when testResultsStructured is empty", () => {
    const fields = createEmptyRxFormFields();
    fields.testResults = "CBC: WNL\nLFT: mild transaminitis";
    const payload = buildRxPayload(fields);
    expect(payload.testResults).toBe("CBC: WNL\nLFT: mild transaminitis");
    expect(payload.testResultsJson).toEqual([]);
  });

  it("emits null testResults when both structured and free-text are empty", () => {
    const payload = buildRxPayload(createEmptyRxFormFields());
    expect(payload.testResults).toBeNull();
    expect(payload.testResultsJson).toEqual([]);
  });

  it("derives testResults from structured rows when non-empty", () => {
    const fields = createEmptyRxFormFields();
    fields.testResults = "legacy text that should be overridden";
    fields.testResultsStructured = [HBA1C, RBS];
    const payload = buildRxPayload(fields);
    expect(payload.testResults).toBe(deriveTestResults([HBA1C, RBS]));
    expect(payload.testResultsJson).toEqual([HBA1C, RBS]);
  });

  it("derives identically for hand-entry vs an equivalent structured row set (obj-24 parity seed)", () => {
    const structured = createEmptyRxFormFields();
    structured.testResultsStructured = [HBA1C, RBS];

    const handEntry = createEmptyRxFormFields();
    handEntry.testResults = deriveTestResults([HBA1C, RBS]);

    expect(buildRxPayload(structured).testResults).toBe(
      buildRxPayload(handEntry).testResults,
    );
  });
});

describe("rxFormReducer test-results actions (obj-20)", () => {
  it("adds, updates, and removes rows", () => {
    let state = rxFormReducer(baseState(), { type: "ADD_TEST_RESULT", row: HBA1C });
    expect(state.fields.testResultsStructured).toEqual([HBA1C]);
    expect(state.isDirty).toBe(true);

    state = rxFormReducer(state, { type: "ADD_TEST_RESULT", row: RBS });
    state = rxFormReducer(state, {
      type: "UPDATE_TEST_RESULT",
      id: "r1",
      patch: { value: "8.1", interpretation: "abnormal" },
    });
    expect(state.fields.testResultsStructured[0]).toMatchObject({
      id: "r1",
      value: "8.1",
      interpretation: "abnormal",
    });

    state = rxFormReducer(state, { type: "REMOVE_TEST_RESULT", id: "r1" });
    expect(state.fields.testResultsStructured.map((r) => r.id)).toEqual(["r2"]);
  });

  it("replaces the set via SET_TEST_RESULTS, normalizing input", () => {
    const state = rxFormReducer(baseState(), {
      type: "SET_TEST_RESULTS",
      testResults: [
        RBS,
        { id: "bad", source: "nope", name: "X" } as unknown as TestResultRow,
      ],
    });
    expect(state.fields.testResultsStructured.map((r) => r.id)).toEqual(["r2"]);
  });
});

describe("rxFormFieldsFromPrescription test-results hydration (obj-20)", () => {
  it("hydrates testResultsStructured from test_results_json and round-trips", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      test_results: "legacy",
      test_results_json: [HBA1C, RBS],
    } as unknown as PrescriptionWithRelations;
    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.testResultsStructured).toEqual([HBA1C, RBS]);

    const payload = buildRxPayload(fields);
    expect(payload.testResultsJson).toEqual([HBA1C, RBS]);
    expect(payload.testResults).toBe(deriveTestResults([HBA1C, RBS]));
  });

  it("defaults testResultsStructured to [] when test_results_json is absent", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      test_results: "free text only",
    } as unknown as PrescriptionWithRelations;
    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.testResultsStructured).toEqual([]);
    expect(fields.testResults).toBe("free text only");
  });
});
