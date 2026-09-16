/**
 * RxWorkspace — cockpitMode gate (cnc-01).
 *
 * Run:
 *   pnpm --filter frontend vitest run components/consultation/cockpit/__tests__/RxWorkspace.test.tsx
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import RxWorkspace from "../RxWorkspace";
import SideSheetHost from "@/components/patient-profile/SideSheetHost";
import { trackCockpitPolishNavClarityLanded } from "@/lib/patient-profile/telemetry";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { RxLockProvider } from "@/components/cockpit/rx/useRxLock";
import { PrescriptionFormShellProvider } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import type { RxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";
import type { PrescriptionWithRelations } from "@/types/prescription";

const prescriptionIdRef = { current: null as string | null };

vi.mock("@/components/consultation/PrescriptionForm", () => ({
  default: () => <div data-testid="prescription-form">Prescription form</div>,
}));

vi.mock("@/components/cockpit/rx/previous/PreviousRxSideSheet", () => ({
  PreviousRxSideSheetAnchor: () => null,
}));

vi.mock("@/components/cockpit/rx/favorites/FavoritesSideSheet", () => ({
  FavoritesSideSheetAnchor: () => null,
}));

vi.mock("@/lib/patient-profile/telemetry", () => ({
  trackCockpitPolishNavClarityLanded: vi.fn(),
  trackCockpitV2RRxPolishSideSheetApplied: vi.fn(),
}));

const observeMock = vi.fn();
const unobserveMock = vi.fn();
const disconnectMock = vi.fn();

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  observe = observeMock;
  unobserve = unobserveMock;
  disconnect = disconnectMock;
  takeRecords = (): IntersectionObserverEntry[] => [];
  constructor(
    _callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit,
  ) {}
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  observeMock.mockClear();
  unobserveMock.mockClear();
  disconnectMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWithProvider(
  overrides: Partial<React.ComponentProps<typeof RxWorkspace>> = {},
) {
  return render(
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
      <SideSheetHost>
        <RxWorkspace
          appointmentId="appt-1"
          patientId="pat-1"
          token="test-token"
          state="live"
          {...overrides}
        />
      </SideSheetHost>
    </RxFormProvider>,
  );
}

describe("RxWorkspace cockpitMode prop", () => {
  it("renders RxSectionNav by default", () => {
    renderWithProvider({ cockpitMode: false });
    expect(screen.getByText("Symptoms")).toBeInTheDocument();
  });

  it("hides RxSectionNav when cockpitMode=true", () => {
    renderWithProvider({ cockpitMode: true });
    expect(screen.queryByText("Symptoms")).not.toBeInTheDocument();
    expect(screen.queryByText("Medicines")).not.toBeInTheDocument();
  });

  it("default (no prop) renders the chip strip", () => {
    renderWithProvider({});
    expect(screen.getByText("Symptoms")).toBeInTheDocument();
  });

  it("does not nest a scrollport when cockpitMode=true", () => {
    const { container } = renderWithProvider({ cockpitMode: true });
    expect(container.querySelector(".overflow-y-auto")).toBeNull();
  });

  it("keeps its own scrollport when cockpitMode is off", () => {
    const { container } = renderWithProvider({ cockpitMode: false });
    expect(container.querySelector(".overflow-y-auto")).toBeTruthy();
  });
});

describe("RxWorkspace read-only notice (rxl-02)", () => {
  it("does not show the retired read-only banner on an ended visit", () => {
    renderWithProvider({ state: "ended" });
    expect(screen.queryByTestId("rx-readonly-notice")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/This prescription is read-only/i),
    ).not.toBeInTheDocument();
  });

  it("does not show the notice on an open visit", () => {
    renderWithProvider({ state: "live" });
    expect(screen.queryByTestId("rx-readonly-notice")).not.toBeInTheDocument();
  });

  it("hides the notice on an ended visit when the current note is open (rxl-19)", () => {
    render(
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
        <RxLockProvider cockpitState="ended" noteClosed={false}>
          <SideSheetHost>
            <RxWorkspace
              appointmentId="appt-1"
              patientId="pat-1"
              token="test-token"
              state="ended"
            />
          </SideSheetHost>
        </RxLockProvider>
      </RxFormProvider>,
    );
    expect(screen.queryByTestId("rx-readonly-notice")).not.toBeInTheDocument();
  });

  it("does not leave a full-bleed pointer-events-none overlay on an ended visit", () => {
    const { container } = renderWithProvider({ state: "ended" });
    expect(
      container.querySelector(".pointer-events-none.absolute.inset-0"),
    ).toBeNull();
  });
});

describe("RxWorkspace revise strip (rxl-25)", () => {
  function issuedShell(
    rx: Partial<PrescriptionWithRelations>,
  ): RxFormProviderSetup {
    return {
      loading: false,
      initialFields: createEmptyRxFormFields(),
      entryMode: "structured",
      setEntryMode: vi.fn(),
      prescription: {
        id: "rx-1",
        attested_at: "2026-09-10T04:45:00.000Z",
        version: 1,
        ...rx,
      } as PrescriptionWithRelations,
      setPrescription: vi.fn(),
      prescriptionIdRef: { current: "rx-1" },
      attachments: [],
      setAttachments: vi.fn(),
      setInitialFields: vi.fn(),
      generateInstanceIds: () => [],
      instanceIdSeqRef: { current: 0 },
      medicineInstanceIds: [],
      setMedicineInstanceIds: vi.fn(),
      subjectiveSectionOrder: null,
      setSubjectiveSectionOrder: vi.fn(),
      subjectiveSectionCollapsed: null,
      setSubjectiveSectionCollapsed: vi.fn(),
      subjectiveSectionHidden: null,
      setSubjectiveSectionHidden: vi.fn(),
      objectiveDefaults: null,
      setObjectiveDefaults: vi.fn(),
      planDefaults: null,
      setPlanDefaults: vi.fn(),
      assessmentDefaults: null,
      setAssessmentDefaults: vi.fn(),
      providerProps: {
        key: "appt-1",
        appointmentId: "appt-1",
        patientId: "pat-1",
        token: "test-token",
        entryMode: "structured",
        initialFields: createEmptyRxFormFields(),
        autosaveEnabled: false,
        prescriptionIdRef: { current: "rx-1" },
        onPrescriptionCreated: vi.fn(),
      },
    };
  }

  it("shows the revise strip on a same-day issued note", () => {
    vi.useFakeTimers({
      now: new Date("2026-09-10T06:30:00.000Z"),
      toFake: ["Date"],
    });
    render(
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
        <RxLockProvider cockpitState="ended" noteClosed={false}>
          <PrescriptionFormShellProvider value={issuedShell({})}>
            <SideSheetHost>
              <RxWorkspace
                appointmentId="appt-1"
                patientId="pat-1"
                token="test-token"
                state="ended"
              />
            </SideSheetHost>
          </PrescriptionFormShellProvider>
        </RxLockProvider>
      </RxFormProvider>,
    );
    expect(screen.getByTestId("rx-revise-strip")).toHaveTextContent(
      /Issued .*The next print or send replaces that slip/,
    );
    expect(screen.queryByTestId("rx-readonly-notice")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("does not show the strip on a draft", () => {
    renderWithProvider({ state: "live" });
    expect(screen.queryByTestId("rx-revise-strip")).not.toBeInTheDocument();
  });

  it("marks a superseded note read-only", () => {
    render(
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
        <RxLockProvider cockpitState="ended" noteClosed={true}>
          <PrescriptionFormShellProvider
            value={issuedShell({ superseded_by_id: "rx-2" })}
          >
            <SideSheetHost>
              <RxWorkspace
                appointmentId="appt-1"
                patientId="pat-1"
                token="test-token"
                state="ended"
              />
            </SideSheetHost>
          </PrescriptionFormShellProvider>
        </RxLockProvider>
      </RxFormProvider>,
    );
    expect(screen.getByTestId("rx-superseded-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("rx-revise-strip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rx-readonly-notice")).not.toBeInTheDocument();
  });
});

describe("RxWorkspace nav-clarity telemetry (cnc-05)", () => {
  beforeEach(() => {
    vi.mocked(trackCockpitPolishNavClarityLanded).mockClear();
  });

  it("fires nav_clarity_landed once on first cockpitMode mount", () => {
    renderWithProvider({ cockpitMode: true });
    expect(trackCockpitPolishNavClarityLanded).toHaveBeenCalledTimes(1);
    expect(trackCockpitPolishNavClarityLanded).toHaveBeenCalledWith({
      appointmentId: "appt-1",
      cockpitMode: true,
      rxSectionNavHidden: true,
      rightColumnTitle: "Chart Notes",
    });
  });

  it("does not fire nav_clarity_landed when cockpitMode is false", () => {
    renderWithProvider({ cockpitMode: false });
    expect(trackCockpitPolishNavClarityLanded).not.toHaveBeenCalled();
  });
});
