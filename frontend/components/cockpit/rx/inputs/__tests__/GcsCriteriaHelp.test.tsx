import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GcsCriteriaHelp } from "@/components/cockpit/rx/inputs/GcsCriteriaHelp";

describe("GcsCriteriaHelp", () => {
  it("opens full adult GCS reference from the title help control", () => {
    render(<GcsCriteriaHelp variant="title" />);

    expect(screen.queryByText("Spontaneous")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("gcs-criteria-help"));
    expect(screen.getByTestId("gcs-criteria-panel")).toBeInTheDocument();
    expect(screen.getByText("Adult GCS reference")).toBeInTheDocument();
    expect(screen.getByText("Spontaneous")).toBeInTheDocument();
    expect(screen.getByText("Obeys commands")).toBeInTheDocument();
  });

  it("opens component-only criteria beside E/V/M inputs", () => {
    render(<GcsCriteriaHelp componentKey="vitalsGcsV" variant="inline" />);

    fireEvent.click(screen.getByTestId("gcs-criteria-help-vitalsGcsV"));
    expect(screen.getByTestId("gcs-criteria-panel-vitalsGcsV")).toBeInTheDocument();
    expect(screen.getByText("Oriented")).toBeInTheDocument();
    expect(screen.queryByText("Spontaneous")).not.toBeInTheDocument();
  });
});
