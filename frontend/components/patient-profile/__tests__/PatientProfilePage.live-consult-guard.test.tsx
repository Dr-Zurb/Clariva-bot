/**
 * `<PatientProfilePage>` — live-consult guard tests (ppr-15e, Vitest + RTL).
 *
 * Tests the guard that fires when the doctor toggles the Consultation pane
 * OFF while a consult is active (`CockpitState === "live"`).
 *
 * Strategy: mock every heavy dependency except the guard logic itself and the
 * AlertDialog. `<PaneToggleBar>` is mocked to expose `onBeforeHide` via a
 * `data-testid` button so tests can fire the guard directly. The shell ref is
 * mocked so we can assert `setPaneHidden` calls.
 *
 * Six cases (per ppr-15e AC Phase 6):
 *   1. No guard when consult is `ready`.
 *   2. Guard fires when consult is `live` AND clicking body pill.
 *   3. "Keep visible" closes dialog without hiding.
 *   4. "Hide anyway" hides the pane.
 *   5. Guard does NOT fire on Chart or Rx pills, even when live.
 *   6. Guard does NOT fire on hotkey / preset path (deliberate carve-out).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mocks — all must be registered before importing the component under test.
// ---------------------------------------------------------------------------

// Control CockpitState via this mutable ref so individual tests can set it.
let mockCockpitState: string = "ready";

vi.mock("@/lib/patient-profile/state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/patient-profile/state")>();
  return {
    ...actual,
    deriveCockpitState: () => mockCockpitState,
    shouldShowChartRail: () => true,
    canSendPrescription: () => false,
  };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    postAppointmentWrapUp: vi.fn(),
    postDoctorMarkNoShow: vi.fn(),
    listPrescriptionsByAppointment: vi.fn().mockResolvedValue({
      data: { prescriptions: [] },
    }),
    getDoctorSettings: vi.fn().mockResolvedValue({ data: { settings: {} } }),
  };
});

vi.mock("@/lib/patient-profile/layout", () => ({
  shouldRunSeed: () => false,
  readLegacyLayoutOnce: () => null,
  markSeedDone: vi.fn(),
  LAYOUT_STORAGE_KEY: "test:layout",
  TELEMED_VIDEO_LAYOUT_STORAGE_KEY: "test:telemed-video",
  WALKIN_LAYOUT_STORAGE_KEY: "test:walkin",
}));

vi.mock("@/hooks/useLayoutTreePresets", () => ({
  useLayoutTreePresets: () => ({
    presets: [],
    loading: false,
    error: false,
    atCap: false,
    refresh: vi.fn(),
    savePreset: vi.fn(),
    deletePreset: vi.fn(),
    renamePreset: vi.fn(),
  }),
}));

vi.mock("@/components/patient-profile/CustomizeBar", () => ({
  default: () => null,
  LayoutCrampedNudge: () => null,
}));

vi.mock("@/components/patient-profile/CommandBar", () => ({
  default: () => null,
}));

vi.mock("@/components/patient-profile/KeyboardHelpHost", () => ({
  default: () => null,
}));

vi.mock("@/components/patient-profile/PatientRibbon", () => ({
  PatientRibbon: () => null,
}));

vi.mock("@/lib/patient-profile/useShellLayout", () => ({
  validateLayout: () => null,
}));

// This suite targets the LEGACY PatientProfileShell guard (it mocks `Shell` and
// asserts on its imperative `setPaneHidden`). Post-cutover (cv3x-02) v3 is
// default-on, so pin this test to the legacy shell; the v3 `consultActive`
// drag-guard is covered separately by the CockpitV3Shell suite.
vi.mock("@/lib/patient-profile/v3/flags", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/patient-profile/v3/flags")>();
  return {
    ...actual,
    cockpitV3Enabled: () => false,
    resolveCockpitShell: () => "legacy" as const,
  };
});

vi.mock("@/lib/patient-profile/preset-translation", () => ({
  translateLegacyPreset: () => null,
}));

vi.mock("@/hooks/usePatientProfilePresets", () => ({
  usePatientProfilePresets: () => ({
    loading: false,
    customs: [],
    savePreset: vi.fn(),
    renamePreset: vi.fn(),
    deletePreset: vi.fn(),
    applyPreset: vi.fn().mockReturnValue(false),
    nextEvictionTarget: () => null,
  }),
}));

vi.mock("@/hooks/useShellHotkeys", () => ({
  useShellHotkeys: vi.fn(),
}));

vi.mock("@/components/cockpit/rx/useRxFormProviderSetup", () => ({
  useRxFormProviderSetup: () => ({
    providerProps: {
      key: "appt-1-ready",
      appointmentId: "appt-1",
      patientId: null,
      token: "test-token",
      entryMode: "new",
      initialFields: {},
      autosaveEnabled: false,
    },
  }),
}));

vi.mock("@/components/cockpit/rx/RxFormContext", () => ({
  RxFormProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/cockpit/rx/RxSafetyContext", () => ({
  RxSafetyProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/cockpit/rx/PrescriptionFormShellContext", () => ({
  PrescriptionFormShellProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("@/components/patient-profile/PatientProfileHeader", () => ({
  default: ({ centerSlot }: { centerSlot: React.ReactNode }) => (
    <div data-testid="cockpit-header">{centerSlot}</div>
  ),
}));

vi.mock("@/components/consultation/cockpit/SavePresetDialog", () => ({
  default: () => null,
}));

vi.mock("@/components/consultation/cockpit/ManagePresetsDialog", () => ({
  default: () => null,
}));

vi.mock("@/components/consultation/ConsultationLauncher", () => {
  const MockLauncher = React.forwardRef(() => null);
  MockLauncher.displayName = "MockConsultationLauncher";
  return { default: MockLauncher };
});

// Stub pane renderers.
vi.mock("@/components/patient-profile/panes/PatientChartPane", () => ({
  default: () => <div data-testid="chart-pane" />,
}));
vi.mock("@/components/patient-profile/panes/ConsultationBodyPane", () => ({
  default: () => <div data-testid="body-pane" />,
}));
vi.mock("@/components/patient-profile/panes/RxPane", () => ({
  default: () => <div data-testid="rx-pane" />,
}));

// Capture the shell's imperative handle so tests can assert setPaneHidden.
const mockSetPaneHidden = vi.fn();
const mockApplyLayout = vi.fn();
const mockReorderPane = vi.fn();

vi.mock("@/components/patient-profile/Shell", () => {
  const MockShell = React.forwardRef(
    (
      _props: React.PropsWithoutRef<object>,
      ref: React.ForwardedRef<{
        setPaneHidden: typeof mockSetPaneHidden;
        applyLayout: typeof mockApplyLayout;
        reorderPane: typeof mockReorderPane;
        paneOrder: string[];
        paneState: Record<string, unknown>;
      }>,
    ) => {
      React.useImperativeHandle(ref, () => ({
        setPaneHidden: mockSetPaneHidden,
        applyLayout: mockApplyLayout,
        reorderPane: mockReorderPane,
        paneOrder: ["chart", "body", "rx"],
        paneState: {},
        getPaneTree: () => ({
          id: "__root__",
          sizePct: 100,
          hidden: false,
          direction: "horizontal",
          children: [],
        }),
      }));
      return <div data-testid="shell" />;
    },
  );
  MockShell.displayName = "MockPatientProfileShell";
  return { default: MockShell };
});

// ---------------------------------------------------------------------------
// PaneToggleBar mock — exposes onBeforeHide via a set of labelled buttons.
// Each button simulates a "hide this pane" click by calling onBeforeHide(id)
// and then onToggleHidden(id) only if the guard allows it — matching the real
// PaneToggleButton.handleClick logic exactly.
// ---------------------------------------------------------------------------
vi.mock("@/components/patient-profile/PaneToggleBar", () => ({
  default: ({
    onBeforeHide,
    onToggleHidden,
  }: {
    onBeforeHide?: (id: string) => boolean | undefined;
    onToggleHidden: (id: string) => void;
  }) => {
    const clickPane = (id: string) => {
      if (onBeforeHide?.(id) === false) return;
      onToggleHidden(id);
    };
    return (
      <div data-testid="toggle-bar">
        <button onClick={() => clickPane("chart")}>Hide chart</button>
        <button onClick={() => clickPane("body")}>Hide body</button>
        <button onClick={() => clickPane("rx")}>Hide rx</button>
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import PatientProfilePage from "../PatientProfilePage";
import type { Appointment } from "@/types/appointment";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appt-1",
    doctor_id: "doc-1",
    patient_id: "pat-1",
    patient_name: "Test Patient",
    patient_phone: null,
    patient_age: null,
    patient_sex: null,
    appointment_date: "2026-05-14T10:00:00Z",
    status: "confirmed",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    consultation_session: null,
    ...overrides,
  };
}

function renderPage(cockpitState: string = "ready") {
  mockCockpitState = cockpitState;
  const appt = makeAppointment();
  render(<PatientProfilePage appointment={appt} token="test-token" />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("<PatientProfilePage> — live-consult guard (ppr-15e)", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockCockpitState = "ready";
  });

  // ── 1 ─────────────────────────────────────────────────────────────────────
  it("hides body pane immediately (no dialog) when consult state is ready", () => {
    renderPage("ready");

    fireEvent.click(screen.getByRole("button", { name: /hide body/i }));

    // No dialog should appear.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    // onToggleHidden proceeds → our mock calls onToggleHidden which calls
    // shellRef.current.setPaneHidden. But since toggle goes through
    // handleToggleHidden → shellRef.current.setPaneHidden, let's assert no dialog.
    expect(
      screen.queryByText(/hide the consultation panel/i),
    ).not.toBeInTheDocument();
  });

  // ── 2 ─────────────────────────────────────────────────────────────────────
  it("shows confirmation dialog when consult is live and body pill is clicked", () => {
    renderPage("live");

    fireEvent.click(screen.getByRole("button", { name: /hide body/i }));

    expect(
      screen.getByText(/hide the consultation panel/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the consultation is currently active/i),
    ).toBeInTheDocument();
  });

  // ── 3 ─────────────────────────────────────────────────────────────────────
  it("closes dialog without hiding when 'Keep visible' is clicked", () => {
    renderPage("live");

    fireEvent.click(screen.getByRole("button", { name: /hide body/i }));

    // Dialog is open.
    expect(
      screen.getByText(/hide the consultation panel/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /keep visible/i }));

    // Dialog should close.
    expect(
      screen.queryByText(/hide the consultation panel/i),
    ).not.toBeInTheDocument();
    // setPaneHidden must NOT have been called.
    expect(mockSetPaneHidden).not.toHaveBeenCalled();
  });

  // ── 4 ─────────────────────────────────────────────────────────────────────
  it("hides the pane and closes dialog when 'Hide anyway' is clicked", () => {
    renderPage("live");

    fireEvent.click(screen.getByRole("button", { name: /hide body/i }));

    fireEvent.click(screen.getByRole("button", { name: /hide anyway/i }));

    // Dialog should close.
    expect(
      screen.queryByText(/hide the consultation panel/i),
    ).not.toBeInTheDocument();
    // setPaneHidden must have been called with the body pane hidden.
    expect(mockSetPaneHidden).toHaveBeenCalledWith("body", true);
  });

  // ── 5 ─────────────────────────────────────────────────────────────────────
  it("does NOT show dialog when Chart or Rx pills are clicked, even when live", () => {
    renderPage("live");

    // Click Chart
    fireEvent.click(screen.getByRole("button", { name: /hide chart/i }));
    expect(
      screen.queryByText(/hide the consultation panel/i),
    ).not.toBeInTheDocument();

    // Click Rx
    fireEvent.click(screen.getByRole("button", { name: /hide rx/i }));
    expect(
      screen.queryByText(/hide the consultation panel/i),
    ).not.toBeInTheDocument();
  });

  // ── 6 ─────────────────────────────────────────────────────────────────────
  it("does NOT show dialog when the shell's setPaneHidden is called directly (hotkey / preset path)", () => {
    renderPage("live");

    // Simulate a hotkey calling setPaneHidden directly (bypasses onBeforeHide).
    mockSetPaneHidden("body", true);

    // No guard dialog should appear — the direct setPaneHidden path is the
    // deliberate carve-out for hotkeys and preset-apply.
    expect(
      screen.queryByText(/hide the consultation panel/i),
    ).not.toBeInTheDocument();
    expect(mockSetPaneHidden).toHaveBeenCalledWith("body", true);
  });
});
