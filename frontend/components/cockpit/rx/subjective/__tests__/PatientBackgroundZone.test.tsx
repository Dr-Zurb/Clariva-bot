import { fireEvent, render, screen } from "@testing-library/react";
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
  PastSurgicalHistoryField: ({
    sectionOpen,
    onSectionOpenChange,
  }: {
    sectionOpen?: boolean;
    onSectionOpenChange?: (open: boolean) => void;
  }) => (
    <button
      type="button"
      data-testid="past-surgical-toggle"
      aria-expanded={sectionOpen ?? false}
      onClick={() => onSectionOpenChange?.(!(sectionOpen ?? false))}
    >
      Toggle Past surgical history
    </button>
  ),
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
    expect(screen.getByTestId("past-surgical-toggle")).toBeInTheDocument();
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

  it("accordion: opening past surgical closes past medical history", () => {
    renderZone();

    const pmh = screen.getByRole("button", { name: /Toggle past medical history/i });
    const surgical = screen.getByTestId("past-surgical-toggle");

    expect(pmh).toHaveAttribute("aria-expanded", "true");
    expect(surgical).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(surgical);
    expect(surgical).toHaveAttribute("aria-expanded", "true");
    expect(pmh).toHaveAttribute("aria-expanded", "false");
  });
});
