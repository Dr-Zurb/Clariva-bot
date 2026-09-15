/**
 * lvc-15 — Phase 3 gate.
 * One last-visit fetch. Carry and vitals ghosts do not call the legacy APIs.
 */
import { existsSync, readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  useRxForm,
} from "@/components/cockpit/rx/RxFormContext";
import { CarryForwardButton } from "@/components/cockpit/rx/subjective/CarryForwardButton";
import { LastVisitComplaintsStrip } from "@/components/cockpit/rx/last-visit/LastVisitComplaintsStrip";
import { useLastVisitVitals } from "@/components/cockpit/rx/inputs/useLastVisitVitals";
import { LastVisitSummaryProvider } from "@/hooks/useLastVisitSummary";
import { lastVisitSummaryQueryOptions } from "@/lib/cockpit/last-visit-summary-query";
import { prefetchConsultVitalsQueries } from "@/lib/query/prefetch/consult-vitals";
import { getLastVisitSummary } from "@/lib/api/last-visit-summary";
import { getLastSubjectiveForPatient } from "@/lib/api/last-subjective";
import { getLastPrescriptionInEpisode } from "@/lib/api";
import type { LastVisitSummary } from "@/lib/api/last-visit-summary";
import { STALE } from "@/lib/query/stale";

vi.mock("@/lib/api/last-visit-summary", () => ({
  getLastVisitSummary: vi.fn(),
}));

vi.mock("@/lib/api/last-subjective", () => ({
  getLastSubjectiveForPatient: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getLastPrescriptionInEpisode: vi.fn(),
    getAppointmentDeskVitals: vi
      .fn()
      .mockResolvedValue({ data: { vitals: null } }),
  };
});

const SUMMARY: LastVisitSummary = {
  sourcePrescriptionId: "rx-prior",
  sourceCreatedAt: "2026-08-12T10:00:00.000Z",
  complaints: [{ id: "c-1", name: "Cough", category: "default" }],
  diagnoses: [],
  provisionalDiagnosis: null,
  medicines: [],
  investigationsOrders: null,
  advice: null,
  followUp: null,
  followUpValue: null,
  followUpUnit: null,
  familyHistory: "Father — HTN",
  vitals: { vitalsHr: 72 },
};

const prescriptionIdRef = { current: null as string | null };

const COCKPIT_READERS = [
  "components/cockpit/rx/subjective/CarryForwardButton.tsx",
  "components/cockpit/rx/inputs/useLastVisitVitals.ts",
  "components/consultation/PrescriptionForm.tsx",
  "lib/cockpit/desk-vitals-query.ts",
  "lib/query/prefetch/consult-vitals.ts",
  "lib/query/prefetch/next-consult.ts",
  "components/patient-profile/panes/RxPane.tsx",
  "hooks/useLastVisitSummary.ts",
  "components/cockpit/rx/last-visit/LastVisitComplaintsStrip.tsx",
  "components/cockpit/rx/last-visit/LastVisitMedicinesStrip.tsx",
] as const;

function DirtyProbe() {
  const { state } = useRxForm();
  return <div data-testid="dirty">{state.isDirty ? "yes" : "no"}</div>;
}

function GhostProbe() {
  const ghost = useLastVisitVitals();
  return <div data-testid="ghost-hr">{ghost?.vitalsHr ?? ""}</div>;
}

function renderCockpitReaders(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="tok"
        entryMode="structured"
        initialFields={createEmptyRxFormFields()}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <LastVisitSummaryProvider>
          <CarryForwardButton />
          <LastVisitComplaintsStrip />
          <GhostProbe />
          <DirtyProbe />
        </LastVisitSummaryProvider>
      </RxFormProvider>
    </QueryClientProvider>,
  );
}

describe("lvc-15 Phase 3 gate", () => {
  beforeEach(() => {
    vi.mocked(getLastVisitSummary).mockReset();
    vi.mocked(getLastSubjectiveForPatient).mockReset();
    vi.mocked(getLastPrescriptionInEpisode).mockReset();
    vi.mocked(getLastVisitSummary).mockResolvedValue({
      success: true,
      data: { summary: SUMMARY },
      meta: { timestamp: "", requestId: "" },
    });
  });

  it("cockpit last-visit readers do not import last-subjective, last-in-episode, or the retired popover", () => {
    expect(
      existsSync("components/consultation/cockpit/PreviousRxPopover.tsx"),
    ).toBe(false);

    for (const rel of COCKPIT_READERS) {
      const src = readFileSync(rel, "utf8");
      expect(src, rel).not.toMatch(/from ["']@\/lib\/api\/last-subjective["']/);
      expect(src, rel).not.toMatch(/getLastSubjectiveForPatient\s*\(/);
      expect(src, rel).not.toMatch(/getLastPrescriptionInEpisode\s*\(/);
      expect(src, rel).not.toMatch(/\/last-in-episode/);
      expect(src, rel).not.toMatch(/from ["'][^"']*PreviousRxPopover["']/);
    }
  });

  it("queue-hover prefetch serves the one last-visit fetch; carry and ghosts do not add another", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: STALE.CLINICAL } },
    });

    await prefetchConsultVitalsQueries(client, "tok", "appt-1", "pat-1");
    expect(getLastVisitSummary).toHaveBeenCalledTimes(1);
    expect(
      client.getQueryData(
        lastVisitSummaryQueryOptions("tok", "pat-1", "appt-1").queryKey,
      ),
    ).toEqual(SUMMARY);

    renderCockpitReaders(client);

    await waitFor(() => {
      expect(screen.getByTestId("carry-forward-trigger")).toBeInTheDocument();
    });
    expect(screen.getByTestId("last-visit-complaints")).toBeInTheDocument();
    expect(screen.getByTestId("ghost-hr")).toHaveTextContent("72");
    expect(screen.getByTestId("dirty")).toHaveTextContent("no");

    expect(getLastVisitSummary).toHaveBeenCalledTimes(1);
    expect(getLastSubjectiveForPatient).not.toHaveBeenCalled();
    expect(getLastPrescriptionInEpisode).not.toHaveBeenCalled();
  });

  it("first visit renders no strip and no carry button (LVC-Q5)", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <RxFormProvider
          appointmentId="appt-1"
          patientId="pat-1"
          token="tok"
          entryMode="structured"
          initialFields={createEmptyRxFormFields()}
          autosaveEnabled={false}
          prescriptionIdRef={prescriptionIdRef}
          onPrescriptionCreated={() => {}}
        >
          <LastVisitSummaryProvider value={null}>
            <CarryForwardButton />
            <LastVisitComplaintsStrip />
            <DirtyProbe />
          </LastVisitSummaryProvider>
        </RxFormProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByTestId("carry-forward-trigger")).not.toBeInTheDocument();
    expect(screen.queryByTestId("last-visit-complaints")).not.toBeInTheDocument();
    expect(screen.getByTestId("dirty")).toHaveTextContent("no");
    expect(getLastSubjectiveForPatient).not.toHaveBeenCalled();
    expect(getLastPrescriptionInEpisode).not.toHaveBeenCalled();
  });

  it("display is not a write; applying one item dirties (LVC-DL-5)", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <RxFormProvider
          appointmentId="appt-1"
          patientId="pat-1"
          token="tok"
          entryMode="structured"
          initialFields={createEmptyRxFormFields()}
          autosaveEnabled={false}
          prescriptionIdRef={prescriptionIdRef}
          onPrescriptionCreated={() => {}}
        >
          <LastVisitSummaryProvider value={SUMMARY}>
            <LastVisitComplaintsStrip />
            <DirtyProbe />
          </LastVisitSummaryProvider>
        </RxFormProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("dirty")).toHaveTextContent("no");
    fireEvent.click(
      screen.getByTestId("last-visit-complaints-item-c-1-Worsening"),
    );
    expect(screen.getByTestId("dirty")).toHaveTextContent("yes");
  });
});
