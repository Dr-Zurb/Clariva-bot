import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import SubjectivePane from "@/components/patient-profile/panes/SubjectivePane";

const prescriptionIdRef = { current: null as string | null };

function renderWithRxForm(ui: ReactElement) {
  return render(
    <RxFormProvider
      appointmentId="appt-1"
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

describe("SubjectivePane", () => {
  it("renders CC and HOPI fields inside RxFormProvider", () => {
    renderWithRxForm(<SubjectivePane hideHeader />);
    expect(screen.getByLabelText("Subjective")).toBeInTheDocument();
    expect(screen.getByLabelText(/Chief complaint/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/History of present illness/i)).toBeInTheDocument();
  });

  it("omits the section H2 when hideHeader is true", () => {
    renderWithRxForm(<SubjectivePane hideHeader />);
    expect(screen.queryByRole("heading", { name: "Subjective" })).not.toBeInTheDocument();
  });
});
