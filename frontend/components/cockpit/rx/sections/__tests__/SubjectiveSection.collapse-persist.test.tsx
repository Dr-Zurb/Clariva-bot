/**
 * subj-31 close-gate — collapse persistence remount-survival + delta-only contract.
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
import type { SubjectiveSectionCollapseMap } from "@/lib/cockpit/subjective-section-collapse";
import { toCustomBlockSectionId } from "@/lib/cockpit/subjective-section-order";

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

function getCollapseToggle(label: string | RegExp) {
  return screen.getByRole("button", { name: label });
}

function collapsePatchCalls() {
  return mockPatchDoctorSettings.mock.calls.filter(
    (call) =>
      call[1] &&
      typeof call[1] === "object" &&
      "subjective_section_collapsed" in (call[1] as Record<string, unknown>),
  );
}

async function waitForSettingsLoaded() {
  await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());
}

describe("SubjectiveSection collapse persistence (subj-31)", () => {
  beforeEach(() => {
    mockGetDoctorSettings.mockReset();
    mockPatchDoctorSettings.mockReset();
    mockUpdatePrescription.mockReset();
    mockGetDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: [],
          subjective_section_collapsed: {},
        },
      },
    });
    mockPatchDoctorSettings.mockImplementation(async (_token, payload) => ({
      data: {
        settings: {
          subjective_section_order: [],
          subjective_section_collapsed:
            payload.subjective_section_collapsed ?? {},
        },
      },
    }));
  });

  it("autosaves delta-only overrides after collapsing top-level sections", async () => {
    renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitForSettingsLoaded();

    const chiefToggle = getCollapseToggle("Toggle chief complaints");
    expect(chiefToggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(chiefToggle);

    const freeTextToggle = getCollapseToggle("Toggle free-text notes");
    expect(freeTextToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(freeTextToggle);

    await waitFor(
      () => {
        expect(collapsePatchCalls().length).toBeGreaterThan(0);
        const last = collapsePatchCalls().at(-1)?.[1] as {
          subjective_section_collapsed: Record<string, boolean>;
        };
        expect(last.subjective_section_collapsed).toEqual({
          chief_complaints: false,
          free_text_notes: true,
        });
        expect(last.subjective_section_collapsed).not.toHaveProperty("social_history");
        expect(last.subjective_section_collapsed).not.toHaveProperty("family_history");
      },
      { timeout: 1500 },
    );
    expect(mockUpdatePrescription).not.toHaveBeenCalled();
  });

  it("restores collapsed sections after unmount/remount (tab toggle simulation)", async () => {
    const savedMap = { chief_complaints: false, free_text_notes: true };

    const first = renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitForSettingsLoaded();

    fireEvent.click(getCollapseToggle("Toggle chief complaints"));
    fireEvent.click(getCollapseToggle("Toggle free-text notes"));

    await waitFor(() => expect(collapsePatchCalls().length).toBeGreaterThan(0), {
      timeout: 1500,
    });

    mockGetDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: [],
          subjective_section_collapsed: savedMap,
        },
      },
    });
    first.unmount();

    renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitFor(() => {
      expect(getCollapseToggle("Toggle chief complaints")).toHaveAttribute("aria-expanded", "false");
      expect(getCollapseToggle("Toggle free-text notes")).toHaveAttribute("aria-expanded", "true");
      expect(getCollapseToggle("Toggle Social / personal history")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });
  });

  it("hydrates from shell-provided collapse map on fresh mount (patient reopen simulation)", async () => {
    renderWithShell(<SubjectiveSection heading={null} />, {
      subjectiveSectionCollapsed: { chief_complaints: false, social_history: true },
    });

    await waitFor(() => {
      expect(getCollapseToggle("Toggle chief complaints")).toHaveAttribute("aria-expanded", "false");
      expect(getCollapseToggle("Toggle Social / personal history")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });
    expect(mockGetDoctorSettings).not.toHaveBeenCalled();
  });

  it("keeps sections collapsed while collapse map fetch is in flight (no default-open flash)", async () => {
    let resolveSettings!: (value: unknown) => void;
    mockGetDoctorSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSettings = resolve;
      }),
    );

    renderWithRxForm(<SubjectiveSection heading={null} />);

    expect(getCollapseToggle("Toggle chief complaints")).toHaveAttribute("aria-expanded", "false");
    expect(getCollapseToggle("Toggle free-text notes")).toHaveAttribute("aria-expanded", "false");

    resolveSettings({
      data: {
        settings: {
          subjective_section_order: [],
          subjective_section_collapsed: { chief_complaints: true },
        },
      },
    });

    await waitFor(() => {
      expect(getCollapseToggle("Toggle chief complaints")).toHaveAttribute("aria-expanded", "true");
    });
  });

  it("does not reset a user toggle when section order settles after mount", async () => {
    mockGetDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: ["chief_complaints", "social_history", "free_text_notes"],
          subjective_section_collapsed: {},
        },
      },
    });

    renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitForSettingsLoaded();

    const socialToggle = getCollapseToggle("Toggle Social / personal history");
    expect(socialToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(socialToggle);
    expect(socialToggle).toHaveAttribute("aria-expanded", "true");

    await waitFor(
      () => {
        expect(socialToggle).toHaveAttribute("aria-expanded", "true");
      },
      { timeout: 1500 },
    );
  });

  it("does not revert a user collapse when shell echoes a stale stored map", async () => {
    function StaleShellEchoHarness() {
      const [shellCollapsed, setShellCollapsed] = useState<SubjectiveSectionCollapseMap>({});
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
        subjectiveSectionCollapsed: shellCollapsed,
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
            <button type="button" onClick={() => setShellCollapsed({})}>
              stale-echo
            </button>
          </PrescriptionFormShellProvider>
        </RxFormProvider>
      );
    }

    render(<StaleShellEchoHarness />);

    const chiefToggle = getCollapseToggle("Toggle chief complaints");
    await waitFor(() => expect(chiefToggle).toHaveAttribute("aria-expanded", "true"));

    fireEvent.click(chiefToggle);
    expect(chiefToggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "stale-echo" }));

    await waitFor(
      () => {
        expect(chiefToggle).toHaveAttribute("aria-expanded", "false");
      },
      { timeout: 1500 },
    );
  });

  it("keeps a collapsed section closed after autosave echoes storedSectionCollapsed", async () => {
    renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitForSettingsLoaded();

    const chiefToggle = getCollapseToggle("Toggle chief complaints");
    expect(chiefToggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(chiefToggle);
    expect(chiefToggle).toHaveAttribute("aria-expanded", "false");

    await waitFor(() => expect(collapsePatchCalls().length).toBeGreaterThan(0), {
      timeout: 1500,
    });

    expect(chiefToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("never persists custom_block ids even when a custom block is present", async () => {
    const fields = createEmptyRxFormFields();
    fields.customSubsections = [
      {
        id: CUSTOM_BLOCK_ID,
        title: "Travel history",
        body: null,
        children: [],
      },
    ];

    renderWithRxForm(<SubjectiveSection heading={null} />, fields);
    await waitForSettingsLoaded();

    const customToggle = getCollapseToggle("Toggle Travel history");
    fireEvent.click(customToggle);

    fireEvent.click(getCollapseToggle("Toggle chief complaints"));

    await waitFor(
      () => {
        const last = collapsePatchCalls().at(-1)?.[1] as {
          subjective_section_collapsed: Record<string, boolean>;
        };
        expect(Object.keys(last.subjective_section_collapsed)).toEqual(["chief_complaints"]);
        expect(last.subjective_section_collapsed).not.toHaveProperty(
          toCustomBlockSectionId(CUSTOM_BLOCK_ID),
        );
      },
      { timeout: 1500 },
    );
  });

  it("does not autosave collapse overrides when disabled", async () => {
    renderWithRxForm(<SubjectiveSection heading={null} disabled />);
    await waitForSettingsLoaded();

    expect(collapsePatchCalls()).toHaveLength(0);
    expect(mockUpdatePrescription).not.toHaveBeenCalled();
  });
});
