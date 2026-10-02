import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DeskVisitDocumentsStrip } from "@/components/cockpit/rx/objective/DeskVisitDocumentsStrip";
import type { VisitDocument } from "@/types/visit-documents";

const harness = vi.hoisted(() => ({
  documents: [] as VisitDocument[],
  rx: {
    token: "tok",
    appointmentId: "appt-1",
    patientId: "pat-1",
    dispatch: () => undefined,
    seedFields: () => undefined,
    state: { fields: { labReports: [], testResultsStructured: [] } },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: harness.documents }),
}));

vi.mock("@/components/cockpit/rx/RxFormContext", () => ({
  useOptionalRxForm: () => harness.rx,
}));

vi.mock("@/components/cockpit/rx/PrescriptionFormShellContext", () => ({
  usePrescriptionFormShell: () => ({ id: "shell" }),
}));

vi.mock("@/components/cockpit/rx/objective/LabExtractVerifyDialog", () => ({
  LabExtractVerifyDialog: () => null,
}));

function document(id: string, source: VisitDocument["source"]): VisitDocument {
  return {
    id,
    doctor_id: "doctor-1",
    patient_id: "pat-1",
    appointment_id: "appt-1",
    document_type: source === "patient" ? "other" : "lab_report",
    report_date: null,
    ordered_by: "outside",
    source,
    actor_id: "actor-1",
    created_at: "2026-09-27T00:00:00.000Z",
    updated_at: "2026-09-27T00:00:00.000Z",
    pages: [
      {
        id: `${id}-page`,
        document_id: id,
        file_type: "application/pdf",
        page_index: 0,
        created_at: "2026-09-27T00:00:00.000Z",
      },
    ],
  };
}

describe("DeskVisitDocumentsStrip groups", () => {
  beforeEach(() => {
    harness.documents = [];
  });

  it("keeps extract on a desk page and omits it on a patient page", () => {
    harness.documents = [document("desk-1", "front_desk"), document("patient-1", "patient")];
    render(<DeskVisitDocumentsStrip />);
    expect(screen.getByText("From staff")).toBeInTheDocument();
    expect(screen.getByText("From the patient")).toBeInTheDocument();
    expect(screen.getAllByTestId("desk-lab-extract")).toHaveLength(1);
    expect(screen.queryByText(/\/desk\//)).not.toBeInTheDocument();
  });

  it("omits the staff heading when every file came from the patient", () => {
    harness.documents = [document("patient-1", "patient")];
    render(<DeskVisitDocumentsStrip />);
    expect(screen.queryByText("From staff")).not.toBeInTheDocument();
    expect(screen.getByText("From the patient")).toBeInTheDocument();
    expect(screen.queryByTestId("desk-lab-extract")).not.toBeInTheDocument();
  });
});
