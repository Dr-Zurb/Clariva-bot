import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  printSignedPdf,
  useRxCommitActions,
} from "@/components/cockpit/rx/useRxCommitActions";
import {
  isPrintAdvanceHeld,
  resetPrintAdvanceHoldForTests,
} from "@/lib/cockpit/rx-print-advance";
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
    reissuePrescription: vi.fn(),
    createPrescription: vi.fn(),
    updatePrescription: vi.fn(),
    fetchPrescriptionPdf: vi.fn().mockResolvedValue({
      blob: new Blob(["pdf"], { type: "application/pdf" }),
      filename: "prescription-9sep2026-v1.pdf",
    }),
    getDoctorSettings: vi.fn().mockResolvedValue({ data: { settings: {} } }),
    getPrescriptionPdfUrl: vi.fn(),
    listPatientAllergies: vi.fn().mockResolvedValue({
      data: {
        allergies: [
          {
            allergen: "Penicillin",
            severity: "unknown",
            reaction: null,
          },
        ],
        sectionNotes: null,
      },
    }),
  };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            email: "doc@test.com",
            user_metadata: { full_name: "Dr Test" },
          },
        },
      }),
    },
  }),
}));

function makeShell(
  initialFields = createEmptyRxFormFields()
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
    generateInstanceIds: (n: number) =>
      Array.from({ length: n }, (_, i) => `m-${i}`),
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <RxFormProvider key={key} {...providerProps}>
          <RxSafetyProvider token="token" patientId="pat-1">
            <RxFormActionsBridgeProvider>
              <PrescriptionFormShellProvider value={shell}>
                {children}
              </PrescriptionFormShellProvider>
            </RxFormActionsBridgeProvider>
          </RxSafetyProvider>
        </RxFormProvider>
      </QueryClientProvider>
    );
  };
}

/**
 * Stub the print pipeline: signed-PDF fetch, blob URL, and the iframe's
 * contentWindow. A real browser fires `load` once the PDF viewer is up and the
 * hook prints on that event; jsdom never loads a blob src, so an observer
 * fires it here rather than patching `appendChild` (nested spies recurse).
 */
function installPrintIframe(
  print: ReturnType<typeof vi.fn>,
  objectUrl = "blob:rx"
) {
  const afterPrintHandlers: Array<() => void> = [];
  const mediaListeners: Array<(event: { matches: boolean }) => void> = [];
  const media = {
    matches: false,
    addEventListener: (_event: string, cb: (event: { matches: boolean }) => void) => {
      mediaListeners.push(cb);
    },
    addListener: (cb: (event: { matches: boolean }) => void) => {
      mediaListeners.push(cb);
    },
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  };
  const loadObserver = new MutationObserver(() => {
    printIframes().forEach((el) => {
      if (el.dataset.loadFired === "1") return;
      el.dataset.loadFired = "1";
      el.dispatchEvent(new Event("load"));
    });
  });
  loadObserver.observe(document.body, { childList: true });
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    blob: async () => new Blob(["pdf"], { type: "application/pdf" }),
  } as Response);
  const createObjectURL = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue(objectUrl);
  const revokeObjectURL = vi
    .spyOn(URL, "revokeObjectURL")
    .mockImplementation(() => {});
  const contentWindow = vi
    .spyOn(HTMLIFrameElement.prototype, "contentWindow", "get")
    .mockReturnValue({
      focus: vi.fn(),
      print,
      matchMedia: () => media,
      addEventListener: (event: string, cb: () => void) => {
        if (event === "afterprint") afterPrintHandlers.push(cb);
      },
      removeEventListener: vi.fn(),
    } as unknown as Window);

  return {
    fetchSpy,
    createObjectURL,
    revokeObjectURL,
    fireAfterPrint: () => afterPrintHandlers.forEach((cb) => cb()),
    firePrintMedia: (matches: boolean) => {
      media.matches = matches;
      mediaListeners.forEach((cb) => cb({ matches }));
    },
    restore: () => {
      loadObserver.disconnect();
      fetchSpy.mockRestore();
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
      contentWindow.mockRestore();
    },
  };
}

function printIframes(): NodeListOf<HTMLIFrameElement> {
  return document.querySelectorAll<HTMLIFrameElement>("iframe[data-rx-print]");
}

describe("useRxCommitActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    resetPrintAdvanceHoldForTests();
  });

  afterEach(() => {
    printIframes().forEach((el) => el.remove());
    resetPrintAdvanceHoldForTests();
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
      { wrapper: wrapper(shell) }
    );

    await act(async () => {
      result.current.openPreview();
    });

    expect(result.current.previewOpen).toBe(true);
    expect(result.current.previewVM).not.toBeNull();
    await waitFor(() => {
      expect(result.current.previewVM?.allergies).toBe("Penicillin");
    });
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
      { wrapper: wrapper(shell) }
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
      "11111111-1111-4111-8111-111111111111"
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
      { wrapper: wrapper(shell) }
    );

    await act(async () => {
      result.current.openPreview();
    });

    expect(result.current.previewVM?.hopi).toBe(
      deriveHopiFromComplaints([complaint])
    );
    expect(result.current.previewVM?.hopi).not.toContain(
      "raw fallback that must not print"
    );
  });

  it("prints the vitals section note on the preview vitals line", async () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsBpReadings = [{ systolic: 120, diastolic: 80 }];
    fields.vitalsSectionNote = "234234";

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
      { wrapper: wrapper(shell) }
    );

    await act(async () => {
      result.current.openPreview();
    });

    expect(result.current.previewVM?.vitals).toBe("BP 120/80 — 234234");
  });

  it("opens the system print dialog without a new tab", async () => {
    const { fetchPrescriptionPdf } = await import("@/lib/api");
    vi.mocked(fetchPrescriptionPdf).mockResolvedValue({
      blob: new Blob(["pdf"], { type: "application/pdf" }),
      filename: "prescription-9sep2026-v1.pdf",
    });
    const print = vi.fn();
    const openSpy = vi.spyOn(window, "open");
    const printStub = installPrintIframe(print);

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
      { wrapper: wrapper(shell) }
    );

    expect(result.current.canPrint).toBe(true);
    expect(result.current.canFinish).toBe(false);

    await act(async () => {
      await result.current.printPrescription();
    });

    expect(fetchPrescriptionPdf).toHaveBeenCalledWith("token", "rx-1");
    expect(printStub.createObjectURL).toHaveBeenCalled();
    expect(print).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
    printStub.restore();
    openSpy.mockRestore();
  });

  it("downloads the signed PDF without opening a print tab", async () => {
    const { fetchPrescriptionPdf } = await import("@/lib/api");
    vi.mocked(fetchPrescriptionPdf).mockResolvedValue({
      blob: new Blob(["pdf"], { type: "application/pdf" }),
      filename: "prescription-9sep2026-v2.pdf",
    });
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
      { wrapper: wrapper(shell) }
    );

    await act(async () => {
      await result.current.downloadPrescription();
    });

    expect(fetchPrescriptionPdf).toHaveBeenCalledWith("token", "rx-1");
    expect(createObjectURL).toHaveBeenCalled();
    const downloadLink = append.mock.calls
      .map(([node]) => node)
      .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);
    expect(downloadLink?.download).toBe("prescription-9sep2026-v2.pdf");
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:rx");
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
      { wrapper: wrapper(shell) }
    );

    expect(result.current.canFinish).toBe(false);
    expect(result.current.canPrint).toBe(true);
  });

  it("offers finish on an ended visit when a same-day issued note can be revised", () => {
    const shell = makeShell();
    shell.prescription = {
      id: "rx-1",
      attested_at: "2026-09-09T04:45:00.000Z",
    } as never;
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

    expect(result.current.canFinish).toBe(true);
  });

  it("advances to the next patient after send, finish, and print", async () => {
    const { getPrescriptionPdfUrl, sendPrescriptionToPatient } =
      await import("@/lib/api");
    vi.mocked(getPrescriptionPdfUrl).mockResolvedValue({
      success: true,
      data: { signedUrl: "https://storage.example/rx.pdf?sig=1" },
      meta: { timestamp: "", requestId: "" },
    });
    vi.mocked(sendPrescriptionToPatient).mockResolvedValue({
      success: true,
      data: { sent: true, channels: { email: true } },
      meta: { timestamp: "", requestId: "" },
    });
    const print = vi.fn();
    const openSpy = vi.spyOn(window, "open");
    const printStub = installPrintIframe(print);
    const onFinish = vi.fn(() => {
      window.history.pushState({}, "", "/dashboard/appointments/next-a");
    });
    const fields = createEmptyRxFormFields();
    fields.provisionalDiagnosis = "Hypertension";
    fields.advice = "Rest";
    fields.medicines[0] = { ...fields.medicines[0]!, medicineName: "Aspirin" };

    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          onFinish,
          registerActions: false,
        }),
      { wrapper: wrapper(makeShell(fields)) }
    );

    await act(async () => {
      result.current.sendFinishAndPrint();
    });
    await waitFor(() => {
      expect(onFinish).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1);
    });
    expect(openSpy).not.toHaveBeenCalled();
    expect(isPrintAdvanceHeld()).toBe(true);
    expect(sessionStorage.getItem("pf11_cancelled_appt-1")).toBe("1");
    printStub.firePrintMedia(true);
    printStub.firePrintMedia(false);
    expect(isPrintAdvanceHeld()).toBe(false);
    expect(sessionStorage.getItem("pf11_cancelled_appt-1")).toBeNull();
    printStub.restore();
    openSpy.mockRestore();
  });

  it("clears a stale print-only advance block when finishing without print", async () => {
    const { sendPrescriptionToPatient } = await import("@/lib/api");
    vi.mocked(sendPrescriptionToPatient).mockResolvedValue({
      success: true,
      data: { sent: true, channels: { email: true } },
      meta: { timestamp: "", requestId: "" },
    });
    // An earlier Print on this visit parked the next-patient advance.
    sessionStorage.setItem("pf11_cancelled_appt-1", "1");

    const onFinish = vi.fn();
    const fields = createEmptyRxFormFields();
    fields.medicines[0] = { ...fields.medicines[0]!, medicineName: "Aspirin" };

    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          onFinish,
          registerActions: false,
        }),
      { wrapper: wrapper(makeShell(fields)) }
    );

    await act(async () => {
      result.current.sendAndFinish();
    });
    await waitFor(() => {
      expect(onFinish).toHaveBeenCalledTimes(1);
    });
    expect(sessionStorage.getItem("pf11_cancelled_appt-1")).toBeNull();
    expect(isPrintAdvanceHeld()).toBe(false);
  });

  it("opens print as soon as the PDF is ready, without waiting for wrap-up", async () => {
    const { getPrescriptionPdfUrl, sendPrescriptionToPatient } =
      await import("@/lib/api");
    vi.mocked(getPrescriptionPdfUrl).mockResolvedValue({
      success: true,
      data: { signedUrl: "https://storage.example/rx.pdf?sig=1" },
      meta: { timestamp: "", requestId: "" },
    });
    vi.mocked(sendPrescriptionToPatient).mockResolvedValue({
      success: true,
      data: { sent: true, channels: { email: true } },
      meta: { timestamp: "", requestId: "" },
    });
    const order: string[] = [];
    const print = vi.fn(() => {
      order.push("print");
    });
    const printStub = installPrintIframe(print);
    let resolveFinish!: () => void;
    const onFinish = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          order.push("finish");
          resolveFinish = resolve;
        })
    );
    const fields = createEmptyRxFormFields();
    fields.medicines[0] = { ...fields.medicines[0]!, medicineName: "Aspirin" };

    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          onFinish,
          registerActions: false,
        }),
      { wrapper: wrapper(makeShell(fields)) }
    );

    await act(async () => {
      result.current.sendFinishAndPrint();
    });
    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(onFinish).toHaveBeenCalledTimes(1);
    });
    expect(order[0]).toBe("print");
    resolveFinish();
    printStub.restore();
  });

  it("opens the print dialog before wrap-up hands over to the next patient", async () => {
    const { sendPrescriptionToPatient } = await import("@/lib/api");
    vi.mocked(sendPrescriptionToPatient).mockResolvedValue({
      success: true,
      data: { sent: true, channels: { email: true } },
      meta: { timestamp: "", requestId: "" },
    });
    const print = vi.fn();
    const printStub = installPrintIframe(print);
    let holdAtFinish = false;
    const onFinish = vi.fn(() => {
      holdAtFinish = isPrintAdvanceHeld();
    });
    const fields = createEmptyRxFormFields();
    fields.medicines[0] = { ...fields.medicines[0]!, medicineName: "Aspirin" };

    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          onFinish,
          registerActions: false,
        }),
      { wrapper: wrapper(makeShell(fields)) }
    );

    await act(async () => {
      result.current.sendFinishAndPrint();
    });
    await waitFor(() => {
      expect(onFinish).toHaveBeenCalledTimes(1);
    });
    // Wrap-up may remount the cockpit; the next-patient jump must stay
    // parked until the dialog is handed off.
    expect(holdAtFinish).toBe(true);
    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1);
    });
    expect(isPrintAdvanceHeld()).toBe(true);
    printStub.restore();
  });

  it("keeps the print PDF alive when the next patient unmounts the cockpit", async () => {
    const { fetchPrescriptionPdf, sendPrescriptionToPatient } =
      await import("@/lib/api");
    vi.mocked(sendPrescriptionToPatient).mockResolvedValue({
      success: true,
      data: { sent: true, channels: { email: true } },
      meta: { timestamp: "", requestId: "" },
    });
    let resolvePdf!: (value: { blob: Blob; filename: string }) => void;
    vi.mocked(fetchPrescriptionPdf).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePdf = resolve;
        })
    );
    let stub!: ReturnType<typeof installPrintIframe>;
    let revokesBeforePrint = -1;
    const print = vi.fn(() => {
      revokesBeforePrint = stub.revokeObjectURL.mock.calls.length;
    });
    stub = installPrintIframe(print);
    const fields = createEmptyRxFormFields();
    fields.medicines[0] = { ...fields.medicines[0]!, medicineName: "Aspirin" };

    const { result, unmount } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          onFinish: vi.fn(),
          registerActions: false,
        }),
      { wrapper: wrapper(makeShell(fields)) }
    );

    await act(async () => {
      result.current.sendFinishAndPrint();
    });
    // The doctor's next patient loads while the PDF is still rendering.
    unmount();
    await act(async () => {
      resolvePdf({
        blob: new Blob(["pdf"], { type: "application/pdf" }),
        filename: "prescription-9sep2026-v1.pdf",
      });
    });

    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1);
    });
    expect(revokesBeforePrint).toBe(0);
    stub.restore();
  });

  it("parks on this visit when the print PDF cannot be loaded", async () => {
    const { fetchPrescriptionPdf, sendPrescriptionToPatient } =
      await import("@/lib/api");
    vi.mocked(sendPrescriptionToPatient).mockResolvedValue({
      success: true,
      data: { sent: true, channels: { email: true } },
      meta: { timestamp: "", requestId: "" },
    });
    vi.mocked(fetchPrescriptionPdf).mockRejectedValueOnce(
      new Error("Could not load prescription PDF")
    );
    const onFinish = vi.fn();
    const fields = createEmptyRxFormFields();
    fields.medicines[0] = { ...fields.medicines[0]!, medicineName: "Aspirin" };

    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          onFinish,
          registerActions: false,
        }),
      { wrapper: wrapper(makeShell(fields)) }
    );

    await act(async () => {
      result.current.sendFinishAndPrint();
    });

    await waitFor(() => {
      expect(result.current.commitError).toBe("Could not load prescription PDF");
    });
    // Visit still finishes, but the doctor stays here to retry the printout.
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("pf11_cancelled_appt-1")).toBe("1");
  });

  it("finishes the visit without waiting for send", async () => {
    const { sendPrescriptionToPatient } = await import("@/lib/api");
    let resolveSend!: (value: {
      success: true;
      data: { sent: boolean; channels: { email: boolean } };
      meta: { timestamp: string; requestId: string };
    }) => void;
    vi.mocked(sendPrescriptionToPatient).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        })
    );
    const onFinish = vi.fn();
    const fields = createEmptyRxFormFields();
    fields.medicines[0] = { ...fields.medicines[0]!, medicineName: "Aspirin" };

    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          onFinish,
          registerActions: false,
        }),
      { wrapper: wrapper(makeShell(fields)) }
    );

    await act(async () => {
      result.current.sendAndFinish();
    });

    await waitFor(() => {
      expect(onFinish).toHaveBeenCalledTimes(1);
    });
    expect(sendPrescriptionToPatient).toHaveBeenCalled();
    resolveSend({
      success: true,
      data: { sent: true, channels: { email: true } },
      meta: { timestamp: "", requestId: "" },
    });
  });

  it("reuses the preview-warmed PDF for print instead of fetching again", async () => {
    const { fetchPrescriptionPdf, sendPrescriptionToPatient } =
      await import("@/lib/api");
    vi.mocked(sendPrescriptionToPatient).mockResolvedValue({
      success: true,
      data: { sent: true, channels: { email: true } },
      meta: { timestamp: "", requestId: "" },
    });
    const print = vi.fn();
    const printStub = installPrintIframe(print);
    const fields = createEmptyRxFormFields();
    fields.medicines[0] = { ...fields.medicines[0]!, medicineName: "Aspirin" };

    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          onFinish: vi.fn(),
          registerActions: false,
        }),
      { wrapper: wrapper(makeShell(fields)) }
    );

    await act(async () => {
      result.current.openPreview();
    });
    await waitFor(() => {
      expect(fetchPrescriptionPdf).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      result.current.sendFinishAndPrint();
    });
    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1);
    });
    expect(fetchPrescriptionPdf).toHaveBeenCalledTimes(1);
    printStub.restore();
  });

  it("prewarms the PDF on intent without opening the preview", async () => {
    const { fetchPrescriptionPdf } = await import("@/lib/api");
    const printStub = installPrintIframe(vi.fn());

    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          registerActions: false,
        }),
      { wrapper: wrapper(makeShell()) }
    );

    await act(async () => {
      result.current.prewarmOnIntent();
    });
    await waitFor(() => {
      expect(fetchPrescriptionPdf).toHaveBeenCalledWith("token", "rx-1");
    });
    expect(result.current.previewOpen).toBe(false);
    printStub.restore();
  });

  it("opens print as soon as the PDF is ready, without waiting for send", async () => {
    const { getPrescriptionPdfUrl, sendPrescriptionToPatient } =
      await import("@/lib/api");
    vi.mocked(getPrescriptionPdfUrl).mockResolvedValue({
      success: true,
      data: { signedUrl: "https://storage.example/rx.pdf?sig=1" },
      meta: { timestamp: "", requestId: "" },
    });
    let resolveSend!: (value: {
      success: true;
      data: { sent: boolean; channels: { email: boolean } };
      meta: { timestamp: string; requestId: string };
    }) => void;
    vi.mocked(sendPrescriptionToPatient).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        })
    );
    const print = vi.fn();
    const printStub = installPrintIframe(print);
    const fields = createEmptyRxFormFields();
    fields.medicines[0] = { ...fields.medicines[0]!, medicineName: "Aspirin" };

    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          onFinish: vi.fn(),
          registerActions: false,
        }),
      { wrapper: wrapper(makeShell(fields)) }
    );

    await act(async () => {
      result.current.sendFinishAndPrint();
    });
    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1);
    });
    expect(sendPrescriptionToPatient).toHaveBeenCalled();
    resolveSend({
      success: true,
      data: { sent: true, channels: { email: true } },
      meta: { timestamp: "", requestId: "" },
    });
    printStub.restore();
  });

  it("creates a draft on send when autosave never ran", async () => {
    const { createPrescription, sendPrescriptionToPatient } =
      await import("@/lib/api");
    vi.mocked(createPrescription).mockResolvedValue({
      success: true,
      data: {
        prescription: { id: "rx-created" },
      } as never,
      meta: { timestamp: "", requestId: "" },
    });
    vi.mocked(sendPrescriptionToPatient).mockResolvedValue({
      success: true,
      data: { sent: true, channels: { email: true } },
      meta: { timestamp: "", requestId: "" },
    });

    const prescriptionIdRef = { current: null as string | null };
    const fields = createEmptyRxFormFields();
    fields.hopi = "Headache";
    const shell = makeShell(fields);
    shell.prescriptionIdRef = prescriptionIdRef;
    shell.providerProps.prescriptionIdRef = prescriptionIdRef;

    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          registerActions: false,
        }),
      { wrapper: wrapper(shell) }
    );

    await act(async () => {
      result.current.sendRx();
    });

    await waitFor(() => {
      expect(createPrescription).toHaveBeenCalled();
    });
    expect(sendPrescriptionToPatient).toHaveBeenCalledWith(
      "token",
      "rx-created"
    );
    expect(result.current.commitError).toBeNull();
  });

  it("cancels next-patient advance for print-only", async () => {
    const { getPrescriptionPdfUrl } = await import("@/lib/api");
    vi.mocked(getPrescriptionPdfUrl).mockResolvedValue({
      success: true,
      data: { signedUrl: "https://storage.example/rx.pdf?sig=1" },
      meta: { timestamp: "", requestId: "" },
    });
    const print = vi.fn();
    const printStub = installPrintIframe(print);

    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "live",
          registerActions: false,
        }),
      { wrapper: wrapper(makeShell()) }
    );

    await act(async () => {
      await result.current.printPrescription();
    });
    expect(sessionStorage.getItem("pf11_cancelled_appt-1")).toBe("1");
    printStub.restore();
  });
});

describe("useRxCommitActions rxl-25", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    resetPrintAdvanceHoldForTests();
  });

  it("opens the reason dialog instead of sending an issued note", async () => {
    const { sendPrescriptionToPatient, reissuePrescription } = await import(
      "@/lib/api"
    );
    const shell = makeShell();
    shell.prescription = {
      id: "rx-1",
      attested_at: "2026-09-09T04:45:00.000Z",
    } as never;

    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "ended",
          registerActions: false,
        }),
      { wrapper: wrapper(shell) },
    );

    await act(async () => {
      result.current.sendRx();
    });

    expect(result.current.revisionReasonOpen).toBe(true);
    expect(sendPrescriptionToPatient).not.toHaveBeenCalled();
    expect(reissuePrescription).not.toHaveBeenCalled();
  });

  it("reissues then sends after a reason is chosen", async () => {
    const { sendPrescriptionToPatient, reissuePrescription } = await import(
      "@/lib/api"
    );
    vi.mocked(reissuePrescription).mockResolvedValue({
      success: true,
      data: {
        prescription: {
          id: "rx-2",
          attested_at: "2026-09-10T06:40:00.000Z",
          supersedes_id: "rx-1",
          version: 2,
          prescription_attachments: [],
        },
      },
      meta: { timestamp: "", requestId: "" },
    } as never);
    vi.mocked(sendPrescriptionToPatient).mockResolvedValue({
      success: true,
      data: { sent: true, channels: { email: true } },
      meta: { timestamp: "", requestId: "" },
    } as never);

    const fields = createEmptyRxFormFields();
    fields.provisionalDiagnosis = "Hypertension";
    fields.advice = "Rest";
    fields.medicines[0] = { ...fields.medicines[0]!, medicineName: "Aspirin" };
    const shell = makeShell(fields);
    shell.prescription = {
      id: "rx-1",
      attested_at: "2026-09-09T04:45:00.000Z",
      sent_to_patient_at: null,
    } as never;

    const { result } = renderHook(
      () =>
        useRxCommitActions({
          appointmentId: "appt-1",
          patientId: "pat-1",
          token: "token",
          cockpitState: "ended",
          registerActions: false,
        }),
      { wrapper: wrapper(shell) },
    );

    await act(async () => {
      result.current.sendRx();
    });
    await act(async () => {
      result.current.onRevisionReasonConfirm("treatment_change");
    });

    await waitFor(() => {
      expect(reissuePrescription).toHaveBeenCalledWith(
        "token",
        "rx-1",
        "treatment_change",
      );
    });
    await waitFor(() => {
      expect(sendPrescriptionToPatient).toHaveBeenCalledWith("token", "rx-2");
    });
    expect(shell.prescriptionIdRef.current).toBe("rx-2");
  });

  it("does not reissue a draft send", async () => {
    const { sendPrescriptionToPatient, reissuePrescription } = await import(
      "@/lib/api"
    );
    vi.mocked(sendPrescriptionToPatient).mockResolvedValue({
      success: true,
      data: { sent: true, channels: { email: true } },
      meta: { timestamp: "", requestId: "" },
    } as never);
    const fields = createEmptyRxFormFields();
    fields.provisionalDiagnosis = "Hypertension";
    fields.advice = "Rest";
    fields.medicines[0] = { ...fields.medicines[0]!, medicineName: "Aspirin" };
    const shell = makeShell(fields);
    shell.prescription = { id: "rx-1", attested_at: null } as never;

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
      result.current.sendRx();
    });

    expect(reissuePrescription).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(sendPrescriptionToPatient).toHaveBeenCalledWith("token", "rx-1");
    });
  });
});

describe("printSignedPdf", () => {
  it("keeps the print iframe after afterprint (Chrome fires that when the dialog opens)", async () => {
    const print = vi.fn();
    const printStub = installPrintIframe(print, "blob:rx-keep");

    await printSignedPdf("https://storage.example/rx.pdf");

    expect(print).toHaveBeenCalledTimes(1);
    printStub.fireAfterPrint();
    expect(printStub.revokeObjectURL).not.toHaveBeenCalled();
    expect(
      document.querySelector('iframe[title="Print prescription"]')
    ).toBeTruthy();

    printStub.restore();
    document.querySelector('iframe[title="Print prescription"]')?.remove();
  });

  it("rejects when the signed URL cannot be fetched", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      blob: async () => new Blob([]),
    } as Response);

    await expect(
      printSignedPdf("https://storage.example/missing.pdf")
    ).rejects.toThrow("Could not load prescription PDF");
    fetchSpy.mockRestore();
  });
});
