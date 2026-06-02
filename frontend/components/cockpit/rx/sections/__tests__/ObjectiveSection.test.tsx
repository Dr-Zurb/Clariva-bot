import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import { EXAM_DELIMITER } from "@/lib/cockpit/exam-findings";

const prescriptionIdRef = { current: null as string | null };

function renderSection(initial?: Partial<RxFormFields>) {
  const initialFields = {
    ...createEmptyRxFormFields(),
    ...initial,
  };

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
      <ObjectiveSection />
    </RxFormProvider>,
  );
}

function renderSectionDisabled(ui: ReactElement) {
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

describe("ObjectiveSection — R-HISTORY enhancements", () => {
  it("renders Vitals grid + 3 textareas + collapsed legacy", () => {
    renderSection();
    expect(screen.getByLabelText(/General examination/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Systemic examination/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Test results/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Show legacy free-text vitals/i),
    ).toBeInTheDocument();
    const legacyInput = screen.getByLabelText(/Vitals \(free-text — legacy\)/i);
    expect(legacyInput.closest("details")?.open).toBe(false);
  });

  it("parses legacy examinationFindings into General textarea", () => {
    renderSection({ examinationFindings: "Pale, afebrile." });
    const general = screen.getByLabelText(
      /General examination/i,
    ) as HTMLTextAreaElement;
    const systemic = screen.getByLabelText(
      /Systemic examination/i,
    ) as HTMLTextAreaElement;
    expect(general.value).toBe("Pale, afebrile.");
    expect(systemic.value).toBe("");
  });

  it("parses delimited examinationFindings into both textareas", () => {
    renderSection({
      examinationFindings: `Alert${EXAM_DELIMITER}Chest clear`,
    });
    const general = screen.getByLabelText(
      /General examination/i,
    ) as HTMLTextAreaElement;
    const systemic = screen.getByLabelText(
      /Systemic examination/i,
    ) as HTMLTextAreaElement;
    expect(general.value).toBe("Alert");
    expect(systemic.value).toBe("Chest clear");
  });

  it("serializes back to delimited form on edit", () => {
    renderSection({ examinationFindings: "Alert" });
    const systemic = screen.getByLabelText(
      /Systemic examination/i,
    ) as HTMLTextAreaElement;
    fireEvent.change(systemic, { target: { value: "Chest clear" } });
    expect(systemic.value).toBe("Chest clear");
    const general = screen.getByLabelText(
      /General examination/i,
    ) as HTMLTextAreaElement;
    expect(general.value).toBe("Alert");
  });

  it("disables all inputs when disabled prop set", () => {
    const { container } = renderSectionDisabled(<ObjectiveSection disabled />);
    const generalEl = container.querySelector("#exam-general");
    expect(generalEl).toBeDisabled();
  });
});

describe("ObjectiveSection visual split (cpv-04)", () => {
  it("renders both labels with icons", () => {
    renderSection();
    expect(screen.getByText("General Examination")).toBeInTheDocument();
    expect(screen.getByText("Systemic Examination")).toBeInTheDocument();
  });

  it("each textarea is labelled correctly", () => {
    renderSection();
    expect(screen.getByLabelText("General Examination")).toBeInTheDocument();
    expect(screen.getByLabelText("Systemic Examination")).toBeInTheDocument();
  });

  it("typing in General does not affect Systemic", () => {
    renderSection();
    fireEvent.change(screen.getByLabelText("General Examination"), {
      target: { value: "alert and oriented" },
    });
    expect(screen.getByLabelText("Systemic Examination")).toHaveValue("");
  });

  it("placeholders are visible clinical examples", () => {
    renderSection();
    expect(
      screen.getByPlaceholderText(/alert, oriented/i),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/chest clear/i),
    ).toBeInTheDocument();
  });
});
