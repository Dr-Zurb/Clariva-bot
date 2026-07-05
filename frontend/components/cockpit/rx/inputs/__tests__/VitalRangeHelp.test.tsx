import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VitalRangeHelp } from "@/components/cockpit/rx/inputs/VitalRangeHelp";
import { BP_ACC_AHA_ADULT_RANGES } from "@/lib/cockpit/vital-range-reference";

describe("VitalRangeHelp", () => {
  it("opens BP reference with ACC/AHA tiers", async () => {
    render(<VitalRangeHelp kind="bp" />);

    fireEvent.click(screen.getByTestId("vital-range-help-bp"));

    await waitFor(() => {
      expect(screen.getByTestId("vital-range-help-panel-bp")).toBeInTheDocument();
    });

    for (const row of BP_ACC_AHA_ADULT_RANGES) {
      expect(screen.getByText(row.label)).toBeInTheDocument();
      expect(screen.getByText(row.range)).toBeInTheDocument();
    }
  });

  it("shows current reading banner when category provided", async () => {
    render(
      <VitalRangeHelp
        kind="vitalsTempC"
        currentCategory={{
          severity: "moderate",
          label: "Fever",
          direction: "high",
          source: "CDC / SCCM",
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("vital-range-help-vitalsTempC"));

    await waitFor(() => {
      expect(screen.getByTestId("vital-range-help-current-reading")).toBeInTheDocument();
    });

    expect(screen.getByTestId("vital-range-help-current-reading")).toHaveTextContent("Fever");
    expect(screen.getByText(/Hypothermia/i)).toBeInTheDocument();
  });

  it("opens glucose reference with timing-specific sections", async () => {
    render(<VitalRangeHelp kind="glucose" glucoseTiming="fasting" />);

    fireEvent.click(screen.getByTestId("vital-range-help-glucose"));

    await waitFor(() => {
      expect(screen.getByTestId("vital-range-help-panel-glucose")).toBeInTheDocument();
    });

    expect(screen.getByText(/Fasting \/ pre-meal/i)).toBeInTheDocument();
    expect(screen.queryByText(/Post-prandial \/ random/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Normal fasting/i)).toBeInTheDocument();
  });

  it("shows both glucose timing tables when timing is unknown", async () => {
    render(<VitalRangeHelp kind="glucose" />);

    fireEvent.click(screen.getByTestId("vital-range-help-glucose"));

    await waitFor(() => {
      expect(screen.getByTestId("vital-range-help-panel-glucose")).toBeInTheDocument();
    });

    expect(screen.getByText(/Post-prandial \/ random/i)).toBeInTheDocument();
  });
});
