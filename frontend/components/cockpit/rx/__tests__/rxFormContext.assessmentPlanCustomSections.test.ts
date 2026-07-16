import { describe, expect, it } from "vitest";
import {
  buildRxPayload,
  createEmptyRxFormFields,
  createCustomSubsectionId,
  rxFormFieldsFromPrescription,
  rxFormReducer,
  type RxFormState,
} from "@/components/cockpit/rx/RxFormContext";
import { createEmptyCustomSubsection } from "@/lib/cockpit/custom-subsections";
import type { PrescriptionWithRelations } from "@/types/prescription";

function initialState(fields = createEmptyRxFormFields()): RxFormState {
  return {
    fields,
    isDirty: false,
    isSaving: false,
    isSubmitting: false,
    lastSavedAt: null,
    submitError: null,
  };
}

describe("assessment + plan custom sections form state (assessment-plan-custom-sections)", () => {
  it("assessment reducer add/update/remove sections and children", () => {
    const section = createEmptyCustomSubsection("aaaaaaaa-aaaa-4aaa-8aaa-000000000001");
    section.title = "Risk stratification";

    let state = rxFormReducer(initialState(), {
      type: "ADD_ASSESSMENT_CUSTOM_SECTION",
      section,
    });
    expect(state.fields.assessmentCustomSections).toHaveLength(1);

    state = rxFormReducer(state, {
      type: "UPDATE_ASSESSMENT_CUSTOM_SECTION",
      index: 0,
      patch: { body: "Moderate CV risk" },
    });
    expect(state.fields.assessmentCustomSections[0].body).toBe("Moderate CV risk");

    const childId = createCustomSubsectionId();
    state = rxFormReducer(state, {
      type: "ADD_ASSESSMENT_CUSTOM_SECTION_CHILD",
      sectionId: section.id,
      child: { id: childId, title: "Score", body: "ASCVD 12%" },
    });
    expect(state.fields.assessmentCustomSections[0].children).toHaveLength(1);

    state = rxFormReducer(state, {
      type: "REMOVE_ASSESSMENT_CUSTOM_SECTION_CHILD",
      sectionId: section.id,
      childIndex: 0,
    });
    expect(state.fields.assessmentCustomSections[0].children).toHaveLength(0);

    state = rxFormReducer(state, { type: "REMOVE_ASSESSMENT_CUSTOM_SECTION", index: 0 });
    expect(state.fields.assessmentCustomSections).toHaveLength(0);
  });

  it("plan reducer add/update/reorder sections", () => {
    const first = createEmptyCustomSubsection("bbbbbbbb-bbbb-4bbb-8bbb-000000000001");
    first.title = "Lifestyle plan";
    const second = createEmptyCustomSubsection("cccccccc-cccc-4ccc-8ccc-000000000002");
    second.title = "Monitoring";

    let state = rxFormReducer(initialState(), {
      type: "ADD_PLAN_CUSTOM_SECTION",
      section: first,
    });
    state = rxFormReducer(state, { type: "ADD_PLAN_CUSTOM_SECTION", section: second });
    // Newest is prepended.
    expect(state.fields.planCustomSections[0].title).toBe("Monitoring");
    expect(state.fields.planCustomSections[1].title).toBe("Lifestyle plan");

    state = rxFormReducer(state, {
      type: "REORDER_PLAN_CUSTOM_SECTIONS",
      fromIndex: 0,
      toIndex: 1,
    });
    expect(state.fields.planCustomSections[0].title).toBe("Lifestyle plan");
    expect(state.fields.planCustomSections[1].title).toBe("Monitoring");
  });

  it("buildRxPayload maps both dedicated columns and hydration round-trips", () => {
    const fields = createEmptyRxFormFields();
    fields.assessmentCustomSections = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
        title: "Risk",
        body: "High",
        children: [],
      },
    ];
    fields.planCustomSections = [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002",
        title: "Diet",
        body: "Low salt",
        children: [
          { id: "dddddddd-dddd-4ddd-8ddd-000000000003", title: "Salt", body: "<2g/day" },
        ],
      },
    ];

    const payload = buildRxPayload(fields);
    expect(payload.assessmentCustomSections).toHaveLength(1);
    expect(payload.planCustomSections).toHaveLength(1);
    expect(payload.planCustomSections![0].children).toHaveLength(1);

    const rx = {
      id: "rx-1",
      appointment_id: "appt-1",
      patient_id: "pat-1",
      doctor_id: "doc-1",
      type: "structured",
      cc: null,
      hopi: null,
      provisional_diagnosis: null,
      follow_up: null,
      patient_education: null,
      clinical_notes: null,
      sent_to_patient_at: null,
      created_at: "2026-06-17T00:00:00Z",
      updated_at: "2026-06-17T00:00:00Z",
      assessment_custom_sections: payload.assessmentCustomSections,
      plan_custom_sections: payload.planCustomSections,
    } as PrescriptionWithRelations;

    const hydrated = rxFormFieldsFromPrescription(rx);
    expect(hydrated.assessmentCustomSections).toEqual(payload.assessmentCustomSections);
    expect(hydrated.planCustomSections).toEqual(payload.planCustomSections);
  });

  it("hydrates absent columns as empty arrays", () => {
    const rx = {
      id: "rx-1",
      appointment_id: "appt-1",
      patient_id: null,
      doctor_id: "doc-1",
      type: "structured",
      cc: null,
      hopi: null,
      provisional_diagnosis: null,
      follow_up: null,
      patient_education: null,
      clinical_notes: null,
      sent_to_patient_at: null,
      created_at: "2026-06-17T00:00:00Z",
      updated_at: "2026-06-17T00:00:00Z",
    } as PrescriptionWithRelations;

    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.assessmentCustomSections).toEqual([]);
    expect(fields.planCustomSections).toEqual([]);
  });
});
