import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DerivedVitalsHelp } from "@/components/cockpit/rx/inputs/DerivedVitalsHelp";
import { BMI_WHO_ADULT_RANGES } from "@/lib/cockpit/bmi";

describe("DerivedVitalsHelp", () => {
  it("opens a panel with WHO BMI ranges and BSA formula", async () => {
    render(<DerivedVitalsHelp />);

    fireEvent.click(screen.getByTestId("derived-vitals-help"));

    await waitFor(() => {
      expect(screen.getByTestId("derived-vitals-help-panel")).toBeInTheDocument();
    });

    for (const row of BMI_WHO_ADULT_RANGES) {
      expect(screen.getByText(row.label)).toBeInTheDocument();
      expect(screen.getByText(row.range)).toBeInTheDocument();
    }

    expect(screen.getByText(/Mosteller/i)).toBeInTheDocument();
    expect(screen.getByText(/no single universal normal range/i)).toBeInTheDocument();
  });
});
