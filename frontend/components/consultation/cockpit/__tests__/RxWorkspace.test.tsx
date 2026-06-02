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
