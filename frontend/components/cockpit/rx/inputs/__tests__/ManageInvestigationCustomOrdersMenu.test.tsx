/**
 * Manage menu for doctor-saved custom investigation orders.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ManageInvestigationCustomOrdersMenu } from "@/components/cockpit/rx/inputs/ManageInvestigationCustomOrdersMenu";
import type { DoctorInvestigationCustomOrder } from "@/lib/cockpit/investigations-custom-orders";

const orders: DoctorInvestigationCustomOrder[] = [
  {
    id: "custom:anemia workup",
    label: "Anemia workup",
    members: [{ id: "hb", label: "Hemoglobin", kind: "analyte" }],
    useCount: 2,
    pinned: true,
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
];

describe("ManageInvestigationCustomOrdersMenu", () => {
  it("renames and deletes via Manage panel", () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <ManageInvestigationCustomOrdersMenu
        orders={orders}
        onRename={onRename}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByTestId("investigations-manage-my-orders"));
    expect(
      screen.getByTestId("investigations-manage-my-orders-panel"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId("investigations-manage-rename-custom:anemia workup"),
    );
    const input = screen.getByTestId(
      "investigations-manage-rename-input-custom:anemia workup",
    );
    fireEvent.change(input, { target: { value: "Anemia panel" } });
    fireEvent.click(
      screen.getByTestId("investigations-manage-rename-save-custom:anemia workup"),
    );
    expect(onRename).toHaveBeenCalledWith(
      "custom:anemia workup",
      "Anemia panel",
    );

    fireEvent.click(
      screen.getByTestId("investigations-manage-delete-custom:anemia workup"),
    );
    expect(onDelete).toHaveBeenCalledWith("custom:anemia workup");
  });

  it("renders nothing when there are no saved orders", () => {
    const { container } = render(
      <ManageInvestigationCustomOrdersMenu
        orders={[]}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
