import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { RxLockProvider } from "@/components/cockpit/rx/useRxLock";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import { AssessmentSection } from "@/components/cockpit/rx/sections/AssessmentSection";
import { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";
import { PlanSection } from "@/components/cockpit/rx/sections/PlanSection";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: vi.fn().mockResolvedValue({
      data: { settings: {} },
    }),
    getAppointmentById: vi.fn().mockResolvedValue({
      data: { appointment: { consultation_type: "in_clinic" } },
    }),
    patchDoctorSettings: vi.fn(),
    updatePrescription: vi.fn(),
    createPrescription: vi.fn(),
  };
});

function renderEnded(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="t"
        entryMode="structured"
        initialFields={createEmptyRxFormFields()}
        autosaveEnabled={false}
        prescriptionIdRef={{ current: null }}
        onPrescriptionCreated={() => {}}
      >
        <RxLockProvider cockpitState="ended">{ui}</RxLockProvider>
      </RxFormProvider>
    </QueryClientProvider>,
  );
}

describe("rxl-01 lock integrity", () => {
  it("locks objective notes and exam when the visit is ended", async () => {
    renderEnded(<ObjectiveSection heading={null} />);
    expect(await screen.findByTestId("objective-notes-textarea")).toBeDisabled();
  });

  it("locks assessment impression when the visit is ended", async () => {
    renderEnded(<AssessmentSection heading={null} />);
    expect(
      await screen.findByPlaceholderText(
        "Clinical impression, reasoning, and other notes",
      ),
    ).toBeDisabled();
  });

  it("locks subjective when the visit is ended", async () => {
    renderEnded(<SubjectiveSection heading={null} />);
    expect(await screen.findByTestId("subjective-clear-all")).toBeDisabled();
    fireEvent.click(screen.getByTestId("subjective-expand-all"));
    expect(
      await screen.findByLabelText("Additional history notes"),
    ).toBeDisabled();
  });

  it("locks plan follow-up notes and hides investigation search when the visit is ended", async () => {
    renderEnded(
      <PlanSection
        heading={null}
        safetyLifted
        token="t"
        medicineInstanceIds={[]}
        setMedicineInstanceIds={() => {}}
        generateInstanceIds={() => []}
        drugMasterIndex={new Map()}
        setDrugMasterIndex={() => {}}
        allergies={[]}
        ddiInteractions={[]}
        isAcked={() => false}
        onAcknowledge={() => {}}
        onAckDdi={() => {}}
      />,
    );
    expect(await screen.findByTestId("investigations-chip-row")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search panel, test, or imaging…"),
    ).not.toBeInTheDocument();
    const followUpToggle = await screen.findByRole("button", {
      name: /Toggle Follow-up/i,
    });
    if (followUpToggle.getAttribute("aria-expanded") === "false") {
      fireEvent.click(followUpToggle);
    }
    expect(screen.getByLabelText(/^Notes$/)).toBeDisabled();
  });
});
