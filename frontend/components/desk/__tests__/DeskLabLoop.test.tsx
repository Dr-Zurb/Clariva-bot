import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeskLabOrdersList } from "@/components/desk/DeskDocumentsStrip";
import { DeskLabUploadDialog } from "@/components/desk/DeskLabUploadDialog";
import {
  DeskQueueModeChips,
  LabsOnlyVisitList,
} from "@/components/desk/DeskQueueList";
import type { DeskTodayRow } from "@/lib/desk/prep";

vi.mock("@/components/desk/DeskDocumentsStrip", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/desk/DeskDocumentsStrip")>();
  return {
    ...actual,
    DeskDocumentsStrip: () => (
      <div data-testid="desk-lab-strip">Camera File Extract</div>
    ),
  };
});

describe("DeskLabOrdersList", () => {
  it("renders ordered test labels and kinds", () => {
    render(
      <DeskLabOrdersList
        orders={[
          {
            orderId: "o1",
            label: "CBC",
            kind: "blood",
            status: "pending",
            reasonCode: null,
            reasonNote: null,
            documentId: null,
          },
          {
            orderId: "o2",
            label: "USG abdomen",
            kind: "imaging",
            status: "uploaded",
            reasonCode: null,
            reasonNote: null,
            documentId: "doc-1",
          },
        ]}
      />
    );
    const list = screen.getByTestId("desk-lab-orders");
    expect(list).toHaveTextContent("CBC");
    expect(list).toHaveTextContent("blood");
    expect(list).toHaveTextContent("USG abdomen");
    expect(list).toHaveTextContent("imaging");
  });

  it("shows the empty line when nothing is attested", () => {
    render(<DeskLabOrdersList orders={[]} />);
    expect(screen.getByTestId("desk-lab-orders-empty")).toHaveTextContent(
      "No tests on this visit yet."
    );
  });

  it("shows a desk error instead of the empty line", () => {
    render(<DeskLabOrdersList orders={[]} error="Could not load tests" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load tests");
    expect(screen.queryByTestId("desk-lab-orders-empty")).not.toBeInTheDocument();
  });

  it("covers a test from the latest report or asks why it was not done", () => {
    const onCover = vi.fn();
    const onNotDone = vi.fn();
    const onClear = vi.fn();
    render(
      <DeskLabOrdersList
        orders={[
          {
            orderId: "o1",
            label: "CBC",
            kind: "blood",
            status: "pending",
            reasonCode: null,
            reasonNote: null,
            documentId: null,
          },
        ]}
        coverDocumentId="doc-1"
        onCover={onCover}
        onNotDone={onNotDone}
        onClear={onClear}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "On this report" }));
    expect(onCover).toHaveBeenCalledWith("o1");
    fireEvent.click(screen.getByRole("button", { name: "Not done" }));
    fireEvent.click(screen.getByRole("button", { name: "Patient refused" }));
    expect(onNotDone).toHaveBeenCalledWith("o1", "patient_refused");
  });
});

describe("DeskQueueModeChips", () => {
  const counts = { all: 3, waiting: 1, arrived: 1, seen: 1 };

  it("hides Labs pending without internal_labs", () => {
    render(
      <DeskQueueModeChips
        filter="all"
        labsPendingMode={false}
        showLabsPending={false}
        counts={counts}
        labsPendingCount={2}
        onSelect={() => undefined}
      />
    );
    expect(
      screen.queryByRole("tab", { name: /Labs pending/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /All/i })).toBeInTheDocument();
  });

  it("hides the day-board chips when the login is labs-only", () => {
    render(
      <DeskQueueModeChips
        filter="all"
        labsPendingMode
        showLabsPending={false}
        showQueueChips={false}
        counts={counts}
        labsPendingCount={2}
        onSelect={() => undefined}
      />
    );
    expect(screen.queryByRole("tab", { name: /All/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /Waiting/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /Labs pending/i })
    ).not.toBeInTheDocument();
  });

  it("shows Labs pending with internal_labs", () => {
    render(
      <DeskQueueModeChips
        filter="all"
        labsPendingMode={false}
        showLabsPending
        counts={counts}
        labsPendingCount={2}
        onSelect={() => undefined}
      />
    );
    expect(screen.getByRole("tab", { name: /Labs pending/i })).toHaveTextContent(
      "2"
    );
  });
});

function labRow(overrides: Partial<DeskTodayRow> = {}): DeskTodayRow {
  return {
    id: "apt-1",
    doctor_id: "doc-1",
    patient_id: "pat-1",
    patient_name: "Test Patient",
    patient_phone: "9000000001",
    patient_age: 40,
    patient_sex: "female",
    patient_mrn: "P-001",
    appointment_date: "2026-09-10T04:30:00.000Z",
    status: "completed",
    created_at: "2026-09-10T04:30:00.000Z",
    updated_at: "2026-09-10T04:30:00.000Z",
    deskPrep: { vitals: "unused", history: "unused", reports: "empty" },
    daysPending: 3,
    reportUploaded: false,
    labOrders: [
      {
        orderId: "o1",
        label: "CBC",
        kind: "blood",
        status: "pending",
        reasonCode: null,
        reasonNote: null,
        documentId: null,
      },
    ],
    ...overrides,
  };
}

describe("DeskLabUploadDialog", () => {
  it("names the patient and keeps the upload strip inside the dialog", () => {
    render(
      <DeskLabUploadDialog
        open
        onOpenChange={() => undefined}
        token="tok"
        appointmentId="apt-1"
        patientName="Test Patient"
        visitDate="10 Sep"
        mrn="P-001"
      />
    );
    const dialog = screen.getByTestId("desk-lab-upload-dialog");
    expect(dialog).toHaveTextContent("Test Patient");
    expect(dialog).toHaveTextContent("P-001");
    expect(screen.getByTestId("desk-lab-strip")).toBeInTheDocument();
  });
});

describe("LabsOnlyVisitList", () => {
  it("opens a dialog from Upload reports and does not expand the row", () => {
    render(
      <LabsOnlyVisitList
        visible={[labRow()]}
        timezone="Asia/Kolkata"
        prepLabel="Upload reports"
        token="tok"
      />
    );
    expect(screen.queryByTestId("desk-lab-upload-dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Upload reports" })[0]);
    expect(screen.getByTestId("desk-lab-upload-dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("desk-today-prep")).not.toBeInTheDocument();
  });

  it("opens the same dialog from an already-uploaded row", () => {
    render(
      <LabsOnlyVisitList
        visible={[labRow({ reportUploaded: true, daysPending: 0 })]}
        timezone="Asia/Kolkata"
        prepLabel="Upload reports"
        token="tok"
      />
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Upload reports" })[0]);
    expect(screen.getByTestId("desk-lab-upload-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("desk-lab-strip")).toBeInTheDocument();
  });
});
