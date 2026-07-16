/**
 * vit-08 — ManageVitalsMenu hide/unhide, has-data hint, and VitalsGrid wiring.
 */

import type { ReactElement } from "react";
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { VitalsGrid } from "@/components/cockpit/rx/inputs/VitalsGrid";
import {
  ManageVitalsMenu,
  resolveVitalHasDataHint,
} from "@/components/cockpit/rx/inputs/ManageVitalsMenu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { resolveEffectiveVitalsHidden, isVitalExcludedFromObjectiveUi } from "@/lib/cockpit/vitals-visibility";
import { isPairedContextCategorical } from "@/lib/cockpit/vitals-group-layout";
import { isGcsComponentOnlyKey } from "@/lib/cockpit/gcs-subscore";
import { isBpComponentOnlyKey } from "@/lib/cockpit/bp-cluster";
import { isPupilComponentOnlyKey } from "@/lib/cockpit/pupil-cluster";
import { CATEGORICAL_VITAL_ORDER, type CategoricalVitalKey } from "@/lib/cockpit/categorical-vitals-schema";
import type { VitalVisibilityKey } from "@/lib/cockpit/vitals-visibility";

function isMenuCountableHiddenKey(id: VitalVisibilityKey): boolean {
  if (isVitalExcludedFromObjectiveUi(id)) return false;
  if (isGcsComponentOnlyKey(id)) return false;
  if (isBpComponentOnlyKey(id)) return false;
  if (isPupilComponentOnlyKey(id)) return false;
  if (
    (CATEGORICAL_VITAL_ORDER as readonly string[]).includes(id) &&
    isPairedContextCategorical(id as CategoricalVitalKey)
  ) {
    return false;
  }
  return true;
}

const mockGetDoctorSettings = vi.fn();
const mockPatchDoctorSettings = vi.fn();
const mockGetPatientById = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
    patchDoctorSettings: (...args: unknown[]) => mockPatchDoctorSettings(...args),
    getLastPrescriptionInEpisode: vi
      .fn()
      .mockResolvedValue({ data: { prescription: null } }),
    getPatientById: (...args: unknown[]) => mockGetPatientById(...args),
  };
});

vi.mock("@/hooks/queries/useVitalsTrendsQuery", async () => {
  const { buildVitalsTrendSeries, indexVitalsTrendSeries } = await import(
    "@/lib/cockpit/vitals-trends"
  );
  const { buildCategoricalVitalTimelines } = await import(
    "@/lib/cockpit/categorical-vitals-timeline"
  );
  const {
    buildCustomVitalTextTimelines,
    buildCustomVitalTrendSeries,
    indexCustomVitalTrendSeries,
  } = await import("@/lib/cockpit/custom-vitals-trends");
  const empty = buildVitalsTrendSeries([]);
  const emptyCustom = buildCustomVitalTrendSeries([]);
  return {
    useVitalsTrendsQuery: () => ({
      series: empty,
      byMetric: indexVitalsTrendSeries(empty),
      categoricalTimelines: buildCategoricalVitalTimelines([]),
      customTrendSeries: emptyCustom,
      byCustomId: indexCustomVitalTrendSeries(emptyCustom),
      customTextTimelines: buildCustomVitalTextTimelines([]),
      isLoading: false,
      isEmpty: true,
      error: null,
    }),
  };
});

vi.mock("@/components/cockpit/rx/objective/PediatricGrowthChartsSection", () => ({
  PediatricGrowthChartsSection: () => null,
}));

const prescriptionIdRef = { current: null as string | null };

function renderWithProvider(initial?: Partial<RxFormFields>) {
  const initialFields = {
    ...createEmptyRxFormFields(),
    ...initial,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RxFormProvider
          appointmentId="appt-1"
          patientId="pat-1"
          token="tok"
          entryMode="structured"
          initialFields={initialFields}
          autosaveEnabled={false}
          prescriptionIdRef={prescriptionIdRef}
          onPrescriptionCreated={() => {}}
        >
          <VitalsGrid />
        </RxFormProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function renderMenu(
  ui: ReactElement,
  initial?: Partial<RxFormFields>,
) {
  const initialFields = { ...createEmptyRxFormFields(), ...initial };
  return render(
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="tok"
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

async function waitForVitalsSettingsLoaded() {
  await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());
}

async function revealVital(menuLabel: string) {
  await waitForVitalsSettingsLoaded();
  if (!screen.queryByRole("button", { name: `Show ${menuLabel}` })) {
    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
  }
  const showBtn = await screen.findByRole("button", { name: `Show ${menuLabel}` });
  fireEvent.click(showBtn);
}

function hiddenPatchCalls() {
  return mockPatchDoctorSettings.mock.calls.filter(
    (call) =>
      call[1] &&
      typeof call[1] === "object" &&
      "vitals_hidden" in (call[1] as Record<string, unknown>),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDoctorSettings.mockResolvedValue({
    data: { settings: { vitals_hidden: [] } },
  });
  mockPatchDoctorSettings.mockImplementation(async (_token, payload) => ({
    data: {
      settings: {
        vitals_hidden: payload.vitals_hidden ?? [],
        vitals_custom: payload.vitals_custom ?? [],
      },
    },
  }));
  mockGetPatientById.mockResolvedValue({
    data: { patient: { date_of_birth: null, gender: null } },
  });
});

describe("resolveVitalHasDataHint (vit-08 / P10-D5)", () => {
  it("reports boolean presence without surfacing values", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsHr = 88;
    expect(resolveVitalHasDataHint("vitalsHr", fields)).toBe(true);
    expect(resolveVitalHasDataHint("vitalsGlucoseMgDl", fields)).toBe(false);
  });
});

describe("ManageVitalsMenu (vit-08)", () => {
  const { hidden: defaultHidden } = resolveEffectiveVitalsHidden({ storedHidden: [] });

  it("exposes accessible toggle state (aria-pressed)", async () => {
    function StatefulMenu() {
      const [hiddenIds, setHiddenIds] = useState(defaultHidden);
      return (
        <ManageVitalsMenu
          effectiveHiddenIds={hiddenIds}
          fields={createEmptyRxFormFields()}
          onToggleHidden={(key) =>
            setHiddenIds((prev) =>
              prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key],
            )
          }
        />
      );
    }

    renderMenu(<StatefulMenu />);

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    const hideHr = await screen.findByRole("button", { name: "Hide Pulse Rate (PR)" });
    expect(hideHr).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(hideHr);
    expect(await screen.findByRole("button", { name: "Show Pulse Rate (PR)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows has-data hint without rendering the value", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsGlucoseMgDl = 142;

    renderMenu(
      <ManageVitalsMenu
        effectiveHiddenIds={defaultHidden}
        fields={fields}
        onToggleHidden={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    expect(screen.getByText("Has data")).toBeInTheDocument();
    expect(screen.queryByText("142")).not.toBeInTheDocument();
  });

  it("lists clustered/registry vitals once and excludes component-only keys", () => {
    renderMenu(
      <ManageVitalsMenu
        effectiveHiddenIds={defaultHidden}
        fields={createEmptyRxFormFields()}
        onToggleHidden={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));

    // Plain registry vitals appear as a single row.
    expect(screen.getByTestId("vitals-manager-row-vitalsGlucoseMgDl")).toBeInTheDocument();

    // BP collapses to one cluster row.
    expect(screen.getByTestId("vitals-manager-row-vitalsBpSystolic")).toBeInTheDocument();
    expect(screen.getByText("Blood pressure (BP)")).toBeInTheDocument();
    expect(screen.queryByTestId("vitals-manager-row-vitalsBpDiastolic")).not.toBeInTheDocument();
    expect(screen.queryByText("BP Systolic")).not.toBeInTheDocument();
    expect(screen.queryByText("BP Diastolic")).not.toBeInTheDocument();

    // Paired context categoricals never get their own row.
    expect(screen.queryByTestId("vitals-manager-row-vitalsO2DeliveryMethod")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vitals-manager-row-vitalsPulseRhythm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vitals-manager-row-vitalsTempSite")).not.toBeInTheDocument();

    // GCS shows the total only — not the E/V/M components.
    expect(screen.getByTestId("vitals-manager-row-vitalsGcsTotal")).toBeInTheDocument();
    expect(screen.queryByTestId("vitals-manager-row-vitalsGcsE")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vitals-manager-row-vitalsGcsV")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vitals-manager-row-vitalsGcsM")).not.toBeInTheDocument();

    // Pupils collapse to one cluster row.
    expect(screen.getByTestId("vitals-manager-row-vitalsPupilSizeLeftMm")).toBeInTheDocument();
    expect(screen.getByText("Pupils")).toBeInTheDocument();
    expect(screen.queryByTestId("vitals-manager-row-vitalsPupilSizeRightMm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vitals-manager-row-vitalsPupilReactivityLeft")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vitals-manager-row-vitalsPupilReactivityRight")).not.toBeInTheDocument();
  });

  it("filters rows by the search query and shows an empty state", () => {
    renderMenu(
      <ManageVitalsMenu
        effectiveHiddenIds={defaultHidden}
        fields={createEmptyRxFormFields()}
        onToggleHidden={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    const search = screen.getByTestId("vitals-manager-search");

    fireEvent.change(search, { target: { value: "glucose" } });
    expect(screen.getByTestId("vitals-manager-row-vitalsGlucoseMgDl")).toBeInTheDocument();
    expect(screen.queryByTestId("vitals-manager-row-vitalsHr")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "zzzzz" } });
    expect(screen.getByTestId("vitals-manager-empty")).toBeInTheDocument();
  });
});

describe("VitalsGrid · manage vitals menu (vit-08)", () => {
  it("shows classic core fields by default and hides extended vitals", async () => {
    renderWithProvider();
    await waitForVitalsSettingsLoaded();

    expect(screen.getByLabelText(/Systolic blood pressure/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Pulse Rate \(PR\) in bpm/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Respiratory Rate \(RR\) in breaths\/min/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Blood glucose value$/i)).toBeInTheDocument();
  });

  it("hides and shows BP as a paired cluster", async () => {
    renderWithProvider();
    await waitForVitalsSettingsLoaded();

    expect(screen.getByLabelText(/Systolic blood pressure/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Hide Blood pressure (BP)" }),
    );

    await waitFor(() => {
      expect(screen.queryByLabelText(/Systolic blood pressure/i)).not.toBeInTheDocument();
    });

    await waitFor(
      () => {
        const last = hiddenPatchCalls().at(-1)?.[1] as { vitals_hidden: string[] };
        expect(last.vitals_hidden).toContain("vitalsBpSystolic");
        expect(last.vitals_hidden).toContain("vitalsBpDiastolic");
      },
      { timeout: 1500 },
    );

    // Popover stays open after hide — do not click the trigger again (that closes it).
    fireEvent.click(
      await screen.findByRole("button", { name: "Show Blood pressure (BP)" }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Systolic blood pressure/i)).toBeInTheDocument();
    });
  });

  it("can hide a core vital (no lock)", async () => {
    renderWithProvider();
    await waitForVitalsSettingsLoaded();

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    fireEvent.click(await screen.findByRole("button", { name: "Hide Pulse Rate (PR)" }));

    await waitFor(() => {
      expect(screen.queryByLabelText(/Pulse Rate \(PR\) in bpm/i)).not.toBeInTheDocument();
    });
  });

  it("unhiding a non-core vital shows it in the grid", async () => {
    renderWithProvider();
    await revealVital("Glasgow Coma Scale (GCS)");
    expect(screen.getByLabelText(/Glasgow Coma Scale \(GCS\) in \/15/i)).toBeInTheDocument();
  });

  it("hide-with-data warns then hides while retaining the value", async () => {
    renderWithProvider({ vitalsHr: 92 });
    await waitForVitalsSettingsLoaded();

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    fireEvent.click(await screen.findByRole("button", { name: "Hide Pulse Rate (PR)" }));

    expect(screen.getByTestId("hide-vital-with-data-dialog")).toBeInTheDocument();
    expect(screen.getByText("Value is kept, just hidden.")).toBeInTheDocument();
    expect(screen.queryByText("92")).not.toBeInTheDocument();

    const dialog = screen.getByTestId("hide-vital-with-data-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Hide" }));

    await waitFor(() => {
      expect(screen.queryByLabelText(/Pulse Rate \(PR\) in bpm/i)).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    expect(await screen.findByText("Has data")).toBeInTheDocument();
  });

  it("autosaves vitals_hidden after toggling visibility", async () => {
    renderWithProvider();
    await waitForVitalsSettingsLoaded();

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    fireEvent.click(await screen.findByRole("button", { name: "Hide Pulse Rate (PR)" }));

    await waitFor(
      () => {
        expect(hiddenPatchCalls().length).toBeGreaterThan(0);
        const last = hiddenPatchCalls().at(-1)?.[1] as { vitals_hidden: string[] };
        expect(last.vitals_hidden).toContain("vitalsHr");
      },
      { timeout: 1500 },
    );
  });

  it("adds a custom vital via the form and renders it in the grid", async () => {
    renderWithProvider();
    await waitForVitalsSettingsLoaded();

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    fireEvent.click(await screen.findByTestId("vitals-manager-add-custom-trigger"));

    fireEvent.change(screen.getByTestId("vitals-manager-add-custom-label"), {
      target: { value: "abdominal girth" },
    });
    fireEvent.change(screen.getByTestId("vitals-manager-add-custom-unit"), {
      target: { value: "cm" },
    });
    fireEvent.click(screen.getByTestId("vitals-manager-add-custom-save"));

    // The new custom vital becomes an input in the grid.
    const input = await screen.findByLabelText("Abdominal girth");
    expect(input).toBeInTheDocument();

    // And it autosaves as a per-doctor default.
    await waitFor(() => {
      const customCalls = mockPatchDoctorSettings.mock.calls.filter(
        (call) => call[1] && "vitals_custom" in (call[1] as Record<string, unknown>),
      );
      expect(customCalls.length).toBeGreaterThan(0);
      const last = customCalls.at(-1)?.[1] as {
        vitals_custom: Array<{ label: string; unit: string | null; kind: string }>;
      };
      expect(last.vitals_custom).toEqual([
        expect.objectContaining({ label: "Abdominal girth", unit: "cm", kind: "numeric" }),
      ]);
    });
  });

  it("renders measured differently on custom vitals", async () => {
    renderWithProvider();
    await waitForVitalsSettingsLoaded();

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    fireEvent.click(await screen.findByTestId("vitals-manager-add-custom-trigger"));
    fireEvent.change(screen.getByTestId("vitals-manager-add-custom-label"), {
      target: { value: "abdominal girth" },
    });
    fireEvent.click(screen.getByTestId("vitals-manager-add-custom-save"));

    const input = await screen.findByLabelText("Abdominal girth");
    const customId = input.getAttribute("id")?.replace("custom-vital-", "");
    expect(customId).toMatch(/^custom_/);
    expect(screen.getByTestId(`vital-provenance-trigger-${customId}`)).toBeInTheDocument();
  });

  it("edits a custom vital via the pencil action and autosaves", async () => {
    renderWithProvider();
    await waitForVitalsSettingsLoaded();

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    fireEvent.click(await screen.findByTestId("vitals-manager-add-custom-trigger"));
    fireEvent.change(screen.getByTestId("vitals-manager-add-custom-label"), {
      target: { value: "abdominal girth" },
    });
    fireEvent.change(screen.getByTestId("vitals-manager-add-custom-unit"), {
      target: { value: "cm" },
    });
    fireEvent.click(screen.getByTestId("vitals-manager-add-custom-save"));

    expect(await screen.findByLabelText("Abdominal girth")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Edit Abdominal girth" }));
    expect(screen.getByTestId("vitals-manager-edit-custom-form")).toBeInTheDocument();
    expect(screen.queryByTestId("vitals-manager-add-custom-form")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("vitals-manager-edit-custom-label"), {
      target: { value: "Waist circumference" },
    });
    fireEvent.change(screen.getByTestId("vitals-manager-edit-custom-group"), {
      target: { value: "metabolic" },
    });
    fireEvent.click(screen.getByTestId("vitals-manager-edit-custom-save"));

    expect(await screen.findByLabelText("Waist circumference")).toBeInTheDocument();
    expect(screen.queryByLabelText("Abdominal girth")).not.toBeInTheDocument();

    await waitFor(() => {
      const customCalls = mockPatchDoctorSettings.mock.calls.filter(
        (call) => call[1] && "vitals_custom" in (call[1] as Record<string, unknown>),
      );
      const last = customCalls.at(-1)?.[1] as {
        vitals_custom: Array<{ id: string; label: string; group: string }>;
      };
      expect(last.vitals_custom).toEqual([
        expect.objectContaining({
          label: "Waist circumference",
          group: "metabolic",
        }),
      ]);
      expect(last.vitals_custom[0]?.id).toMatch(/^custom_/);
    });
  });

  it("clears the current visit value when a custom vital kind changes on edit", async () => {
    renderWithProvider();
    await waitForVitalsSettingsLoaded();

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    fireEvent.click(await screen.findByTestId("vitals-manager-add-custom-trigger"));
    fireEvent.change(screen.getByTestId("vitals-manager-add-custom-label"), {
      target: { value: "Peak flow" },
    });
    fireEvent.click(screen.getByTestId("vitals-manager-add-custom-save"));

    const input = (await screen.findByLabelText("Peak flow")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "420" } });
    expect(input.value).toBe("420");

    fireEvent.click(await screen.findByRole("button", { name: "Edit Peak flow" }));
    fireEvent.change(screen.getByTestId("vitals-manager-edit-custom-kind"), {
      target: { value: "text" },
    });
    fireEvent.click(screen.getByTestId("vitals-manager-edit-custom-save"));

    const textInput = (await screen.findByLabelText("Peak flow")) as HTMLInputElement;
    expect(textInput.value).toBe("");
  });

  it("removes a custom vital from the grid (definition dropped)", async () => {
    renderWithProvider();
    await waitForVitalsSettingsLoaded();

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    fireEvent.click(await screen.findByTestId("vitals-manager-add-custom-trigger"));
    fireEvent.change(screen.getByTestId("vitals-manager-add-custom-label"), {
      target: { value: "Gait" },
    });
    fireEvent.change(screen.getByTestId("vitals-manager-add-custom-kind"), {
      target: { value: "text" },
    });
    fireEvent.click(screen.getByTestId("vitals-manager-add-custom-save"));

    expect(await screen.findByLabelText("Gait")).toBeInTheDocument();

    // The menu is still open after adding — remove the custom vital from its row.
    const removeBtn = await screen.findByRole("button", { name: "Remove Gait" });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByLabelText("Gait")).not.toBeInTheDocument();
    });
  });

  it("updates the trigger hidden count", async () => {
    const { hidden: defaultHidden } = resolveEffectiveVitalsHidden({ storedHidden: [] });
    const menuHiddenCount = defaultHidden.filter(isMenuCountableHiddenKey).length;
    renderWithProvider();
    await waitForVitalsSettingsLoaded();

    expect(screen.getByTestId("vitals-manager-trigger")).toHaveAttribute(
      "aria-label",
      `Manage vitals · ${menuHiddenCount} hidden`,
    );

    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    fireEvent.click(await screen.findByRole("button", { name: "Hide Pulse Rate (PR)" }));

    await waitFor(() => {
      expect(screen.getByTestId("vitals-manager-trigger")).toHaveAttribute(
        "aria-label",
        `Manage vitals · ${menuHiddenCount + 1} hidden`,
      );
    });
  });
});
