import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { HistoryFields } from "@/components/cockpit/rx/subjective/HistoryFields";
import { insertHistoryChip } from "@/lib/cockpit/history-field-chips";

const mockUpdatePrescription = vi.fn().mockResolvedValue({ data: {} });

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    updatePrescription: (...args: unknown[]) => mockUpdatePrescription(...args),
    createPrescription: vi.fn(),
  };
});

const prescriptionIdRef = { current: "rx-1" as string | null };

function renderWithRxForm(
  ui: ReactElement,
  options: { autosaveEnabled?: boolean } = {},
) {
  return render(
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="test-token"
      entryMode="structured"
      initialFields={createEmptyRxFormFields()}
      autosaveEnabled={options.autosaveEnabled ?? false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      {ui}
    </RxFormProvider>,
  );
}

describe("insertHistoryChip", () => {
  it("appends chips with comma separation and dedupes", () => {
    expect(insertHistoryChip("", "Non-smoker")).toBe("Non-smoker");
    expect(insertHistoryChip("Non-smoker", "Vegetarian")).toBe("Non-smoker, Vegetarian");
    expect(insertHistoryChip("Non-smoker", "non-smoker")).toBe("Non-smoker");
  });
});

describe("HistoryFields", () => {
  beforeEach(() => {
    mockUpdatePrescription.mockClear();
    prescriptionIdRef.current = "rx-1";
  });

  it("renders family and social history fields", () => {
    renderWithRxForm(<HistoryFields />);
    expect(screen.getByText("Family history", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Social / personal history", { exact: true })).toBeInTheDocument();
  });

  it("uses structured family history field", () => {
    renderWithRxForm(<HistoryFields />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Family history" }));
    fireEvent.click(screen.getByRole("button", { name: "None significant" }));
    expect(screen.queryByTestId("family-history-card-father")).not.toBeInTheDocument();
  });

  it("uses structured social history with replace semantics", () => {
    renderWithRxForm(<HistoryFields />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    fireEvent.click(
      screen.getByTestId("social-smoking-status").querySelector('button[aria-label="Non-smoker"]')!,
    );
    fireEvent.click(
      screen.getByTestId("social-diet-type").querySelector('button[aria-label="Vegetarian"]')!,
    );

    expect(screen.getByLabelText("Social / personal history notes")).toHaveValue("");
    expect(screen.getByPlaceholderText("Job or role")).toHaveValue("");

    fireEvent.click(
      screen.getByTestId("social-smoking-status").querySelector('button[aria-label="Ex-smoker"]')!,
    );
    expect(
      screen.getByTestId("social-smoking-status").querySelector('button[aria-label="Ex-smoker"]'),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByTestId("social-smoking-status").querySelector('button[aria-label="Non-smoker"]'),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("fires autosave after editing a history field", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithRxForm(<HistoryFields />, { autosaveEnabled: true });

    fireEvent.click(screen.getByRole("button", { name: "Toggle Social / personal history" }));
    fireEvent.click(
      screen.getByTestId("social-smoking-status").querySelector('button[aria-label="Non-smoker"]')!,
    );

    await vi.advanceTimersByTimeAsync(1600);

    await waitFor(() => {
      expect(mockUpdatePrescription).toHaveBeenCalled();
    });

    vi.useRealTimers();
  });
});
