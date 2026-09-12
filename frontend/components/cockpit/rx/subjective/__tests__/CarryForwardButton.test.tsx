import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  rxFormReducer,
} from "@/components/cockpit/rx/RxFormContext";
import { CarryForwardButton } from "../CarryForwardButton";
import { LastVisitSummaryProvider } from "@/hooks/useLastVisitSummary";
import { getLastSubjectiveForPatient } from "@/lib/api/last-subjective";
import type { LastVisitSummary } from "@/lib/api/last-visit-summary";

vi.mock("@/lib/api/last-subjective", () => ({
  getLastSubjectiveForPatient: vi.fn(),
}));

const prescriptionIdRef = { current: null as string | null };

const SUBJECTIVE_SUMMARY: LastVisitSummary = {
  sourcePrescriptionId: "rx-prev",
  sourceCreatedAt: "2026-05-01T00:00:00.000Z",
  complaints: [{ id: "c-1", name: "Headache", category: "pain" }],
  diagnoses: [],
  provisionalDiagnosis: null,
  medicines: [],
  investigationsOrders: null,
  advice: null,
  followUp: null,
  followUpValue: null,
  followUpUnit: null,
  familyHistory: "Father — HTN",
  socialHistory: null,
  pastSurgicalHistory: null,
};

const MEDICINES_ONLY_SUMMARY: LastVisitSummary = {
  ...SUBJECTIVE_SUMMARY,
  complaints: [],
  familyHistory: null,
  medicines: [
    {
      medicineName: "Dextromethorphan",
      dosage: "1 tds",
      route: "",
      frequency: "tds",
      duration: "5 days",
      instructions: "",
      drugMasterId: null,
      frequencyCode: null,
      durationValue: 5,
      durationUnit: "days",
      routeCode: null,
      doseQty: 1,
      doseUnit: "spoon",
      form: "syrup",
      foodTiming: null,
    },
  ],
};

function renderWithRxForm(
  ui: ReactElement,
  summary?: LastVisitSummary | null,
) {
  return render(
    <RxFormProvider
      appointmentId="appt-current"
      patientId="pat-1"
      token="test-token"
      entryMode="structured"
      initialFields={createEmptyRxFormFields()}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      {summary === undefined ? (
        ui
      ) : (
        <LastVisitSummaryProvider value={summary}>{ui}</LastVisitSummaryProvider>
      )}
    </RxFormProvider>,
  );
}

describe("CarryForwardButton", () => {
  beforeEach(() => {
    vi.mocked(getLastSubjectiveForPatient).mockClear();
  });

  it("hides when no last-visit summary is provided", () => {
    renderWithRxForm(<CarryForwardButton />, null);
    expect(screen.queryByTestId("carry-forward-trigger")).not.toBeInTheDocument();
    expect(getLastSubjectiveForPatient).not.toHaveBeenCalled();
  });

  it("hides when last visit has no carryable subjective fields", () => {
    renderWithRxForm(<CarryForwardButton />, MEDICINES_ONLY_SUMMARY);
    expect(screen.queryByTestId("carry-forward-trigger")).not.toBeInTheDocument();
    expect(getLastSubjectiveForPatient).not.toHaveBeenCalled();
  });

  it("copy all uses the shared last-visit summary and does not fetch last-subjective", () => {
    renderWithRxForm(<CarryForwardButton />, SUBJECTIVE_SUMMARY);

    expect(getLastSubjectiveForPatient).not.toHaveBeenCalled();
    expect(screen.getByTestId("carry-forward-trigger")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("carry-forward-trigger"));
    fireEvent.click(screen.getByTestId("carry-forward-copy-all"));

    const initial = {
      fields: createEmptyRxFormFields(),
      isDirty: false,
      isSaving: false,
      isSubmitting: false,
      lastSavedAt: null,
      submitError: null,
    };

    let state = initial;
    state = rxFormReducer(state, {
      type: "SET_COMPLAINTS",
      complaints: [{ id: "new-1", name: "Headache", category: "pain" }],
    });
    state = rxFormReducer(state, {
      type: "SET_FIELD",
      key: "familyHistory",
      value: "Father — HTN",
    });

    expect(state.fields.complaints).toHaveLength(1);
    expect(state.fields.complaints[0].name).toBe("Headache");
    expect(state.fields.familyHistory).toBe("Father — HTN");
    expect(state.isDirty).toBe(true);
  });
});
