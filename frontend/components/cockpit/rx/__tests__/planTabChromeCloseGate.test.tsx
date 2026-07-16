/**
 * plan-c-04 — Plan tab chrome close gate.
 *
 * Proves W0–W2 (reorder + L1 cards + Advice/Education L2) without new product
 * behaviour. Product logic lives in PlanSection; this file only verifies the gate.
 * med-lib-01 — Medications zone uses section templates (no favorites / starter packs).
 */
import { useCallback, useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type RxMedicine,
} from "@/components/cockpit/rx/RxFormContext";
import { PlanSection } from "@/components/cockpit/rx/sections/PlanSection";
import {
  SOAP_TAB_FAMILY_ACCENT,
  SOAP_TAB_HEADING_ICON,
} from "@/components/cockpit/rx/sections/section-chrome";
import {
  DEPTH_TONE_RECESSED_SURFACE,
} from "@/components/ui/sticky-stack";

vi.mock("@/components/ehr/DrugAutocomplete", () => ({
  default: ({
    inputId,
    value,
    placeholder,
  }: {
    inputId?: string;
    value: string;
    placeholder?: string;
  }) => (
    <input
      id={inputId}
      aria-label={placeholder ?? "Medicine name"}
      value={value}
      readOnly
      onChange={() => undefined}
    />
  ),
}));

vi.mock("@/components/cockpit/rx/plan/AdviceHandoutsStrip", () => ({
  AdviceHandoutsStrip: () => <div data-testid="advice-handouts-strip" />,
}));

const prescriptionIdRef = { current: null as string | null };

function completeMedicine(name: string): RxMedicine {
  return {
    medicineName: name,
    dosage: "500mg",
    route: "",
    frequency: "Three times daily",
    duration: "5 days",
    instructions: "",
    drugMasterId: null,
    frequencyCode: "TID",
    durationValue: 5,
    durationUnit: "days",
    routeCode: null,
    doseQty: null,
    doseUnit: null,
    form: null,
    foodTiming: null,
  };
}

function PlanCloseGateHarness() {
  const medicines = [completeMedicine("Ibuprofen")];
  const [medicineInstanceIds, setMedicineInstanceIds] = useState(["instance-a"]);
  const nextIdRef = useRef(1);
  const generateInstanceIds = useCallback((count: number) => {
    return Array.from({ length: count }, () => {
      nextIdRef.current += 1;
      return `instance-${nextIdRef.current}`;
    });
  }, []);

  return (
    <div data-cockpit-pane-id="plan">
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={{
          ...createEmptyRxFormFields(medicines),
          medicines,
        }}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <PlanSection
          heading="Plan"
          safetyLifted
          token="test-token"
          medicineInstanceIds={medicineInstanceIds}
          setMedicineInstanceIds={setMedicineInstanceIds}
          generateInstanceIds={generateInstanceIds}
          drugMasterIndex={new Map()}
          setDrugMasterIndex={() => {}}
          allergies={[]}
          ddiInteractions={[]}
          isAcked={() => false}
          onAcknowledge={() => {}}
          onAckDdi={() => {}}
        />
      </RxFormProvider>
    </div>
  );
}

function renderCloseGate() {
  return render(<PlanCloseGateHarness />);
}

function assertFollows(earlier: HTMLElement, later: HTMLElement) {
  expect(
    earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
}

describe("plan-c-04 · authoring order (PLAN-C2)", () => {
  it("orders Investigations → Medications → Follow-up → Advice → Referral → Notes", () => {
    renderCloseGate();

    const zones = [
      screen.getByTestId("plan-investigations-zone"),
      screen.getByTestId("plan-medications-zone"),
      screen.getByTestId("plan-follow-up-zone"),
      screen.getByTestId("plan-advice-zone"),
      screen.getByTestId("plan-referral-zone"),
      screen.getByTestId("plan-notes-zone"),
    ];

    for (let i = 0; i < zones.length - 1; i += 1) {
      assertFollows(zones[i]!, zones[i + 1]!);
    }
  });
});

describe("plan-c-04 · depth + family accent (PLAN-C3/C4/C5)", () => {
  it("tab root has no depthTone; L1 shells are recessed with plan accent", () => {
    renderCloseGate();

    const root = screen.getByTestId("plan-scroll-top");
    expect(root.className).not.toContain(DEPTH_TONE_RECESSED_SURFACE);
    expect(root.className).not.toContain(SOAP_TAB_FAMILY_ACCENT.plan);

    const heading = screen.getByRole("heading", { name: "Plan" });
    expect(heading.className).toContain(SOAP_TAB_FAMILY_ACCENT.plan);
    expect(SOAP_TAB_HEADING_ICON.plan).toBeDefined();

    for (const testId of [
      "plan-investigations-zone",
      "plan-medications-zone",
      "plan-follow-up-zone",
      "plan-advice-zone",
      "plan-referral-zone",
      "plan-notes-zone",
    ]) {
      const zone = screen.getByTestId(testId);
      expect(zone.className).toContain(DEPTH_TONE_RECESSED_SURFACE);
      expect(zone.className).toContain(SOAP_TAB_FAMILY_ACCENT.plan);
    }
  });

  it("Advice is a single L1 section with handouts (no education L2)", () => {
    renderCloseGate();

    expect(screen.getByTestId("plan-advice-zone")).toBeInTheDocument();
    expect(screen.getByTestId("advice-handouts-strip")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-advice-l2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-education-l2")).not.toBeInTheDocument();
  });
});

describe("plan-c-04 · a11y — not colour-only", () => {
  it("L1 Advice uses recessed luminance surface, not hue card backgrounds", () => {
    renderCloseGate();

    const l1 = screen.getByTestId("plan-advice-zone");

    expect(l1.className).toContain("bg-muted/30");
    expect(l1.className).not.toMatch(/bg-(primary|accent|emerald|violet)/);
  });
});

describe("plan-c-04 · behaviour invariants (PLAN-C7)", () => {
  it("Medications L1 collapse/expand still works", () => {
    renderCloseGate();

    const toggle = screen.getByRole("button", { name: /Toggle Medications/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("medicines section template chrome lives inside Medications", () => {
    renderCloseGate();

    const meds = screen.getByTestId("plan-medications-zone");
    expect(meds).toContainElement(screen.getByTestId("medicines-section-template"));
    expect(screen.queryByTestId("favorites-chip-strip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-starter-packs")).not.toBeInTheDocument();
  });
});
