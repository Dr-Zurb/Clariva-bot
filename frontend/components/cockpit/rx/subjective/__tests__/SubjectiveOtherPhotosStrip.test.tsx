/**
 * sdp-04 — "Other photos" orphan fallback + read-only + round-trip close-gate.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyComplaint,
  createEmptyRxFormFields,
  rxFormReducer,
  type RxFormState,
} from "@/components/cockpit/rx/RxFormContext";
import { PrescriptionFormShellProvider } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { SubjectiveOtherPhotosStrip } from "@/components/cockpit/rx/subjective/SubjectiveOtherPhotosStrip";
import { PrescriptionMediaStrip } from "@/components/cockpit/rx/media/PrescriptionMediaStrip";
import type { RxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";
import {
  SUBJECTIVE_MEDIA_ALLOWED_MIME,
  SUBJECTIVE_MEDIA_MAX_FILES,
  SUBJECTIVE_MEDIA_MAX_FILE_SIZE_MB,
  filterOrphanSubjectiveAttachments,
  filterSubjectiveAttachmentsForComplaint,
} from "@/lib/cockpit/subjective-media";
import type { PrescriptionAttachment } from "@/types/prescription";

const mockGetDownloadUrl = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getPrescriptionDownloadUrl: (...a: unknown[]) => mockGetDownloadUrl(...a),
    deletePrescriptionAttachment: (...a: unknown[]) => mockDelete(...a),
  };
});

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

function OtherPhotosHarness({
  initialAttachments,
  initialFields = createEmptyRxFormFields(),
  disabled = false,
}: {
  initialAttachments: PrescriptionAttachment[];
  initialFields?: ReturnType<typeof createEmptyRxFormFields>;
  disabled?: boolean;
}): ReactElement {
  const [attachments, setAttachments] = useState(initialAttachments);
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
        <SubjectiveOtherPhotosStrip disabled={disabled} />
      </PrescriptionFormShellProvider>
    </RxFormProvider>
  );
}

beforeEach(() => {
  mockGetDownloadUrl.mockReset();
  mockDelete.mockReset();
  mockGetDownloadUrl.mockResolvedValue({ data: { downloadUrl: "https://signed/url.jpg" } });
});

describe("SubjectiveOtherPhotosStrip (sdp-04)", () => {
  it("renders nothing when every subjective photo matches a current complaint", () => {
    const complaint = createEmptyComplaint();
    complaint.name = "Rash";
    const fields = createEmptyRxFormFields();
    fields.complaints = [complaint];

    render(
      <OtherPhotosHarness
        initialFields={fields}
        initialAttachments={[
          makeAttachment({ id: "pinned", file_path: `doc-1/rx-1/subjective/${complaint.id}/uuid-a.jpg` }),
        ]}
      />,
    );

    expect(screen.queryByTestId("subjective-other-photos")).not.toBeInTheDocument();
  });

  it("surfaces orphan photos when the complaint id no longer exists", async () => {
    const complaint = createEmptyComplaint();
    const fields = createEmptyRxFormFields();
    fields.complaints = [];

    render(
      <OtherPhotosHarness
        initialFields={fields}
        initialAttachments={[
          makeAttachment({ id: "orphan", file_path: `doc-1/rx-1/subjective/${complaint.id}/uuid-a.jpg` }),
        ]}
      />,
    );

    const strip = await screen.findByTestId("subjective-other-photos");
    expect(within(strip).getByText("Other photos")).toBeInTheDocument();
    expect(within(strip).getAllByTestId("subjective-other-photos-item")).toHaveLength(1);
    expect(screen.queryByTestId("subjective-other-photos-add")).not.toBeInTheDocument();
  });

  it("is read-only when disabled: thumbnails without add/remove", async () => {
    const fields = createEmptyRxFormFields();
    fields.complaints = [];

    render(
      <OtherPhotosHarness
        disabled
        initialFields={fields}
        initialAttachments={[
          makeAttachment({ id: "orphan", file_path: "doc-1/rx-1/subjective/gone/uuid.jpg" }),
        ]}
      />,
    );

    const strip = await screen.findByTestId("subjective-other-photos");
    expect(within(strip).getAllByTestId("subjective-other-photos-item")).toHaveLength(1);
    expect(screen.queryByTestId("subjective-other-photos-add")).not.toBeInTheDocument();
    expect(screen.queryByTestId("subjective-other-photos-remove")).not.toBeInTheDocument();
  });

  it("uses PHI-safe generic aria labels on controls", async () => {
    const fields = createEmptyRxFormFields();
    fields.complaints = [];

    render(
      <OtherPhotosHarness
        initialFields={fields}
        initialAttachments={[
          makeAttachment({ id: "orphan", file_path: "doc-1/rx-1/subjective/gone/patient-rash.jpg" }),
        ]}
      />,
    );

    await screen.findByTestId("subjective-other-photos");
    expect(screen.getByLabelText("Open Attachment 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove Attachment 1")).toBeInTheDocument();
    expect(screen.queryByLabelText(/patient-rash/i)).not.toBeInTheDocument();
  });
});

describe("subjective media round-trip (sdp-04)", () => {
  it("keeps a pinned photo on the same complaint after a reload-shaped re-render", () => {
    const complaint = createEmptyComplaint();
    const attachments = [
      makeAttachment({ id: "p1", file_path: `doc-1/rx-1/subjective/${complaint.id}/uuid-rash.jpg` }),
    ];

    const first = filterSubjectiveAttachmentsForComplaint(attachments, complaint.id);
    const reloaded = filterSubjectiveAttachmentsForComplaint(attachments, complaint.id);
    expect(first.map((a) => a.id)).toEqual(["p1"]);
    expect(reloaded.map((a) => a.id)).toEqual(["p1"]);
  });

  it("does not cascade-delete attachments when a complaint is removed from form state", () => {
    const complaint = createEmptyComplaint();
    const attachments = [
      makeAttachment({ id: "p1", file_path: `doc-1/rx-1/subjective/${complaint.id}/uuid-rash.jpg` }),
    ];

    const start: RxFormState = {
      fields: { ...createEmptyRxFormFields(), complaints: [complaint] },
      isDirty: false,
      isSaving: false,
      isSubmitting: false,
      lastSavedAt: null,
      submitError: null,
    };
    const state = rxFormReducer(start, { type: "REMOVE_COMPLAINT", index: 0 });

    expect(state.fields.complaints).toHaveLength(0);
    expect(filterOrphanSubjectiveAttachments(attachments, state.fields.complaints).map((a) => a.id)).toEqual([
      "p1",
    ]);
  });
});

describe("PrescriptionMediaStrip read-only compact (sdp-04)", () => {
  it("hides add/remove when disabled on a per-complaint strip", async () => {
    const complaintId = "cmp-1";
    const prescriptionIdRef = { current: "rx-1" as string | null };
    const initialFields = createEmptyRxFormFields();
    const shell = {
      loading: false,
      initialFields,
      entryMode: "structured" as const,
      setEntryMode: vi.fn(),
      prescription: null,
      setPrescription: vi.fn(),
      prescriptionIdRef,
      attachments: [
        makeAttachment({ id: "p1", file_path: `doc-1/rx-1/subjective/${complaintId}/uuid.jpg` }),
      ],
      setAttachments: vi.fn(),
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

    render(
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
            disabled
            filterAttachments={(list) => filterSubjectiveAttachmentsForComplaint(list, complaintId)}
            allowedMime={SUBJECTIVE_MEDIA_ALLOWED_MIME}
            maxFiles={SUBJECTIVE_MEDIA_MAX_FILES}
            maxFileSizeMb={SUBJECTIVE_MEDIA_MAX_FILE_SIZE_MB}
            variant="compact"
            testIdBase={`complaint-photos-${complaintId}`}
            sectionLabel="Photos"
            addLabel="Add photo"
            addAriaLabel="Add photo for complaint 1"
            listAriaLabel="Photos for complaint 1"
            emptyMessage=""
            emptyMessageDisabled=""
          />
        </PrescriptionFormShellProvider>
      </RxFormProvider>,
    );

    await screen.findByTestId(`complaint-photos-${complaintId}`);
    expect(screen.queryByLabelText("Add photo for complaint 1")).not.toBeInTheDocument();
    expect(screen.queryByTestId(`complaint-photos-${complaintId}-remove`)).not.toBeInTheDocument();
  });
});
