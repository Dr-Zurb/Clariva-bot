/**
 * rxd-02 — MedicineRow two-state rendering (summary + editor).
 */

import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MedicineRow, {
  type MedicineRowValue,
} from "@/components/consultation/MedicineRow";

vi.mock("@/components/ehr/DrugAutocomplete", () => ({
  default: ({
    inputId,
    value,
    placeholder,
  }: {
    inputId?: string;
    value: string;
    placeholder?: string;
  }) => (
    <input
      id={inputId}
      aria-label={placeholder ?? "Medicine name"}
      value={value}
      readOnly
      onChange={() => undefined}
    />
  ),
}));

function emptyRow(overrides: Partial<MedicineRowValue> = {}): MedicineRowValue {
  return {
    medicineName: "",
    dosage: "",
    route: "",
    frequency: "",
    duration: "",
    instructions: "",
    drugMasterId: null,
    frequencyCode: null,
    durationValue: null,
    durationUnit: null,
    routeCode: null,
    ...overrides,
  };
}

function completeRow(overrides: Partial<MedicineRowValue> = {}): MedicineRowValue {
  return emptyRow({
    medicineName: "Paracetamol",
    dosage: "500mg",
    frequency: "Three times daily",
    duration: "5 days",
    frequencyCode: "TID",
    durationValue: 5,
    durationUnit: "days",
    ...overrides,
  });
}

type RowProps = Partial<ComponentProps<typeof MedicineRow>>;

function renderRow(
  valueOverrides: Partial<MedicineRowValue> = {},
  propOverrides: RowProps = {},
) {
  const value =
    propOverrides.value ??
    ("medicineName" in valueOverrides &&
    valueOverrides.medicineName === "" &&
    !("frequencyCode" in valueOverrides)
      ? emptyRow(valueOverrides)
      : valueOverrides.medicineName || valueOverrides.frequencyCode
        ? { ...emptyRow(), ...valueOverrides }
        : completeRow(valueOverrides));

  const onChange = vi.fn();
  const onPatch = vi.fn();
  const onRemove = vi.fn();
  const onRequestEdit = vi.fn();
  const onRequestCollapse = vi.fn();

  const view = render(
    <MedicineRow
      index={2}
      value={value}
      onChange={onChange}
      onPatch={onPatch}
      onRemove={onRemove}
      token="test-token"
      onRequestEdit={onRequestEdit}
      onRequestCollapse={onRequestCollapse}
      {...propOverrides}
    />,
  );

  return {
    ...view,
    value,
    onChange,
    onPatch,
    onRemove,
    onRequestEdit,
    onRequestCollapse,
  };
}

describe("MedicineRow summary mode", () => {
  it("renders the compact line when isEditing is false and the row is complete", () => {
    renderRow({}, { isEditing: false });

    expect(
      screen.getByRole("button", { name: "Medicine row 3 — tap to edit" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Paracetamol")).toBeInTheDocument();
    expect(screen.getByText("500mg")).toBeInTheDocument();
    expect(screen.getByText("Three times daily")).toBeInTheDocument();
    expect(screen.getByText("5 days")).toBeInTheDocument();
    expect(screen.queryByLabelText("Dosage")).not.toBeInTheDocument();
  });
});

describe("MedicineRow editor mode", () => {
  it("renders the full editor when isEditing is true", () => {
    renderRow({}, { isEditing: true });

    expect(screen.getByLabelText("Dosage")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Medicine row 3 — tap to edit" }),
    ).not.toBeInTheDocument();
  });

  it("renders the full editor when the row is incomplete even if isEditing is false", () => {
    renderRow({ medicineName: "Paracetamol" }, { isEditing: false });

    expect(screen.getByLabelText("Dosage")).toBeInTheDocument();
  });
});

describe("MedicineRow tap to edit", () => {
  it("fires onRequestEdit with the row index when the summary row is clicked", () => {
    const { onRequestEdit } = renderRow({}, { isEditing: false });

    fireEvent.click(
      screen.getByRole("button", { name: "Medicine row 3 — tap to edit" }),
    );

    expect(onRequestEdit).toHaveBeenCalledTimes(1);
    expect(onRequestEdit).toHaveBeenCalledWith(2);
  });
});

describe("MedicineRow delete from summary", () => {
  it("fires onRemove and does not fire onRequestEdit when Delete is clicked", () => {
    const { onRemove, onRequestEdit } = renderRow({}, { isEditing: false });

    fireEvent.click(screen.getByRole("button", { name: "Delete medicine row" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(2);
    expect(onRequestEdit).not.toHaveBeenCalled();
  });
});

describe("MedicineRow Esc in editor", () => {
  it("fires onRequestCollapse when Escape is pressed on a complete row", () => {
    const { onRequestCollapse } = renderRow({}, { isEditing: true });

    fireEvent.keyDown(screen.getByLabelText("Dosage"), { key: "Escape" });

    expect(onRequestCollapse).toHaveBeenCalledTimes(1);
    expect(onRequestCollapse).toHaveBeenCalledWith(2);
  });

  it("does nothing when Escape is pressed on an incomplete row", () => {
    const { onRequestCollapse } = renderRow(
      { medicineName: "Paracetamol" },
      { isEditing: true },
    );

    fireEvent.keyDown(screen.getByLabelText("Dosage"), { key: "Escape" });

    expect(onRequestCollapse).not.toHaveBeenCalled();
  });
});

describe("MedicineRow blur to outside", () => {
  it("fires onRequestCollapse when focus leaves the editor entirely on a complete row", () => {
    const onRequestCollapse = vi.fn();
    render(
      <>
        <MedicineRow
          index={2}
          value={completeRow()}
          onChange={vi.fn()}
          onPatch={vi.fn()}
          onRemove={vi.fn()}
          token="test-token"
          isEditing={true}
          onRequestCollapse={onRequestCollapse}
        />
        <button type="button">Outside focus</button>
      </>,
    );

    const dosageInput = screen.getByLabelText("Dosage");
    const outsideButton = screen.getByRole("button", { name: "Outside focus" });

    fireEvent.focus(dosageInput);
    fireEvent.blur(dosageInput, { relatedTarget: outsideButton });

    expect(onRequestCollapse).toHaveBeenCalledTimes(1);
    expect(onRequestCollapse).toHaveBeenCalledWith(2);
  });
});

describe("MedicineRow read-only summary", () => {
  it("renders summary without tap affordances when isReadOnly is true", () => {
    renderRow({}, { isReadOnly: true });

    expect(screen.getByLabelText("Medicine row 3")).toHaveAttribute(
      "data-readonly",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: "Medicine row 3 — tap to edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit medicine row" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete medicine row" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Paracetamol")).toBeInTheDocument();
  });
});

describe("MedicineRow default behavior", () => {
  it("renders the editor unchanged when isEditing and callbacks are omitted", () => {
    const value = completeRow();
    render(
      <MedicineRow
        index={0}
        value={value}
        onChange={vi.fn()}
        onPatch={vi.fn()}
        onRemove={vi.fn()}
        token="test-token"
      />,
    );

    expect(screen.getByLabelText("Dosage")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /tap to edit/i }),
    ).not.toBeInTheDocument();
  });
});

describe("MedicineRow summary drag handle", () => {
  it("forwards dragHandleProps to the summary drag handle", () => {
    const onPointerDown = vi.fn();
    renderRow({}, { isEditing: false, dragHandleProps: { onPointerDown } });

    const dragHandle = screen
      .getByRole("button", { name: "Medicine row 3 — tap to edit" })
      .querySelector("[aria-hidden='true']");
    expect(dragHandle).toBeTruthy();
    fireEvent.pointerDown(dragHandle!);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });
});
