/**
 * Labs portal: action first (Upload and extract / Upload only), then
 * camera or file as the source. Picking a file runs that action immediately.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { DeskDocumentsStrip } from "@/components/desk/DeskDocumentsStrip";
import type { VisitDocument } from "@/types/visit-documents";

const mockListDocuments = vi.fn();
const mockListOrders = vi.fn();
const mockGetUploadUrl = vi.fn();
const mockCreateDocument = vi.fn();
const mockAddPage = vi.fn();
const mockExtract = vi.fn();
const mockDownloadUrl = vi.fn();
const mockDelete = vi.fn();
const mockUploadToSignedUrl = vi.fn();

vi.mock("@/lib/desk/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/desk/api")>();
  return {
    ...actual,
    listDeskVisitDocuments: (...a: unknown[]) => mockListDocuments(...a),
    listDeskLabOrders: (...a: unknown[]) => mockListOrders(...a),
    getDeskVisitDocumentUploadUrl: (...a: unknown[]) => mockGetUploadUrl(...a),
    createDeskVisitDocument: (...a: unknown[]) => mockCreateDocument(...a),
    addDeskVisitDocumentPage: (...a: unknown[]) => mockAddPage(...a),
    extractDeskVisitDocumentPageLab: (...a: unknown[]) => mockExtract(...a),
    getDeskVisitDocumentDownloadUrl: (...a: unknown[]) => mockDownloadUrl(...a),
    deleteDeskVisitDocument: (...a: unknown[]) => mockDelete(...a),
  };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        uploadToSignedUrl: (...a: unknown[]) => mockUploadToSignedUrl(...a),
      }),
    },
  }),
}));

function makeDocument(overrides: Partial<VisitDocument> = {}): VisitDocument {
  return {
    id: "doc-1",
    doctor_id: "doc",
    patient_id: "pat-1",
    appointment_id: "appt-1",
    document_type: "lab_report",
    report_date: null,
    ordered_by: "us",
    source: "front_desk",
    actor_id: "staff-1",
    created_at: "2026-09-22T00:00:00Z",
    updated_at: "2026-09-22T00:00:00Z",
    pages: [
      {
        id: "page-1",
        document_id: "doc-1",
        file_type: "image/jpeg",
        page_index: 0,
        created_at: "2026-09-22T00:00:00Z",
      },
    ],
    extracted_results: [],
    ...overrides,
  };
}

function extractOk(pageId: string) {
  return {
    data: {
      pageId,
      pageCount: 1,
      skippedPageIndexes: [],
      source: "vision",
      rows: [
        {
          rawName: "Hb",
          rawValue: "11.8",
          rawUnit: "g/dL",
          rawRange: "12.0 - 15.0",
          rawMethod: null,
          pageIndex: 0,
          lineText: "Hb 11.8 g/dL 12.0 - 15.0",
        },
      ],
    },
  };
}

function Harness({
  mode = "internal_labs",
}: {
  mode?: "internal_labs" | "papers";
}): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <DeskDocumentsStrip
        token="test-token"
        appointmentId="appt-1"
        mode={mode}
        open
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockListDocuments.mockReset();
  mockListOrders.mockReset();
  mockGetUploadUrl.mockReset();
  mockCreateDocument.mockReset();
  mockAddPage.mockReset();
  mockExtract.mockReset();
  mockDownloadUrl.mockReset();
  mockDelete.mockReset();
  mockUploadToSignedUrl.mockReset();
  mockListDocuments.mockResolvedValue({ data: { documents: [] } });
  mockDelete.mockResolvedValue(undefined);
  mockListOrders.mockResolvedValue({ data: { orders: [] } });
  mockGetUploadUrl.mockResolvedValue({
    data: { path: "doc-1/appt-1/page.jpg", token: "t" },
  });
  mockUploadToSignedUrl.mockResolvedValue({ error: null });
  mockCreateDocument.mockResolvedValue({ data: { document: makeDocument() } });
  mockExtract.mockResolvedValue(extractOk("page-1"));
  mockDownloadUrl.mockResolvedValue({
    data: { downloadUrl: "https://signed/url.jpg" },
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pending");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function addFile(
  testId: string,
  file = new File(["x"], "cbc.jpg", { type: "image/jpeg" })
) {
  fireEvent.change(screen.getByTestId(testId), {
    target: { files: [file] },
  });
}

function openDropdown(trigger: Element) {
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    bubbles: true,
    cancelable: true,
  });
  fireEvent.click(trigger);
}

describe("DeskDocumentsStrip labs upload split", () => {
  it("shows Upload and extract first and hides camera/file until an action is chosen", async () => {
    render(<Harness />);
    await screen.findByText("Upload reports");

    expect(
      screen.getByTestId("desk-lab-upload-and-extract")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("desk-lab-camera")).not.toBeInTheDocument();
    expect(screen.queryByTestId("desk-lab-file")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("desk-lab-upload-and-extract"));
    expect(screen.getByTestId("desk-lab-camera")).toBeInTheDocument();
    expect(screen.getByTestId("desk-lab-file")).toBeInTheDocument();
    expect(screen.getByText("Choose camera or file")).toBeInTheDocument();
    expect(mockGetUploadUrl).not.toHaveBeenCalled();
  });

  it("uploads then extracts after Upload and extract then a file", async () => {
    render(<Harness />);
    await screen.findByText("Upload reports");

    fireEvent.click(screen.getByTestId("desk-lab-upload-and-extract"));
    addFile("desk-lab-file-input");

    await screen.findByTestId("lab-extract-verify-dialog");
    expect(mockCreateDocument).toHaveBeenCalledTimes(1);
    expect(mockExtract).toHaveBeenCalledWith(
      "test-token",
      "appt-1",
      "doc-1",
      "page-1"
    );
  });

  it("uploads without extracting after Upload only then a camera photo", async () => {
    render(<Harness />);
    await screen.findByText("Upload reports");

    openDropdown(screen.getByTestId("desk-lab-upload-more"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Upload only" }));
    expect(
      screen.getByText("Upload only — choose camera or file")
    ).toBeInTheDocument();
    addFile("desk-lab-camera-input");

    await waitFor(() => expect(mockCreateDocument).toHaveBeenCalledTimes(1));
    expect(mockExtract).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("lab-extract-verify-dialog")
    ).not.toBeInTheDocument();
    expect(
      await screen.findByTestId("desk-page-lab-extract")
    ).toBeInTheDocument();
  });

  it("still uploads immediately from camera or file in papers mode", async () => {
    render(<Harness mode="papers" />);
    await screen.findByText("Patient files");

    expect(
      screen.queryByTestId("desk-lab-upload-and-extract")
    ).not.toBeInTheDocument();
    addFile("desk-lab-file-input");

    await waitFor(() => expect(mockCreateDocument).toHaveBeenCalledTimes(1));
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("shows an in-file progress ring as soon as a file is picked", async () => {
    let finishUrl: (() => void) | undefined;
    mockGetUploadUrl.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishUrl = () =>
            resolve({
              data: { path: "doc-1/appt-1/page.jpg", token: "t" },
            });
        })
    );

    render(<Harness />);
    await screen.findByText("Upload reports");
    fireEvent.click(screen.getByTestId("desk-lab-upload-and-extract"));
    addFile("desk-lab-file-input");

    expect(await screen.findByTestId("desk-lab-pending")).toBeInTheDocument();
    expect(screen.getByText(/Uploading \d+ percent/)).toBeInTheDocument();
    finishUrl?.();
    await screen.findByTestId("lab-extract-verify-dialog");
    expect(screen.queryByTestId("desk-lab-pending")).not.toBeInTheDocument();
  });

  it("drops the report from the list as soon as remove is clicked", async () => {
    let finishDelete: (() => void) | undefined;
    mockListDocuments.mockResolvedValue({
      data: { documents: [makeDocument()] },
    });
    mockDelete.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishDelete = resolve;
        })
    );

    render(<Harness />);
    fireEvent.click(await screen.findByLabelText("Remove document"));

    expect(screen.queryByLabelText("Remove document")).not.toBeInTheDocument();
    expect(mockDelete).toHaveBeenCalledWith("test-token", "appt-1", "doc-1");
    finishDelete?.();
  });
});
