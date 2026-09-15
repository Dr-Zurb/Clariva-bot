import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Appointment } from "@/types/appointment";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import {
  CockpitContextRow,
  CockpitContextSurface,
} from "@/components/patient-profile/CockpitContextRow";
import SideSheetHost from "@/components/patient-profile/SideSheetHost";

const prescriptionIdRef = { current: null as string | null };

vi.mock("@/hooks/usePatientRibbonData", () => ({
  usePatientRibbonData: () => ({
    allergies: [],
    chronicConditions: [],
    activeMeds: [],
    activeMedsCount: 0,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/lib/patient-profile/telemetry", () => ({
  trackCockpitV2RRibbonLanded: vi.fn(),
}));

vi.mock("@/components/cockpit/rx/RxSafetyContext", () => ({
  useOptionalRxSafety: () => null,
}));

vi.mock("@/components/cockpit/rx/inputs/useLastVisitVitals", () => ({
  useDeskVisitVitals: () => null,
  useDeskVisitVitalsNote: () => null,
}));

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appt-1",
    doctor_id: "doc-1",
    patient_id: "pat-1",
    patient_name: "Test",
    patient_phone: "1",
    appointment_date: "2026-08-31T10:00:00.000Z",
    status: "confirmed",
    notes: null,
    created_at: "2026-08-31T09:00:00.000Z",
    updated_at: "2026-08-31T09:00:00.000Z",
    consultation_type: "in_clinic",
    consultation_session: null,
    ...overrides,
  } as Appointment;
}

function renderRow(
  state: "ready" | "live" | "ended" = "ready",
  appt: Appointment = makeAppointment(),
  fields = createEmptyRxFormFields(),
) {
  return render(
    <RxFormProvider
      appointmentId={appt.id}
      patientId={appt.patient_id ?? "pat-1"}
      token="tok"
      entryMode="structured"
      initialFields={fields}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      <SideSheetHost>
        <CockpitContextRow appointment={appt} token="tok" state={state} />
      </SideSheetHost>
    </RxFormProvider>,
  );
}

describe("CockpitContextRow (ckd-08)", () => {
  it("shows the brief for a known patient", () => {
    renderRow("ready");
    expect(screen.getByTestId("cockpit-context-row")).toBeInTheDocument();
    expect(screen.getByTestId("patient-ribbon")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-vitals-strip")).toBeInTheDocument();
    expect(screen.queryByTestId("treating-diagnosis")).not.toBeInTheDocument();
  });

  it("puts vitals left of the brief", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsHr = 82;
    renderRow("ready", makeAppointment(), fields);
    const row = screen.getByTestId("cockpit-context-row");
    const vitals = screen.getByTestId("cockpit-vitals-strip");
    const ribbon = screen.getByTestId("patient-ribbon");
    expect(row.compareDocumentPosition(vitals) & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy();
    expect(
      vitals.compareDocumentPosition(ribbon) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the brief and vitals slot during a live consult when both are empty", () => {
    renderRow("live");
    expect(screen.getByTestId("cockpit-context-row")).toBeInTheDocument();
    expect(screen.getByTestId("patient-ribbon")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-vitals-strip")).toBeInTheDocument();
    expect(screen.getByText("Vitals")).toBeInTheDocument();
  });

  it("does not paint its own border or card fill (ckd-13)", () => {
    renderRow("ready");
    const row = screen.getByTestId("cockpit-context-row");
    expect(row.className).not.toMatch(/border-b/);
    expect(row.className).not.toMatch(/bg-card/);
  });

  it("CockpitContextSurface is one border and one background", () => {
    render(
      <CockpitContextSurface>
        <div>identity</div>
      </CockpitContextSurface>,
    );
    const surface = screen.getByTestId("cockpit-context-surface");
    expect(surface.className).toMatch(/border-b/);
    expect(surface.className).toMatch(/bg-background/);
  });

  it("omits the ribbon for a walk-in but keeps the vitals slot", () => {
    renderRow("ready", makeAppointment({ patient_id: null }));
    expect(screen.queryByTestId("patient-ribbon")).not.toBeInTheDocument();
    expect(screen.getByTestId("cockpit-vitals-strip")).toBeInTheDocument();
  });
});
