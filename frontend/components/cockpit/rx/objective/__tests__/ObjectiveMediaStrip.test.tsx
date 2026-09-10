/**
 * obj-22 — Objective media strip: lists only objective-tagged media, tags uploads with the
 * `objective` category, removes via the delete endpoint, and is read-only when disabled.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { PrescriptionFormShellProvider } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { ObjectiveMediaStrip } from "@/components/cockpit/rx/objective/ObjectiveMediaStrip";
import type { RxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";
import type { PrescriptionAttachment } from "@/types/prescription";

const mockGetUploadUrl = vi.fn();
const mockRegister = vi.fn();
const mockGetDownloadUrl = vi.fn();
const mockDelete = vi.fn();
const mockCreatePrescription = vi.fn();
const mockUploadToSignedUrl = vi.fn();
const mockExtractLabPdf = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    createPrescription: (...a: unknown[]) => mockCreatePrescription(...a),
    getPrescriptionUploadUrl: (...a: unknown[]) => mockGetUploadUrl(...a),
    registerPrescriptionAttachment: (...a: unknown[]) => mockRegister(...a),
    getPrescriptionDownloadUrl: (...a: unknown[]) => mockGetDownloadUrl(...a),
    deletePrescriptionAttachment: (...a: unknown[]) => mockDelete(...a),
  };
});

vi.mock("@/lib/api/lab-extract", () => ({
  extractLabPdfFromAttachment: (...a: unknown[]) => mockExtractLabPdf(...a),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ uploadToSignedUrl: (...a: unknown[]) => mockUploadToSignedUrl(...a) }) },
  }),
}));

function makeAttachment(overrides: Partial<PrescriptionAttachment>): PrescriptionAttachment {
  return {
    id: "a1",
    prescription_id: "rx-1",
    file_path: "doc-1/rx-1/uuid-file.jpg",
    file_type: "image/jpeg",
    caption: null,
    uploaded_at: "2026-06-19T00:00:00Z",
    ...overrides,
  };
}

/** Renders the strip under a shell whose `attachments` is real React state. */
function Harness({
  initialAttachments,
  disabled = false,
  withShell = true,
}: {
  initialAttachments: PrescriptionAttachment[];
  disabled?: boolean;
  withShell?: boolean;
}): ReactElement {
  const [attachments, setAttachments] = useState(initialAttachments);
  const initialFields = createEmptyRxFormFields();
  const prescriptionIdRef = { current: "rx-1" as string | null };

  const shell = {
    loading: false,
    initialFields,
    entryMode: "structured" as const,
    setEntryMode: vi.fn(),
    prescription: null,
    setPrescription: vi.fn(),
    prescriptionIdRef,
    attachments,
    setAttachments,
    setInitialFields: vi.fn(),
    generateInstanceIds: (n: number) => Array.from({ length: n }, (_, i) => `m-${i}`),
    instanceIdSeqRef: { current: 0 },
    medicineInstanceIds: ["m-0"],
    setMedicineInstanceIds: vi.fn(),
    subjectiveSectionOrder: [],
    setSubjectiveSectionOrder: vi.fn(),
    subjectiveSectionCollapsed: {},
    setSubjectiveSectionCollapsed: vi.fn(),
    subjectiveSectionHidden: [],
    setSubjectiveSectionHidden: vi.fn(),
    objectiveDefaults: null,
    setObjectiveDefaults: vi.fn(),
    planDefaults: null,
    setPlanDefaults: vi.fn(),
    assessmentDefaults: null,
    setAssessmentDefaults: vi.fn(),
    providerProps: {
      key: "test",
      appointmentId: "appt-1",
      patientId: "pat-1",
      token: "test-token",
      entryMode: "structured" as const,
      initialFields,
      autosaveEnabled: false,
      prescriptionIdRef,
      onPrescriptionCreated: vi.fn(),
    },
  } as unknown as RxFormProviderSetup;

  const strip = <ObjectiveMediaStrip disabled={disabled} />;

  return (
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
      {withShell ? (
        <PrescriptionFormShellProvider value={shell}>{strip}</PrescriptionFormShellProvider>
      ) : (
        strip
      )}
    </RxFormProvider>
  );
}

beforeEach(() => {
  mockGetUploadUrl.mockReset();
  mockRegister.mockReset();
  mockGetDownloadUrl.mockReset();
  mockDelete.mockReset();
  mockCreatePrescription.mockReset();
  mockUploadToSignedUrl.mockReset();
  mockExtractLabPdf.mockReset();
  mockGetDownloadUrl.mockResolvedValue({ data: { downloadUrl: "https://signed/url.jpg" } });
});

describe("ObjectiveMediaStrip (obj-22)", () => {
  it("lists only objective-tagged media, not legacy photo-Rx attachments", async () => {
    render(
      <Harness
        initialAttachments={[
          makeAttachment({ id: "legacy", file_path: "doc-1/rx-1/uuid-rx.jpg" }),
          makeAttachment({ id: "obj-1", file_path: "doc-1/rx-1/objective/uuid-wound.jpg" }),
        ]}
      />,
    );

    const items = await screen.findAllByTestId("objective-media-item");
    expect(items).toHaveLength(1);
    // Legacy attachment never surfaces in the objective strip.
    expect(screen.queryByText("uuid-rx.jpg")).not.toBeInTheDocument();
  });

  it("tags uploads with the objective category and appends the registered attachment", async () => {
    mockGetUploadUrl.mockResolvedValue({ data: { path: "doc-1/rx-1/objective/uuid-new.jpg", token: "t" } });
    mockUploadToSignedUrl.mockResolvedValue({ error: null });
    mockRegister.mockResolvedValue({
      data: { attachment: makeAttachment({ id: "obj-new", file_path: "doc-1/rx-1/objective/uuid-new.jpg" }) },
    });

    render(<Harness initialAttachments={[]} />);

    const input = screen.getByLabelText("Upload report pages");
    const file = new File(["x"], "wound.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mockGetUploadUrl).toHaveBeenCalled());
    expect(mockGetUploadUrl.mock.calls[0]![2]).toMatchObject({ category: "objective" });
    await waitFor(() => expect(screen.getAllByTestId("objective-media-item")).toHaveLength(1));
  });

  it("shows every selected file as a pending card before register finishes", async () => {
    let finishFirst: ((value: { error: null }) => void) | undefined;
    mockGetUploadUrl.mockResolvedValue({ data: { path: "doc-1/rx-1/objective/uuid.pdf", token: "t" } });
    mockUploadToSignedUrl.mockImplementation(
      () =>
        new Promise<{ error: null }>((resolve) => {
          if (!finishFirst) finishFirst = resolve;
          else resolve({ error: null });
        }),
    );
    mockRegister
      .mockResolvedValueOnce({
        data: {
          attachment: makeAttachment({
            id: "p1",
            file_path: "doc-1/rx-1/objective/a.pdf",
            file_type: "application/pdf",
          }),
        },
      })
      .mockResolvedValueOnce({
        data: {
          attachment: makeAttachment({
            id: "p2",
            file_path: "doc-1/rx-1/objective/b.pdf",
            file_type: "application/pdf",
          }),
        },
      });

    render(<Harness initialAttachments={[]} />);
    fireEvent.change(screen.getByLabelText("Upload report pages"), {
      target: {
        files: [
          new File(["a"], "01_CBC.pdf", { type: "application/pdf" }),
          new File(["b"], "02_LFT.pdf", { type: "application/pdf" }),
        ],
      },
    });

    await waitFor(() => expect(screen.getAllByTestId("objective-media-pending")).toHaveLength(2));
    finishFirst?.({ error: null });
    await waitFor(() => expect(screen.getAllByTestId("objective-media-item")).toHaveLength(2));
    expect(screen.queryByTestId("objective-media-pending")).not.toBeInTheDocument();
  });

  it("removes an attachment via the delete endpoint", async () => {
    mockDelete.mockResolvedValue(undefined);
    render(
      <Harness
        initialAttachments={[
          makeAttachment({ id: "obj-1", file_path: "doc-1/rx-1/objective/uuid-wound.jpg" }),
        ]}
      />,
    );

    let finishDelete: (() => void) | undefined;
    mockDelete.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishDelete = resolve;
        }),
    );
    const item = await screen.findByTestId("objective-media-item");
    fireEvent.click(within(item).getByTestId("objective-media-remove"));

    expect(screen.queryByTestId("objective-media-item")).not.toBeInTheDocument();
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("test-token", "rx-1", "obj-1"));
    finishDelete?.();
  });

  it("is read-only when disabled: no add input, no remove buttons", async () => {
    render(
      <Harness
        disabled
        initialAttachments={[
          makeAttachment({ id: "obj-1", file_path: "doc-1/rx-1/objective/uuid-wound.jpg" }),
        ]}
      />,
    );

    await screen.findByTestId("objective-media-item");
    expect(screen.queryByLabelText("Upload report pages")).not.toBeInTheDocument();
    expect(screen.queryByTestId("objective-media-remove")).not.toBeInTheDocument();
  });

  it("extracts a PDF only after the doctor confirms", async () => {
    mockExtractLabPdf.mockResolvedValue({
      data: {
        attachmentId: "pdf-1",
        pageCount: 1,
        skippedPageIndexes: [],
        source: "pdf_text",
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
    });

    render(
      <Harness
        initialAttachments={[
          makeAttachment({
            id: "pdf-1",
            file_path: "doc-1/rx-1/objective/uuid-cbc.pdf",
            file_type: "application/pdf",
          }),
        ]}
      />,
    );

    fireEvent.click(await screen.findByTestId("lab-extract-from-pdf"));
    await screen.findByTestId("lab-extract-verify-dialog");
    expect(mockExtractLabPdf).toHaveBeenCalledWith("test-token", "rx-1", "pdf-1");
    expect(screen.queryByTestId("test-result-row-r1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("lab-extract-confirm"));
    await waitFor(() =>
      expect(screen.queryByTestId("lab-extract-verify-dialog")).not.toBeInTheDocument(),
    );
  });

  it("extracts every pending PDF before opening one combined verify dialog", async () => {
    mockExtractLabPdf.mockImplementation((_token: string, _rx: string, attachmentId: string) =>
      Promise.resolve({
        data: {
          attachmentId,
          pageCount: 1,
          skippedPageIndexes: [],
          source: "pdf_text",
          rows: [
            {
              rawName: attachmentId === "pdf-1" ? "Total bilirubin" : "Creatinine",
              rawValue: "1.1",
              rawUnit: "mg/dL",
              rawRange: null,
              rawMethod: null,
              pageIndex: 0,
              lineText: "row",
            },
          ],
        },
      }),
    );

    render(
      <Harness
        initialAttachments={[
          makeAttachment({
            id: "pdf-1",
            file_path: "doc-1/rx-1/objective/02_LFT_Test_Report.pdf",
            file_type: "application/pdf",
          }),
          makeAttachment({
            id: "pdf-2",
            file_path: "doc-1/rx-1/objective/03_KFT_Test_Report.pdf",
            file_type: "application/pdf",
          }),
        ]}
      />,
    );

    fireEvent.click(await screen.findByTestId("lab-extract-all"));
    await screen.findByTestId("lab-extract-verify-dialog");
    expect(mockExtractLabPdf).toHaveBeenCalledTimes(2);
    expect(mockExtractLabPdf).toHaveBeenCalledWith("test-token", "rx-1", "pdf-1");
    expect(mockExtractLabPdf).toHaveBeenCalledWith("test-token", "rx-1", "pdf-2");
    expect(screen.getByText("Verify · 2 reports")).toBeInTheDocument();
    expect(screen.getAllByTestId("lab-extract-report-tab")).toHaveLength(2);

    fireEvent.click(screen.getByTestId("lab-extract-confirm"));
    await waitFor(() =>
      expect(screen.queryByTestId("lab-extract-verify-dialog")).not.toBeInTheDocument(),
    );
    expect(mockExtractLabPdf).toHaveBeenCalledTimes(2);
  });

  it("hides extract when disabled", async () => {
    render(
      <Harness
        disabled
        initialAttachments={[
          makeAttachment({
            id: "pdf-1",
            file_path: "doc-1/rx-1/objective/uuid-cbc.pdf",
            file_type: "application/pdf",
          }),
        ]}
      />,
    );
    await screen.findByTestId("objective-media-item");
    expect(screen.queryByTestId("lab-extract-from-pdf")).not.toBeInTheDocument();
  });

  it("extracts a report photo and shows the source image for verification", async () => {
    mockExtractLabPdf.mockResolvedValue({
      data: {
        attachmentId: "photo-1",
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
    });

    render(
      <Harness
        initialAttachments={[
          makeAttachment({
            id: "photo-1",
            file_path: "doc-1/rx-1/objective/uuid-cbc.jpg",
            file_type: "image/jpeg",
          }),
        ]}
      />,
    );

    fireEvent.click(await screen.findByTestId("lab-extract-from-pdf"));
    await screen.findByTestId("lab-extract-verify-dialog");
    expect(mockExtractLabPdf).toHaveBeenCalledWith("test-token", "rx-1", "photo-1");
    expect(screen.getByTestId("lab-extract-vision-notice")).toBeInTheDocument();
    expect(screen.getByAltText("Source report photo")).toHaveAttribute(
      "src",
      "https://signed/url.jpg",
    );
  });

  it("extracts a mixed batch of PDFs and photos into one dialog", async () => {
    mockExtractLabPdf.mockImplementation((_token: string, _rx: string, attachmentId: string) =>
      Promise.resolve({
        data: {
          attachmentId,
          pageCount: 1,
          skippedPageIndexes: [],
          source: attachmentId === "photo-1" ? "vision" : "pdf_text",
          rows: [
            {
              rawName: attachmentId === "photo-1" ? "Creatinine" : "Total bilirubin",
              rawValue: "1.1",
              rawUnit: "mg/dL",
              rawRange: null,
              rawMethod: null,
              pageIndex: 0,
              lineText: "row",
            },
          ],
        },
      }),
    );

    render(
      <Harness
        initialAttachments={[
          makeAttachment({
            id: "pdf-1",
            file_path: "doc-1/rx-1/objective/02_LFT_Test_Report.pdf",
            file_type: "application/pdf",
          }),
          makeAttachment({
            id: "photo-1",
            file_path: "doc-1/rx-1/objective/03_KFT_Test_Report.jpg",
            file_type: "image/jpeg",
          }),
        ]}
      />,
    );

    fireEvent.click(await screen.findByTestId("lab-extract-all"));
    await screen.findByTestId("lab-extract-verify-dialog");
    expect(mockExtractLabPdf).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId("lab-extract-report-tab")).toHaveLength(2);

    // The notice is per-tab: the PDF tab opens first and must not claim the
    // rows were read by a model.
    expect(screen.queryByTestId("lab-extract-vision-notice")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId("lab-extract-report-tab")[1]!);
    expect(screen.getByTestId("lab-extract-vision-notice")).toBeInTheDocument();
  });

  it("surfaces the server reason when photo extraction is disabled, and opens no dialog", async () => {
    mockExtractLabPdf.mockRejectedValue(new Error("Report photo extraction is not enabled."));

    render(
      <Harness
        initialAttachments={[
          makeAttachment({
            id: "photo-1",
            file_path: "doc-1/rx-1/objective/uuid-cbc.jpg",
            file_type: "image/jpeg",
          }),
        ]}
      />,
    );

    fireEvent.click(await screen.findByTestId("lab-extract-from-pdf"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Report photo extraction is not enabled.",
      ),
    );
    expect(screen.queryByTestId("lab-extract-verify-dialog")).not.toBeInTheDocument();
  });

  it("renders a cockpit-only note when there is no shell", () => {
    render(<Harness withShell={false} initialAttachments={[]} />);
    expect(screen.getByText(/available in the consultation cockpit/i)).toBeInTheDocument();
    expect(screen.queryByTestId("objective-media-strip")).not.toBeInTheDocument();
  });
});
