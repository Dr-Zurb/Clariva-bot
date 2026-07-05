import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";

describe("CollapsibleContainer", () => {
  it("hides the body when collapsed even with flex bodyClassName", () => {
    render(
      <CollapsibleContainer
        title="Section"
        toggleLabel="Toggle section"
        bodyClassName="flex flex-col"
        defaultOpen
      >
        <p>Body content</p>
      </CollapsibleContainer>,
    );

    expect(screen.getByText("Body content")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Toggle section" }));

    // The animating wrapper carries aria-hidden + the collapsed grid track.
    const wrapper = screen
      .getByText("Body content")
      .closest("[aria-hidden]") as HTMLElement | null;
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
    expect(wrapper?.className).toContain("grid-rows-[0fr]");
  });

  it("shows the body again when expanded", () => {
    render(
      <CollapsibleContainer
        title="Section"
        toggleLabel="Toggle section"
        bodyClassName="flex flex-col"
        defaultOpen={false}
      >
        <p>Body content</p>
      </CollapsibleContainer>,
    );

    const wrapper = screen
      .getByText("Body content")
      .closest("[aria-hidden]") as HTMLElement | null;
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
    expect(wrapper?.className).toContain("grid-rows-[0fr]");

    fireEvent.click(screen.getByRole("button", { name: "Toggle section" }));

    expect(wrapper).toHaveAttribute("aria-hidden", "false");
    expect(wrapper?.className).toContain("grid-rows-[1fr]");
  });

  it("does not collapse when clicking an interactive title control", () => {
    render(
      <CollapsibleContainer
        interactiveTitle={
          <input aria-label="Editable title" defaultValue="Travel history" />
        }
        toggleLabel="Toggle section"
        defaultOpen
      >
        <p>Body content</p>
      </CollapsibleContainer>,
    );

    expect(screen.getByText("Body content")).toBeVisible();
    fireEvent.click(screen.getByLabelText("Editable title"));
    expect(screen.getByText("Body content")).toBeVisible();
  });

  it("renders leadingActions before the title", () => {
    render(
      <CollapsibleContainer
        title="Section"
        leadingActions={<span data-testid="drag-handle">drag</span>}
        toggleLabel="Toggle section"
        defaultOpen
      >
        <p>Body content</p>
      </CollapsibleContainer>,
    );

    const dragHandle = screen.getByTestId("drag-handle");
    const titleButton = screen.getByRole("button", { name: "Section" });
    expect(dragHandle.compareDocumentPosition(titleButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("keeps the full section title visible when a long preview is present", () => {
    render(
      <CollapsibleContainer
        title="Social / personal history"
        toggleLabel="Toggle Social / personal history"
        preview="— Smoking: Smoker (cigarette, hookah, vape) · Smokeless: Gutka, Paan/Supari, Khaini · Alcohol: Drinks alcohol"
        defaultOpen
      >
        <p>Body content</p>
      </CollapsibleContainer>,
    );

    const title = screen.getByText("Social / personal history");
    expect(title).toHaveClass("shrink-0");
    expect(title).not.toHaveClass("truncate");
  });
});
