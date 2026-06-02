/**
 * rxd-03 — PlanSection active-row tracking (one editor at a time).
 * rxs-03 — Plan-pane keyboard shortcuts.
 * rxf-06 — Favorites chip strip wire-up in PlanSection.
 */

import { useCallback, useRef, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type RxFormFields,
  type RxMedicine,
} from "@/components/cockpit/rx/RxFormContext";
import { PlanSection } from "@/components/cockpit/rx/sections/PlanSection";
import * as cockpitTelemetry from "@/lib/patient-profile/telemetry";
import type { DoctorDrugFavorite } from "@/lib/api/doctor-drug-favorites";

const mockRefetchFavorites = vi.fn().mockResolvedValue([]);
const mockOpenSideSheet = vi.fn();
const mockCreateFavorite = vi.fn();

let mockFavorites: DoctorDrugFavorite[] = [];

vi.mock("@/hooks/useFavorites", () => ({
  useFavorites: () => ({
    data: mockFavorites,
    isLoading: false,
    refetch: mockRefetchFavorites,
  }),
}));

vi.mock("@/lib/api/doctor-drug-favorites", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/doctor-drug-favorites")>();
  return {
    ...actual,
    createFavorite: (...args: unknown[]) => mockCreateFavorite(...args),
  };
});

vi.mock("@/components/patient-profile/SideSheetHost", () => ({
  useSideSheet: () => ({
    open: mockOpenSideSheet,
    close: vi.fn(),
    register: vi.fn(() => () => undefined),
    isOpen: vi.fn(() => false),
  }),
}));

vi.mock("@/lib/patient-profile/telemetry", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/patient-profile/telemetry")>();
  return {
    ...actual,
    trackCockpitV2RRxPolishShortcutUsed: vi.fn(),
    trackCockpitV2RRxPolishFavoriteApplied: vi.fn(),
  };
});

vi.mock("@/components/ehr/DrugAutocomplete", () => ({
  default: ({
    inputId,
    value,
    placeholder,
  }: {
    inputId?: string;
    value: string;
    placeholder?: string;
  }) => (
    <input
      id={inputId}
      aria-label={placeholder ?? "Medicine name"}
      value={value}
      readOnly
      onChange={() => undefined}
    />
  ),
}));

const prescriptionIdRef = { current: null as string | null };

function completeMedicine(name: string): RxMedicine {
  return {
    medicineName: name,
    dosage: "500mg",
    route: "",
    frequency: "Three times daily",
    duration: "5 days",
    instructions: "",
    drugMasterId: null,
    frequencyCode: "TID",
    durationValue: 5,
    durationUnit: "days",
    routeCode: null,
  };
}

function isRowInEditorMode(index: number): boolean {
  return document.getElementById(`med-dosage-${index}`) !== null;
}

function isRowInSummaryMode(index: number): boolean {
  return (
    screen.queryByRole("button", {
      name: `Medicine row ${index + 1} — tap to edit`,
    }) !== null
  );
}

function PlanSectionHarness({
  initialFields,
  initialInstanceIds,
  disabled = false,
  onSendAndFinish,
  canSend = false,
}: {
  initialFields: RxFormFields;
  initialInstanceIds: string[];
  disabled?: boolean;
  onSendAndFinish?: () => void;
  canSend?: boolean;
}) {
  const [medicineInstanceIds, setMedicineInstanceIds] =
    useState(initialInstanceIds);
  const nextIdRef = useRef(initialInstanceIds.length);
  const generateInstanceIds = useCallback((count: number) => {
    return Array.from({ length: count }, () => {
      nextIdRef.current += 1;
      return `instance-${nextIdRef.current}`;
    });
  }, []);

  return (
    <div data-cockpit-pane-id="plan">
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
        <PlanSection
          heading={null}
          disabled={disabled}
          safetyLifted
          token="test-token"
          medicineInstanceIds={medicineInstanceIds}
          setMedicineInstanceIds={setMedicineInstanceIds}
          generateInstanceIds={generateInstanceIds}
          drugMasterIndex={new Map()}
          setDrugMasterIndex={() => {}}
          allergies={[]}
          ddiInteractions={[]}
          isAcked={() => false}
          onAcknowledge={() => {}}
          onAckDdi={() => {}}
          onSendAndFinish={onSendAndFinish}
          canSend={canSend}
        />
      </RxFormProvider>
    </div>
  );
}

function renderPlanSection(
  medicines: RxMedicine[],
  instanceIds: string[],
  options: {
    disabled?: boolean;
    onSendAndFinish?: () => void;
    canSend?: boolean;
  } = {},
) {
  const initialFields = {
    ...createEmptyRxFormFields(medicines),
    medicines,
  };
  return render(
    <PlanSectionHarness
      initialFields={initialFields}
      initialInstanceIds={instanceIds}
      disabled={options.disabled}
      onSendAndFinish={options.onSendAndFinish}
      canSend={options.canSend}
    />,
  );
}

function fireDocumentKey(
  key: string,
  opts: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean } = {},
): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      metaKey: opts.metaKey ?? false,
      ctrlKey: opts.ctrlKey ?? false,
      shiftKey: opts.shiftKey ?? false,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function modKey(opts: { shiftKey?: boolean } = {}): {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
} {
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform);
  return isMac
    ? { metaKey: true, shiftKey: opts.shiftKey }
    : { ctrlKey: true, shiftKey: opts.shiftKey };
}

function makeFavorite(
  overrides: Partial<DoctorDrugFavorite> = {},
): DoctorDrugFavorite {
  return {
    id: "fav-pcm",
    name: "PCM fever",
    template: completeMedicine("Paracetamol"),
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("PlanSection favorites chip strip (rxf-06)", () => {
  beforeEach(() => {
    mockFavorites = [];
    mockRefetchFavorites.mockClear();
    mockOpenSideSheet.mockClear();
    mockCreateFavorite.mockReset();
    mockCreateFavorite.mockResolvedValue(makeFavorite());
    vi.spyOn(window, "prompt").mockImplementation(() => "PCM fever");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts the chip strip above the medicine list", () => {
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    const strip = screen.getByTestId("favorites-chip-strip");
    const medicinesSection = document.getElementById("medicines-section");
    expect(medicinesSection).toContainElement(strip);

    const rowSummary = screen.getByRole("button", {
      name: "Medicine row 1 — tap to edit",
    });
    expect(
      strip.compareDocumentPosition(rowSummary) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("appends a pre-filled row and makes it the active editor when a chip is tapped", () => {
    mockFavorites = [makeFavorite()];
    renderPlanSection([completeMedicine("Ibuprofen")], ["instance-a"]);

    fireEvent.click(
      screen.getByRole("button", { name: "Apply favorite PCM fever" }),
    );

    expect(isRowInSummaryMode(0)).toBe(true);
    expect(isRowInEditorMode(1)).toBe(true);
    expect(screen.getByDisplayValue("Paracetamol")).toBeInTheDocument();
    expect(cockpitTelemetry.trackCockpitV2RRxPolishFavoriteApplied).toHaveBeenCalledWith({
      favoriteId: "fav-pcm",
      fromCount: 1,
    });
  });

  it("saves the active complete row as a favorite and refetches chips", async () => {
    mockFavorites = [makeFavorite()];
    renderPlanSection([completeMedicine("Paracetamol")], ["instance-a"]);

    fireEvent.click(
      screen.getByRole("button", { name: "Medicine row 1 — tap to edit" }),
    );
    expect(isRowInEditorMode(0)).toBe(true);

    fireEvent.click(screen.getByTestId("favorites-save-current"));

    await waitFor(() => {
      expect(mockCreateFavorite).toHaveBeenCalledWith("test-token", {
        name: "PCM fever",
        template: expect.objectContaining({ medicineName: "Paracetamol" }),
      });
    });
    expect(mockRefetchFavorites).toHaveBeenCalled();
  });

  it("opens the favorites side sheet from Manage", () => {
    renderPlanSection([completeMedicine("Paracetamol")], ["instance-a"]);

    fireEvent.click(screen.getByTestId("favorites-manage"));
    expect(mockOpenSideSheet).toHaveBeenCalledWith("rx-favorites");
  });

  it("shows the cold-start hint when there are zero favorites", () => {
    mockFavorites = [];
    renderPlanSection([completeMedicine("Paracetamol")], ["instance-a"]);

    expect(
      screen.getByText(/Save medicines you prescribe often as one-tap chips/),
    ).toBeInTheDocument();
  });
});

describe("PlanSection active-row tracking", () => {
  it("keeps one editor at a time when tapping another row summary", () => {
    renderPlanSection(
      [completeMedicine("Paracetamol"), completeMedicine("Ibuprofen")],
      ["instance-a", "instance-b"],
    );

    expect(isRowInSummaryMode(0)).toBe(true);
    expect(isRowInSummaryMode(1)).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Medicine row 1 — tap to edit" }),
    );
    expect(isRowInEditorMode(0)).toBe(true);
    expect(isRowInSummaryMode(1)).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Medicine row 2 — tap to edit" }),
    );
    expect(isRowInSummaryMode(0)).toBe(true);
    expect(isRowInEditorMode(1)).toBe(true);
  });

  it("does not collapse an incomplete row when a sibling is activated", () => {
    renderPlanSection(
      [
        {
          ...completeMedicine("Draft"),
          dosage: "",
          frequency: "",
          duration: "",
          frequencyCode: null,
          durationValue: null,
          durationUnit: null,
        },
        completeMedicine("Paracetamol"),
      ],
      ["instance-a", "instance-b"],
    );

    expect(isRowInEditorMode(0)).toBe(true);
    expect(isRowInSummaryMode(1)).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Medicine row 2 — tap to edit" }),
    );

    expect(isRowInEditorMode(0)).toBe(true);
    expect(isRowInEditorMode(1)).toBe(true);
  });

  it("starts a newly added row as the active editor", () => {
    renderPlanSection([completeMedicine("Paracetamol")], ["instance-a"]);

    fireEvent.click(screen.getByRole("button", { name: "+ Add medicine" }));

    expect(isRowInSummaryMode(0)).toBe(true);
    expect(isRowInEditorMode(1)).toBe(true);
  });

  it("clears the active row when the active row is deleted", () => {
    renderPlanSection(
      [completeMedicine("Paracetamol"), completeMedicine("Ibuprofen")],
      ["instance-a", "instance-b"],
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Medicine row 2 — tap to edit" }),
    );
    expect(isRowInEditorMode(1)).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove medicine 2" }),
    );

    expect(isRowInSummaryMode(0)).toBe(true);
    expect(screen.queryByRole("button", { name: /Medicine row 2/i })).toBeNull();
  });

  it("keeps the same active instance id after deleting a row before it", () => {
    renderPlanSection(
      [
        completeMedicine("Aspirin"),
        completeMedicine("Paracetamol"),
        completeMedicine("Ibuprofen"),
      ],
      ["instance-a", "instance-b", "instance-c"],
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Medicine row 3 — tap to edit" }),
    );
    expect(isRowInEditorMode(2)).toBe(true);

    const rowOneSummary = screen.getByRole("button", {
      name: "Medicine row 1 — tap to edit",
    });
    fireEvent.click(
      within(rowOneSummary).getByRole("button", { name: "Delete medicine row" }),
    );

    expect(isRowInEditorMode(1)).toBe(true);
    expect(screen.getByDisplayValue("Ibuprofen")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Aspirin")).not.toBeInTheDocument();
  });

  it("moves focus between summary rows with ArrowDown and ArrowUp", () => {
    renderPlanSection(
      [completeMedicine("Paracetamol"), completeMedicine("Ibuprofen")],
      ["instance-a", "instance-b"],
    );

    const firstSummary = screen.getByRole("button", {
      name: "Medicine row 1 — tap to edit",
    });
    const secondSummary = screen.getByRole("button", {
      name: "Medicine row 2 — tap to edit",
    });
    const list = firstSummary.parentElement as HTMLElement;

    firstSummary.focus();
    expect(document.activeElement).toBe(firstSummary);

    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(document.activeElement).toBe(secondSummary);

    fireEvent.keyDown(list, { key: "ArrowUp" });
    expect(document.activeElement).toBe(firstSummary);
  });
});

describe("PlanSection densification telemetry (rxd-04)", () => {
  beforeEach(() => {
    window.__cockpitV2RRxPolishDensificationLanded = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fires densification telemetry once when summary rows are visible", () => {
    const spy = vi.spyOn(
      cockpitTelemetry,
      "trackCockpitV2RRxPolishDensificationLanded",
    );
    renderPlanSection(
      [completeMedicine("Paracetamol"), completeMedicine("Ibuprofen")],
      ["instance-a", "instance-b"],
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      appointmentId: "appt-1",
      completedRowsCount: 2,
      editorRowsCount: 0,
    });
    spy.mockRestore();
  });

  it("does not fire when no rows are complete", () => {
    const spy = vi.spyOn(
      cockpitTelemetry,
      "trackCockpitV2RRxPolishDensificationLanded",
    );
    renderPlanSection(
      [
        {
          ...completeMedicine("Draft"),
          dosage: "",
          frequency: "",
          duration: "",
          frequencyCode: null,
          durationValue: null,
          durationUnit: null,
        },
      ],
      ["instance-a"],
    );

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("PlanSection keyboard shortcuts (rxs-03)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("Cmd/Ctrl+M adds a medicine row when focus is inside the plan pane", async () => {
    renderPlanSection([completeMedicine("Paracetamol")], ["instance-a"]);

    const addButton = screen.getByRole("button", { name: /\+ Add medicine/i });
    addButton.focus();

    fireDocumentKey("m", modKey());

    expect(cockpitTelemetry.trackCockpitV2RRxPolishShortcutUsed).toHaveBeenCalledWith(
      {
        combo: "mod+m",
        action: "add-medicine",
      },
    );
    await waitFor(() => {
      expect(document.getElementById("med-dosage-1")).toBeInTheDocument();
    });
  });

  it("Cmd/Ctrl+Enter from textarea does not send when canSend is true", () => {
    const onSendAndFinish = vi.fn();
    renderPlanSection([completeMedicine("Paracetamol")], ["instance-a"], {
      onSendAndFinish,
      canSend: true,
    });

    const advice = screen.getByLabelText(/advice \/ lifestyle/i);
    advice.focus();

    fireDocumentKey("Enter", modKey());

    expect(onSendAndFinish).not.toHaveBeenCalled();
  });

  it("Cmd/Ctrl+Shift+Enter from textarea sends when canSend is true", () => {
    const onSendAndFinish = vi.fn();
    renderPlanSection([completeMedicine("Paracetamol")], ["instance-a"], {
      onSendAndFinish,
      canSend: true,
    });

    const advice = screen.getByLabelText(/advice \/ lifestyle/i);
    advice.focus();

    fireDocumentKey("Enter", modKey({ shiftKey: true }));

    expect(onSendAndFinish).toHaveBeenCalledTimes(1);
  });
});
