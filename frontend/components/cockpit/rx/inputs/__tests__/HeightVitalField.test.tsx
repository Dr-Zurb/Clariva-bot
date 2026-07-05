import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeightVitalField } from "@/components/cockpit/rx/inputs/HeightVitalField";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  useRxForm,
} from "@/components/cockpit/rx/RxFormContext";

const prescriptionIdRef = { current: null as string | null };

function HeightHarness() {
  const { state } = useRxForm();
  return (
    <>
      <HeightVitalField label="Height" />
      <span data-testid="committed-height">{state.fields.vitalsHtCm ?? "null"}</span>
    </>
  );
}

function renderHeight(initialHtCm: number | null = null) {
  return render(
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="tok"
      entryMode="structured"
      initialFields={{
        ...createEmptyRxFormFields(),
        vitalsHtCm: initialHtCm,
      }}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      <HeightHarness />
    </RxFormProvider>,
  );
}

describe("HeightVitalField", () => {
  it("allows typing multi-digit cm without clamping until blur", () => {
    renderHeight(null);
    const input = screen.getByTestId("height-cm-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "1" } });
    expect(input.value).toBe("1");
    expect(screen.getByTestId("committed-height")).toHaveTextContent("null");

    fireEvent.change(input, { target: { value: "17" } });
    expect(input.value).toBe("17");

    fireEvent.change(input, { target: { value: "179" } });
    expect(input.value).toBe("179");
    expect(screen.getByTestId("committed-height")).toHaveTextContent("null");

    fireEvent.blur(input);
    expect(input.value).toBe("179");
    expect(screen.getByTestId("committed-height")).toHaveTextContent("179");
  });

  it("clamps to hardMin on blur when value is below range", () => {
    renderHeight(null);
    const input = screen.getByTestId("height-cm-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.blur(input);

    expect(input.value).toBe("20");
    expect(screen.getByTestId("committed-height")).toHaveTextContent("20");
  });

  it("clamps to hardMax on blur when value is above range", () => {
    renderHeight(null);
    const input = screen.getByTestId("height-cm-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "300" } });
    fireEvent.blur(input);

    expect(input.value).toBe("250");
    expect(screen.getByTestId("committed-height")).toHaveTextContent("250");
  });

  it("clears committed height when input is emptied on blur", () => {
    renderHeight(170);
    const input = screen.getByTestId("height-cm-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(input.value).toBe("");
    expect(screen.getByTestId("committed-height")).toHaveTextContent("null");
  });

  it("commits on Enter", () => {
    renderHeight(null);
    const input = screen.getByTestId("height-cm-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "179" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input.value).toBe("179");
    expect(screen.getByTestId("committed-height")).toHaveTextContent("179");
  });
});
