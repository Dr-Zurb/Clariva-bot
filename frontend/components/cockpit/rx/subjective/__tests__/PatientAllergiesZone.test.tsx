/**
 * Allergies zone header must paint count/preview from the shared query cache on
 * remount (tab switch) — not wait for a fresh network round-trip.
 */

import { useLayoutEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { PatientAllergiesZone } from "../PatientAllergiesZone";
import { queryKeys } from "@/lib/query/keys";
import type { PatientAllergy } from "@/types/patient-chart";

const prescriptionIdRef = { current: null as string | null };

vi.mock("@/components/ehr/sections/AllergiesSection", () => ({
  default: function AllergiesSectionStub({
    onTemplateControlsReadyChange,
  }: {
    onTemplateControlsReadyChange?: (ready: boolean) => void;
  }) {
    useLayoutEffect(() => {
      onTemplateControlsReadyChange?.(true);
      return () => onTemplateControlsReadyChange?.(false);
    }, [onTemplateControlsReadyChange]);
    return <div data-testid="allergies-section-stub" />;
  },
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    listPatientAllergies: vi.fn().mockResolvedValue({
      success: true,
      data: { allergies: [], sectionNotes: null },
    }),
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

function renderZone(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={createEmptyRxFormFields()}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <PatientAllergiesZone patientId="pat-1" token="test-token" mode="default" />
      </RxFormProvider>
    </QueryClientProvider>,
  );
}

describe("PatientAllergiesZone", () => {
  it("paints count + preview from query cache on first paint (tab-switch remount)", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.patient("pat-1").allergies(), {
      allergies: [makeAllergy("a1", "Penicillin"), makeAllergy("a2", "Peanuts")],
      sectionNotes: null,
    });

    renderZone(queryClient);

    const zone = screen.getByTestId("patient-allergies-zone");
    expect(zone).toHaveTextContent("2");
    expect(zone).toHaveTextContent("— 2 allergies");
    expect(screen.getByTestId("subjective-section-template-allergies")).toBeInTheDocument();
    expect(screen.getByTestId("subjective-section-template-save-allergies")).toBeInTheDocument();
  });
});
