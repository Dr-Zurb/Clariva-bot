import { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { listPrescriptionsByPatient } from "@/lib/api";
import { listPatientVitals } from "@/lib/api/patient-chart";
import type { Appointment } from "@/types/appointment";
import type { PatientVitalsReading } from "@/types/patient-chart";
import HistoryPane from "../HistoryPane";
import SnapshotPane from "../SnapshotPane";

vi.mock("@/lib/api/patient-chart", () => ({
  listPatientVitals: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  listPrescriptionsByPatient: vi.fn(),
}));

vi.mock("@/components/patient-profile/SideSheetHost", () => ({
  useSideSheet: () => ({ open: vi.fn() }),
}));

vi.mock("@/components/ehr/sections/AllergiesSection", () => ({
  default: function AllergiesSectionMock({
    onCountChange,
  }: {
    onCountChange?: (n: number) => void;
  }) {
    useEffect(() => {
      onCountChange?.(1);
    }, [onCountChange]);
    return <div>Penicillin</div>;
  },
}));

vi.mock("@/components/ehr/sections/ChronicConditionsSection", () => ({
  default: () => <div data-testid="chronic-stub" />,
}));
vi.mock("@/components/ehr/sections/ProblemListSection", () => ({
  default: () => <div data-testid="problems-stub" />,
}));
vi.mock("@/components/ehr/sections/PreviousRxSection", () => ({
  default: () => <div data-testid="rx-stub" />,
}));

const appointment: Appointment = {
  id: "appt-1",
  patient_id: "pat-1",
} as Appointment;

const prescriptionIdRef = { current: null as string | null };

function makeVitals(
  overrides: Partial<PatientVitalsReading> = {},
): PatientVitalsReading {
  return {
    id: "vital-1",
    doctor_id: "doc-1",
    patient_id: "pat-1",
    appointment_id: null,
    bp_systolic: null,
    bp_diastolic: null,
    heart_rate: null,
    temperature_c: null,
    spo2: null,
    weight_kg: null,
    height_cm: 172,
    bmi: null,
    note: null,
    recorded_at: "2026-01-01T00:00:00.000Z",
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Chart-rail disclosure (ccd-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPatientVitals).mockResolvedValue({
      data: { vitals: [makeVitals()] },
    } as Awaited<ReturnType<typeof listPatientVitals>>);
    vi.mocked(listPrescriptionsByPatient).mockResolvedValue({
      data: { prescriptions: [] },
    } as Awaited<ReturnType<typeof listPrescriptionsByPatient>>);
  });

  it("SnapshotPane chevron toggles between expanded and summary", async () => {
    render(
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={createEmptyRxFormFields()}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <SnapshotPane appointment={appointment} token="test-token" />
      </RxFormProvider>,
    );

    expect(await screen.findByText("Height")).toBeInTheDocument();
    expect(screen.getByText("172.0")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Collapse Snapshot"));

    expect(screen.queryByText("172.0")).not.toBeInTheDocument();
    expect(screen.getByText(/172cm/)).toBeInTheDocument();
  });

  it("SnapshotPane allergy card chevron toggles", async () => {
    render(
      <SnapshotPane appointment={appointment} token="test-token" hideHeader />,
    );

    expect(await screen.findByText("Penicillin")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Collapse Allergies"));
    expect(screen.queryByText("Penicillin")).not.toBeInTheDocument();
    expect(screen.getByText(/1 allergy/)).toBeInTheDocument();
  });

  it("aria-expanded reflects state on SnapshotPane chevron", async () => {
    render(<SnapshotPane appointment={appointment} token="test-token" />);

    const chevron = await screen.findByLabelText("Collapse Snapshot");
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(chevron);
    expect(screen.getByLabelText("Expand Snapshot")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("HistoryPane chevron toggles between expanded list and summary", async () => {
    vi.mocked(listPrescriptionsByPatient).mockResolvedValue({
      data: {
        prescriptions: [
          {
            id: "rx-1",
            created_at: "2026-03-12T10:00:00.000Z",
            cc: "Fever",
            provisional_diagnosis: "Viral",
            prescription_medicines: [{ id: "m1" }],
          },
        ],
      },
    } as Awaited<ReturnType<typeof listPrescriptionsByPatient>>);

    render(<HistoryPane appointment={appointment} token="test-token" />);

    expect(await screen.findByText("Fever")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Collapse History"));
    await waitFor(() => {
      expect(screen.queryByText("Fever")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Last visit:/)).toBeInTheDocument();
  });
});
