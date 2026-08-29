import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  printSignedPdf,
  useRxCommitActions,
} from "@/components/cockpit/rx/useRxCommitActions";
import {
  RxFormProvider,
  createEmptyComplaint,
  createEmptyRxFormFields,
  deriveHopiFromComplaints,
} from "@/components/cockpit/rx/RxFormContext";
import { RxFormActionsBridgeProvider } from "@/components/cockpit/rx/RxFormActionsContext";
import { RxSafetyProvider } from "@/components/cockpit/rx/RxSafetyContext";
import { PrescriptionFormShellProvider } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import type { RxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    sendPrescriptionToPatient: vi.fn(),
    getDoctorSettings: vi.fn().mockResolvedValue({ data: { settings: {} } }),
    getPrescriptionPdfUrl: vi.fn(),
  };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { email: "doc@test.com", user_metadata: { full_name: "Dr Test" } } },
      }),
    },
  }),
}));

function makeShell(
  initialFields = createEmptyRxFormFields(),
): RxFormProviderSetup {
  const prescriptionIdRef = { current: "rx-1" as string | null };
  return {
    loading: false,
    initialFields,
    entryMode: "structured",
    setEntryMode: vi.fn(),
    prescription: null,
    setPrescription: vi.fn(),
    prescriptionIdRef,
    attachments: [],
    setAttachments: vi.fn(),
    setInitialFields: vi.fn(),
    generateInstanceIds: (n: number) => Array.from({ length: n }, (_, i) => `m-${i}`),
    instanceIdSeqRef: { current: 0 },
    medicineInstanceIds: ["m-0"],
    setMedicineInstanceIds: vi.fn(),
    subjectiveSectionOrder: null,
    setSubjectiveSectionOrder: vi.fn(),
    subjectiveSectionCollapsed: null,
    setSubjectiveSectionCollapsed: vi.fn(),
    subjectiveSectionHidden: null,
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
      token: "token",
      entryMode: "structured",
      initialFields,
      autosaveEnabled: false,
      prescriptionIdRef,
      onPrescriptionCreated: vi.fn(),
    },
  };
}

function wrapper(shell: RxFormProviderSetup) {
  const { key, ...providerProps } = shell.providerProps;
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <RxFormProvider key={key} {...providerProps}>
        <RxSafetyProvider token="token" patientId="pat-1">
          <RxFormActionsBridgeProvider>
            <PrescriptionFormShellProvider value={shell}>
              {children}
            </PrescriptionFormShellProvider>
          </RxFormActionsBridgeProvider>
        </RxSafetyProvider>
      </RxFormProvider>
    );
  };
}

describe("useRxCommitActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens preview without Plan pane mounted", async () => {
    const shell = makeShell();
    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "ended",
          registerActions: true,
        }),
      { wrapper: wrapper(shell) },
    );

    await act(async () => {
      result.current.openPreview();
    });

    expect(result.current.previewOpen).toBe(true);
    expect(result.current.previewVM).not.toBeNull();
  });

  it("fills patient identity from the appointment, not sample values", async () => {
    const shell = makeShell();
    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          patientName: "Bhavna Joshi",
          patientIdentity: {
            phone: "9876543210",
            ageYears: 34,
            sex: "female",
            guardianName: "Rajesh Joshi",
            guardianRelation: "husband",
            mrn: "P-1042",
            visitDate: "2026-08-25T10:00:00.000Z",
          },
          token: "token",
          cockpitState: "live",
          registerActions: false,
        }),
      { wrapper: wrapper(shell) },
    );

    await act(async () => {
      result.current.openPreview();
    });

    expect(result.current.previewVM).toMatchObject({
      patientName: "Bhavna Joshi",
      patientPhone: "9876543210",
      patientAge: "34 y",
      patientGender: "female",
      guardianName: "Rajesh Joshi",
      guardianRelation: "husband",
      medicalRecordNumber: "P-1042",
    });
    expect(result.current.previewVM?.visitDateLabel).toMatch(/25 Aug 2026/);
  });

  it("uses the saved derived hopi in preview, not the raw fallback field", async () => {
    const complaint = createEmptyComplaint(
      "11111111-1111-4111-8111-111111111111",
    );
    complaint.name = "Migraine";
    complaint.onset = "2 days";
    complaint.severity = "severe";
    const fields = createEmptyRxFormFields();
    fields.hopi = "raw fallback that must not print";
    fields.complaints = [complaint];

    const shell = makeShell(fields);
    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          registerActions: false,
        }),
      { wrapper: wrapper(shell) },
    );

    await act(async () => {
      result.current.openPreview();
    });

    expect(result.current.previewVM?.hopi).toBe(
      deriveHopiFromComplaints([complaint]),
    );
    expect(result.current.previewVM?.hopi).not.toContain(
      "raw fallback that must not print",
    );
  });

  it("opens the system print dialog without a new tab", async () => {
    const { getPrescriptionPdfUrl } = await import("@/lib/api");
    vi.mocked(getPrescriptionPdfUrl).mockResolvedValue({
      success: true,
      data: { signedUrl: "https://storage.example/rx.pdf?sig=1" },
      meta: { timestamp: "", requestId: "" },
    });
    const print = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["pdf"], { type: "application/pdf" }),
    } as Response);
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:rx");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const openSpy = vi.spyOn(window, "open");
    const realAppend = document.body.appendChild.bind(document.body);
    const append = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation((node) => {
        const el = realAppend(node);
        if (node instanceof HTMLIFrameElement) {
          Object.defineProperty(node, "contentWindow", {
            configurable: true,
            value: {
              focus: vi.fn(),
              print,
              addEventListener: vi.fn(),
              removeEventListener: vi.fn(),
            },
          });
          node.onload?.(new Event("load"));
        }
        return el;
      });

    const shell = makeShell();
    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          registerActions: false,
        }),
      { wrapper: wrapper(shell) },
    );

    expect(result.current.canPrint).toBe(true);
    expect(result.current.canFinish).toBe(false);

    await act(async () => {
      await result.current.printPrescription();
    });

    expect(getPrescriptionPdfUrl).toHaveBeenCalledWith("token", "rx-1");
    expect(fetchSpy).toHaveBeenCalledWith("https://storage.example/rx.pdf?sig=1");
    expect(createObjectURL).toHaveBeenCalled();
    expect(print).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    openSpy.mockRestore();
    append.mockRestore();
  });

  it("downloads the signed PDF without opening a print tab", async () => {
    const { getPrescriptionPdfUrl } = await import("@/lib/api");
    vi.mocked(getPrescriptionPdfUrl).mockResolvedValue({
      success: true,
      data: { signedUrl: "https://storage.example/rx.pdf?sig=1" },
      meta: { timestamp: "", requestId: "" },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["pdf"], { type: "application/pdf" }),
    } as Response);
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:rx");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const click = vi.fn();
    const append = vi.spyOn(document.body, "appendChild");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);

    const shell = makeShell();
    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          registerActions: false,
        }),
      { wrapper: wrapper(shell) },
    );

    await act(async () => {
      await result.current.downloadPrescription();
    });

    expect(getPrescriptionPdfUrl).toHaveBeenCalledWith("token", "rx-1");
    expect(fetchSpy).toHaveBeenCalledWith("https://storage.example/rx.pdf?sig=1");
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:rx");
    fetchSpy.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    append.mockRestore();
  });

  it("offers finish only before the visit has ended", () => {
    const shell = makeShell();
    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "ended",
          onFinish: vi.fn(),
          registerActions: false,
        }),
      { wrapper: wrapper(shell) },
    );

    expect(result.current.canFinish).toBe(false);
    expect(result.current.canPrint).toBe(true);
  });
});

describe("printSignedPdf", () => {
  it("rejects when the signed URL cannot be fetched", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      blob: async () => new Blob([]),
    } as Response);

    await expect(printSignedPdf("https://storage.example/missing.pdf")).rejects.toThrow(
      "Could not load prescription PDF",
    );
    fetchSpy.mockRestore();
  });
});
