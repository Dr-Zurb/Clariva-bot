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

    const body = screen.getByText("Body content").parentElement;
    expect(body).toHaveAttribute("aria-hidden", "true");
    expect(body).toHaveStyle({ display: "none" });
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

    const body = screen.getByText("Body content").parentElement;
    expect(body).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(screen.getByRole("button", { name: "Toggle section" }));

    expect(body).toHaveAttribute("aria-hidden", "false");
    expect(body).not.toHaveStyle({ display: "none" });
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
});
