import { describe, expect, it } from "vitest";
import {
  createEmptyRxFormFields,
  rxFormReducer,
} from "@/components/cockpit/rx/RxFormContext";

function baseState(fields = createEmptyRxFormFields()) {
  return {
    fields,
    isDirty: false,
    isSaving: false,
    isSubmitting: false,
    lastSavedAt: null,
    submitError: null,
  };
}

describe("rxl-03 seed vs edit", () => {
  it("SET_FIELD marks the form dirty", () => {
    const next = rxFormReducer(baseState(), {
      type: "SET_FIELD",
      key: "vitalsHr",
      value: 72,
    });
    expect(next.fields.vitalsHr).toBe(72);
    expect(next.isDirty).toBe(true);
  });

  it("SEED_FIELDS writes values without marking dirty", () => {
    const next = rxFormReducer(baseState(), {
      type: "SEED_FIELDS",
      patch: { vitalsHr: 88, vitalsSectionNote: "sitting" },
    });
    expect(next.fields.vitalsHr).toBe(88);
    expect(next.fields.vitalsSectionNote).toBe("sitting");
    expect(next.isDirty).toBe(false);
  });

  it("RESET hydrates without marking dirty", () => {
    const dirty = rxFormReducer(baseState(), {
      type: "SET_FIELD",
      key: "advice",
      value: "rest",
    });
    const initial = createEmptyRxFormFields();
    initial.vitalsHr = 71;
    const reset = rxFormReducer(dirty, { type: "RESET", initialFields: initial });
    expect(reset.fields.vitalsHr).toBe(71);
    expect(reset.isDirty).toBe(false);
  });
});
