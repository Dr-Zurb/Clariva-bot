import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SoapTabFamilyProvider } from "@/components/cockpit/rx/sections/section-chrome";
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

  it("keeps the full section title; preview truncates / hides on narrow panes", () => {
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

    const preview = screen.getByText(/Smoking: Smoker/);
    expect(preview.className).toContain("truncate");
    expect(preview.className).toContain("hidden");
    expect(preview.className).toContain("@[22rem]/collapsible:inline");
  });

  it("uses a named container so header chrome can stack below pane width", () => {
    const { container } = render(
      <CollapsibleContainer title="Chief complaints" defaultOpen toggleLabel="Toggle">
        <p>Body</p>
      </CollapsibleContainer>,
    );
    const section = container.querySelector("section");
    expect(section?.className).toContain("@container/collapsible");
  });

  it("applies depth-tone surfaces when depthTone is enabled", () => {
    const { container } = render(
      <CollapsibleContainer title="Root" depthTone defaultOpen toggleLabel="Toggle root">
        <CollapsibleContainer title="Nested" variant="subsection" defaultOpen toggleLabel="Toggle nested">
          <p>Nested body</p>
        </CollapsibleContainer>
      </CollapsibleContainer>,
    );

    const sections = container.querySelectorAll("section");
    expect(sections[0]?.className).toContain("bg-muted/30");
    expect(sections[0]?.className).toContain("border-border/30");
    expect(sections[0]?.className).not.toContain("border-l-2");
    expect(sections[0]?.className).not.toContain("shadow-sm");
    expect(sections[1]?.className).toContain("bg-card");
    expect(sections[1]?.className).not.toContain("border-l-2");
    expect(sections[1]?.className).toContain("border-border/60");
    expect(sections[1]?.className).toContain("shadow-sm");
    expect(screen.getByText("Nested").className).toContain("text-sm");
  });

  it("shows a status dot on depth-tone subsections driven by count", () => {
    const { container } = render(
      <SoapTabFamilyProvider family="subjective">
        <CollapsibleContainer title="Root" depthTone defaultOpen toggleLabel="Toggle root">
          <CollapsibleContainer
            title="Empty nested"
            variant="subsection"
            defaultOpen
            toggleLabel="Toggle empty"
            count={0}
          >
            <p>Body</p>
          </CollapsibleContainer>
          <CollapsibleContainer
            title="Filled nested"
            variant="subsection"
            defaultOpen={false}
            toggleLabel="Toggle filled"
            count={2}
          >
            <p>Filled body</p>
          </CollapsibleContainer>
        </CollapsibleContainer>
      </SoapTabFamilyProvider>,
    );

    const dots = container.querySelectorAll("span.rounded-full");
    const subsectionDots = [...dots].filter(
      (el) =>
        el.className.includes("rounded-full") &&
        (el.className.includes("h-2") || el.className.includes("h-1.5")),
    );
    expect(subsectionDots).toHaveLength(2);
    expect(subsectionDots[0]?.className).toContain("h-2");
    expect(subsectionDots[0]?.className).toContain("bg-muted-foreground/40");
    expect(subsectionDots[1]?.className).toContain("h-2");
    expect(subsectionDots[1]?.className).toContain("bg-primary");
  });

  it("uses square dots on L3 leaf subsections and solid circles on L2 clusters", () => {
    const { container } = render(
      <SoapTabFamilyProvider family="subjective">
        <CollapsibleContainer title="Root" depthTone defaultOpen toggleLabel="Toggle root">
          <CollapsibleContainer title="Cluster" variant="subsection" defaultOpen toggleLabel="Toggle cluster">
            <CollapsibleContainer
              title="Leaf"
              variant="subsection"
              defaultOpen
              toggleLabel="Toggle leaf"
              count={1}
            >
              <p>Leaf body</p>
            </CollapsibleContainer>
          </CollapsibleContainer>
        </CollapsibleContainer>
      </SoapTabFamilyProvider>,
    );

    const sections = container.querySelectorAll("section");
    const clusterDot = sections[1]?.querySelector("span.rounded-full");
    const leafDot = sections[2]?.querySelector("span.rounded-sm");

    expect(clusterDot?.className).toContain("h-2");
    expect(clusterDot?.className).toContain("rounded-full");
    expect(leafDot?.className).toContain("h-1.5");
    expect(leafDot?.className).toContain("rounded-sm");
    expect(leafDot?.className).toContain("bg-primary");
  });

  it("paints opaque bg-background on every sticky header (depth-tone wells included)", () => {
    const { container } = render(
      <CollapsibleContainer
        title="Social / personal history"
        depthTone
        stickyHeader
        defaultOpen
        toggleLabel="Toggle Social / personal history"
      >
        <CollapsibleContainer
          title="Tobacco, alcohol & drugs"
          variant="subsection"
          stickyHeader
          defaultOpen
          toggleLabel="Toggle cluster"
        >
          <CollapsibleContainer
            title="Alcohol"
            variant="subsection"
            stickyHeader
            defaultOpen
            toggleLabel="Toggle alcohol"
          >
            <p>Drinks alcohol</p>
          </CollapsibleContainer>
        </CollapsibleContainer>
      </CollapsibleContainer>,
    );

    const sections = container.querySelectorAll("section");
    expect(sections).toHaveLength(3);
    // L1 well shell stays translucent; the sticky header row must be opaque.
    expect(sections[0]?.className).toContain("bg-muted/30");

    for (const section of sections) {
      const header = section.firstElementChild as HTMLElement | null;
      expect(header?.className).toContain("bg-background");
      expect(header?.className).toContain("border-b");
      expect(header?.style.position).toBe("sticky");
    }
  });
});
