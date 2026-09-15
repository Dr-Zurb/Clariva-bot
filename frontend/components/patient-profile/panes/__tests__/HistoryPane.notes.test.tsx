import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPrescriptionsByPatient } from "@/lib/api";
import type { Appointment } from "@/types/appointment";
import type { PrescriptionWithRelations } from "@/types/prescription";
import HistoryPane from "../HistoryPane";

const { listMock, createMock, updateMock, openSheet } = vi.hoisted(() => ({
  listMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  openSheet: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  listPrescriptionsByPatient: listMock,
  getPrescriptionsForPatient: listMock,
  createPrescription: createMock,
  updatePrescription: updateMock,
}));

vi.mock("@/components/patient-profile/SideSheetHost", () => ({
  useSideSheet: () => ({ open: openSheet }),
}));

const appointment: Appointment = {
  id: "appt-today",
  patient_id: "pat-1",
} as Appointment;

function renderPane() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HistoryPane appointment={appointment} token="tok" />
    </QueryClientProvider>,
  );
}

function note(
  overrides: Partial<PrescriptionWithRelations> = {},
): PrescriptionWithRelations {
  return {
    id: "rx-1",
    appointment_id: "appt-today",
    patient_id: "pat-1",
    doctor_id: "doc-1",
    type: "structured",
    cc: "Fever",
    hopi: null,
    provisional_diagnosis: "Viral",
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
    sent_to_patient_at: null,
    created_at: "2026-09-09T04:45:00.000Z",
    updated_at: "2026-09-09T04:45:00.000Z",
    prescription_medicines: [{ id: "m1" }],
    ...overrides,
  } as PrescriptionWithRelations;
}

function listResponse(prescriptions: PrescriptionWithRelations[]) {
  return {
    data: { prescriptions },
  } as Awaited<ReturnType<typeof listPrescriptionsByPatient>>;
}

describe("HistoryPane notes (rxl-09 / rxl-28)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders one closed card for a single-note visit", async () => {
    listMock.mockResolvedValue(
      listResponse([
        note({
          attested_at: "2026-03-12T10:00:00.000Z",
          created_at: "2026-03-12T10:00:00.000Z",
        }),
      ]),
    );

    renderPane();

    expect(await screen.findByText("Fever")).toBeInTheDocument();
    expect(screen.getByTestId("history-note-state-rx-1")).toHaveTextContent(
      "Closed",
    );
    expect(screen.queryByText(/Same visit/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("history-visit-group-appt-today")).not.toBeInTheDocument();
  });

  it("lists two dated rows for notes that share an appointment", async () => {
    listMock.mockResolvedValue(
      listResponse([
        note({
          id: "rx-v2",
          version: 2,
          issued_at: "2026-09-09T13:10:00.000Z",
          attested_at: "2026-09-09T13:10:00.000Z",
          created_at: "2026-09-09T13:10:00.000Z",
          supersedes_id: "rx-v1",
          cc: "Fever — revised",
        }),
        note({
          id: "rx-v1",
          version: 1,
          issued_at: "2026-09-09T04:45:00.000Z",
          attested_at: "2026-09-09T04:45:00.000Z",
          superseded_by_id: "rx-v2",
        }),
      ]),
    );

    renderPane();

    expect(await screen.findByText("Same visit · 2 notes")).toBeInTheDocument();
    expect(screen.getByTestId("history-visit-card-rx-v2")).toBeInTheDocument();
    expect(screen.getByTestId("history-visit-card-rx-v1")).toBeInTheDocument();
    expect(screen.getByTestId("history-note-version-rx-v2")).toHaveTextContent(
      "Version 2",
    );
    expect(screen.getByTestId("history-note-version-rx-v1")).toHaveTextContent(
      "Version 1",
    );
    expect(screen.getByTestId("history-note-state-rx-v2")).toHaveTextContent(
      "Closed",
    );
    expect(screen.getByTestId("history-note-state-rx-v1")).toHaveTextContent(
      "Superseded",
    );
  });

  it("marks an unattested note as Draft", async () => {
    listMock.mockResolvedValue(listResponse([note({ attested_at: null })]));

    renderPane();

    expect(await screen.findByTestId("history-note-state-rx-1")).toHaveTextContent(
      "Draft",
    );
  });

  it("opens a note read-only without writing or adopting", async () => {
    listMock.mockResolvedValue(
      listResponse([
        note({
          id: "rx-v1",
          version: 1,
          attested_at: "2026-09-09T04:45:00.000Z",
          superseded_by_id: "rx-v2",
        }),
      ]),
    );

    renderPane();
    fireEvent.click(
      await screen.findByRole("button", { name: /Open visit from/ }),
    );

    await waitFor(() => {
      expect(openSheet).toHaveBeenCalledTimes(1);
    });
    const sheet = openSheet.mock.calls[0]?.[0] as { id: string };
    expect(sheet.id).toBe("visit-detail-rx-v1");
    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
