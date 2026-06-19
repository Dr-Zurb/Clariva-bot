/**
 * obj-15 — Phase-3 layout-engine close-gate.
 *
 * The phase-closing proof that the objective layout engines (obj-09..14:
 * reorder, collapse, hidden/manage-menu, custom sections, modality/specialty
 * seed) are **view-only** (P3-D3): no layout permutation changes the derived
 * `examination_findings` / `test_results` / `vitals_*` by a single byte, every
 * engine **round-trips** a remount as the per-doctor default, and the surface
 * is accessible. Same fixture rigor as the P1 `obj-04` derivation gate.
 *
 * Layout lives in `ObjectiveSection` local state + `doctor_settings`; it never
 * enters `RxFormFields`, so `buildRxPayload` is structurally independent of it.
 * This gate exercises the REAL component tree (reorder/collapse/hide/seed via
 * the UI) and proves the rendered payload never moves.
 */

import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  buildRxPayload,
  createEmptyRxFormFields,
  rxFormFieldsFromPrescription,
  useRxForm,
  type ExamSystemFinding,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { PrescriptionFormShellProvider } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import type {
  DoctorObjectiveDefaults,
  RxFormProviderSetup,
} from "@/components/cockpit/rx/useRxFormProviderSetup";
import { resolveDefaultLayout } from "@/lib/cockpit/objective-default-layout";
import { EXAM_DELIMITER } from "@/lib/cockpit/exam-findings";
import type { ObjectiveSectionId } from "@/lib/cockpit/objective-section-order";
import type { PrescriptionWithRelations } from "@/types/prescription";

const mockGetDoctorSettings = vi.fn();
const mockPatchDoctorSettings = vi.fn();
const mockUpdatePrescription = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
    patchDoctorSettings: (...args: unknown[]) => mockPatchDoctorSettings(...args),
    updatePrescription: (...args: unknown[]) => mockUpdatePrescription(...args),
    createPrescription: vi.fn(),
  };
});

const EMPTY_DEFAULTS: DoctorObjectiveDefaults = {
  sectionOrder: [],
  sectionCollapsed: {},
  sectionHidden: [],
  customSections: [],
};

beforeEach(() => {
  mockGetDoctorSettings.mockReset();
  mockPatchDoctorSettings.mockReset();
  mockUpdatePrescription.mockReset();
  mockGetDoctorSettings.mockResolvedValue({
    data: { settings: { objective_section_order: [], objective_section_collapsed: {} } },
  });
  mockPatchDoctorSettings.mockImplementation(async (_token, payload) => ({
    data: { settings: { ...payload } },
  }));
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const prescriptionIdRef = { current: "rx-1" as string | null };

/** Mirrors the live `buildRxPayload` over current form state for byte-parity. */
function PayloadProbe() {
  const { state } = useRxForm();
  return <pre data-testid="payload-probe">{JSON.stringify(buildRxPayload(state.fields))}</pre>;
}

function readPayload(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId("payload-probe").textContent ?? "{}");
}

function renderWithRxForm(initialFields: RxFormFields) {
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
        <ObjectiveSection heading={null} />
        <PayloadProbe />
      </RxFormProvider>
    </TooltipProvider>,
  );
}

function renderWithShell(
  shell: Partial<RxFormProviderSetup>,
  initialFields: RxFormFields = createEmptyRxFormFields(),
) {
  const prescriptionIdRefLocal = { current: "rx-1" as string | null };
  const fullShell = {
    loading: false,
    initialFields,
    entryMode: "structured" as const,
    setEntryMode: vi.fn(),
    prescription: null,
    setPrescription: vi.fn(),
    prescriptionIdRef: prescriptionIdRefLocal,
    attachments: [],
    setAttachments: vi.fn(),
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
    objectiveDefaults: EMPTY_DEFAULTS,
    setObjectiveDefaults: vi.fn(),
    providerProps: {
      key: "test",
      appointmentId: "appt-1",
      patientId: "pat-1",
      token: "test-token",
      entryMode: "structured" as const,
      initialFields,
      autosaveEnabled: false,
      prescriptionIdRef: prescriptionIdRefLocal,
      onPrescriptionCreated: vi.fn(),
    },
    ...shell,
  } satisfies RxFormProviderSetup;

  const ui: ReactElement = (
    <TooltipProvider>
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={initialFields}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRefLocal}
        onPrescriptionCreated={() => {}}
      >
        <PrescriptionFormShellProvider value={fullShell}>
          <ObjectiveSection heading={null} />
          <PayloadProbe />
        </PrescriptionFormShellProvider>
      </RxFormProvider>
    </TooltipProvider>
  );
  return render(ui);
}

function renderedOrder(container: HTMLElement): ObjectiveSectionId[] {
  const root = container.querySelector('[aria-label="Objective"]')!;
  return Array.from(root.querySelectorAll("[data-objective-section-id]")).map(
    (el) => el.getAttribute("data-objective-section-id") as ObjectiveSectionId,
  );
}

async function waitForSettingsLoaded() {
  await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());
}

function patchCallsWith(key: string) {
  return mockPatchDoctorSettings.mock.calls.filter(
    (c) => c[1] && typeof c[1] === "object" && key in (c[1] as Record<string, unknown>),
  );
}

async function openMenu() {
  fireEvent.click(screen.getByTestId("objective-section-manager-trigger"));
  await screen.findAllByRole("button", { name: /^(Hide|Show) / });
}

async function hideViaMenu(label: string) {
  if (!screen.queryByRole("button", { name: `Hide ${label}` })) await openMenu();
  fireEvent.click(await screen.findByRole("button", { name: `Hide ${label}` }));
}

// A content-rich row exercising every objective output column.
function richFields(): RxFormFields {
  const f = createEmptyRxFormFields();
  f.vitalsBpSystolic = 120;
  f.vitalsBpDiastolic = 80;
  f.vitalsHr = 72;
  f.vitalsSpo2 = 98;
  f.examFindings = [
    { systemId: "general", status: "normal", findings: [], notes: null },
    { systemId: "cvs", status: "abnormal", findings: ["Murmur"], notes: "grade 3/6" },
  ] satisfies ExamSystemFinding[];
  f.testResults = "Hb 12.5 g/dL";
  f.objectiveCustomSections = [
    { id: "11111111-1111-4111-8111-111111111111", title: "P/V", body: "No CMT", children: [] },
  ];
  return f;
}

// ---------------------------------------------------------------------------
// §1 Output byte-parity (P3-D3)
// ---------------------------------------------------------------------------

describe("obj-15 · §1 output byte-parity (layout is view-only)", () => {
  it("1.1 reorder + collapse + hide leave buildRxPayload byte-identical", async () => {
    const { container } = renderWithRxForm(richFields());
    await waitForSettingsLoaded();
    await waitFor(() => expect(renderedOrder(container).length).toBeGreaterThan(0));

    const baseline = JSON.stringify(readPayload());

    // (a) reorder — move Vitals down via the keyboard grip.
    const grip = screen.getByRole("button", { name: /Reorder Vitals/i });
    fireEvent.keyDown(grip, { key: "ArrowDown" });
    expect(JSON.stringify(readPayload())).toBe(baseline);

    // (b) collapse — toggle Examination closed.
    fireEvent.click(screen.getByRole("button", { name: "Toggle Examination" }));
    expect(JSON.stringify(readPayload())).toBe(baseline);

    // (c) hide — hide Test results (content stays in the payload — see 1.2).
    await hideViaMenu("Test results");
    await waitFor(() => expect(renderedOrder(container)).not.toContain("test_results"));
    expect(JSON.stringify(readPayload())).toBe(baseline);
  });

  it("1.1b every modality/specialty seed yields the same payload as the pure derivation", async () => {
    const fields = richFields();
    const pure = JSON.stringify(buildRxPayload(fields));

    for (const seedArgs of [
      { modality: "in_clinic" as const },
      { modality: "video" as const },
      { modality: "voice" as const, specialty: "Cardiology" },
      { modality: "text" as const, specialty: "Dermatology" },
    ]) {
      const { unmount } = renderWithShell(
        { objectiveSeed: resolveDefaultLayout(seedArgs) },
        fields,
      );
      await waitFor(() => expect(screen.getByTestId("payload-probe")).toBeInTheDocument());
      expect(JSON.stringify(readPayload())).toBe(pure);
      unmount();
    }
  });

  it("1.2 a hidden section with content still appears in the derived payload", async () => {
    const { container } = renderWithShell(
      {
        objectiveDefaults: {
          ...EMPTY_DEFAULTS,
          sectionHidden: ["test_results"] as ObjectiveSectionId[],
        },
      },
      richFields(),
    );

    await waitFor(() => expect(renderedOrder(container)).not.toContain("test_results"));
    // The section is hidden from the view, but its content is untouched.
    expect(readPayload().testResults).toBe("Hb 12.5 g/dL");
    expect(readPayload().examinationFindings).toContain("P/V\nNo CMT");
  });

  it("1.3 a legacy-only row derives examination_findings byte-identical (P1 gate holds under P3)", () => {
    const legacy = `Alert, no distress${EXAM_DELIMITER}Chest clear, abdomen soft`;
    const fields = createEmptyRxFormFields();
    fields.examinationFindings = legacy;

    const payload = buildRxPayload(fields);
    expect(payload.examinationFindings).toBe(legacy);
    expect(payload.examinationJson).toEqual([]);

    // save → reload (snapshot consumer reads the column verbatim) → re-save: fixed point.
    const reloaded = {
      id: "rx-1",
      examination_findings: payload.examinationFindings ?? null,
      examination_json: payload.examinationJson ?? [],
    } as unknown as PrescriptionWithRelations;
    expect(buildRxPayload(rxFormFieldsFromPrescription(reloaded)).examinationFindings).toBe(legacy);
  });
});

// ---------------------------------------------------------------------------
// §2 Engine round-trips
// ---------------------------------------------------------------------------

describe("obj-15 · §2 engine round-trips", () => {
  it("2.1 order persists, re-applies as the per-doctor default, and merges stale ids", async () => {
    const { container, unmount } = renderWithRxForm(createEmptyRxFormFields());
    await waitForSettingsLoaded();

    fireEvent.keyDown(screen.getByRole("button", { name: /Reorder Vitals/i }), {
      key: "ArrowDown",
    });
    await waitFor(() =>
      expect(renderedOrder(container)).toEqual([
        "exam",
        "vitals",
        "test_results",
        "legacy_exam",
        "legacy_vitals",
      ]),
    );
    // Order autosave is debounced — wait for the persisted patch.
    await waitFor(
      () => expect(patchCallsWith("objective_section_order").length).toBeGreaterThan(0),
      { timeout: 1500 },
    );
    const persistedOrder = patchCallsWith("objective_section_order").at(-1)![1]
      .objective_section_order as ObjectiveSectionId[];
    expect(persistedOrder).toEqual(["exam", "vitals", "test_results", "legacy_exam", "legacy_vitals"]);
    unmount();

    // Remount with the persisted order + a stale id → re-applies, stale dropped, none lost.
    const { container: c2 } = renderWithShell({
      objectiveDefaults: {
        ...EMPTY_DEFAULTS,
        sectionOrder: [...persistedOrder, "ghost_section"] as ObjectiveSectionId[],
      },
    });
    await waitFor(() => {
      const order = renderedOrder(c2);
      expect(order[0]).toBe("exam");
      expect(order[1]).toBe("vitals");
      expect(new Set(order)).toEqual(
        new Set(["vitals", "exam", "test_results", "legacy_exam", "legacy_vitals"]),
      );
    });
  });

  it("2.2 collapse state survives a remount", async () => {
    renderWithShell({
      objectiveDefaults: {
        ...EMPTY_DEFAULTS,
        sectionCollapsed: { vitals: false, legacy_exam: true },
      },
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Toggle Vitals" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(
        screen.getByRole("button", { name: "Toggle Free-text exam (legacy)" }),
      ).toHaveAttribute("aria-expanded", "true");
    });
    expect(mockGetDoctorSettings).not.toHaveBeenCalled();
  });

  it("2.3 hidden set survives a remount; all-hidden empty-state renders; trigger reachable", async () => {
    renderWithShell({
      objectiveDefaults: {
        ...EMPTY_DEFAULTS,
        sectionHidden: [
          "vitals",
          "exam",
          "test_results",
          "legacy_exam",
          "legacy_vitals",
        ] as ObjectiveSectionId[],
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId("objective-all-hidden-empty")).toBeInTheDocument();
      expect(screen.getByTestId("objective-section-manager-trigger")).toBeInTheDocument();
    });
  });

  it("2.4 custom content round-trips; custom_block ids never reach the persisted order/hidden set", async () => {
    const { container } = renderWithRxForm(richFields());
    await waitForSettingsLoaded();
    await waitFor(() =>
      expect(
        container.querySelector('[data-objective-section-id^="custom_block:"]'),
      ).not.toBeNull(),
    );

    // Derived text carries the custom block (the OBJ-D2 round-trip vehicle).
    expect(readPayload().examinationFindings).toContain("P/V\nNo CMT");

    // The manage menu never offers to hide a custom block (P10-D4: delete, don't hide).
    await openMenu();
    expect(screen.queryByRole("button", { name: "Hide P/V" })).not.toBeInTheDocument();

    // Hide a static section → no custom_block id ever lands in a persisted order/hidden patch.
    fireEvent.click(await screen.findByRole("button", { name: "Hide Test results" }));
    await waitFor(() => expect(patchCallsWith("objective_section_hidden").length).toBeGreaterThan(0));
    for (const key of ["objective_section_hidden", "objective_section_order"]) {
      for (const call of patchCallsWith(key)) {
        for (const id of (call[1][key] as string[]) ?? []) {
          expect(id.startsWith("custom_block:")).toBe(false);
        }
      }
    }
  });

  it("2.5 modality seed is the default; explicit doctor override wins and the seed is never persisted", async () => {
    const { container, unmount } = renderWithShell({
      objectiveSeed: resolveDefaultLayout({ modality: "voice" }),
    });
    // voice seed → test_results leads, structured exam hidden by default.
    await waitFor(() => expect(renderedOrder(container)).toEqual(["test_results", "vitals"]));
    // The seed alone never autosaves (nothing persisted on mount).
    await new Promise((r) => setTimeout(r, 40));
    expect(patchCallsWith("objective_section_hidden")).toEqual([]);
    expect(patchCallsWith("objective_section_order")).toEqual([]);
    unmount();

    // A doctor override wins wholesale over the same seed.
    const { container: c2 } = renderWithShell({
      objectiveDefaults: {
        ...EMPTY_DEFAULTS,
        sectionOrder: ["exam", "vitals", "test_results", "legacy_exam", "legacy_vitals"],
        sectionHidden: ["test_results"],
      },
      objectiveSeed: resolveDefaultLayout({ modality: "voice" }),
    });
    await waitFor(() => expect(renderedOrder(c2)[0]).toBe("exam"));
    // exam visible (seed would have hidden it), test_results hidden (doctor's choice).
    expect(renderedOrder(c2)).toContain("exam");
    expect(renderedOrder(c2)).not.toContain("test_results");
  });
});

// ---------------------------------------------------------------------------
// §3 Accessibility sweep
// ---------------------------------------------------------------------------

describe("obj-15 · §3 accessibility", () => {
  it("3.1 reorder grips are keyboard-operable with aria labels", async () => {
    const { container } = renderWithRxForm(createEmptyRxFormFields());
    await waitForSettingsLoaded();

    const grip = screen.getByRole("button", { name: /Reorder Vitals\. Use arrow keys to move\./i });
    grip.focus();
    expect(grip).toHaveFocus();
    fireEvent.keyDown(grip, { key: "ArrowDown" });
    expect(renderedOrder(container)[0]).toBe("exam");
    fireEvent.keyDown(screen.getByRole("button", { name: /Reorder Vitals/i }), { key: "ArrowUp" });
    expect(renderedOrder(container)[0]).toBe("vitals");
  });

  it("3.2 manage-sections menu exposes aria-expanded + accessible toggle state", async () => {
    renderWithRxForm(createEmptyRxFormFields());
    await waitForSettingsLoaded();

    const trigger = screen.getByTestId("objective-section-manager-trigger");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));

    const hideVitals = await screen.findByRole("button", { name: "Hide Vitals" });
    expect(hideVitals).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(hideVitals);
    expect(await screen.findByRole("button", { name: "Show Vitals" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("3.3 custom-section fields are labelled (editable) and read-only when disabled", async () => {
    // Editable: title/notes have accessible labels.
    const { container, unmount } = renderWithRxForm(richFields());
    await waitForSettingsLoaded();
    const block = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('[data-testid^="objective-custom-section-1"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(within(block).getByLabelText("Section title")).toHaveValue("P/V");
    expect(within(block).getByLabelText("Notes")).toHaveValue("No CMT");
    unmount();

    // Disabled: rendered read-only (no inputs) and never autosaves the doctor default.
    renderWithShellDisabled(richFields());
    await waitFor(() =>
      expect(
        document.querySelector('[data-testid^="objective-custom-section-1"]'),
      ).not.toBeNull(),
    );
    expect(
      document.querySelector('[data-testid^="objective-custom-section-title-"]'),
    ).toBeNull();
    // Read-only body text is rendered (collapsible preview + body both show it).
    expect(screen.getAllByText("No CMT").length).toBeGreaterThan(0);
    expect(patchCallsWith("objective_custom_sections")).toEqual([]);
  });
});

/** Disabled render variant for the read-only a11y assertion. */
function renderWithShellDisabled(initialFields: RxFormFields) {
  const ref = { current: "rx-1" as string | null };
  return render(
    <TooltipProvider>
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={initialFields}
        autosaveEnabled={false}
        prescriptionIdRef={ref}
        onPrescriptionCreated={() => {}}
      >
        <ObjectiveSection heading={null} disabled />
        <PayloadProbe />
      </RxFormProvider>
    </TooltipProvider>,
  );
}
