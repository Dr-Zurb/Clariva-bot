/**
 * The nil-known assertion is a deliberate clinical claim, so it has to be an
 * explicit control — never inferred from an empty list — and it must disappear
 * once a real allergen is on file.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AllergiesSection from "../AllergiesSection";
import { queryKeys } from "@/lib/query/keys";
import type { PatientAllergy } from "@/types/patient-chart";

const updateSectionNotes = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    listPatientAllergies: vi.fn().mockResolvedValue({
      success: true,
      data: { allergies: [], sectionNotes: null, noKnownAllergies: false },
    }),
    updatePatientAllergySectionNotes: (...args: unknown[]) => updateSectionNotes(...args),
  };
});

function makeAllergy(id: string, allergen: string): PatientAllergy {
  return {
    id,
    doctor_id: "doc-1",
    patient_id: "pat-1",
    allergen,
    severity: "unknown",
    reaction: null,
    note: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function renderSection(cache: {
  allergies: PatientAllergy[];
  sectionNotes: string | null;
  noKnownAllergies: boolean;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(queryKeys.patient("pat-1").allergies(), cache);
  render(
    <QueryClientProvider client={queryClient}>
      <AllergiesSection
        patientId="pat-1"
        token="test-token"
        layout="stacked"
        mode="default"
      />
    </QueryClientProvider>,
  );
}

describe("AllergiesSection nil-known assertion", () => {
  beforeEach(() => {
    updateSectionNotes.mockReset();
    updateSectionNotes.mockResolvedValue({
      success: true,
      data: { notes: null, noKnownAllergies: true },
    });
  });

  it("is unpressed when the doctor has never asserted it", () => {
    renderSection({ allergies: [], sectionNotes: null, noKnownAllergies: false });
    expect(screen.getByTestId("allergies-none-known")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("allergies-combobox")).toBeInTheDocument();
  });

  it("reflects a stored assertion and hides allergen capture", () => {
    renderSection({ allergies: [], sectionNotes: null, noKnownAllergies: true });
    expect(screen.getByTestId("allergies-none-known")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("allergies-combobox")).not.toBeInTheDocument();
  });

  it("patches only the flag so a saved note is not dropped", async () => {
    renderSection({ allergies: [], sectionNotes: "Asked at intake", noKnownAllergies: false });

    fireEvent.click(screen.getByTestId("allergies-none-known"));

    await waitFor(() => expect(updateSectionNotes).toHaveBeenCalledTimes(1));
    expect(updateSectionNotes).toHaveBeenCalledWith("test-token", "pat-1", {
      noKnownAllergies: true,
    });
    expect(screen.getByTestId("allergies-none-known")).toHaveAttribute("aria-pressed", "true");
  });

  it("hides the control once an allergen is on file", () => {
    renderSection({
      allergies: [makeAllergy("a1", "Penicillin")],
      sectionNotes: null,
      noKnownAllergies: false,
    });
    expect(screen.queryByTestId("allergies-none-known")).not.toBeInTheDocument();
  });
});
