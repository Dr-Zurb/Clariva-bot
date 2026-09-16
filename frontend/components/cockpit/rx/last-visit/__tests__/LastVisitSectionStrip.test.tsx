import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LastVisitSectionStrip } from "@/components/cockpit/rx/last-visit/LastVisitSectionStrip";

describe("LastVisitSectionStrip", () => {
  it("renders nothing without items", () => {
    const { container } = render(
      <LastVisitSectionStrip visitDate="12 Aug" summary="" items={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("stays expanded so last-visit items are visible without a click", () => {
    render(
      <LastVisitSectionStrip
        visitDate="12 Aug"
        summary=""
        items={[
          {
            key: "c1",
            label: "Cough",
            actions: [{ label: "Improving", onClick: vi.fn() }],
          },
        ]}
        testId="last-visit-complaints"
      />
    );
    expect(
      screen.getByTestId("last-visit-complaints-header")
    ).toHaveTextContent("Last visit (12 Aug)");
    expect(
      screen.getByTestId("last-visit-complaints-header")
    ).not.toHaveTextContent("Cough");
    expect(
      screen.getByTestId("last-visit-complaints-items")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("last-visit-complaints-item-c1")
    ).toHaveTextContent("Cough");
  });

  it("applies from an item action button, never a submit", () => {
    const onApply = vi.fn();
    render(
      <LastVisitSectionStrip
        visitDate="12 Aug"
        summary="cough"
        items={[
          {
            key: "c1",
            label: "Cough",
            actions: [
              {
                label: "Improving",
                onClick: onApply,
                testId: "course-improving",
              },
            ],
          },
        ]}
        testId="last-visit-complaints"
      />
    );
    const action = screen.getByTestId("course-improving");
    expect(action.tagName).toBe("BUTTON");
    expect(action).toHaveAttribute("type", "button");
    fireEvent.click(action);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("places item actions immediately before the label when asked", () => {
    render(
      <LastVisitSectionStrip
        visitDate="11 Sep"
        summary=""
        items={[
          {
            key: "m1",
            label: "pantacid — 2 capsules",
            actions: [
              {
                label: "Repeat",
                onClick: vi.fn(),
                testId: "row-repeat",
              },
            ],
          },
        ]}
        actionsPlacement="start"
        testId="last-visit-medicines"
      />
    );
    const row = screen.getByTestId("last-visit-medicines-item-m1");
    const repeat = screen.getByTestId("row-repeat");
    expect(row.firstElementChild).toContainElement(repeat);
    expect(row.textContent).toMatch(/^Repeat/);
  });
});
