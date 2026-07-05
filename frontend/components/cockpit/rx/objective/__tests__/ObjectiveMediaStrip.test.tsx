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

    const input = screen.getByLabelText("Add objective media");
    const file = new File(["x"], "wound.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mockGetUploadUrl).toHaveBeenCalled());
    expect(mockGetUploadUrl.mock.calls[0]![2]).toMatchObject({ category: "objective" });
    await waitFor(() => expect(screen.getAllByTestId("objective-media-item")).toHaveLength(1));
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

    const item = await screen.findByTestId("objective-media-item");
    fireEvent.click(within(item).getByTestId("objective-media-remove"));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("test-token", "rx-1", "obj-1"));
    await waitFor(() => expect(screen.queryByTestId("objective-media-item")).not.toBeInTheDocument());
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
    expect(screen.queryByLabelText("Add objective media")).not.toBeInTheDocument();
    expect(screen.queryByTestId("objective-media-remove")).not.toBeInTheDocument();
  });

  it("renders a cockpit-only note when there is no shell", () => {
    render(<Harness withShell={false} initialAttachments={[]} />);
    expect(screen.getByText(/available in the consultation cockpit/i)).toBeInTheDocument();
    expect(screen.queryByTestId("objective-media-strip")).not.toBeInTheDocument();
  });
});
