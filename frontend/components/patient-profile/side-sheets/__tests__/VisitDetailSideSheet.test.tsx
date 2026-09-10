import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VisitDetailSideSheet from "@/components/patient-profile/side-sheets/VisitDetailSideSheet";
import { getPrescription, getPrescriptionPdfUrl } from "@/lib/api";
import { printSignedPdf } from "@/components/cockpit/rx/useRxCommitActions";
import type { PrescriptionWithRelations } from "@/types/prescription";

vi.mock("@/lib/api", () => ({
  getPrescription: vi.fn(),
  getPrescriptionPdfUrl: vi.fn(),
}));

vi.mock("@/components/cockpit/rx/useRxCommitActions", () => ({
  printSignedPdf: vi.fn(),
}));

const mockedGet = vi.mocked(getPrescription);
const mockedPdfUrl = vi.mocked(getPrescriptionPdfUrl);
const mockedPrint = vi.mocked(printSignedPdf);

function pastRx(): PrescriptionWithRelations {
  return {
    id: "rx-past",
    appointment_id: "appt-past",
    patient_id: "pat-1",
    doctor_id: "doc-1",
    type: "structured",
    cc: "Headache",
    hopi: null,
    provisional_diagnosis: "Migraine",
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
    sent_to_patient_at: "2026-09-07T04:00:00.000Z",
    created_at: "2026-09-07T04:00:00.000Z",
    updated_at: "2026-09-07T04:00:00.000Z",
    vitals_bp_systolic: 142,
    vitals_bp_diastolic: 84,
    vitals_hr: 73,
    prescription_medicines: [
      {
        id: "med-1",
        prescription_id: "rx-past",
        medicine_name: "Telmisartan",
        dosage: "40mg",
        frequency: "Once daily",
        duration: "20 days",
        instructions: null,
        sort_order: 0,
      },
    ],
  } as PrescriptionWithRelations;
}

describe("VisitDetailSideSheet reprint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue({
      data: { prescription: pastRx() },
    } as Awaited<ReturnType<typeof getPrescription>>);
    mockedPdfUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/rx-past.pdf" },
    } as Awaited<ReturnType<typeof getPrescriptionPdfUrl>>);
    mockedPrint.mockResolvedValue(undefined);
  });

  it("reprints Version 1 by that row's id", async () => {
    mockedGet.mockResolvedValue({
      data: {
        prescription: {
          ...pastRx(),
          id: "rx-v1",
          version: 1,
          superseded_by_id: "rx-v2",
          attested_at: "2026-09-09T04:45:00.000Z",
        },
      },
    } as Awaited<ReturnType<typeof getPrescription>>);

    render(<VisitDetailSideSheet rxId="rx-v1" token="tok" />);

    expect(await screen.findByText(/Version 1/)).toBeInTheDocument();
    expect(screen.getByText(/Superseded/)).toBeInTheDocument();
    expect(screen.getByTestId("rx-superseded-notice")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reprint/i }));

    await waitFor(() => {
      expect(mockedPdfUrl).toHaveBeenCalledWith("tok", "rx-v1");
    });
  });

  it("prints the saved past-visit PDF without saving", async () => {
    render(<VisitDetailSideSheet rxId="rx-past" token="tok" />);

    await screen.findByTestId("visit-detail-reprint");
    fireEvent.click(screen.getByRole("button", { name: /reprint/i }));

    await waitFor(() => {
      expect(mockedPdfUrl).toHaveBeenCalledWith("tok", "rx-past");
      expect(mockedPrint).toHaveBeenCalledWith(
        "https://storage.example/rx-past.pdf",
      );
    });
  });

  it("surfaces a print failure without crashing", async () => {
    mockedPdfUrl.mockRejectedValueOnce(new Error("PDF unavailable"));
    render(<VisitDetailSideSheet rxId="rx-past" token="tok" />);

    await screen.findByTestId("visit-detail-reprint");
    fireEvent.click(screen.getByRole("button", { name: /reprint/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("PDF unavailable");
    expect(mockedPrint).not.toHaveBeenCalled();
  });
});
