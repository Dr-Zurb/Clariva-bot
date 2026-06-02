import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import ObjectivePane from "@/components/patient-profile/panes/ObjectivePane";

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

describe("ObjectivePane", () => {
  it("renders vitals and exam fields inside RxFormProvider", () => {
    renderWithRxForm(<ObjectivePane hideHeader />);
    expect(screen.getByLabelText("Objective")).toBeInTheDocument();
    expect(screen.getByLabelText(/General examination/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Systemic examination/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Test results/i)).toBeInTheDocument();
    expect(screen.getByText(/Show legacy free-text vitals/i)).toBeInTheDocument();
  });

  it("omits the section H2 when hideHeader is true", () => {
    renderWithRxForm(<ObjectivePane hideHeader />);
    expect(screen.queryByRole("heading", { name: "Objective" })).not.toBeInTheDocument();
  });
});
