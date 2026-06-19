import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import SubjectivePane from "@/components/patient-profile/panes/SubjectivePane";

vi.mock("@/components/ehr/sections/AllergiesSection", () => ({
  default: () => <div data-testid="allergies-stub" />,
}));
vi.mock("@/components/ehr/sections/ProblemOrientedMedicalSection", () => ({
  default: () => <div data-testid="problem-oriented-stub" />,
}));

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
  it("renders complaint cards, visit histories, and free-text fallback", () => {
    renderWithRxForm(<SubjectivePane hideHeader />);
    expect(screen.getByLabelText("Subjective")).toBeInTheDocument();
    expect(screen.getByLabelText("Chief complaints")).toBeInTheDocument();
    expect(screen.getByLabelText("Visit histories")).toBeInTheDocument();
    expect(screen.getByText("Free-text notes (optional)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Free-text notes (optional)"));
    expect(screen.getByLabelText("Additional history notes")).toBeInTheDocument();
  });

  it("omits the section H2 when hideHeader is true", () => {
    renderWithRxForm(<SubjectivePane hideHeader />);
    expect(screen.queryByRole("heading", { name: "Subjective" })).not.toBeInTheDocument();
  });

  it("mounts medical background and allergies zones when patient context is provided", () => {
    renderWithRxForm(
      <SubjectivePane hideHeader patientId="pat-1" token="test-token" />,
    );
    expect(screen.getByText("Patient background")).toBeInTheDocument();
    expect(screen.getByText("Allergies")).toBeInTheDocument();
    expect(screen.getByTestId("allergies-stub")).toBeInTheDocument();
    expect(screen.getByTestId("problem-oriented-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("problems-stub")).not.toBeInTheDocument();
  });

  it("hides patient chart zones without patient context", () => {
    renderWithRxForm(<SubjectivePane hideHeader />);
    expect(screen.queryByText("Patient background")).not.toBeInTheDocument();
    expect(screen.queryByText("Allergies")).not.toBeInTheDocument();
  });
});
