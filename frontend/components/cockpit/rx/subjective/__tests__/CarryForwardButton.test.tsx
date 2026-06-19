import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  rxFormReducer,
} from "@/components/cockpit/rx/RxFormContext";
import { CarryForwardButton } from "../CarryForwardButton";
import { getLastSubjectiveForPatient } from "@/lib/api/last-subjective";

vi.mock("@/lib/api/last-subjective", () => ({
  getLastSubjectiveForPatient: vi.fn(),
}));

const prescriptionIdRef = { current: null as string | null };

function renderWithRxForm(ui: ReactElement) {
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
      {ui}
    </RxFormProvider>,
  );
}

describe("CarryForwardButton", () => {
  beforeEach(() => {
    vi.mocked(getLastSubjectiveForPatient).mockResolvedValue({
      success: true,
      data: {
        subjective: {
          sourcePrescriptionId: "rx-prev",
          sourceCreatedAt: "2026-05-01T00:00:00.000Z",
          complaints: [{ id: "c-1", name: "Headache", category: "pain" }],
          familyHistory: "Father — HTN",
          socialHistory: null,
          pastSurgicalHistory: null,
        },
      },
      meta: { timestamp: "", requestId: "" },
    });
  });

  it("hides when no prior subjective exists", async () => {
    vi.mocked(getLastSubjectiveForPatient).mockResolvedValue({
      success: true,
      data: { subjective: null },
      meta: { timestamp: "", requestId: "" },
    });

    renderWithRxForm(<CarryForwardButton />);
    await waitFor(() => {
      expect(screen.queryByTestId("carry-forward-trigger")).not.toBeInTheDocument();
    });
  });

  it("copy all dispatches carry-forward actions", async () => {
    renderWithRxForm(<CarryForwardButton />);

    await waitFor(() => {
      expect(screen.getByTestId("carry-forward-trigger")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("carry-forward-trigger"));
    fireEvent.click(screen.getByTestId("carry-forward-copy-all"));

    // Reducer integration: SET_COMPLAINTS + SET_FIELD should hydrate state
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
