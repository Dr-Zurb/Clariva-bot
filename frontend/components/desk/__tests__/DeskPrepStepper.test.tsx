import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeskPrepPanel, DeskPrepStepper } from "@/components/desk/DeskPrepPanel";

vi.mock("@/components/desk/DeskVitalsForm", () => ({
  DeskVitalsForm: ({ saveLabel }: { saveLabel?: string }) => (
    <button type="button">{saveLabel ?? "Save vitals"}</button>
  ),
}));

vi.mock("@/components/desk/DeskHistoryForm", () => ({
  DeskHistoryForm: ({ saveLabel }: { saveLabel?: string }) => (
    <button type="button">{saveLabel ?? "Save"}</button>
  ),
}));

vi.mock("@/components/desk/DeskDocumentsStrip", () => ({
  DeskDocumentsStrip: ({ finishLabel }: { finishLabel?: string }) => (
    <button type="button">{finishLabel ?? "Done"}</button>
  ),
}));

const SLOTS = ["vitals", "history", "internal_labs", "papers"] as const;

describe("DeskPrepStepper", () => {
  it("marks the current step", () => {
    render(<DeskPrepStepper slots={SLOTS} current="history" />);
    const history = screen.getByRole("button", { name: "Health record" });
    expect(history).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "Vitals" })).not.toHaveAttribute(
      "aria-current"
    );
    expect(
      screen.getByRole("button", { name: "Internal labs" })
    ).not.toHaveAttribute("aria-current");
  });

  it("lets you jump to another skippable step", () => {
    const onSelect = vi.fn();
    render(
      <DeskPrepStepper slots={SLOTS} current="papers" onSelect={onSelect} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Vitals" }));
    expect(onSelect).toHaveBeenCalledWith("vitals");
  });
});

describe("DeskPrepPanel sequence chrome", () => {
  it("hides the stepper and uses Done for one held slot", () => {
    render(
      <DeskPrepPanel
        token="tok"
        appointmentId="apt-1"
        sequence
        capabilities={["vitals"]}
      />
    );
    expect(screen.queryByTestId("desk-prep-stepper")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("shows the stepper in clinic order for two or more slots", () => {
    render(
      <DeskPrepPanel
        token="tok"
        appointmentId="apt-1"
        sequence
        capabilities={["papers", "vitals"]}
      />
    );
    const stepper = screen.getByTestId("desk-prep-stepper");
    const steps = within(stepper)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(steps).toEqual(["Vitals", "Patient files"]);
    expect(
      screen.getByRole("button", { name: "Save and next" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Patient files" }));
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });
});
