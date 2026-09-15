import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { usePatientRibbonData } from "@/hooks/usePatientRibbonData";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    listPatientAllergies: vi.fn().mockResolvedValue({
      data: { allergies: [], sectionNotes: null, noKnownAllergies: false },
    }),
    listPatientConditions: vi.fn().mockResolvedValue({
      data: { conditions: [] },
    }),
    getPatientMedicalBackground: vi.fn().mockResolvedValue({
      data: {
        medicalBackground: {
          conditions: [],
          unlinkedMedications: [],
          links: [],
          notes: null,
        },
      },
    }),
  };
});
import { queryKeys } from "@/lib/query/keys";
import type {
  MedicalBackgroundGrouped,
  PatientAllergy,
  PatientChronicCondition,
} from "@/types/patient-chart";

function allergy(id: string, allergen: string): PatientAllergy {
  return {
    id,
    doctor_id: "doc-1",
    patient_id: "pat-1",
    allergen,
    severity: "severe",
    reaction: "rash",
    note: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function condition(id: string, name: string): PatientChronicCondition {
  return {
    id,
    doctor_id: "doc-1",
    patient_id: "pat-1",
    condition: name,
    status: "active",
    diagnosed_on: "2020-01-01",
    diagnosed_ago_value: null,
    diagnosed_ago_unit: null,
    resolved_ago_value: null,
    resolved_ago_unit: null,
    on_treatment: true,
    acuity: null,
    code: null,
    code_title: null,
    note: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function emptyBackground(
  conditions: PatientChronicCondition[] = [],
): MedicalBackgroundGrouped {
  return {
    conditions: conditions.map((row) => ({ ...row, medications: [] })),
    unlinkedMedications: [],
    links: [],
    notes: null,
  };
}

function renderRibbonHook(client: QueryClient) {
  return renderHook(() => usePatientRibbonData("pat-1", "tok"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("usePatientRibbonData query sync", () => {
  it("mirrors allergies and PMH already in the shared query cache", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(queryKeys.patient("pat-1").allergies(), {
      allergies: [allergy("a1", "Penicillin")],
      sectionNotes: null,
      noKnownAllergies: false,
    });
    client.setQueryData(
      queryKeys.patient("pat-1").medicalBackground(),
      emptyBackground([condition("c1", "Hypertension")]),
    );

    const { result } = renderRibbonHook(client);

    expect(result.current.allergies).toEqual([
      { id: "a1", name: "Penicillin", reaction: "rash", severity: "severe" },
    ]);
    expect(result.current.chronicConditions).toEqual([
      { id: "c1", name: "Hypertension", since: "2020-01-01" },
    ]);
  });

  it("updates chips when the tab writes the shared cache", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(queryKeys.patient("pat-1").allergies(), {
      allergies: [],
      sectionNotes: null,
      noKnownAllergies: false,
    });
    client.setQueryData(
      queryKeys.patient("pat-1").medicalBackground(),
      emptyBackground(),
    );

    const { result } = renderRibbonHook(client);
    expect(result.current.allergies).toEqual([]);
    expect(result.current.chronicConditions).toEqual([]);

    client.setQueryData(queryKeys.patient("pat-1").allergies(), {
      allergies: [allergy("a2", "Peanuts")],
      sectionNotes: null,
      noKnownAllergies: false,
    });
    client.setQueryData(
      queryKeys.patient("pat-1").medicalBackground(),
      emptyBackground([condition("c2", "Asthma")]),
    );

    await waitFor(() => {
      expect(result.current.allergies.map((chip) => chip.name)).toEqual([
        "Peanuts",
      ]);
      expect(result.current.chronicConditions.map((chip) => chip.name)).toEqual([
        "Asthma",
      ]);
    });
  });
});
