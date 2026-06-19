/**
 * subj-35 / subj-38 — visibility persistence remount-survival + custom-block contracts.
 */

import type { ReactElement } from "react";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { PrescriptionFormShellProvider } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";
import type { RxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";
import type { SubjectiveSectionHiddenSet } from "@/lib/cockpit/subjective-section-visibility";
import { toCustomBlockSectionId } from "@/lib/cockpit/subjective-section-order";
import type { SubjectiveSectionId } from "@/lib/cockpit/subjective-section-order";

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

vi.mock("@/components/ehr/sections/ProblemOrientedMedicalSection", () => ({
  default: () => <div data-testid="problem-oriented-stub" />,
}));

vi.mock("@/components/ehr/sections/AllergiesSection", () => ({
  default: () => <div data-testid="allergies-stub" />,
}));

const prescriptionIdRef = { current: "rx-1" as string | null };
const CUSTOM_BLOCK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";

function renderWithRxForm(
  ui: ReactElement,
  initialFields: RxFormFields = createEmptyRxFormFields(),
) {
  return render(
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
      {ui}
    </RxFormProvider>,
  );
}

function renderWithShell(
  ui: ReactElement,
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

  return render(
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
      <PrescriptionFormShellProvider value={fullShell}>{ui}</PrescriptionFormShellProvider>
    </RxFormProvider>,
  );
}

function readRenderedSectionOrder(container: HTMLElement): SubjectiveSectionId[] {
  const root = container.querySelector("#rx-symptoms");
  expect(root).toBeTruthy();
  return Array.from(root!.querySelectorAll("[data-subjective-section-id]")).map(
    (el) => el.getAttribute("data-subjective-section-id") as SubjectiveSectionId,
  );
}

function openSectionManagerMenu() {
  fireEvent.click(screen.getByTestId("section-manager-menu-trigger"));
}

async function hideSectionViaMenu(label: string) {
  if (!screen.queryByRole("button", { name: `Hide ${label}` })) {
    openSectionManagerMenu();
  }
  await waitFor(() => {
    expect(screen.getByRole("button", { name: `Hide ${label}` })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole("button", { name: `Hide ${label}` }));
}

function customBlockFields(): RxFormFields {
  const fields = createEmptyRxFormFields();
  fields.customSubsections = [
    {
      id: CUSTOM_BLOCK_ID,
      title: "Travel history",
      body: null,
      children: [],
    },
  ];
  return fields;
}

function orderPatchCalls() {
  return mockPatchDoctorSettings.mock.calls.filter(
    (call) =>
      call[1] &&
      typeof call[1] === "object" &&
      "subjective_section_order" in (call[1] as Record<string, unknown>),
  );
}

function hiddenPatchCalls() {
  return mockPatchDoctorSettings.mock.calls.filter(
    (call) =>
      call[1] &&
      typeof call[1] === "object" &&
      "subjective_section_hidden" in (call[1] as Record<string, unknown>),
  );
}

async function waitForSettingsLoaded() {
  await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());
}

describe("SubjectiveSection visibility persistence (subj-35 / subj-38)", () => {
  beforeEach(() => {
    mockGetDoctorSettings.mockReset();
    mockPatchDoctorSettings.mockReset();
    mockUpdatePrescription.mockReset();
    mockGetDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: [],
          subjective_section_collapsed: {},
          subjective_section_hidden: [],
        },
      },
    });
    mockPatchDoctorSettings.mockImplementation(async (_token, payload) => ({
      data: {
        settings: {
          subjective_section_order: [],
          subjective_section_collapsed: {},
          subjective_section_hidden: payload.subjective_section_hidden ?? [],
        },
      },
    }));
  });

  it("autosaves delta-only hidden ids after hiding sections via the menu", async () => {
    const { container } = renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitForSettingsLoaded();

    await hideSectionViaMenu("Family history");
    await hideSectionViaMenu("Social / personal history");
    await hideSectionViaMenu("Chief complaints");

    await waitFor(
      () => {
        expect(hiddenPatchCalls().length).toBeGreaterThan(0);
        const last = hiddenPatchCalls().at(-1)?.[1] as {
          subjective_section_hidden: string[];
        };
        expect(last.subjective_section_hidden).toEqual(
          expect.arrayContaining(["family_history", "social_history", "chief_complaints"]),
        );
        expect(last.subjective_section_hidden).not.toContain("free_text_notes");
      },
      { timeout: 1500 },
    );

    const order = readRenderedSectionOrder(container);
    expect(order).not.toContain("family_history");
    expect(order).not.toContain("social_history");
    expect(order).not.toContain("chief_complaints");
    expect(mockUpdatePrescription).not.toHaveBeenCalled();
  });

  it("restores hidden sections after unmount/remount (tab toggle simulation)", async () => {
    const savedHidden = ["family_history", "social_history", "chief_complaints"];

    const first = renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitForSettingsLoaded();

    await hideSectionViaMenu("Family history");
    await hideSectionViaMenu("Social / personal history");
    await hideSectionViaMenu("Chief complaints");

    await waitFor(() => expect(hiddenPatchCalls().length).toBeGreaterThan(0), {
      timeout: 1500,
    });

    mockGetDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: [],
          subjective_section_collapsed: {},
          subjective_section_hidden: savedHidden,
        },
      },
    });
    first.unmount();

    const second = renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitFor(() => {
      const order = readRenderedSectionOrder(second.container);
      expect(order).not.toContain("family_history");
      expect(order).not.toContain("social_history");
      expect(order).not.toContain("chief_complaints");
      expect(order).toContain("past_surgical");
    });
  });

  it("hydrates from shell-provided hidden set on fresh mount (patient reopen simulation)", async () => {
    const { container } = renderWithShell(<SubjectiveSection heading={null} />, {
      subjectiveSectionHidden: ["family_history", "free_text_notes"],
    });

    await waitFor(() => {
      const order = readRenderedSectionOrder(container);
      expect(order).not.toContain("family_history");
      expect(order).not.toContain("free_text_notes");
      expect(order).toContain("chief_complaints");
    });
    expect(mockGetDoctorSettings).not.toHaveBeenCalled();
  });

  it("does not revert a user hide when shell echoes a stale stored set", async () => {
    function StaleShellEchoHarness() {
      const [shellHidden, setShellHidden] = useState<SubjectiveSectionHiddenSet>([]);
      const prescriptionIdRefLocal = { current: "rx-1" as string | null };
      const initialFields = createEmptyRxFormFields();
      const shell = {
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
        subjectiveSectionHidden: shellHidden,
        setSubjectiveSectionHidden: vi.fn(),
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
      } satisfies RxFormProviderSetup;

      return (
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
          <PrescriptionFormShellProvider value={shell}>
            <SubjectiveSection heading={null} />
            <button type="button" onClick={() => setShellHidden([])}>
              stale-echo
            </button>
          </PrescriptionFormShellProvider>
        </RxFormProvider>
      );
    }

    const { container } = render(<StaleShellEchoHarness />);
    await waitFor(() => {
      expect(screen.getByTestId("section-manager-menu-trigger")).toBeInTheDocument();
    });

    await hideSectionViaMenu("Family history");

    await waitFor(() => {
      expect(readRenderedSectionOrder(container)).not.toContain("family_history");
    });

    fireEvent.click(screen.getByRole("button", { name: "stale-echo" }));

    await waitFor(
      () => {
        expect(readRenderedSectionOrder(container)).not.toContain("family_history");
      },
      { timeout: 1500 },
    );
  });

  it("persists custom_block id when hiding a custom section (P11-D2)", async () => {
    renderWithRxForm(<SubjectiveSection heading={null} />, customBlockFields());
    await waitForSettingsLoaded();

    await hideSectionViaMenu("Travel history");

    await waitFor(
      () => {
        const last = hiddenPatchCalls().at(-1)?.[1] as {
          subjective_section_hidden: string[];
        };
        expect(last.subjective_section_hidden).toEqual([
          toCustomBlockSectionId(CUSTOM_BLOCK_ID),
        ]);
      },
      { timeout: 1500 },
    );
  });

  it("custom section hide survives tab toggle remount", async () => {
    const savedHidden = [toCustomBlockSectionId(CUSTOM_BLOCK_ID)];

    const first = renderWithRxForm(<SubjectiveSection heading={null} />, customBlockFields());
    await waitForSettingsLoaded();

    await hideSectionViaMenu("Travel history");
    await waitFor(() => expect(hiddenPatchCalls().length).toBeGreaterThan(0), {
      timeout: 1500,
    });

    mockGetDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: [],
          subjective_section_collapsed: {},
          subjective_section_hidden: savedHidden,
        },
      },
    });
    first.unmount();

    const second = renderWithRxForm(<SubjectiveSection heading={null} />, customBlockFields());
    await waitFor(() => {
      const order = readRenderedSectionOrder(second.container);
      expect(order).not.toContain(toCustomBlockSectionId(CUSTOM_BLOCK_ID));
      expect(order).toContain("chief_complaints");
    });
  });

  it("custom section hide re-applies on patient reopen via shell", async () => {
    const { container } = renderWithShell(
      <SubjectiveSection heading={null} />,
      { subjectiveSectionHidden: [toCustomBlockSectionId(CUSTOM_BLOCK_ID)] },
      customBlockFields(),
    );

    await waitFor(() => {
      const order = readRenderedSectionOrder(container);
      expect(order).not.toContain(toCustomBlockSectionId(CUSTOM_BLOCK_ID));
      expect(order).toContain("chief_complaints");
    });
    expect(mockGetDoctorSettings).not.toHaveBeenCalled();
  });

  it("custom section order persists across reopen with stable id (subj-36 bonus)", async () => {
    const fields = customBlockFields();
    const customBlockSectionId = toCustomBlockSectionId(CUSTOM_BLOCK_ID);

    mockPatchDoctorSettings.mockImplementation(async (_token, payload) => ({
      data: {
        settings: {
          subjective_section_order: payload.subjective_section_order ?? [],
          subjective_section_collapsed: {},
          subjective_section_hidden: payload.subjective_section_hidden ?? [],
        },
      },
    }));

    const first = renderWithRxForm(<SubjectiveSection heading={null} />, fields);
    await waitForSettingsLoaded();

    openSectionManagerMenu();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Move Travel history up" })).toBeInTheDocument();
    });

    const moveUp = screen.getByRole("button", { name: "Move Travel history up" });
    for (let i = 0; i < 5; i += 1) {
      if (!moveUp.hasAttribute("disabled")) {
        fireEvent.click(moveUp);
      }
    }

    let savedOrder: SubjectiveSectionId[] = [];
    await waitFor(
      () => {
        expect(orderPatchCalls().length).toBeGreaterThan(0);
        savedOrder = (
          orderPatchCalls().at(-1)?.[1] as { subjective_section_order: SubjectiveSectionId[] }
        ).subjective_section_order;
        expect(savedOrder[0]).toBe(customBlockSectionId);
      },
      { timeout: 1500 },
    );

    first.unmount();

    mockGetDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: savedOrder,
          subjective_section_collapsed: {},
          subjective_section_hidden: [],
        },
      },
    });

    const second = renderWithRxForm(<SubjectiveSection heading={null} />, fields);
    await waitFor(() => {
      const order = readRenderedSectionOrder(second.container);
      expect(order[0]).toBe(customBlockSectionId);
    });
  });

  it("removes a custom section from the manage menu", async () => {
    const { container } = renderWithRxForm(
      <SubjectiveSection heading={null} />,
      customBlockFields(),
    );
    await waitForSettingsLoaded();

    openSectionManagerMenu();
    await waitFor(() => {
      expect(
        screen.getByTestId(`section-manager-remove-${toCustomBlockSectionId(CUSTOM_BLOCK_ID)}`),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByTestId(`section-manager-remove-${toCustomBlockSectionId(CUSTOM_BLOCK_ID)}`),
    );

    await waitFor(() => {
      const order = readRenderedSectionOrder(container);
      expect(order).not.toContain(toCustomBlockSectionId(CUSTOM_BLOCK_ID));
    });
    expect(screen.queryByText("Travel history")).not.toBeInTheDocument();
  });

  it("does not autosave hidden set when disabled", async () => {
    renderWithRxForm(<SubjectiveSection heading={null} disabled />);
    await waitForSettingsLoaded();

    expect(hiddenPatchCalls()).toHaveLength(0);
    expect(screen.getByTestId("section-manager-menu-trigger")).toBeInTheDocument();
    expect(mockUpdatePrescription).not.toHaveBeenCalled();
  });

  it("renders all-hidden empty-state while keeping the menu reachable", async () => {
    renderWithShell(<SubjectiveSection heading={null} />, {
      subjectiveSectionHidden: [
        "chief_complaints",
        "past_surgical",
        "family_history",
        "social_history",
        "free_text_notes",
      ],
    });

    await waitFor(() => {
      expect(screen.getByTestId("subjective-all-hidden-empty")).toBeInTheDocument();
      expect(screen.getByTestId("section-manager-menu-trigger")).toBeInTheDocument();
    });
  });
});
