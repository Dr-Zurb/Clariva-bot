import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { listPatientVitals } from "@/lib/api/patient-chart";
import type { Appointment } from "@/types/appointment";
import type { PatientVitalsReading } from "@/types/patient-chart";
import SnapshotPane from "../SnapshotPane";
import { mergeSnapshotVitals } from "../snapshot-vitals-merge";

vi.mock("@/lib/api/patient-chart", () => ({
  listPatientVitals: vi.fn(),
}));

vi.mock("@/components/ehr/sections/AllergiesSection", () => ({
  default: () => <div data-testid="allergies-stub" />,
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

const prescriptionIdRef = { current: null as string | null };

const appointment: Appointment = {
  id: "appt-1",
  patient_id: "pat-1",
} as Appointment;

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
    height_cm: null,
    bmi: null,
    note: null,
    recorded_at: "2026-01-01T00:00:00.000Z",
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function mockVitalsList(vitals: PatientVitalsReading[]) {
  vi.mocked(listPatientVitals).mockResolvedValue({
    data: { vitals },
  } as Awaited<ReturnType<typeof listPatientVitals>>);
}

function renderSnapshotPane(
  ui: ReactElement,
  draft?: Partial<RxFormFields>,
) {
  if (draft === undefined) {
    return render(ui);
  }
  return render(
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="test-token"
      entryMode="structured"
      initialFields={{ ...createEmptyRxFormFields(), ...draft }}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      {ui}
    </RxFormProvider>,
  );
}

describe("mergeSnapshotVitals", () => {
  it("marks draft-only height as draft-sourced", () => {
    const { displayed, isDraft } = mergeSnapshotVitals(
      makeVitals({ height_cm: 170, weight_kg: 65 }),
      { ...createEmptyRxFormFields(), vitalsHtCm: 172, vitalsWtKg: null },
    );
    expect(displayed.heightCm).toBe("172.0");
    expect(isDraft.heightCm).toBe(true);
    expect(isDraft.weightKg).toBe(false);
  });

  it("hides draft badge when draft matches persisted", () => {
    const { isDraft } = mergeSnapshotVitals(
      makeVitals({ height_cm: 172 }),
      { ...createEmptyRxFormFields(), vitalsHtCm: 172 },
    );
    expect(isDraft.heightCm).toBe(false);
  });
});

describe("SnapshotPane live draft vitals (ccd-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVitalsList([]);
  });

  it("shows persisted patient_chart values when no draft", async () => {
    mockVitalsList([
      makeVitals({ height_cm: 170, weight_kg: 65 }),
    ]);
    renderSnapshotPane(
      <SnapshotPane appointment={appointment} token="test-token" hideHeader />,
    );
    expect(await screen.findByText("170.0")).toBeInTheDocument();
    expect(screen.getByText("65.0")).toBeInTheDocument();
    expect(screen.queryByText("Live draft")).not.toBeInTheDocument();
  });

  it("merges draft values and shows Live draft badge", async () => {
    mockVitalsList([
      makeVitals({ height_cm: 170, weight_kg: 65 }),
    ]);
    renderSnapshotPane(
      <SnapshotPane appointment={appointment} token="test-token" hideHeader />,
      { vitalsHtCm: 172 },
    );
    expect(await screen.findByText("172.0")).toBeInTheDocument();
    expect(screen.getByText("65.0")).toBeInTheDocument();
    const badges = screen.getAllByText("Live draft");
    expect(badges.length).toBe(1);
  });

  it("renders empty-state when no data anywhere", async () => {
    mockVitalsList([]);
    renderSnapshotPane(
      <SnapshotPane appointment={appointment} token="test-token" hideHeader />,
    );
    expect(await screen.findByText("No vitals on file")).toBeInTheDocument();
  });

  it("badge disappears after persistence (draft === persisted)", async () => {
    mockVitalsList([makeVitals({ height_cm: 172 })]);
    renderSnapshotPane(
      <SnapshotPane appointment={appointment} token="test-token" hideHeader />,
      { vitalsHtCm: 172 },
    );
    await waitFor(() => {
      expect(screen.getByText("172.0")).toBeInTheDocument();
    });
    expect(screen.queryByText("Live draft")).not.toBeInTheDocument();
  });
});
