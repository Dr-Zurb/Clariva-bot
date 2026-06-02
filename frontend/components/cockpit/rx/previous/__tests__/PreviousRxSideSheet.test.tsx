/**
 * PreviousRxSideSheet — unit tests (rxss-02).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import PreviousRxSideSheet from "@/components/cockpit/rx/previous/PreviousRxSideSheet";
import type { PrescriptionWithRelations } from "@/types/prescription";

const mockUsePriorRxList = vi.fn();
const mockFixedSizeList = vi.fn(
  ({
    itemCount,
    children,
  }: {
    itemCount: number;
    children: (props: { index: number; style: React.CSSProperties }) => React.ReactNode;
  }) => (
    <div data-testid="prior-rx-virtual-list" data-item-count={itemCount}>
      {Array.from({ length: itemCount }, (_, index) =>
        children({ index, style: {} }),
      )}
    </div>
  ),
);

vi.mock("@/hooks/usePriorRxList", () => ({
  usePriorRxList: (...args: unknown[]) => mockUsePriorRxList(...args),
}));

vi.mock("react-window", () => ({
  FixedSizeList: (props: {
    itemCount: number;
    children: (props: { index: number; style: React.CSSProperties }) => React.ReactNode;
  }) => mockFixedSizeList(props),
}));

vi.mock("@/lib/patient-profile/telemetry", () => ({
  trackCockpitV2RRxPolishSideSheetOpened: vi.fn(),
  trackCockpitV2RRxPolishSideSheetFilterChanged: vi.fn(),
}));

import * as cockpitTelemetry from "@/lib/patient-profile/telemetry";

function makeRx(
  overrides: Partial<PrescriptionWithRelations> & Pick<PrescriptionWithRelations, "id">,
): PrescriptionWithRelations {
  return {
    appointment_id: "appt-1",
    patient_id: "patient-1",
    doctor_id: "doctor-1",
    type: "structured",
    cc: null,
    hopi: null,
    provisional_diagnosis: "Hypertension",
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
    sent_to_patient_at: null,
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-01T10:00:00.000Z",
    prescription_medicines: [
      {
        id: "med-1",
        prescription_id: overrides.id,
        medicine_name: "Amlodipine",
        dosage: "5mg",
        route: null,
        frequency: null,
        duration: null,
        instructions: null,
        sort_order: 0,
        created_at: "2026-05-01T10:00:00.000Z",
        drug_master_id: null,
        frequency_code: null,
        duration_value: null,
        duration_unit: null,
        route_code: null,
      },
    ],
    ...overrides,
  };
}

const defaultProps = {
  appointmentId: "appt-1",
  patientId: "patient-1",
  token: "token-1",
  currentDx: "",
  activeConditions: [] as string[],
  currentMedicines: [],
  onConfirmApply: vi.fn(),
};

describe("PreviousRxSideSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePriorRxList.mockReturnValue({
      all: [],
      filtered: [],
      isLoading: false,
      error: undefined,
      reload: vi.fn(),
    });
  });

  it("renders header with counts", () => {
    mockUsePriorRxList.mockReturnValue({
      all: [makeRx({ id: "rx-1" }), makeRx({ id: "rx-2" })],
      filtered: [makeRx({ id: "rx-1" })],
      isLoading: false,
      error: undefined,
      reload: vi.fn(),
    });

    render(<PreviousRxSideSheet {...defaultProps} />);

    expect(screen.getByRole("heading", { name: "Previous prescriptions" })).toBeInTheDocument();
    expect(screen.getByText("2 total · 1 shown")).toBeInTheDocument();
  });

  it("renders chips with disabled state for empty Dx / conditions", () => {
    render(<PreviousRxSideSheet {...defaultProps} />);

    expect(screen.getByRole("button", { name: "All" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Last 30 days" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Same diagnosis" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Active condition" })).toBeDisabled();
  });

  it("enables same-diagnosis and active-condition chips when context is present", () => {
    render(
      <PreviousRxSideSheet
        {...defaultProps}
        currentDx="URI"
        activeConditions={["Asthma"]}
      />,
    );

    expect(screen.getByRole("button", { name: "Same diagnosis" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Active condition" })).toBeEnabled();
  });

  it("passes search value to the hook", () => {
    render(<PreviousRxSideSheet {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Search by medicine name"), {
      target: { value: "amox" },
    });

    expect(mockUsePriorRxList).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "amox" }),
    );
  });

  it("shows skeleton during load", () => {
    mockUsePriorRxList.mockReturnValue({
      all: [],
      filtered: [],
      isLoading: true,
      error: undefined,
      reload: vi.fn(),
    });

    render(<PreviousRxSideSheet {...defaultProps} />);

    expect(screen.getByTestId("prior-rx-skeleton")).toBeInTheDocument();
  });

  it("shows empty state when filtered list is empty", () => {
    mockUsePriorRxList.mockReturnValue({
      all: [],
      filtered: [],
      isLoading: false,
      error: undefined,
      reload: vi.fn(),
    });

    render(<PreviousRxSideSheet {...defaultProps} />);

    expect(screen.getByText("No prior prescriptions")).toBeInTheDocument();
  });

  it("shows no matches when filters exclude all rows", () => {
    mockUsePriorRxList.mockReturnValue({
      all: [makeRx({ id: "rx-1" })],
      filtered: [],
      isLoading: false,
      error: undefined,
      reload: vi.fn(),
    });

    render(<PreviousRxSideSheet {...defaultProps} />);

    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("engages virtual scroll when more than 20 rows", () => {
    const rxes = Array.from({ length: 21 }, (_, i) =>
      makeRx({ id: `rx-${i}`, created_at: `2026-05-${String(i + 1).padStart(2, "0")}T10:00:00.000Z` }),
    );

    mockUsePriorRxList.mockReturnValue({
      all: rxes,
      filtered: rxes,
      isLoading: false,
      error: undefined,
      reload: vi.fn(),
    });

    render(<PreviousRxSideSheet {...defaultProps} />);

    expect(screen.getByTestId("prior-rx-virtual-list")).toBeInTheDocument();
    expect(mockFixedSizeList).toHaveBeenCalledWith(
      expect.objectContaining({ itemCount: 21 }),
    );
  });

  it("renders non-virtual list at 20 rows or fewer", () => {
    const rxes = Array.from({ length: 3 }, (_, i) => makeRx({ id: `rx-${i}` }));

    mockUsePriorRxList.mockReturnValue({
      all: rxes,
      filtered: rxes,
      isLoading: false,
      error: undefined,
      reload: vi.fn(),
    });

    render(<PreviousRxSideSheet {...defaultProps} />);

    expect(screen.queryByTestId("prior-rx-virtual-list")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Apply prescription from/i })).toHaveLength(3);
  });

  it("opens apply preview overlay when Apply is clicked", () => {
    const rx = makeRx({ id: "rx-1" });
    mockUsePriorRxList.mockReturnValue({
      all: [rx],
      filtered: [rx],
      isLoading: false,
      error: undefined,
      reload: vi.fn(),
    });

    render(<PreviousRxSideSheet {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Apply prescription from/i }));

    expect(screen.getByTestId("prior-rx-apply-preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Apply" })).toBeInTheDocument();
  });

  it("calls onConfirmApply with final medicines in append mode", () => {
    const onConfirmApply = vi.fn();
    const rx = makeRx({ id: "rx-prior" });
    mockUsePriorRxList.mockReturnValue({
      all: [rx],
      filtered: [rx],
      isLoading: false,
      error: undefined,
      reload: vi.fn(),
    });

    render(
      <PreviousRxSideSheet
        {...defaultProps}
        currentMedicines={[
          {
            medicineName: "Existing",
            dosage: "1mg",
            route: "",
            frequency: "",
            duration: "",
            instructions: "",
            drugMasterId: null,
            frequencyCode: null,
            durationValue: null,
            durationUnit: null,
            routeCode: null,
          },
        ]}
        onConfirmApply={onConfirmApply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Apply prescription from/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Apply" }));

    expect(onConfirmApply).toHaveBeenCalledWith(
      expect.objectContaining({
        priorRx: rx,
        mode: "append",
        final: expect.arrayContaining([
          expect.objectContaining({ medicineName: "Existing" }),
          expect.objectContaining({ medicineName: "Amlodipine" }),
        ]),
      }),
    );
  });

  it("fires opened telemetry once after load completes", () => {
    mockUsePriorRxList.mockReturnValue({
      all: [makeRx({ id: "rx-1" }), makeRx({ id: "rx-2" })],
      filtered: [makeRx({ id: "rx-1" }), makeRx({ id: "rx-2" })],
      isLoading: false,
      error: undefined,
      reload: vi.fn(),
    });

    render(<PreviousRxSideSheet {...defaultProps} />);

    expect(cockpitTelemetry.trackCockpitV2RRxPolishSideSheetOpened).toHaveBeenCalledTimes(1);
    expect(cockpitTelemetry.trackCockpitV2RRxPolishSideSheetOpened).toHaveBeenCalledWith({
      priorRxCount: 2,
    });
  });

  it("fires filter-changed telemetry on chip and search interactions", () => {
    mockUsePriorRxList.mockReturnValue({
      all: [makeRx({ id: "rx-1" })],
      filtered: [makeRx({ id: "rx-1" })],
      isLoading: false,
      error: undefined,
      reload: vi.fn(),
    });

    render(<PreviousRxSideSheet {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Last 30 days" }));
    fireEvent.change(screen.getByLabelText("Search by medicine name"), {
      target: { value: "amox" },
    });

    expect(cockpitTelemetry.trackCockpitV2RRxPolishSideSheetFilterChanged).toHaveBeenCalledWith({
      chip: "last-30-days",
      hasSearch: false,
    });
    expect(cockpitTelemetry.trackCockpitV2RRxPolishSideSheetFilterChanged).toHaveBeenCalledWith({
      chip: "last-30-days",
      hasSearch: true,
    });
  });
});
