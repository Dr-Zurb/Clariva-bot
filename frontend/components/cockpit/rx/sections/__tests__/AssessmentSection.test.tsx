import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { AssessmentSection } from "@/components/cockpit/rx/sections/AssessmentSection";

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

describe("AssessmentSection", () => {
  it("renders legacy Dx input and DDx when dxLifted is false", () => {
    renderWithRxForm(<AssessmentSection />);
    expect(screen.getByLabelText(/provisional diagnosis/i)).toHaveAttribute(
      "id",
      "diagnosis",
    );
    expect(screen.getByLabelText(/differential diagnosis/i)).toBeInTheDocument();
  });

  it("renders summary and hides Dx + DDx when dxLifted is true", () => {
    renderWithRxForm(
      <AssessmentSection dxLifted />,
      {
        ...createEmptyRxFormFields(),
        provisionalDiagnosis: "Asthma",
      },
    );
    expect(
      screen.getByText(/working dx is in the strip above/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asthma" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/provisional diagnosis/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/differential diagnosis/i)).not.toBeInTheDocument();
  });

  it("focuses strip Dx input when summary button is clicked", () => {
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, "focus");
    render(
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={{
          ...createEmptyRxFormFields(),
          provisionalDiagnosis: "Asthma",
        }}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <input id="diagnosis" aria-label="Working Dx" />
        <AssessmentSection dxLifted />
      </RxFormProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Asthma" }));
    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });
});
