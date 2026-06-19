import { describe, expect, it } from "vitest";
import {
  buildRxPayload,
  createEmptyRxFormFields,
  createCustomSubsectionId,
  rxFormFieldsFromPrescription,
  rxFormReducer,
  type RxFormState,
} from "@/components/cockpit/rx/RxFormContext";
import {
  createEmptyCustomSubsection,
  serializeCustomSubsections,
} from "@/lib/cockpit/custom-subsections";
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

describe("custom subsections form state (subj-19)", () => {
  it("reducer add/update/remove/reorder sections and children", () => {
    const section = createEmptyCustomSubsection("aaaaaaaa-aaaa-4aaa-8aaa-000000000001");
    section.title = "Travel";

    let state = rxFormReducer(initialState(), {
      type: "ADD_CUSTOM_SUBSECTION",
      section,
    });
    expect(state.fields.customSubsections).toHaveLength(1);

    state = rxFormReducer(state, {
      type: "UPDATE_CUSTOM_SUBSECTION",
      index: 0,
      patch: { body: "Visited Kerala" },
    });
    expect(state.fields.customSubsections[0].body).toBe("Visited Kerala");

    const childId = createCustomSubsectionId();
    state = rxFormReducer(state, {
      type: "ADD_CUSTOM_SUBSECTION_CHILD",
      sectionId: section.id,
      child: { id: childId, title: "Prophylaxis", body: "Doxy" },
    });
    expect(state.fields.customSubsections[0].children).toHaveLength(1);

    state = rxFormReducer(state, {
      type: "UPDATE_CUSTOM_SUBSECTION_CHILD",
      sectionId: section.id,
      childIndex: 0,
      patch: { body: "Doxycycline" },
    });
    expect(state.fields.customSubsections[0].children[0].body).toBe("Doxycycline");

    state = rxFormReducer(state, {
      type: "REORDER_CUSTOM_SUBSECTION_CHILDREN",
      sectionId: section.id,
      fromIndex: 0,
      toIndex: 0,
    });

    state = rxFormReducer(state, {
      type: "REMOVE_CUSTOM_SUBSECTION_CHILD",
      sectionId: section.id,
      childIndex: 0,
    });
    expect(state.fields.customSubsections[0].children).toHaveLength(0);

    const second = createEmptyCustomSubsection("bbbbbbbb-bbbb-4bbb-8bbb-000000000002");
    second.title = "Occupation";
    state = rxFormReducer(state, { type: "ADD_CUSTOM_SUBSECTION", section: second });
    expect(state.fields.customSubsections).toHaveLength(2);

    state = rxFormReducer(state, {
      type: "REORDER_CUSTOM_SUBSECTIONS",
      fromIndex: 1,
      toIndex: 0,
    });
    expect(state.fields.customSubsections[0].title).toBe("Occupation");

    state = rxFormReducer(state, { type: "REMOVE_CUSTOM_SUBSECTION", index: 0 });
    expect(state.fields.customSubsections).toHaveLength(1);
    expect(state.fields.customSubsections[0].title).toBe("Travel");
  });

  it("preserves spaces in section titles while typing", () => {
    const section = createEmptyCustomSubsection("aaaaaaaa-aaaa-4aaa-8aaa-000000000001");
    section.title = "menstrual";

    let state = rxFormReducer(initialState(), {
      type: "ADD_CUSTOM_SUBSECTION",
      section,
    });

    state = rxFormReducer(state, {
      type: "UPDATE_CUSTOM_SUBSECTION",
      index: 0,
      patch: { title: "menstrual " },
    });
    expect(state.fields.customSubsections[0].title).toBe("menstrual ");

    state = rxFormReducer(state, {
      type: "UPDATE_CUSTOM_SUBSECTION",
      index: 0,
      patch: { title: "menstrual history" },
    });
    expect(state.fields.customSubsections[0].title).toBe("menstrual history");
  });

  it("buildRxPayload round-trips structured tree and derived mirror", () => {
    const fields = createEmptyRxFormFields();
    fields.customSubsections = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
        title: "Travel history",
        body: "Kerala trip",
        children: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002",
            title: "Prophylaxis",
            body: "Doxy",
          },
        ],
      },
    ];

    const payload = buildRxPayload(fields);
    expect(payload.customSubsections).toHaveLength(1);
    expect(payload.customSubsections![0].children).toHaveLength(1);
    expect(payload.customSubsectionsText).toBe(
      serializeCustomSubsections(fields.customSubsections),
    );

    const rx = {
      id: "rx-1",
      appointment_id: "appt-1",
      patient_id: "pat-1",
      doctor_id: "doc-1",
      type: "structured",
      cc: payload.cc,
      hopi: payload.hopi,
      provisional_diagnosis: null,
      investigations_orders: null,
      follow_up: null,
      patient_education: null,
      clinical_notes: null,
      sent_to_patient_at: null,
      created_at: "2026-06-17T00:00:00Z",
      updated_at: "2026-06-17T00:00:00Z",
      custom_subsections: payload.customSubsections,
    } as PrescriptionWithRelations;

    const hydrated = rxFormFieldsFromPrescription(rx);
    expect(hydrated.customSubsections).toEqual(payload.customSubsections);
    expect(hydrated.customSubsectionsText).toBe(payload.customSubsectionsText);
  });

  it("hydrates absent custom_subsections as empty array", () => {
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
    expect(fields.customSubsections).toEqual([]);
    expect(fields.customSubsectionsText).toBe("");
  });

  it("does not change cc/hopi when custom subsections are present", () => {
    const base = createEmptyRxFormFields();
    base.complaints = [
      {
        id: "cccccccc-cccc-4ccc-8ccc-000000000003",
        name: "Fever",
        severity: "moderate",
      },
    ];

    const withCustom = createEmptyRxFormFields();
    withCustom.complaints = [...base.complaints];
    withCustom.customSubsections = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
        title: "Travel",
        body: "Abroad",
        children: [],
      },
    ];

    const basePayload = buildRxPayload(base);
    const withCustomPayload = buildRxPayload(withCustom);

    expect(withCustomPayload.cc).toBe(basePayload.cc);
    expect(withCustomPayload.hopi).toBe(basePayload.hopi);
    expect(withCustomPayload.customSubsections).toHaveLength(1);
    expect(withCustomPayload.customSubsectionsText).toContain("Travel");
  });
});
