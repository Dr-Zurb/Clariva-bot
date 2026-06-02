/**
 * ppd-03 — PrescriptionForm entry-mode + photo lift gates.
 *
 * Run:
 *   pnpm --filter frontend vitest run components/consultation/__tests__/PrescriptionForm.test.tsx
 */

import { useCallback, useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import type { RxSafetySurfaceValue } from "@/lib/ehr/use-rx-safety-surface";
import type { PrescriptionType } from "@/types/prescription";
import { PrescriptionFormBody } from "@/components/consultation/PrescriptionForm";

const prescriptionIdRef = { current: null as string | null };

const baseSafety: RxSafetySurfaceValue = {
  matchableMedicines: [],
  medicineInstanceIds: ["m-1"],
  allergies: [],
  drugMasterIndex: new Map(),
  setDrugMasterIndex: vi.fn(),
  ddiInteractions: [],
  formAllergyMatches: [],
  isAcked: () => false,
  onAcknowledge: vi.fn(),
  onAckDdi: vi.fn(),
  visible: false,
  clashesCount: 0,
  ddiCount: 0,
};

vi.mock("@/components/cockpit/rx/RxSafetyContext", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/components/cockpit/rx/RxSafetyContext")
  >();
  return {
    ...actual,
    useRxSafety: vi.fn(() => baseSafety),
  };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getLastPrescriptionInEpisode: vi.fn().mockResolvedValue({
      data: { prescription: null },
    }),
  };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    storage: { from: () => ({ uploadToSignedUrl: vi.fn() }) },
  }),
}));

vi.mock("@/components/cockpit/rx/PrescriptionFormCompositionRoot", () => ({
  PrescriptionFormCompositionRoot: (props: {
    subjectiveLifted?: boolean;
    objectiveLifted?: boolean;
  }) => (
    <div
      data-testid="composition-root"
      data-subjective-lifted={String(props.subjectiveLifted ?? false)}
      data-objective-lifted={String(props.objectiveLifted ?? false)}
    />
  ),
}));

vi.mock("@/components/ehr/TemplatePicker", () => ({
  default: () => null,
}));

vi.mock("@/components/consultation/PrescriptionPatientPreview", () => ({
  default: () => null,
}));

vi.mock("@/components/consultation/PrescriptionPreSendCheck", () => ({
  default: () => null,
}));

vi.mock("@/components/consultation/SaveStatus", () => ({
  default: () => <span role="status">Save status</span>,
}));

vi.mock("@/components/cockpit/rx/SendRxFinishButton", () => ({
  SendRxFinishButton: () => (
    <button type="button">Send Rx &amp; finish</button>
  ),
}));

type BodyHarnessOptions = {
  entryMode?: PrescriptionType;
  entryModeLifted?: boolean;
  photoLifted?: boolean;
  subjectiveLifted?: boolean;
  objectiveLifted?: boolean;
  actionsInFooter?: boolean;
  onFinish?: () => void;
  __testExposeEnsurePhoto?: (fn: () => Promise<string>) => void;
};

function PrescriptionFormBodyHarness({
  entryMode: initialEntryMode = "structured",
  entryModeLifted = false,
  photoLifted = false,
  subjectiveLifted = false,
  objectiveLifted = false,
  actionsInFooter = false,
  onFinish,
  __testExposeEnsurePhoto,
}: BodyHarnessOptions) {
  const [entryMode, setEntryMode] = useState<PrescriptionType>(initialEntryMode);
  const [prescription, setPrescription] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [initialFields, setInitialFields] = useState(createEmptyRxFormFields());
  const [medicineInstanceIds, setMedicineInstanceIds] = useState(["m-1"]);
  const instanceIdSeqRef = useRef(1);
  const generateInstanceIds = useCallback((count: number) => {
    return Array.from({ length: count }, () => {
      instanceIdSeqRef.current += 1;
      return `m-${instanceIdSeqRef.current}`;
    });
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const doctorMetaRef = useRef(null);
  const finishAfterSendRef = useRef(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewVM, setPreviewVM] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [lastEpisodeRx, setLastEpisodeRx] = useState(null);
  const [preSendWarnings, setPreSendWarnings] = useState(null);

  return (
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="test-token"
      entryMode={entryMode}
      initialFields={initialFields}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      <PrescriptionFormBody
          appointmentId="appt-1"
          patientId="pat-1"
          token="test-token"
          entryMode={entryMode}
          setEntryMode={setEntryMode}
          entryModeLifted={entryModeLifted}
          photoLifted={photoLifted}
          subjectiveLifted={subjectiveLifted}
          objectiveLifted={objectiveLifted}
          actionsInFooter={actionsInFooter}
          onFinish={onFinish}
          prescription={prescription}
          setPrescription={setPrescription}
          prescriptionIdRef={prescriptionIdRef}
          attachments={attachments}
          setAttachments={setAttachments}
          setInitialFields={setInitialFields}
          generateInstanceIds={generateInstanceIds}
          instanceIdSeqRef={instanceIdSeqRef}
          medicineInstanceIds={medicineInstanceIds}
          setMedicineInstanceIds={setMedicineInstanceIds}
          templatePickerOpen={templatePickerOpen}
          setTemplatePickerOpen={setTemplatePickerOpen}
          previewOpen={previewOpen}
          setPreviewOpen={setPreviewOpen}
          previewVM={previewVM}
          setPreviewVM={setPreviewVM}
          previewLoading={previewLoading}
          setPreviewLoading={setPreviewLoading}
          doctorMetaRef={doctorMetaRef}
          lastEpisodeRx={lastEpisodeRx}
          setLastEpisodeRx={setLastEpisodeRx}
          fileInputRef={fileInputRef}
          preSendWarnings={preSendWarnings}
          setPreSendWarnings={setPreSendWarnings}
          finishAfterSendRef={finishAfterSendRef}
          __testExposeEnsurePhoto={__testExposeEnsurePhoto}
        />
    </RxFormProvider>
  );
}

function renderBody(options: BodyHarnessOptions = {}) {
  return render(<PrescriptionFormBodyHarness {...options} />);
}

describe("entryModeLifted — hides the radio fieldset", () => {
  it("does not render Prescription type when lifted", () => {
    renderBody({ entryModeLifted: true });
    expect(screen.queryByText("Prescription type")).toBeNull();
  });
});

describe("entryModeLifted — forces structured mode", () => {
  it("switches photo entry mode to structured on mount", async () => {
    renderBody({ entryMode: "photo", entryModeLifted: true });
    await waitFor(() => {
      expect(screen.getByTestId("composition-root")).toBeInTheDocument();
      expect(screen.queryByText("Attachments")).toBeNull();
    });
    expect(screen.queryByText("Prescription type")).toBeNull();
  });
});

describe("photoLifted — hides the Photo section", () => {
  it("does not render attachments UI when lifted", () => {
    renderBody({ photoLifted: true, entryMode: "photo" });
    expect(screen.queryByText("Attachments")).toBeNull();
    expect(screen.queryByLabelText("Uploaded attachments")).toBeNull();
  });
});

describe("photoLifted — throws on upload attempt (dev)", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("throws from ensurePrescriptionForPhoto when photo is lifted", async () => {
    let ensurePhoto!: () => Promise<string>;
    renderBody({
      photoLifted: true,
      entryMode: "photo",
      __testExposeEnsurePhoto: (fn) => {
        ensurePhoto = fn;
      },
    });
    await waitFor(() => expect(ensurePhoto).toBeDefined());
    await expect(ensurePhoto()).rejects.toThrow(
      "Photo upload is disabled in the cockpit Plan pane.",
    );
    expect(console.warn).toHaveBeenCalledWith(
      "[ppd-03] ensurePrescriptionForPhoto called while photoLifted=true; no-op.",
    );
  });
});

describe("actionsInFooter — suppresses inline commit row", () => {
  it("hides Send Rx, Send & finish, and Finish visit when actions live in footer", () => {
    renderBody({ actionsInFooter: true, onFinish: vi.fn() });
    expect(screen.queryByRole("button", { name: /^send rx$/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /send rx & finish/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /finish visit/i }),
    ).toBeNull();
  });

  it("shows commit-row buttons when actionsInFooter is false and onFinish is set", () => {
    renderBody({ actionsInFooter: false, onFinish: vi.fn() });
    expect(screen.getByRole("button", { name: /^send rx$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send rx & finish/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /finish visit/i }),
    ).toBeInTheDocument();
  });
});

describe("defaults — radio + photo render as before", () => {
  it("shows Prescription type radios with default props", () => {
    renderBody();
    expect(screen.getByText("Prescription type")).toBeInTheDocument();
    expect(screen.getByLabelText("Structured only")).toBeInTheDocument();
    expect(screen.getByLabelText("Photo only")).toBeInTheDocument();
    expect(screen.getByLabelText("Both")).toBeInTheDocument();
  });

  it("shows attachments when entry mode is photo", () => {
    renderBody({ entryMode: "photo" });
    expect(screen.getByText("Attachments")).toBeInTheDocument();
  });

  it("forwards subjectiveLifted and objectiveLifted to composition root", () => {
    renderBody({ subjectiveLifted: true, objectiveLifted: true });
    const root = screen.getByTestId("composition-root");
    expect(root).toHaveAttribute("data-subjective-lifted", "true");
    expect(root).toHaveAttribute("data-objective-lifted", "true");
  });
});
