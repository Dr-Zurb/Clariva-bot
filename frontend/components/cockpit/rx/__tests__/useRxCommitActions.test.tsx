import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRxCommitActions } from "@/components/cockpit/rx/useRxCommitActions";
import {
  RxFormProvider,
  createEmptyRxFormFields,
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

function makeShell(): RxFormProviderSetup {
  const prescriptionIdRef = { current: "rx-1" as string | null };
  return {
    loading: false,
    initialFields: createEmptyRxFormFields(),
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
    providerProps: {
      key: "test",
      appointmentId: "appt-1",
      patientId: "pat-1",
      token: "token",
      entryMode: "structured",
      initialFields: createEmptyRxFormFields(),
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
});
