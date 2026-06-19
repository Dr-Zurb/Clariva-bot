import { describe, it, expect } from "vitest";
import {
  buildRxPayload,
  createEmptyRxFormFields,
  deriveExaminationFindingsFromExam,
  normalizeExamFindings,
  rxFormFieldsFromPrescription,
  rxFormReducer,
  type ExamSystemFinding,
  type RxFormFields,
  type RxFormState,
} from "@/components/cockpit/rx/RxFormContext";
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

const RESPIRATORY: ExamSystemFinding = {
  systemId: "respiratory",
  status: "abnormal",
  findings: ["crepitations", "wheeze"],
  notes: "right base",
};

const GENERAL: ExamSystemFinding = {
  systemId: "general",
  status: "normal",
};

describe("deriveExaminationFindingsFromExam (obj-01)", () => {
  it("renders a deterministic string in registry order, not insertion order", () => {
    // Insertion order is respiratory-then-general; registry order is the reverse.
    const text = deriveExaminationFindingsFromExam([RESPIRATORY, GENERAL]);
    expect(text).toBe(
      ["General: Normal", "Respiratory: crepitations, wheeze (right base)"].join("\n"),
    );
  });

  it("renders an abnormal system with no findings as Abnormal", () => {
    expect(
      deriveExaminationFindingsFromExam([{ systemId: "skin", status: "abnormal" }]),
    ).toBe("Skin: Abnormal");
  });

  it("sorts unknown systems after the core set, alphabetically", () => {
    const text = deriveExaminationFindingsFromExam([
      { systemId: "zebra", status: "normal" },
      { systemId: "alpha", status: "normal" },
      { systemId: "general", status: "normal" },
    ]);
    expect(text).toBe(["General: Normal", "Alpha: Normal", "Zebra: Normal"].join("\n"));
  });

  it("returns an empty string for an empty list", () => {
    expect(deriveExaminationFindingsFromExam([])).toBe("");
  });
});

describe("normalizeExamFindings (obj-01)", () => {
  it("drops rows with empty systemId or bad status and filters findings", () => {
    const result = normalizeExamFindings([
      { systemId: "  ", status: "normal" },
      { systemId: "x", status: "bogus" } as unknown as ExamSystemFinding,
      { systemId: " abdomen ", status: "abnormal", findings: ["tender", "", " "] },
    ]);
    expect(result).toEqual([
      { systemId: "abdomen", status: "abnormal", findings: ["tender"], notes: null },
    ]);
  });
});

describe("buildRxPayload exam derivation (OBJ-D2)", () => {
  it("leaves examinationFindings byte-identical when examFindings is empty", () => {
    const fields = createEmptyRxFormFields();
    fields.examinationFindings = "Chest clear.\n--- SYSTEMIC ---\nS1S2 normal.";
    const payload = buildRxPayload(fields);
    expect(payload.examinationFindings).toBe(
      "Chest clear.\n--- SYSTEMIC ---\nS1S2 normal.",
    );
    expect(payload.examinationJson).toEqual([]);
  });

  it("derives examinationFindings from structured exam when non-empty", () => {
    const fields = createEmptyRxFormFields();
    fields.examinationFindings = "legacy text that should be overridden";
    fields.examFindings = [RESPIRATORY, GENERAL];
    const payload = buildRxPayload(fields);
    expect(payload.examinationFindings).toBe(
      ["General: Normal", "Respiratory: crepitations, wheeze (right base)"].join("\n"),
    );
    expect(payload.examinationJson).toEqual([
      {
        systemId: "respiratory",
        status: "abnormal",
        findings: ["crepitations", "wheeze"],
        notes: "right base",
      },
      { systemId: "general", status: "normal", findings: [], notes: null },
    ]);
  });

  it("emits null examinationFindings when both structured and free-text are empty", () => {
    const payload = buildRxPayload(createEmptyRxFormFields());
    expect(payload.examinationFindings).toBeNull();
    expect(payload.examinationJson).toEqual([]);
  });
});

describe("rxFormReducer exam actions (obj-01)", () => {
  it("upserts a system via SET_EXAM_SYSTEM", () => {
    let state = rxFormReducer(baseState(), {
      type: "SET_EXAM_SYSTEM",
      systemId: "respiratory",
      status: "abnormal",
      findings: ["wheeze", " "],
      notes: " right base ",
    });
    expect(state.fields.examFindings).toEqual([
      { systemId: "respiratory", status: "abnormal", findings: ["wheeze"], notes: "right base" },
    ]);
    expect(state.isDirty).toBe(true);

    state = rxFormReducer(state, {
      type: "SET_EXAM_SYSTEM",
      systemId: "respiratory",
      status: "normal",
    });
    expect(state.fields.examFindings).toEqual([
      { systemId: "respiratory", status: "normal", findings: [], notes: null },
    ]);
  });

  it("removes a system via CLEAR_EXAM_SYSTEM", () => {
    const state = rxFormReducer(baseState({ ...createEmptyRxFormFields(), examFindings: [RESPIRATORY, GENERAL] }), {
      type: "CLEAR_EXAM_SYSTEM",
      systemId: "respiratory",
    });
    expect(state.fields.examFindings).toEqual([GENERAL]);
  });

  it("marks all listed systems normal via MARK_ALL_EXAM_NORMAL", () => {
    const start = baseState({ ...createEmptyRxFormFields(), examFindings: [RESPIRATORY] });
    const state = rxFormReducer(start, {
      type: "MARK_ALL_EXAM_NORMAL",
      systemIds: ["respiratory", "general"],
    });
    expect(state.fields.examFindings).toEqual([
      { systemId: "respiratory", status: "normal", findings: [], notes: null },
      { systemId: "general", status: "normal", findings: [], notes: null },
    ]);
  });

  it("replaces the set via SET_EXAM_FINDINGS, normalizing input", () => {
    const state = rxFormReducer(baseState(), {
      type: "SET_EXAM_FINDINGS",
      examFindings: [GENERAL, { systemId: "  ", status: "normal" }],
    });
    expect(state.fields.examFindings).toEqual([
      { systemId: "general", status: "normal", findings: [], notes: null },
    ]);
  });
});

describe("rxFormFieldsFromPrescription exam hydration (obj-01)", () => {
  it("hydrates examFindings from examination_json", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      patient_id: null,
      doctor_id: "d1",
      type: "structured",
      cc: null,
      hopi: null,
      provisional_diagnosis: null,
      follow_up: null,
      patient_education: null,
      clinical_notes: null,
      sent_to_patient_at: null,
      created_at: "",
      updated_at: "",
      examination_findings: null,
      examination_json: [RESPIRATORY, GENERAL],
    } as unknown as PrescriptionWithRelations;
    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.examFindings).toEqual([
      {
        systemId: "respiratory",
        status: "abnormal",
        findings: ["crepitations", "wheeze"],
        notes: "right base",
      },
      { systemId: "general", status: "normal", findings: [], notes: null },
    ]);
  });

  it("defaults examFindings to [] when examination_json is absent", () => {
    const rx = {
      id: "p1",
      appointment_id: "a1",
      doctor_id: "d1",
      type: "structured",
      examination_findings: "free text only",
    } as unknown as PrescriptionWithRelations;
    const fields = rxFormFieldsFromPrescription(rx);
    expect(fields.examFindings).toEqual([]);
    expect(fields.examinationFindings).toBe("free text only");
  });
});
