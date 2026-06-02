/**
 * ppd-02 — PrescriptionFormCompositionRoot omits Subjective/Objective when lifted.
 */

import { useCallback, useRef, useState } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import {
  PrescriptionFormCompositionRoot,
  type PrescriptionFormCompositionRootProps,
} from "@/components/cockpit/rx/PrescriptionFormCompositionRoot";
import type { DrugMasterRow } from "@/types/drug-master";

vi.mock("@/components/cockpit/rx/sections/PlanSection", () => ({
  PlanSection: () => (
    <section aria-label="Plan" data-testid="rx-section-plan" />
  ),
}));

const prescriptionIdRef = { current: null as string | null };

function renderCompositionRoot(
  props: Partial<PrescriptionFormCompositionRootProps> = {},
) {
  function Harness() {
    const [medicineInstanceIds, setMedicineInstanceIds] = useState<string[]>(
      [],
    );
    const nextIdRef = useRef(0);
    const generateInstanceIds = useCallback((count: number) => {
      return Array.from({ length: count }, () => {
        nextIdRef.current += 1;
        return `instance-${nextIdRef.current}`;
      });
    }, []);
    const [drugMasterIndex, setDrugMasterIndex] = useState<
      ReadonlyMap<string, DrugMasterRow>
    >(new Map());

    return (
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="t"
        entryMode="structured"
        initialFields={createEmptyRxFormFields()}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <PrescriptionFormCompositionRoot
          token="t"
          medicineInstanceIds={medicineInstanceIds}
          setMedicineInstanceIds={setMedicineInstanceIds}
          generateInstanceIds={generateInstanceIds}
          drugMasterIndex={drugMasterIndex}
          setDrugMasterIndex={setDrugMasterIndex}
          allergies={[]}
          ddiInteractions={[]}
          isAcked={() => false}
          onAcknowledge={vi.fn()}
          onAckDdi={vi.fn()}
          {...props}
        />
      </RxFormProvider>
    );
  }

  return render(<Harness />);
}

function expectAllFourSections(): void {
  expect(screen.getByRole("region", { name: "Subjective" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Objective" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Assessment" })).toBeInTheDocument();
  expect(screen.getByTestId("rx-section-plan")).toBeInTheDocument();
}

describe("PrescriptionFormCompositionRoot", () => {
  it("default — renders all four SOAP sections", () => {
    renderCompositionRoot();
    expectAllFourSections();
  });

  it("subjectiveLifted — omits SubjectiveSection", () => {
    renderCompositionRoot({ subjectiveLifted: true });
    expect(
      screen.queryByRole("region", { name: "Subjective" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Objective" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Assessment" })).toBeInTheDocument();
    expect(screen.getByTestId("rx-section-plan")).toBeInTheDocument();
  });

  it("objectiveLifted — omits ObjectiveSection", () => {
    renderCompositionRoot({ objectiveLifted: true });
    expect(screen.getByRole("region", { name: "Subjective" })).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Objective" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Assessment" })).toBeInTheDocument();
    expect(screen.getByTestId("rx-section-plan")).toBeInTheDocument();
  });

  it("both lifted — only Assessment + Plan render", () => {
    renderCompositionRoot({
      subjectiveLifted: true,
      objectiveLifted: true,
    });
    expect(
      screen.queryByRole("region", { name: "Subjective" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Objective" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Assessment" })).toBeInTheDocument();
    expect(screen.getByTestId("rx-section-plan")).toBeInTheDocument();
  });

  it("defaults preserved — omitting lift props matches explicit false", () => {
    const { unmount: unmountDefault } = renderCompositionRoot();
    expectAllFourSections();
    unmountDefault();

    renderCompositionRoot({
      subjectiveLifted: false,
      objectiveLifted: false,
    });
    expectAllFourSections();
  });
});
