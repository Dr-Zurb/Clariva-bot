import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { PatientBackgroundZone } from "../PatientBackgroundZone";

const pomProps: Array<Record<string, unknown>> = [];
const prescriptionIdRef = { current: null as string | null };

vi.mock("@/components/ehr/sections/ProblemOrientedMedicalSection", () => ({
  default: (props: Record<string, unknown>) => {
    pomProps.push(props);
    return <div data-testid="problem-oriented-stub" />;
  },
}));

vi.mock("@/components/cockpit/rx/subjective/PastSurgicalHistoryField", () => ({
  PastSurgicalHistoryField: () => <div data-testid="past-surgical-stub" />,
}));

function renderZone(mode: "default" | "readonly" = "default") {
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
      <PatientBackgroundZone patientId="pat-1" token="test-token" mode={mode} />
    </RxFormProvider>,
  );
}

describe("PatientBackgroundZone", () => {
  it("mounts problem-oriented medical section with patient context", () => {
    renderZone();

    expect(screen.getByTestId("patient-background-zone")).toBeInTheDocument();
    expect(screen.getByText("Patient background")).toBeInTheDocument();
    expect(screen.getByTestId("problem-oriented-stub")).toBeInTheDocument();
    expect(screen.getByTestId("past-surgical-stub")).toBeInTheDocument();
    expect(screen.getByText("Past medical history")).toBeInTheDocument();
    expect(screen.queryByTestId("allergies-stub")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\+ Add/i })).not.toBeInTheDocument();

    expect(pomProps.at(-1)).toMatchObject({
      patientId: "pat-1",
      token: "test-token",
      layout: "in-call",
      mode: "default",
    });
  });

  it("passes readonly mode to problem-oriented section", () => {
    renderZone("readonly");

    expect(pomProps.at(-1)).toMatchObject({ mode: "readonly" });
    expect(screen.queryByRole("button", { name: /\+ Add/i })).not.toBeInTheDocument();
  });
});
