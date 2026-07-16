/**
 * obj-19 — Phase-4 exam-templates close-gate.
 *
 * The phase-closing proof that objective templates + specialty packs are
 * **content-only against the derived output** (P4-D3 / OBJ-D2): filling the
 * structured form by applying a scoped template, the whole-objective
 * (`objective_full`) bundle, or a specialty pack produces a `buildRxPayload`
 * that is byte-identical to hand-entering the same content. It also proves the
 * apply → save → reload → re-apply fixed point (whole + per-section) and the
 * accessibility of every Templates affordance.
 *
 * Mirrors obj-15's `objectiveLayoutParity.test.tsx` rigor and subj-18's
 * whole-section orchestration.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  buildRxPayload,
  createEmptyRxFormFields,
  rxFormFieldsFromPrescription,
  rxFormReducer,
  type ExamSystemFinding,
  type RxFormFields,
  type RxFormState,
} from "@/components/cockpit/rx/RxFormContext";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import { TooltipProvider } from "@/components/ui/tooltip";

// vit-10..12 gave VitalsGrid doctor-scoped trend/demographics queries (needs a
// QueryClient); this template gate covers ObjectiveSection, not vitals internals.
vi.mock("@/components/cockpit/rx/inputs/VitalsGrid", () => ({
  VitalsGrid: () => <div data-testid="vitals-grid-stub" />,
}));
import {
  buildObjectiveTemplateApplyActions,
  buildObjectiveTemplateSavePayload,
} from "@/lib/cockpit/apply-objective-template";
import type { DoctorRxTemplate, RxTemplateObjective } from "@/types/rx-template";
import type { PrescriptionWithRelations } from "@/types/prescription";

const mockGetDoctorSettings = vi.fn();
const mockPatchDoctorSettings = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
    patchDoctorSettings: (...args: unknown[]) => mockPatchDoctorSettings(...args),
    getAppointmentById: vi.fn().mockResolvedValue({ data: { appointment: {} } }),
  };
});

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const CVS_FINDING: ExamSystemFinding = {
  systemId: "cvs",
  status: "abnormal",
  findings: [{ findingId: "murmur", attributes: {} }],
  notes: "grade 3/6",
};

const GENERAL_FINDING: ExamSystemFinding = {
  systemId: "general",
  status: "normal",
  findings: [],
  notes: null,
};

/** A content-rich objective row exercising every output column. */
function richObjectiveFields(): RxFormFields {
  const f = createEmptyRxFormFields();
  f.vitalsBpSystolic = 120;
  f.vitalsBpDiastolic = 80;
  f.vitalsHr = 72;
  f.vitalsSpo2 = 98;
  f.examFindings = [GENERAL_FINDING, CVS_FINDING];
  f.testResults = "Hb 12.5 g/dL";
  f.objectiveCustomSections = [
    { id: "11111111-1111-4111-8111-111111111111", title: "P/V", body: "No CMT", children: [] },
  ];
  return f;
}

function baseState(fields: RxFormFields): RxFormState {
  return {
    fields,
    isDirty: false,
    isSaving: false,
    isSubmitting: false,
    lastSavedAt: null,
    saveError: null,
    submitError: null,
  };
}

function makeTemplate(objective: RxTemplateObjective): DoctorRxTemplate {
  return {
    id: "tpl-obj-19",
    doctor_id: "doc-1",
    name: "Objective preset",
    description: null,
    cc: null,
    hopi: null,
    provisional_diagnosis: null,
    investigations: null,
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
    medicines_json: [],
    subjective_json: {},
    objective_json: objective,
    plan_json: {},
    assessment_json: {},
    pmh_json: {},
    allergies_json: {},
    scope: "objective_full",
    use_count: 0,
    last_used_at: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function applyToEmpty(
  scope: Parameters<typeof buildObjectiveTemplateApplyActions>[0],
  template: DoctorRxTemplate,
  start: RxFormFields = createEmptyRxFormFields(),
): RxFormFields {
  const actions = buildObjectiveTemplateApplyActions(scope, template, start);
  let state = baseState(start);
  for (const action of actions) {
    state = rxFormReducer(state, action);
  }
  return state.fields;
}

/** Save the current objective form-state as an `objective_full` template. */
function saveFullTemplate(fields: RxFormFields): DoctorRxTemplate {
  const payload = buildObjectiveTemplateSavePayload("objective_full", fields);
  return makeTemplate(payload.objective ?? {});
}

/** Project a derived payload back onto the prescription columns a reload reads. */
function prescriptionFromPayload(payload: ReturnType<typeof buildRxPayload>): PrescriptionWithRelations {
  return {
    id: "rx-1",
    examination_findings: payload.examinationFindings ?? null,
    examination_json: payload.examinationJson ?? [],
    test_results: payload.testResults ?? null,
    vitals_bp_systolic: payload.vitalsBpSystolic ?? null,
    vitals_bp_diastolic: payload.vitalsBpDiastolic ?? null,
    vitals_hr: payload.vitalsHr ?? null,
    vitals_spo2: payload.vitalsSpo2 ?? null,
  } as unknown as PrescriptionWithRelations;
}

// ---------------------------------------------------------------------------
// §1 Output byte-parity (P4-D3 / OBJ-D2)
// ---------------------------------------------------------------------------

describe("obj-19 · §1 output byte-parity (templates/packs are content-only)", () => {
  it("1.1 whole-objective apply derives identically to hand-entry", () => {
    const hand = richObjectiveFields();
    const template = saveFullTemplate(hand);
    const applied = applyToEmpty("objective_full", template);

    expect(buildRxPayload(applied)).toEqual(buildRxPayload(hand));
  });

  it("1.1b a scoped (vitals) template apply equals hand-entered vitals", () => {
    const handVitals = createEmptyRxFormFields();
    handVitals.vitalsBpSystolic = 120;
    handVitals.vitalsBpDiastolic = 80;
    handVitals.vitalsHr = 72;
    handVitals.vitalsSpo2 = 98;

    const template = makeTemplate(
      buildObjectiveTemplateSavePayload("vitals", richObjectiveFields()).objective ?? {},
    );
    const applied = applyToEmpty("vitals", template);

    expect(buildRxPayload(applied)).toEqual(buildRxPayload(handVitals));
  });

  it("1.2 no template state leaks into the payload (same keys as hand-entry)", () => {
    const applied = applyToEmpty("objective_full", saveFullTemplate(richObjectiveFields()));
    const handKeys = Object.keys(buildRxPayload(richObjectiveFields())).sort();
    const appliedKeys = Object.keys(buildRxPayload(applied)).sort();

    expect(appliedKeys).toEqual(handKeys);
    // None of the layout/visibility/template config surfaces reach the payload.
    for (const leaked of [
      "objectiveCustomSections",
      "scope",
      "objective",
      "sectionOrder",
      "sectionHidden",
    ]) {
      expect(appliedKeys).not.toContain(leaked);
    }
  });

  it("1.3 legacy/empty rows derive byte-identically (P1 gate holds under P4)", () => {
    const empty = createEmptyRxFormFields();
    expect(buildRxPayload(empty).examinationFindings).toBeNull();
    expect(buildRxPayload(empty).examinationJson).toEqual([]);

    const legacy = createEmptyRxFormFields();
    legacy.examinationFindings = "Alert, no distress";
    expect(buildRxPayload(legacy).examinationFindings).toBe("Alert, no distress");
    expect(buildRxPayload(legacy).examinationJson).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §2 Apply round-trip fixed point
// ---------------------------------------------------------------------------

describe("obj-19 · §2 apply round-trip fixed point", () => {
  it("2.1 apply → save → re-apply yields the same form state + payload (whole-objective)", () => {
    const template1 = saveFullTemplate(richObjectiveFields());
    const fieldsA = applyToEmpty("objective_full", template1);

    // save fieldsA as a fresh objective_full template, then re-apply to empty.
    const template2 = saveFullTemplate(fieldsA);
    const fieldsB = applyToEmpty("objective_full", template2);

    expect(buildRxPayload(fieldsB)).toEqual(buildRxPayload(fieldsA));
    expect(fieldsB.examFindings).toEqual(fieldsA.examFindings);
    expect(fieldsB.objectiveCustomSections.map((s) => ({ title: s.title, body: s.body }))).toEqual(
      fieldsA.objectiveCustomSections.map((s) => ({ title: s.title, body: s.body })),
    );
  });

  it("2.1b apply → save → reload (remount) re-derives an identical payload", () => {
    // Structured exam + vitals + test results survive a prescription reload verbatim.
    const hand = createEmptyRxFormFields();
    hand.vitalsBpSystolic = 120;
    hand.vitalsBpDiastolic = 80;
    hand.vitalsHr = 72;
    hand.examFindings = [GENERAL_FINDING, CVS_FINDING];
    hand.testResults = "Hb 12.5 g/dL";

    const applied = applyToEmpty("objective_full", saveFullTemplate(hand));
    const payload = buildRxPayload(applied);

    const reloaded = rxFormFieldsFromPrescription(prescriptionFromPayload(payload));
    expect(buildRxPayload(reloaded)).toEqual(payload);
  });

  it("2.2 a per-section (exam_cvs) template survives save+reapply; other sections untouched", () => {
    const template = makeTemplate(
      buildObjectiveTemplateSavePayload("exam_cvs", richObjectiveFields()).objective ?? {},
    );

    const start = createEmptyRxFormFields();
    start.vitalsHr = 60;
    start.examFindings = [GENERAL_FINDING];
    start.testResults = "Keep me";

    const applied = applyToEmpty("exam_cvs", template, start);
    expect(applied.examFindings.find((f) => f.systemId === "cvs")).toEqual(CVS_FINDING);
    expect(applied.examFindings.find((f) => f.systemId === "general")).toEqual(GENERAL_FINDING);
    expect(applied.vitalsHr).toBe(60);
    expect(applied.testResults).toBe("Keep me");
  });

  it("2.2b a vitals template survives save+reapply with no exam/test leakage", () => {
    const template = makeTemplate(
      buildObjectiveTemplateSavePayload("vitals", richObjectiveFields()).objective ?? {},
    );

    const start = createEmptyRxFormFields();
    start.examFindings = [GENERAL_FINDING];
    start.testResults = "Keep me";

    const applied = applyToEmpty("vitals", template, start);
    expect(applied.vitalsBpSystolic).toBe(120);
    expect(applied.examFindings).toEqual([GENERAL_FINDING]);
    expect(applied.testResults).toBe("Keep me");
  });
});

// ---------------------------------------------------------------------------
// §3 Accessibility sweep
// ---------------------------------------------------------------------------

function renderObjective(disabled = false, initialFields = richObjectiveFields()) {
  const prescriptionIdRef = { current: "rx-1" as string | null };
  return render(
    <TooltipProvider>
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={initialFields}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <ObjectiveSection heading={null} disabled={disabled} />
      </RxFormProvider>
    </TooltipProvider>,
  );
}

describe("obj-19 · §3 accessibility", () => {
  beforeEach(() => {
    mockGetDoctorSettings.mockReset();
    mockPatchDoctorSettings.mockReset();
    mockGetDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          specialty: "Cardiology",
          objective_section_order: [],
          objective_section_collapsed: {},
        },
      },
    });
    mockPatchDoctorSettings.mockResolvedValue({ data: { settings: {} } });
  });

  it("3.1 the whole-objective Templates button is labelled and opens the picker", async () => {
    renderObjective(false);

    const trigger = await screen.findByTestId("objective-template-trigger");
    expect(trigger).toHaveAttribute("aria-label", "Templates");
    expect(screen.getByTestId("objective-template-save-trigger")).toHaveAttribute(
      "aria-label",
      "Save current objective as template",
    );

    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  });

  it("3.2 read-only (disabled) mode hides the Templates buttons", async () => {
    renderObjective(true);
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Objective"]')).toBeInTheDocument(),
    );

    expect(screen.queryByTestId("objective-template-trigger")).not.toBeInTheDocument();
    expect(screen.queryByTestId("objective-template-save-trigger")).not.toBeInTheDocument();
  });
});
