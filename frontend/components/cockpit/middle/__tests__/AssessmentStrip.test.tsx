import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { AssessmentStrip } from "@/components/cockpit/middle/AssessmentStrip";

const prescriptionIdRef = { current: null as string | null };

function renderWithRxForm(
  ui: ReactElement,
  initialFields = createEmptyRxFormFields(),
) {
  return render(
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
      {ui}
    </RxFormProvider>,
  );
}

describe("AssessmentStrip", () => {
  it('renders Dx input with id="diagnosis"', () => {
    renderWithRxForm(<AssessmentStrip state="live" />, {
      ...createEmptyRxFormFields(),
      provisionalDiagnosis: "URI",
    });
    const input = screen.getByLabelText(/working dx/i);
    expect(input).toHaveAttribute("id", "diagnosis");
    expect(input).toHaveValue("URI");
  });

  it("disables input when state is ended", () => {
    renderWithRxForm(<AssessmentStrip state="ended" />);
    expect(screen.getByLabelText(/working dx/i)).toBeDisabled();
  });

  it("hides DDx add affordance when state is ended", () => {
    renderWithRxForm(
      <AssessmentStrip state="ended" />,
      {
        ...createEmptyRxFormFields(),
        differentialDiagnosis: ["Pneumonia"],
      },
    );
    expect(screen.getByText("Pneumonia")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /differential/i })).not.toBeInTheDocument();
  });

  it("updates Dx via setField on change", () => {
    renderWithRxForm(<AssessmentStrip state="live" />);
    const input = screen.getByLabelText(/working dx/i);
    fireEvent.change(input, { target: { value: "Asthma" } });
    expect(input).toHaveValue("Asthma");
  });
});

describe("AssessmentStrip zero-state (cpv-01)", () => {
  it("collapses to ~24px hint when state=ready (waiting) and no Dx", () => {
    renderWithRxForm(<AssessmentStrip state="ready" />);
    expect(
      screen.getByText(/diagnosis appears here once the doctor enters one/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", {
        name: /working diagnosis and differentials/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("expands when state transitions to live", () => {
    renderWithRxForm(<AssessmentStrip state="live" />);
    expect(
      screen.queryByText(/diagnosis appears here/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: /working diagnosis and differentials/i,
      }),
    ).toBeInTheDocument();
  });

  it("expands when Dx is entered even in ready (waiting) state", () => {
    renderWithRxForm(<AssessmentStrip state="ready" />, {
      ...createEmptyRxFormFields(),
      provisionalDiagnosis: "URI",
    });
    expect(
      screen.queryByText(/diagnosis appears here/i),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/working dx/i)).toBeInTheDocument();
  });
});
