import { describe, it, expect } from "vitest";
import {
  buildRxPayload,
  createEmptyComplaint,
  createEmptyRxFormFields,
  deriveCcFromComplaints,
  deriveHopiFromComplaints,
  formatComplaintHopiLine,
  rxFormFieldsFromPrescription,
  rxFormReducer,
  type Complaint,
  type RxFormState,
} from "@/components/cockpit/rx/RxFormContext";
import type { PrescriptionWithRelations } from "@/types/prescription";

const COMPLAINT_A: Complaint = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Headache",
  onset: "2 days ago",
  duration: "2d",
  character: "Throbbing",
  severity: "severe",
};

const COMPLAINT_B: Complaint = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Leg pain",
  location: "both calves",
  severity: "moderate",
};

function baseState(fields = createEmptyRxFormFields()): RxFormState {
  return {
    fields,
    isDirty: false,
    isSaving: false,
    isSubmitting: false,
    lastSavedAt: null,
    submitError: null,
  };
}

describe("complaint derivation", () => {
  it("derives cc as comma-joined names in card order", () => {
    expect(deriveCcFromComplaints([COMPLAINT_A, COMPLAINT_B])).toBe("Headache, Leg pain");
  });

  it("formats one complaint as an OLDCARTS line", () => {
    expect(formatComplaintHopiLine(COMPLAINT_A)).toBe(
      "Headache — Onset: 2 days ago; Duration: 2d; How it feels: Throbbing; Severity: severe",
    );
  });

  it("derives hopi as double-newline separated complaint blocks", () => {
    expect(deriveHopiFromComplaints([COMPLAINT_A, COMPLAINT_B])).toBe(
      [
        "Headache — Onset: 2 days ago; Duration: 2d; How it feels: Throbbing; Severity: severe",
        "Leg pain — Site: both calves; Severity: moderate",
      ].join("\n\n"),
    );
  });
});

describe("rxFormReducer complaint actions", () => {
  it("adds nested associated complaints under a parent", () => {
    const child = createEmptyComplaint("33333333-3333-4333-8333-333333333333");
    child.name = "Breathlessness";
    let state = rxFormReducer(baseState(), {
      type: "ADD_COMPLAINT",
      complaint: COMPLAINT_A,
    });
    state = rxFormReducer(state, {
      type: "ADD_COMPLAINT",
      complaint: child,
      parentId: COMPLAINT_A.id,
    });
    expect(state.fields.complaints[0].associatedComplaints).toHaveLength(1);
    expect(state.fields.complaints).toHaveLength(1);
  });

  it("demotes a root complaint under another parent", () => {
    let state = rxFormReducer(baseState(), {
      type: "ADD_COMPLAINT",
      complaint: COMPLAINT_A,
    });
    state = rxFormReducer(state, {
      type: "ADD_COMPLAINT",
      complaint: COMPLAINT_B,
    });
    state = rxFormReducer(state, {
      type: "DEMOTE_COMPLAINT",
      sourceIndex: 1,
      targetParentId: COMPLAINT_A.id,
    });

    expect(state.fields.complaints).toHaveLength(1);
    expect(state.fields.complaints[0].associatedComplaints).toHaveLength(1);
    expect(state.fields.complaints[0].associatedComplaints![0].name).toBe("Leg pain");
    expect(deriveCcFromComplaints(state.fields.complaints)).toBe("Headache");
  });

  it("promotes an associated complaint to the root list", () => {
    const child = createEmptyComplaint("33333333-3333-4333-8333-333333333333");
    child.name = "Breathlessness";
    child.severity = "moderate";
    let state = rxFormReducer(baseState(), {
      type: "ADD_COMPLAINT",
      complaint: COMPLAINT_A,
    });
    state = rxFormReducer(state, {
      type: "ADD_COMPLAINT",
      complaint: child,
      parentId: COMPLAINT_A.id,
    });
    state = rxFormReducer(state, {
      type: "PROMOTE_COMPLAINT",
      parentId: COMPLAINT_A.id,
      childIndex: 0,
    });

    expect(state.fields.complaints).toHaveLength(2);
    expect(state.fields.complaints[0].associatedComplaints ?? []).toHaveLength(0);
    expect(state.fields.complaints[1].name).toBe("Breathlessness");
    expect(state.fields.complaints[1].severity).toBe("moderate");
    expect(deriveCcFromComplaints(state.fields.complaints)).toBe(
      "Headache, Breathlessness",
    );
  });

  it("adds, updates, removes, and reorders complaints", () => {
    const empty = createEmptyComplaint("00000000-0000-4000-8000-000000000001");
    let state = rxFormReducer(baseState(), { type: "ADD_COMPLAINT", complaint: empty });
    expect(state.fields.complaints).toHaveLength(1);

    state = rxFormReducer(state, {
      type: "UPDATE_COMPLAINT",
      index: 0,
      patch: { name: "Fever", onset: "today" },
    });
    expect(state.fields.complaints[0].name).toBe("Fever");

    state = rxFormReducer(state, { type: "ADD_COMPLAINT", complaint: COMPLAINT_B });
    expect(state.fields.complaints).toHaveLength(2);

    state = rxFormReducer(state, { type: "REORDER_COMPLAINTS", fromIndex: 1, toIndex: 0 });
    expect(state.fields.complaints[0].name).toBe("Leg pain");

    state = rxFormReducer(state, { type: "REMOVE_COMPLAINT", index: 0 });
    expect(state.fields.complaints).toHaveLength(1);
    expect(state.isDirty).toBe(true);
  });
});

describe("buildRxPayload", () => {
  it("derives cc/hopi from named complaints", () => {
    const fields = createEmptyRxFormFields();
    fields.complaints = [COMPLAINT_A, COMPLAINT_B];
    const payload = buildRxPayload(fields);

    expect(payload.cc).toBe("Headache, Leg pain");
    expect(payload.hopi).toBe(deriveHopiFromComplaints([COMPLAINT_A, COMPLAINT_B]));
    expect(payload.complaints).toHaveLength(2);
    expect(payload.familyHistory).toBeNull();
  });

  it("appends manual hopi fallback when override is set", () => {
    const fields = createEmptyRxFormFields();
    fields.complaints = [COMPLAINT_A];
    fields.hopi = "Patient also reports photophobia.";
    fields.hopiManualOverride = true;

    const payload = buildRxPayload(fields);
    expect(payload.hopi).toBe(
      `${deriveHopiFromComplaints([COMPLAINT_A])}\n\nPatient also reports photophobia.`,
    );
  });

  it("uses legacy cc/hopi when no named complaints exist", () => {
    const fields = createEmptyRxFormFields();
    fields.cc = "Legacy CC";
    fields.hopi = "Legacy HOPI narrative.";

    const payload = buildRxPayload(fields);
    expect(payload.cc).toBe("Legacy CC");
    expect(payload.hopi).toBe("Legacy HOPI narrative.");
    expect(payload.complaints).toEqual([]);
  });

  it("persists owned history fields", () => {
    const fields = createEmptyRxFormFields();
    fields.familyHistoryStructured = {
      relatives: { father: [{ id: "fh-1", condition: "htn" }] },
    };
    fields.socialHistoryStructured = {
      smoking: { status: "never", products: [] },
    };
    fields.pastSurgicalHistoryStructured = {
      procedures: [{ id: "psh-1", procedure: "appendectomy", agoValue: 16, agoUnit: "years" }],
    };

    const payload = buildRxPayload(fields);
    expect(payload.familyHistory).toBe("Father: Hypertension");
    expect(payload.familyHistoryStructured?.relatives?.father?.[0]).toMatchObject({
      condition: "htn",
    });
    expect(payload.socialHistory).toBe("Smoking: Non-smoker");
    expect(payload.socialHistoryStructured?.smoking?.status).toBe("never");
    expect(payload.pastSurgicalHistory).toBe("Appendectomy (16 years ago)");
    expect(payload.pastSurgicalHistoryStructured?.procedures?.[0]).toMatchObject({
      procedure: "appendectomy",
      agoValue: 16,
      agoUnit: "years",
    });
  });
});

describe("rxFormFieldsFromPrescription round-trip", () => {
  it("hydrates complaints and histories from a prescription row", () => {
    const rx = {
      id: "rx-1",
      appointment_id: "appt-1",
      patient_id: "pat-1",
      doctor_id: "doc-1",
      type: "structured",
      cc: "Headache, Leg pain",
      hopi: deriveHopiFromComplaints([COMPLAINT_A, COMPLAINT_B]),
      provisional_diagnosis: null,
      investigations_orders: null,
      follow_up: null,
      patient_education: null,
      clinical_notes: null,
      sent_to_patient_at: null,
      created_at: "2026-06-03T00:00:00Z",
      updated_at: "2026-06-03T00:00:00Z",
      complaints: [COMPLAINT_A, COMPLAINT_B],
      family_history: "Mother — DM",
      social_history: "Teacher",
      past_surgical_history: null,
    } as PrescriptionWithRelations;

    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.complaints).toEqual([COMPLAINT_A, COMPLAINT_B]);
    expect(fields.familyHistory).toBe("Mother — DM");
    expect(fields.familyHistoryStructured.relatives?.mother?.[0]?.condition).toBe("dm");
    expect(fields.socialHistory).toBe("Teacher");
    expect(fields.socialHistoryStructured.notes).toBe("Teacher");
    expect(fields.hopi).toBe("");
    expect(fields.hopiManualOverride).toBe(false);

    const payload = buildRxPayload(fields);
    expect(payload.cc).toBe("Headache, Leg pain");
    expect(payload.hopi).toBe(deriveHopiFromComplaints([COMPLAINT_A, COMPLAINT_B]));
    expect(payload.complaints).toHaveLength(2);
    expect(payload.familyHistory).toBe("Mother: Diabetes mellitus");
    expect(payload.familyHistoryStructured?.relatives?.mother?.[0]?.condition).toBe("dm");
  });
});
