/**
 * vit-13 — vitals-section close-gate.
 *
 * The program-closing proof that the whole vitals surface (the expanded
 * registry-driven catalog, hide/unhide via ManageVitalsMenu, "+ Add vital"
 * per-visit reveal, and per-vital trends) is **view/UX-only against the
 * derived output** (V3-D5) and accessible:
 *
 *   §1  No visibility permutation, per-visit reveal, or trend surface changes
 *       `buildRxPayload` by a byte; a shipped-column row derives byte-identical
 *       to today (re-asserts the vit-03 contract); a hidden-but-recorded vital
 *       still serializes (data never lost) while a hidden-empty vital is `null`.
 *   §2  The per-doctor `vitals_hidden` set re-applies on remount; "+ Add vital"
 *       reveal never persists; `vitals_json` round-trips a save→reload→save.
 *   §3  Menu / picker / sparkline / chart affordances are accessible; sparse /
 *       empty data degrades gracefully and never throws.
 *
 * Visibility lives in `VitalsGrid` local state + `doctor_settings.vitals_hidden`;
 * it never enters `RxFormFields`, so `buildRxPayload` is structurally
 * independent of it. This gate exercises the REAL VitalsGrid tree and proves the
 * rendered payload never moves. Mirrors obj-15 (P3) / obj-29 (P6).
 *
 * Synthetic fixtures only — no PHI in logs/snapshots.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  buildRxPayload,
  createEmptyRxFormFields,
  rxFormFieldsFromPrescription,
  useRxForm,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { VitalsGrid } from "@/components/cockpit/rx/inputs/VitalsGrid";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  buildVitalsTrendSeries,
  indexVitalsTrendSeries,
} from "@/lib/cockpit/vitals-trends";
import { buildCategoricalVitalTimelines } from "@/lib/cockpit/categorical-vitals-timeline";
import {
  buildCustomVitalTextTimelines,
  buildCustomVitalTrendSeries,
  indexCustomVitalTrendSeries,
} from "@/lib/cockpit/custom-vitals-trends";
import { deriveVitalsText } from "@/lib/cockpit/vitals-json";
import { getLastPrescriptionInEpisode, getPatientById } from "@/lib/api";
import type { PrescriptionWithRelations } from "@/types/prescription";

const mockGetDoctorSettings = vi.fn();
const mockPatchDoctorSettings = vi.fn();
const mockUseVitalsTrendsQuery = vi.fn();
const mockedGetLast = vi.mocked(getLastPrescriptionInEpisode);
const mockedGetPatient = vi.mocked(getPatientById);

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
    patchDoctorSettings: (...args: unknown[]) => mockPatchDoctorSettings(...args),
    getAppointmentDeskVitals: vi.fn().mockResolvedValue({ data: { vitals: null } }),
    getLastPrescriptionInEpisode: vi
      .fn()
      .mockResolvedValue({ data: { prescription: null } }),
    getPatientById: vi.fn(),
  };
});

vi.mock("@/hooks/queries/useVitalsTrendsQuery", () => ({
  useVitalsTrendsQuery: (...args: unknown[]) => mockUseVitalsTrendsQuery(...args),
}));

vi.mock("@/components/cockpit/rx/objective/PediatricGrowthChartsSection", () => ({
  // Growth charts have a dedicated close-gate (obj-29); keep this surface focused.
  PediatricGrowthChartsSection: () => null,
}));

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="recharts-host">{children}</div>
    ),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Content-rich row: every shipped core column + json numeric + categorical. */
function richFields(): RxFormFields {
  const f = createEmptyRxFormFields();
  f.vitalsBpSystolic = 120;
  f.vitalsBpDiastolic = 80;
  f.vitalsHr = 72;
  f.vitalsRr = 16;
  f.vitalsTempC = 37;
  f.vitalsSpo2 = 98;
  f.vitalsWtKg = 70;
  f.vitalsHtCm = 170;
  // json-backed (hidden at factory default) — proves "hidden but recorded" serializes.
  f.vitalsO2FlowLMin = 4;
  f.vitalsO2DeliveryMethod = "nasal_cannula";
  return f;
}

function trendPrescriptions(): PrescriptionWithRelations[] {
  return [
    {
      id: "rx-1",
      appointment_id: "appt-0",
      patient_id: "pat-1",
      doctor_id: "doc-1",
      type: "standard",
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: "2026-01-15T10:00:00.000Z",
      vitals_hr: 70,
      vitals_wt_kg: 68,
      vitals_ht_cm: 170,
    },
    {
      id: "rx-2",
      appointment_id: "appt-1",
      patient_id: "pat-1",
      doctor_id: "doc-1",
      type: "standard",
      created_at: "2026-06-15T10:00:00.000Z",
      updated_at: "2026-06-15T10:00:00.000Z",
      vitals_hr: 74,
      vitals_wt_kg: 70,
      vitals_ht_cm: 170,
    },
  ] as PrescriptionWithRelations[];
}

function setTrendQueryResult(prescriptions: PrescriptionWithRelations[]) {
  const series = buildVitalsTrendSeries(prescriptions);
  const customTrendSeries = buildCustomVitalTrendSeries(prescriptions);
  const customTextTimelines = buildCustomVitalTextTimelines(prescriptions);
  mockUseVitalsTrendsQuery.mockReturnValue({
    series,
    byMetric: indexVitalsTrendSeries(series),
    categoricalTimelines: buildCategoricalVitalTimelines(prescriptions),
    customTrendSeries,
    byCustomId: indexCustomVitalTrendSeries(customTrendSeries),
    customTextTimelines,
    isLoading: false,
    isEmpty:
      series.every((s) => s.points.length === 0) &&
      customTrendSeries.every((s) => s.points.length === 0) &&
      customTextTimelines.every((t) => t.points.length === 0),
    error: null,
  });
}

const prescriptionIdRef = { current: "rx-1" as string | null };

function PayloadProbe() {
  const { state } = useRxForm();
  return <pre data-testid="payload-probe">{JSON.stringify(buildRxPayload(state.fields))}</pre>;
}

function readPayload(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId("payload-probe").textContent ?? "{}");
}

function renderGrid(initialFields: RxFormFields = richFields()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RxFormProvider
          appointmentId="appt-1"
          patientId="pat-1"
          token="test-token"
          entryMode="structured"
          initialFields={initialFields}
          autosaveEnabled={false}
          prescriptionIdRef={prescriptionIdRef}
          onPrescriptionCreated={() => {}}
        >
          <VitalsGrid />
          <PayloadProbe />
        </RxFormProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

async function waitForSettingsLoaded() {
  await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());
}

async function openManageMenuTo(label: string) {
  if (!screen.queryByRole("button", { name: `Hide ${label}` })) {
    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
  }
  return screen.findByRole("button", { name: `Hide ${label}` });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDoctorSettings.mockResolvedValue({
    data: { settings: { vitals_hidden: [] } },
  });
  mockPatchDoctorSettings.mockImplementation(async (_token, payload) => ({
    data: { settings: { vitals_hidden: payload.vitals_hidden ?? [] } },
  }));
  mockedGetLast.mockResolvedValue({ data: { prescription: null } });
  mockedGetPatient.mockResolvedValue({
    data: {
      patient: {
        id: "pat-1",
        name: "Test",
        phone: "999",
        date_of_birth: "1990-01-01",
        gender: "male",
        created_at: "2020-01-01T00:00:00.000Z",
        updated_at: "2020-01-01T00:00:00.000Z",
      },
    },
  });
  setTrendQueryResult(trendPrescriptions());
});

// ---------------------------------------------------------------------------
// §1 View-only byte-parity (V3-D5)
// ---------------------------------------------------------------------------

describe("vit-13 · §1 view-only byte-parity (visibility/reveal/trends never reach the payload)", () => {
  it("1.1 hide a core vital, reveal a hidden vital, and expand a chart — payload byte-identical", async () => {
    const fields = richFields();
    const baseline = JSON.stringify(buildRxPayload(fields));

    renderGrid(fields);
    await waitForSettingsLoaded();
    await waitFor(() => expect(screen.getByLabelText(/Pulse Rate \(PR\) in bpm/i)).toBeInTheDocument());
    expect(JSON.stringify(readPayload())).toBe(baseline);

    // (a) hide a visible core vital that holds a value (confirm the has-data warning).
    fireEvent.click(await openManageMenuTo("Pulse Rate (PR)"));
    const dialog = await screen.findByTestId("hide-vital-with-data-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Hide" }));
    await waitFor(() => expect(screen.queryByLabelText(/Pulse Rate \(PR\) in bpm/i)).not.toBeInTheDocument());
    expect(JSON.stringify(readPayload())).toBe(baseline);

    // (b) unhide a hidden-empty vital via Manage vitals.
    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    fireEvent.click(await screen.findByTestId("vitals-manager-toggle-vitalsPefrLMin"));
    await waitFor(() => expect(screen.getByLabelText(/Peak Expiratory Flow Rate \(PEFR\) in L\/min/i)).toBeInTheDocument());
    expect(JSON.stringify(readPayload())).toBe(baseline);

    // (c) open the consolidated All trends dialog.
    fireEvent.click(screen.getByTestId("all-vital-trends-trigger"));
    await waitFor(() => expect(screen.getAllByTestId("recharts-host").length).toBeGreaterThan(0));
    expect(JSON.stringify(readPayload())).toBe(baseline);
  });

  it("1.2 a shipped-column-only row derives byte-identically to today (vit-03 contract)", () => {
    // Empty / column-only json derives to "" — appends nothing for legacy rows.
    expect(deriveVitalsText({})).toBe("");
    expect(deriveVitalsText(null)).toBe("");

    const columnRow = {
      id: "rx-legacy",
      appointment_id: "appt-1",
      doctor_id: "doc-1",
      type: "structured",
      vitals_bp_systolic: 128,
      vitals_bp_diastolic: 82,
      vitals_hr: 76,
      vitals_temp_c: 37.1,
      vitals_spo2: 98,
      vitals_wt_kg: 71.5,
      vitals_ht_cm: 172,
    } as unknown as PrescriptionWithRelations;

    const payload = buildRxPayload(rxFormFieldsFromPrescription(columnRow));
    expect(payload).not.toHaveProperty("vitalsJson");
    expect(payload.vitalsHr).toBe(76);
    expect(payload.vitalsBpSystolic).toBe(128);
    // No json-derived text appends for a shipped-column row.
    expect(deriveVitalsText(payload.vitalsJson ?? null)).toBe("");
  });

  it("1.3 hidden-with-data serializes; hidden-empty is null; no visibility/trend keys leak", async () => {
    renderGrid(richFields());
    await waitForSettingsLoaded();
    await waitFor(() => expect(screen.getByTestId("payload-probe")).toBeInTheDocument());

    // O₂ flow / delivery are hidden at factory default but recorded — data never lost.
    const payload = readPayload();
    expect(payload.vitalsJson).toEqual({
      vitalsO2FlowLMin: 4,
      vitalsO2DeliveryMethod: "nasal_cannula",
    });

    // A hidden + empty json vital never produces a key.
    expect((payload.vitalsJson as Record<string, unknown>)).not.toHaveProperty("vitalsPefrLMin");

    // No visibility / trend / layout keys leak into the payload.
    const keys = Object.keys(payload);
    for (const leaked of [
      "vitalsHidden",
      "vitals_hidden",
      "visibleKeys",
      "visitRevealed",
      "vitalsTrends",
      "byMetric",
      "sparkline",
    ]) {
      expect(keys).not.toContain(leaked);
    }
  });

  it("1.4 a fully-empty grid omits vitalsJson entirely (no leaked empty object)", async () => {
    renderGrid(createEmptyRxFormFields());
    await waitForSettingsLoaded();
    await waitFor(() => expect(screen.getByTestId("payload-probe")).toBeInTheDocument());
    expect(readPayload()).not.toHaveProperty("vitalsJson");
  });
});

// ---------------------------------------------------------------------------
// §2 Visibility + storage round-trips
// ---------------------------------------------------------------------------

describe("vit-13 · §2 visibility + storage round-trips", () => {
  it("2.1 a stored vitals_hidden set re-applies on (re)mount", async () => {
    mockGetDoctorSettings.mockResolvedValue({
      data: { settings: { vitals_hidden: ["vitalsHr"] } },
    });

    const first = renderGrid(richFields());
    await waitForSettingsLoaded();
    // HR is normally a classic-core vital, but the doctor hid it — stays hidden.
    await waitFor(() => expect(screen.getByLabelText(/Oxygen Saturation \(SpO₂\) in %/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/Pulse Rate \(PR\) in bpm/i)).not.toBeInTheDocument();
    first.unmount();

    // Remount → the persisted default re-applies identically.
    renderGrid(richFields());
    await waitForSettingsLoaded();
    await waitFor(() => expect(screen.getByLabelText(/Oxygen Saturation \(SpO₂\) in %/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/Pulse Rate \(PR\) in bpm/i)).not.toBeInTheDocument();
  });

  it("2.2 unhiding a vital via Manage vitals reveals it without touching the payload", async () => {
    renderGrid(createEmptyRxFormFields());
    await waitForSettingsLoaded();
    await waitFor(() => expect(screen.getByLabelText(/Pulse Rate \(PR\) in bpm/i)).toBeInTheDocument());
    const baseline = JSON.stringify(readPayload());

    expect(screen.getByLabelText(/^Blood glucose value$/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
    fireEvent.click(await screen.findByRole("button", { name: "Show Glasgow Coma Scale (GCS)" }));
    expect(screen.getByLabelText(/Glasgow Coma Scale \(GCS\) in \/15/i)).toBeInTheDocument();

    // Visibility is view-only — unhiding never reaches the rx payload.
    expect(JSON.stringify(readPayload())).toBe(baseline);
  });

  it("2.3 vitals_json round-trips save → reload → re-save to a fixed point (canonical units)", () => {
    const fields = createEmptyRxFormFields();
    fields.vitalsBpSystolic = 118;
    fields.vitalsPefrLMin = 420;
    fields.vitalsHipCm = 95.5;
    fields.vitalsGcsE = 4;
    fields.vitalsGcsV = 5;
    fields.vitalsGcsM = 6;
    fields.vitalsGlucoseReadings = [
      { valueMgDl: 108, timing: "fasting", device: null, sequenceLabel: null, note: null },
    ];
    fields.vitalsGlucoseTiming = "fasting";
    fields.vitalsPulseRhythm = "irregular";

    const saved = buildRxPayload(fields);
    const reloaded = rxFormFieldsFromPrescription({
      id: "rx-1",
      appointment_id: "appt-1",
      doctor_id: "doc-1",
      type: "structured",
      vitals_bp_systolic: saved.vitalsBpSystolic,
      vitals_glucose_mg_dl: saved.vitalsGlucoseMgDl,
      vitals_json: saved.vitalsJson,
    } as unknown as PrescriptionWithRelations);

    expect(JSON.stringify(buildRxPayload(reloaded))).toBe(JSON.stringify(saved));
  });
});

// ---------------------------------------------------------------------------
// §3 Accessibility + sparse-data sweep
// ---------------------------------------------------------------------------

describe("vit-13 · §3 accessibility + sparse data", () => {
  it("3.1 ManageVitalsMenu exposes aria-expanded + accessible toggle state", async () => {
    renderGrid(createEmptyRxFormFields());
    await waitForSettingsLoaded();

    const trigger = screen.getByTestId("vitals-manager-trigger");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));

    const hideHr = await screen.findByRole("button", { name: "Hide Pulse Rate (PR)" });
    expect(hideHr).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(hideHr);
    expect(await screen.findByRole("button", { name: "Show Pulse Rate (PR)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("3.2 Manage vitals lists effectively-hidden vitals with a labelled show toggle", async () => {
    renderGrid(createEmptyRxFormFields());
    await waitForSettingsLoaded();

    const trigger = screen.getByTestId("vitals-manager-trigger");
    expect(trigger).toHaveAttribute("aria-label", expect.stringContaining("Manage vitals"));
    fireEvent.click(trigger);
    expect(
      await screen.findByRole("button", { name: "Show Glasgow Coma Scale (GCS)" }),
    ).toBeInTheDocument();
  });

  it("3.3 multi-point history exposes a trend button that opens an accessible chart", async () => {
    renderGrid(richFields());
    await waitForSettingsLoaded();

    const trigger = await screen.findByRole("button", { name: /Pulse Rate \(PR\) trend/i });
    expect(trigger.tagName).toBe("BUTTON");
    fireEvent.click(trigger);

    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: /Pulse Rate \(PR\) trend across 2 visits\./i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("vital-trend-expand-vitalsHr")).toBeInTheDocument();
  });

  it("3.4 zero-history data renders no trend buttons and never throws", async () => {
    setTrendQueryResult([]);
    expect(() => renderGrid(richFields())).not.toThrow();
    await waitForSettingsLoaded();
    expect(screen.queryByTestId("vital-trend-button-vitalsHr")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /trend/i })).not.toBeInTheDocument();
  });

  it("3.5 single-visit history announces one prior reading without throwing", async () => {
    setTrendQueryResult([trendPrescriptions()[0]!]);
    expect(() => renderGrid(richFields())).not.toThrow();
    await waitForSettingsLoaded();
    const trigger = await screen.findByRole("button", { name: /Pulse Rate \(PR\) trend/i });
    fireEvent.click(trigger);
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: /Pulse Rate \(PR\) trend across 1 visit\./i }),
      ).toBeInTheDocument(),
    );
  });
});
