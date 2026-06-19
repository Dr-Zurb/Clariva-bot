import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TobaccoProductRows } from "@/components/cockpit/rx/subjective/TobaccoProductRows";
import type { TobaccoProductRow } from "@/lib/cockpit/social-history-tobacco-products";

function renderSmoking(
  products: TobaccoProductRow[],
  onChange: (products: TobaccoProductRow[]) => void = vi.fn(),
  options?: { implicitPast?: boolean },
) {
  return render(
    <TobaccoProductRows
      catalog="smoking"
      products={products}
      implicitPast={options?.implicitPast}
      testIdPrefix="social-smoking"
      onChange={onChange}
    />,
  );
}

function renderSmokeless(
  products: TobaccoProductRow[],
  onChange: (products: TobaccoProductRow[]) => void = vi.fn(),
) {
  return render(
    <TobaccoProductRows
      catalog="smokeless"
      products={products}
      testIdPrefix="social-smokeless"
      onChange={onChange}
    />,
  );
}

describe("TobaccoProductRows — smokeless UX", () => {
  it("shows inline packets/day suffix and unit chips", () => {
    renderSmokeless([{ id: "p1", type: "gutka", perDay: 2 }]);

    const row = screen.getByTestId("social-smokeless-product-0");
    expect(within(row).getByText("packets/day")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Times" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Packets" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows inline times/day when Times unit is selected", () => {
    renderSmokeless([{ id: "p1", type: "gutka", perDay: 2, perDayUnit: "times" }]);

    const row = screen.getByTestId("social-smokeless-product-0");
    expect(within(row).getByText("times/day")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Packets" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Times" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("uses editable name field in card header for other products", () => {
    const onChange = vi.fn();
    renderSmokeless([{ id: "p1", type: "other", typeOther: "Naswar", perDay: 2 }], onChange);

    const row = screen.getByTestId("social-smokeless-product-0");
    expect(within(row).getByPlaceholderText("Name")).toBeInTheDocument();
    expect(within(row).getByLabelText("Other product name")).toHaveValue("Naswar");

    fireEvent.change(within(row).getByLabelText("Other product name"), {
      target: { value: "Nas war" },
    });
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ typeOther: "Nas war" }),
    ]);
  });

  it("uses stacked card layout for product rows", () => {
    renderSmokeless([
      { id: "p1", type: "gutka", perDay: 1 },
      { id: "p2", type: "paan/supari", perDay: 1 },
    ]);

    expect(screen.getByTestId("social-smokeless-product-0")).toHaveClass("space-y-2");
    expect(screen.getByTitle("Paan/Supari")).toBeInTheDocument();
    const row = screen.getByTestId("social-smokeless-product-0");
    expect(within(row).getByText("Amount")).toBeInTheDocument();
    expect(within(row).getByText("How often")).toBeInTheDocument();
  });
});

describe("TobaccoProductRows — smoking UX", () => {
  it("shows add chips for unused products and no chips inside cards", () => {
    renderSmoking([
      { id: "p1", type: "cigar", perDay: 4 },
      { id: "p2", type: "cigarette", perDay: 10 },
    ]);

    const addStrip = screen.getByTestId("social-smoking-add-chips");
    expect(within(addStrip).getByRole("button", { name: "Add Beedi" })).toBeInTheDocument();
    expect(within(addStrip).queryByRole("button", { name: "Add Cigarette" })).not.toBeInTheDocument();
    expect(within(addStrip).queryByRole("button", { name: "Add Cigar" })).not.toBeInTheDocument();

    const row1 = screen.getByTestId("social-smoking-product-0");
    expect(within(row1).getByText("Cigar")).toBeInTheDocument();
    expect(within(row1).queryByRole("group", { name: "Product type" })).not.toBeInTheDocument();
  });

  it("adds a product card when an add chip is clicked", () => {
    const onChange = vi.fn();
    renderSmoking(
      [
        { id: "p1", type: "cigar", perDay: 4 },
        { id: "p2", type: "cigarette", perDay: 10 },
      ],
      onChange,
    );

    fireEvent.click(screen.getByTestId("social-smoking-add-beedi"));

    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "p1", type: "cigar" }),
        expect.objectContaining({ id: "p2", type: "cigarette" }),
        expect.objectContaining({ type: "beedi" }),
      ]),
    );
  });

  it("returns add chip after removing a product card", () => {
    const onChange = vi.fn();
    renderSmoking([{ id: "p1", type: "cigarette", perDay: 10 }], onChange);

    fireEvent.click(screen.getByRole("button", { name: "Remove Cigarette" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows duration inline on each product row", () => {
    renderSmoking([{ id: "p1", type: "cigarette", perDay: 10, years: 5 }]);

    expect(screen.getByLabelText("Duration")).toBeInTheDocument();
    expect(screen.queryByTestId("social-smoking-duration")).not.toBeInTheDocument();
  });

  it("shows fixed unit label instead of unit chips for standard products", () => {
    renderSmoking([{ id: "p1", type: "cigar", perDay: 4 }]);

    expect(screen.getByText("cigars/day")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Amount unit" })).not.toBeInTheDocument();
  });

  it("shows custom unit field for other smoking products", () => {
    renderSmoking([{ id: "p1", type: "other", typeOther: "Naswar", perDayUnit: "other" }]);

    expect(screen.getByLabelText("Custom amount unit")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Amount unit" })).not.toBeInTheDocument();
  });

  it("shows per-product pack-years on cigarette, beedi, and approximate smoking rows", () => {
    renderSmoking([
      { id: "p1", type: "cigarette", perDay: 3, years: 4 },
      { id: "p2", type: "beedi", perDay: 10, years: 10 },
      { id: "p3", type: "cigar", perDay: 2, years: 3 },
    ]);

    expect(screen.getByTestId("social-smoking-product-pack-years-0")).toHaveTextContent(
      "≈ 0.6 pack-years",
    );
    expect(screen.getByTestId("social-smoking-product-pack-years-1")).toHaveTextContent(
      "≈ 5 pack-years",
    );
    expect(screen.getByTestId("social-smoking-product-pack-years-2")).toHaveTextContent(
      "≈ 0.3 pack-years (approx.)",
    );
  });

  it("does not show pack-years label on non-convertible smoking products", () => {
    renderSmoking([
      { id: "p1", type: "cigarette", perDay: 10 },
      { id: "p2", type: "other", typeOther: "Naswar", perDay: 2 },
    ]);

    expect(screen.queryByTestId("social-smoking-product-pack-years-1")).not.toBeInTheDocument();
  });

  it("toggles product phase and quit duration", () => {
    const onChange = vi.fn();
    renderSmoking([{ id: "p1", type: "beedi", perDay: 10, years: 10 }], onChange);

    fireEvent.click(screen.getByTestId("social-smoking-phase-past-0"));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "p1", phase: "past" }),
    ]);
  });

  it("shows quit duration when product phase is past", () => {
    renderSmoking([
      { id: "p1", type: "beedi", perDay: 10, years: 10, phase: "past", quitYearsAgo: 3 },
    ]);

    const row = screen.getByTestId("social-smoking-product-0");
    expect(within(row).getByLabelText("Quit duration")).toHaveValue(3);
    expect(within(row).getByTestId("social-smoking-phase-past-0")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not show legacy add product button", () => {
    renderSmoking([]);

    expect(screen.queryByTestId("social-smoking-add-product")).not.toBeInTheDocument();
    expect(screen.getByTestId("social-smoking-add-chips")).toBeInTheDocument();
  });

  it("shows per-product quit when implicitPast (ex-smoker)", () => {
    renderSmoking(
      [{ id: "p1", type: "cigarette", perDay: 4, years: 3, quitYearsAgo: 2 }],
      vi.fn(),
      { implicitPast: true },
    );

    expect(screen.queryByTestId("social-smoking-phase-current-0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("social-smoking-phase-past-0")).not.toBeInTheDocument();
    const row = screen.getByTestId("social-smoking-product-0");
    expect(within(row).getByLabelText("Quit duration")).toHaveValue(2);
    expect(within(row).getByText("· for")).toBeInTheDocument();
    expect(within(row).getByText("ago")).toBeInTheDocument();
  });
});
