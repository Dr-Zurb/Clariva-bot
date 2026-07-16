/**
 * sdp-03 — shared prescription media strip: per-complaint subjective filter + upload tagging.
 * Objective parity is covered by ObjectiveMediaStrip.test.tsx (behaviour-preserving wrapper).
 */

import { useCallback, useState } from "react";
import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { PrescriptionFormShellProvider } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { PrescriptionMediaStrip } from "@/components/cockpit/rx/media/PrescriptionMediaStrip";
import type { RxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";
import {
  SUBJECTIVE_ATTACHMENT_CATEGORY,
  SUBJECTIVE_MEDIA_ALLOWED_MIME,
  SUBJECTIVE_MEDIA_MAX_FILES,
  SUBJECTIVE_MEDIA_MAX_FILE_SIZE_MB,
  filterSubjectiveAttachmentsForComplaint,
} from "@/lib/cockpit/subjective-media";
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
    uploaded_at: "2026-06-25T00:00:00Z",
    ...overrides,
  };
}

function ComplaintPhotosHarness({
  complaintId,
  initialAttachments,
}: {
  complaintId: string;
  initialAttachments: PrescriptionAttachment[];
}): ReactElement {
  const [attachments, setAttachments] = useState(initialAttachments);
  const initialFields = createEmptyRxFormFields();
  const prescriptionIdRef = { current: "rx-1" as string | null };

  const filterAttachments = useCallback(
    (list: readonly PrescriptionAttachment[]) =>
      filterSubjectiveAttachmentsForComplaint(list, complaintId),
    [complaintId],
  );

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
      <PrescriptionFormShellProvider value={shell}>
        <PrescriptionMediaStrip
          category={SUBJECTIVE_ATTACHMENT_CATEGORY}
          complaintId={complaintId}
          filterAttachments={filterAttachments}
          allowedMime={SUBJECTIVE_MEDIA_ALLOWED_MIME}
          maxFiles={SUBJECTIVE_MEDIA_MAX_FILES}
          maxFileSizeMb={SUBJECTIVE_MEDIA_MAX_FILE_SIZE_MB}
          variant="compact"
          testIdBase={`complaint-photos-${complaintId}`}
          sectionLabel="Photos"
          addLabel="Add photo"
          addAriaLabel={`Add photo for complaint ${complaintId}`}
          listAriaLabel={`Photos for complaint ${complaintId}`}
          emptyMessage=""
          emptyMessageDisabled=""
        />
      </PrescriptionFormShellProvider>
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

describe("PrescriptionMediaStrip per-complaint subjective (sdp-03)", () => {
  it("lists only photos pinned to this complaint, not another complaint or objective media", async () => {
    render(
      <>
        <ComplaintPhotosHarness
          complaintId="cmp-1"
          initialAttachments={[
            makeAttachment({ id: "legacy", file_path: "doc-1/rx-1/uuid-rx.jpg" }),
            makeAttachment({ id: "obj", file_path: "doc-1/rx-1/objective/uuid-wound.jpg" }),
            makeAttachment({ id: "c1", file_path: "doc-1/rx-1/subjective/cmp-1/uuid-rash.jpg" }),
            makeAttachment({ id: "c2", file_path: "doc-1/rx-1/subjective/cmp-2/uuid-other.jpg" }),
          ]}
        />
        <ComplaintPhotosHarness
          complaintId="cmp-2"
          initialAttachments={[
            makeAttachment({ id: "legacy", file_path: "doc-1/rx-1/uuid-rx.jpg" }),
            makeAttachment({ id: "obj", file_path: "doc-1/rx-1/objective/uuid-wound.jpg" }),
            makeAttachment({ id: "c1", file_path: "doc-1/rx-1/subjective/cmp-1/uuid-rash.jpg" }),
            makeAttachment({ id: "c2", file_path: "doc-1/rx-1/subjective/cmp-2/uuid-other.jpg" }),
          ]}
        />
      </>,
    );

    const strip1 = await screen.findByTestId("complaint-photos-cmp-1");
    const strip2 = await screen.findByTestId("complaint-photos-cmp-2");
    expect(within(strip1).getAllByTestId("complaint-photos-cmp-1-item")).toHaveLength(1);
    expect(within(strip2).getAllByTestId("complaint-photos-cmp-2-item")).toHaveLength(1);
  });

  it("tags uploads with subjective category and complaintId", async () => {
    mockGetUploadUrl.mockResolvedValue({
      data: { path: "doc-1/rx-1/subjective/cmp-1/uuid-new.jpg", token: "t" },
    });
    mockUploadToSignedUrl.mockResolvedValue({ error: null });
    mockRegister.mockResolvedValue({
      data: {
        attachment: makeAttachment({
          id: "new",
          file_path: "doc-1/rx-1/subjective/cmp-1/uuid-new.jpg",
        }),
      },
    });

    render(<ComplaintPhotosHarness complaintId="cmp-1" initialAttachments={[]} />);

    const input = screen.getByLabelText("Add photo for complaint cmp-1");
    fireEvent.change(input, {
      target: { files: [new File(["x"], "rash.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() => expect(mockGetUploadUrl).toHaveBeenCalled());
    expect(mockGetUploadUrl.mock.calls[0]![2]).toMatchObject({
      category: "subjective",
      complaintId: "cmp-1",
    });
    await waitFor(() =>
      expect(screen.getAllByTestId("complaint-photos-cmp-1-item")).toHaveLength(1),
    );
  });
});
