import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CockpitVitalsStrip } from "@/components/cockpit/middle/CockpitVitalsStrip";
import { createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";

const fields = createEmptyRxFormFields();

vi.mock("@/components/cockpit/rx/inputs/useLastVisitVitals", () => ({
  useDeskVisitVitals: () => null,
  useDeskVisitVitalsNote: () => null,
}));

vi.mock("@/components/cockpit/rx/RxFormContext", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/components/cockpit/rx/RxFormContext")
    >();
  return {
    ...actual,
    useRxForm: () => ({
      state: { fields },
    }),
  };
});

describe("CockpitVitalsStrip", () => {
  it("keeps the Vitals label when values are empty", () => {
    Object.assign(fields, createEmptyRxFormFields());
    render(<CockpitVitalsStrip />);
    expect(screen.getByTestId("cockpit-vitals-strip")).toBeInTheDocument();
    expect(screen.getByText("Vitals")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the live vitals line", () => {
    Object.assign(fields, createEmptyRxFormFields(), {
      vitalsBpReadings: [{ systolic: 120, diastolic: 80 }],
      vitalsSectionNote: "234234",
    });
    render(<CockpitVitalsStrip />);
    expect(screen.getByLabelText(/Visit vitals/i)).toBeInTheDocument();
    expect(screen.getByText("BP 120/80 — 234234")).toBeInTheDocument();
  });
});
