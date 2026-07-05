/**
 * obj-24 — Phase-5 point-of-care results + media close-gate.
 *
 * Proves that structured Zone-C surfaces (obj-20..23) are **content/view-only
 * against the derived output** (P5-D3 / OBJ-D2): `test_results` derives
 * byte-identically whether hand-entered (legacy textarea) or filled by structured
 * rows / a scoped template / a POC specialty pack; media attachments round-trip
 * on reload without entering `buildRxPayload`; modality emphasis is seed-
 * independent; and result-row / media / template affordances are accessible.
 *
 * Mirrors obj-04 (P1 derivation gate) + obj-15 (P3 layout gate) +
 * obj-19 (P4 template gate).
 */

import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  buildRxPayload,
  createEmptyRxFormFields,
  rxFormFieldsFromPrescription,
  rxFormReducer,
  useRxForm,
  type RxFormFields,
  type RxFormState,
  type TestResultRow,
} from "@/components/cockpit/rx/RxFormContext";
import { PrescriptionFormShellProvider } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";

// vit-10..12 gave VitalsGrid doctor-scoped trend/demographics queries (needs a
// QueryClient); this results gate covers Zone-C surfaces, not vitals internals.
vi.mock("@/components/cockpit/rx/inputs/VitalsGrid", () => ({
  VitalsGrid: () => <div data-testid="vitals-grid-stub" />,
}));
import {
  buildObjectiveTemplateApplyActions,
  buildObjectiveTemplateSavePayload,
} from "@/lib/cockpit/apply-objective-template";
import { resolveDefaultLayout } from "@/lib/cockpit/objective-default-layout";
import { filterObjectiveAttachments } from "@/lib/cockpit/objective-media";
import { specialtyPackToSyntheticTemplate } from "@/lib/cockpit/objective-specialty-pack-apply";
import { resolveObjectiveSpecialtyPacks } from "@/lib/cockpit/objective-specialty-packs";
import { deriveTestResults } from "@/lib/cockpit/test-results";
import type { DoctorRxTemplate } from "@/types/rx-template";
import type { PrescriptionAttachment, PrescriptionWithRelations } from "@/types/prescription";

const mockGetDoctorSettings = vi.fn();
const mockPatchDoctorSettings = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
    patchDoctorSettings: (...args: unknown[]) => mockPatchDoctorSettings(...args),
    getAppointmentById: vi.fn().mockResolvedValue({ data: { appointment: {} } }),
    getPrescriptionDownloadUrl: vi.fn().mockResolvedValue({
      data: { downloadUrl: "https://example.com/signed" },
    }),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HBA1C: TestResultRow = {
  id: "r-patient-1",
  source: "patient_report",
  name: "HbA1c",
  value: "7.8",
  unit: "%",
  interpretation: "high",
  date: "2026-06-01",
  notes: "Outside lab",
};

const RBS: TestResultRow = {
  id: "r-poc-1",
  source: "in_clinic_poc",
  name: "RBS / Glucometer",
  value: "180",
  unit: "mg/dL",
  interpretation: null,
  date: null,
  notes: null,
};

const LEGACY_FREE_TEXT = "Outside lab Hb 12.5 g/dL — patient brought report";

function richStructuredFields(): RxFormFields {
  const f = createEmptyRxFormFields();
  f.testResultsStructured = [HBA1C, RBS];
  return f;
}

function richLegacyFields(): RxFormFields {
  const f = createEmptyRxFormFields();
  f.testResults = deriveTestResults([HBA1C, RBS]);
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

function applyActions(
  start: RxFormFields,
  actions: ReturnType<typeof buildObjectiveTemplateApplyActions>,
): RxFormFields {
  let state = baseState(start);
  for (const action of actions) {
    state = rxFormReducer(state, action);
  }
  return state.fields;
}

function makeTemplate(
  scope: DoctorRxTemplate["scope"],
  objective: DoctorRxTemplate["objective_json"],
): DoctorRxTemplate {
  return {
    id: "tpl-obj-24",
    doctor_id: "doc-1",
    name: "Result preset",
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
    pmh_json: {},
    allergies_json: {},
    scope,
    use_count: 0,
    last_used_at: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function prescriptionFromPayload(
  payload: ReturnType<typeof buildRxPayload>,
): PrescriptionWithRelations {
  return {
    id: "rx-1",
    test_results: payload.testResults ?? null,
    test_results_json: payload.testResultsJson ?? [],
  } as unknown as PrescriptionWithRelations;
}

function makeAttachment(overrides: Partial<PrescriptionAttachment>): PrescriptionAttachment {
  return {
    id: "att-1",
    prescription_id: "rx-1",
    file_path: "doc-1/rx-1/objective/uuid-wound.jpg",
    file_type: "image/jpeg",
    caption: null,
    uploaded_at: "2026-06-19T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Harness (modality + a11y through the real ObjectiveSection tree)
// ---------------------------------------------------------------------------

function PayloadProbe() {
  const { state } = useRxForm();
  return <pre data-testid="payload-probe">{JSON.stringify(buildRxPayload(state.fields))}</pre>;
}

function readPayload(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId("payload-probe").textContent ?? "{}");
}

function ObjectiveSectionHarness({
  initialFields,
  disabled = false,
  shell,
  attachments = [],
}: {
  initialFields: RxFormFields;
  disabled?: boolean;
  shell?: Partial<RxFormProviderSetup>;
  attachments?: PrescriptionAttachment[];
}) {
  const prescriptionIdRef = { current: "rx-1" as string | null };
  const [attachmentState, setAttachmentState] = useState(attachments);

  const fullShell: RxFormProviderSetup = {
    loading: false,
    initialFields,
    entryMode: "structured",
    setEntryMode: vi.fn(),
    prescription: null,
    setPrescription: vi.fn(),
    prescriptionIdRef,
    attachments: attachmentState,
    setAttachments: setAttachmentState,
    setInitialFields: vi.fn(),
    generateInstanceIds: (n: number) => Array.from({ length: n }, (_, i) => `m-${i}`),
    instanceIdSeqRef: { current: 0 },
    medicineInstanceIds: ["m-0"],
    setMedicineInstanceIds: vi.fn(),
    subjectiveSectionOrder: [],
    setSubjectiveSectionOrder: vi.fn(),
    subjectiveSectionCollapsed: {},
    setSubjectiveSectionCollapsed: vi.fn(),
    subjectiveSectionHidden: [],
    setSubjectiveSectionHidden: vi.fn(),
    objectiveDefaults: {
      sectionOrder: [],
      sectionCollapsed: {},
      sectionHidden: [],
      customSections: [],
    },
    setObjectiveDefaults: vi.fn(),
    providerProps: {
      key: "test",
      appointmentId: "appt-1",
      patientId: "pat-1",
      token: "test-token",
      entryMode: "structured",
      initialFields,
      autosaveEnabled: false,
      prescriptionIdRef,
      onPrescriptionCreated: vi.fn(),
    },
    ...shell,
  } as RxFormProviderSetup;

  return (
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
        <PrescriptionFormShellProvider value={fullShell}>
          <ObjectiveSection heading={null} disabled={disabled} />
          <PayloadProbe />
        </PrescriptionFormShellProvider>
      </RxFormProvider>
    </TooltipProvider>
  );
}

function renderObjectiveSection(
  initialFields: RxFormFields,
  options?: {
    disabled?: boolean;
    shell?: Partial<RxFormProviderSetup>;
    attachments?: PrescriptionAttachment[];
  },
) {
  return render(
    <ObjectiveSectionHarness
      initialFields={initialFields}
      disabled={options?.disabled}
      shell={options?.shell}
      attachments={options?.attachments}
    />,
  );
}

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

// ---------------------------------------------------------------------------
// §1 Output byte-parity (P5-D3 / OBJ-D2)
// ---------------------------------------------------------------------------

describe("obj-24 · §1 output byte-parity (structured results are content-only)", () => {
  it("1.1 structured rows derive test_results byte-identically to the legacy textarea", () => {
    const structured = buildRxPayload(richStructuredFields());
    const legacy = buildRxPayload(richLegacyFields());

    expect(structured.testResults).toBe(legacy.testResults);
    expect(structured.testResults).toBe(deriveTestResults([HBA1C, RBS]));
    expect(structured.testResultsJson).toEqual([HBA1C, RBS]);
  });

  it("1.1b a test_results-scope template apply matches hand-entry of the same patient-report rows", () => {
    const handPatientOnly = createEmptyRxFormFields();
    handPatientOnly.testResultsStructured = [HBA1C];

    const template = makeTemplate(
      "test_results",
      buildObjectiveTemplateSavePayload("test_results", richStructuredFields()).objective ?? {},
    );
    const applied = applyActions(createEmptyRxFormFields(), [
      ...buildObjectiveTemplateApplyActions("test_results", template, createEmptyRxFormFields()),
    ]);

    expect(buildRxPayload(applied).testResults).toEqual(
      buildRxPayload(handPatientOnly).testResults,
    );
    expect(buildRxPayload(applied).testResultsJson).toEqual(
      buildRxPayload(handPatientOnly).testResultsJson,
    );
  });

  it("1.1c a POC specialty pack apply matches hand-entry of the same structured rows", () => {
    const pack = resolveObjectiveSpecialtyPacks("pulmonology")[0]!;
    const applied = applyActions(
      createEmptyRxFormFields(),
      buildObjectiveTemplateApplyActions(
        "objective_full",
        specialtyPackToSyntheticTemplate(pack),
        createEmptyRxFormFields(),
      ),
    );

    const hand = createEmptyRxFormFields();
    hand.testResultsStructured = pack.objective.testResultsJson ?? [];

    expect(buildRxPayload(applied).testResults).toEqual(buildRxPayload(hand).testResults);
    expect(buildRxPayload(applied).testResultsJson?.map((r) => r.name)).toEqual(
      buildRxPayload(hand).testResultsJson?.map((r) => r.name),
    );
  });

  it("1.2 no structured/template/media state leaks into buildRxPayload", () => {
    const payload = buildRxPayload(richStructuredFields());
    const keys = Object.keys(payload).sort();

    for (const leaked of [
      "testResultsStructured",
      "attachments",
      "objectiveSeed",
      "sectionOrder",
      "sectionHidden",
      "scope",
      "objective",
    ]) {
      expect(keys).not.toContain(leaked);
    }
  });

  it("1.3 legacy-only and empty rows derive test_results byte-identically (P1 gate holds under P5)", () => {
    const legacy = createEmptyRxFormFields();
    legacy.testResults = LEGACY_FREE_TEXT;
    expect(buildRxPayload(legacy).testResults).toBe(LEGACY_FREE_TEXT);
    expect(buildRxPayload(legacy).testResultsJson).toEqual([]);

    const empty = createEmptyRxFormFields();
    expect(buildRxPayload(empty).testResults).toBeNull();
    expect(buildRxPayload(empty).testResultsJson).toEqual([]);

    // save → reload → re-save fixed point for legacy free-text.
    const rx = prescriptionFromPayload(buildRxPayload(legacy));
    expect(buildRxPayload(rxFormFieldsFromPrescription(rx)).testResults).toBe(LEGACY_FREE_TEXT);
  });
});

// ---------------------------------------------------------------------------
// §2 Round-trip fixed points
// ---------------------------------------------------------------------------

describe("obj-24 · §2 round-trip fixed points", () => {
  it("2.1 enter → save → reload → re-derive yields the same test_results + test_results_json", () => {
    const hand = richStructuredFields();
    const saved = buildRxPayload(hand);
    const reloaded = rxFormFieldsFromPrescription(prescriptionFromPayload(saved));

    expect(buildRxPayload(reloaded).testResults).toBe(saved.testResults);
    expect(buildRxPayload(reloaded).testResultsJson).toEqual(saved.testResultsJson);
  });

  it("2.1b apply template → save → reload → re-derive is a stable fixed point", () => {
    const template = makeTemplate(
      "point_of_care",
      buildObjectiveTemplateSavePayload("point_of_care", richStructuredFields()).objective ?? {},
    );
    const applied = applyActions(
      createEmptyRxFormFields(),
      buildObjectiveTemplateApplyActions("point_of_care", template, createEmptyRxFormFields()),
    );
    const payload = buildRxPayload(applied);
    const reloaded = rxFormFieldsFromPrescription(prescriptionFromPayload(payload));

    expect(buildRxPayload(reloaded).testResults).toBe(payload.testResults);
    expect(buildRxPayload(reloaded).testResultsJson?.map((r) => r.source)).toEqual(
      payload.testResultsJson?.map((r) => r.source),
    );
  });

  it("2.2 media attachments round-trip on reload; non-objective attachments are filtered out", async () => {
    const objectiveAtt = makeAttachment({
      id: "obj-1",
      file_path: "doc-1/rx-1/objective/uuid-wound.jpg",
    });
    const legacyAtt = makeAttachment({
      id: "legacy-1",
      file_path: "doc-1/rx-1/uuid-photo-rx.jpg",
    });
    const all = [objectiveAtt, legacyAtt];

    expect(filterObjectiveAttachments(all)).toEqual([objectiveAtt]);
    expect(filterObjectiveAttachments(all).map((a) => a.id)).not.toContain("legacy-1");

    const { unmount } = renderObjectiveSection(createEmptyRxFormFields(), {
      attachments: all,
    });

    await waitFor(() => expect(screen.getByTestId("objective-media-strip")).toBeInTheDocument());
    expect(screen.getAllByTestId("objective-media-item")).toHaveLength(1);
    unmount();

    // Remount with the same attachment list (simulates reload).
    renderObjectiveSection(createEmptyRxFormFields(), { attachments: all });
    await waitFor(() => expect(screen.getAllByTestId("objective-media-item")).toHaveLength(1));

    // Media never enters the derived Rx payload.
    expect(readPayload()).not.toHaveProperty("attachments");
    expect(readPayload().testResults).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §3 Modality emphasis is view-only (OBJ-D6)
// ---------------------------------------------------------------------------

describe("obj-24 · §3 modality emphasis is view-only", () => {
  it("3.1 every modality/specialty seed yields the same payload as the pure derivation", async () => {
    const fields = richStructuredFields();
    const pure = JSON.stringify(buildRxPayload(fields));

    for (const seedArgs of [
      { modality: "in_clinic" as const },
      { modality: "video" as const },
      { modality: "voice" as const, specialty: "Cardiology" },
      { modality: "text" as const, specialty: "Pulmonology" },
    ]) {
      const { unmount } = renderObjectiveSection(fields, {
        shell: { objectiveSeed: resolveDefaultLayout(seedArgs) },
      });
      await waitFor(() => expect(screen.getByTestId("payload-probe")).toBeInTheDocument());
      expect(JSON.stringify(readPayload())).toBe(pure);
      unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// §4 Accessibility sweep
// ---------------------------------------------------------------------------

describe("obj-24 · §4 accessibility", () => {
  it("4.1 result-row controls are labelled and keyboard-operable", async () => {
    renderObjectiveSection(richStructuredFields());
    await waitFor(() =>
      expect(screen.getByTestId("test-results-list-patient_report")).toBeInTheDocument(),
    );

    const card = screen.getByTestId(`test-result-row-${HBA1C.id}`);
    expect(within(card).getByLabelText("Test name")).toBeInTheDocument();
    expect(within(card).getByLabelText("Result source")).toBeInTheDocument();
    expect(within(card).getByLabelText("Result interpretation")).toBeInTheDocument();

    const highChip = within(card).getByTestId(`test-result-interpretation-${HBA1C.id}-high`);
    expect(highChip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(card).getByTestId(`test-result-interpretation-${HBA1C.id}-normal`));
    expect(
      within(card).getByTestId(`test-result-interpretation-${HBA1C.id}-normal`),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("4.2 media strip + result-scope template + specialty-pack affordances are labelled", async () => {
    renderObjectiveSection(richStructuredFields(), {
      attachments: [makeAttachment({ id: "m-1" })],
    });

    await waitFor(() => expect(screen.getByTestId("objective-media-strip")).toBeInTheDocument());
    expect(screen.getByLabelText("Add objective media")).toBeInTheDocument();
    expect(screen.getByLabelText("Objective media attachments")).toBeInTheDocument();

    expect(screen.getByTestId("objective-section-template-test_results")).toHaveAttribute(
      "aria-label",
      "Templates",
    );
    expect(screen.getByTestId("objective-section-template-save-test_results")).toHaveAttribute(
      "aria-label",
      "Save as template",
    );
    expect(screen.getByTestId("objective-section-template-point_of_care")).toHaveAttribute(
      "aria-label",
      "Templates",
    );

    const packStrip = await screen.findByTestId("objective-specialty-packs-strip");
    const packButton = packStrip.querySelector("button");
    expect(packButton).not.toBeNull();
    expect(packButton!.tagName).toBe("BUTTON");
  });

  it("4.3 disabled (read-only) mode hides edit affordances for results, media, and templates", async () => {
    renderObjectiveSection(richStructuredFields(), {
      disabled: true,
      attachments: [makeAttachment({ id: "m-1" })],
    });

    await waitFor(() =>
      expect(screen.getByTestId(`test-result-row-${HBA1C.id}`)).toBeInTheDocument(),
    );

    expect(screen.queryByTestId(`test-result-name-${HBA1C.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId("test-results-add-patient_report")).not.toBeInTheDocument();
    expect(screen.queryByTestId("objective-media-add")).not.toBeInTheDocument();
    expect(screen.queryByTestId("objective-media-remove")).not.toBeInTheDocument();
    expect(screen.queryByTestId("objective-section-template-test_results")).not.toBeInTheDocument();
    expect(screen.queryByTestId("objective-specialty-packs-strip")).not.toBeInTheDocument();
  });
});
