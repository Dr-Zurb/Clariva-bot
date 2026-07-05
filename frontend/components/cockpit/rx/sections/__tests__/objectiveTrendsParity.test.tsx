/**
 * obj-29 — Phase-6 trends close-gate.
 *
 * Proves that every trend surface (obj-25..28: series hook, sparklines,
 * weight/BMI detail chart, pediatric growth charts) is **strictly view-only**
 * (P6-D1): `buildRxPayload` is byte-identical with trends rendered, no trend
 * state leaks into the derived output, charts consume only the shipped
 * doctor-scoped per-patient read (P6-D2), sparse/empty data degrades gracefully
 * (P6-D4/P6-D6), and sparkline/chart affordances are accessible.
 *
 * Mirrors obj-04 (P1) · obj-15 (P3) · obj-19 (P4) · obj-24 (P5).
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
import { GROWTH_REFERENCE_PROVENANCE } from "@/lib/cockpit/growth-reference/who-iap-v1";
import { getLastPrescriptionInEpisode, getPatientById } from "@/lib/api";
import type { PrescriptionWithRelations } from "@/types/prescription";

const mockUseVitalsTrendsQuery = vi.fn();
const mockedGetLast = vi.mocked(getLastPrescriptionInEpisode);
const mockedGetPatient = vi.mocked(getPatientById);

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getLastPrescriptionInEpisode: vi
      .fn()
      .mockResolvedValue({ data: { prescription: null } }),
    getPatientById: vi.fn(),
  };
});

vi.mock("@/hooks/queries/useVitalsTrendsQuery", () => ({
  useVitalsTrendsQuery: (...args: unknown[]) => mockUseVitalsTrendsQuery(...args),
}));

vi.mock("@/lib/cockpit/vitals-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cockpit/vitals-visibility")>();
  return {
    ...actual,
    fetchVitalsHidden: vi.fn().mockResolvedValue([]),
    saveVitalsHidden: vi.fn().mockResolvedValue([]),
  };
});

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

function richVitalsFields(): RxFormFields {
  const f = createEmptyRxFormFields();
  f.vitalsBpSystolic = 120;
  f.vitalsBpDiastolic = 80;
  f.vitalsHr = 72;
  f.vitalsWtKg = 70;
  f.vitalsHtCm = 170;
  f.vitalsSpo2 = 98;
  f.vitalsHeadCircumferenceCm = 46;
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
      cc: null,
      hopi: null,
      provisional_diagnosis: null,
      follow_up: null,
      patient_education: null,
      clinical_notes: null,
      sent_to_patient_at: null,
      created_at: "2026-01-15T10:00:00.000Z",
      updated_at: "2026-01-15T10:00:00.000Z",
      vitals_hr: 70,
      vitals_wt_kg: 68,
      vitals_ht_cm: 165,
      vitals_head_circumference_cm: 45,
    },
    {
      id: "rx-2",
      appointment_id: "appt-1",
      patient_id: "pat-1",
      doctor_id: "doc-1",
      type: "standard",
      cc: null,
      hopi: null,
      provisional_diagnosis: null,
      follow_up: null,
      patient_education: null,
      clinical_notes: null,
      sent_to_patient_at: null,
      created_at: "2026-06-15T10:00:00.000Z",
      updated_at: "2026-06-15T10:00:00.000Z",
      vitals_hr: 74,
      vitals_wt_kg: 70,
      vitals_ht_cm: 170,
      vitals_head_circumference_cm: 46,
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

function setEmptyTrendQuery() {
  setTrendQueryResult([]);
}

function setSinglePointTrendQuery() {
  setTrendQueryResult([trendPrescriptions()[0]!]);
}

const prescriptionIdRef = { current: "rx-1" as string | null };

function PayloadProbe() {
  const { state } = useRxForm();
  return <pre data-testid="payload-probe">{JSON.stringify(buildRxPayload(state.fields))}</pre>;
}

function renderTrendsHarness(initialFields: RxFormFields = richVitalsFields()) {
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

function readPayload(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId("payload-probe").textContent ?? "{}");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetLast.mockResolvedValue({ data: { prescription: null } });
  mockedGetPatient.mockResolvedValue({
    data: {
      patient: {
        id: "pat-1",
        name: "Test",
        phone: "999",
        date_of_birth: "2024-06-01",
        gender: "male",
        created_at: "2020-01-01T00:00:00.000Z",
        updated_at: "2020-01-01T00:00:00.000Z",
      },
    },
  });
  setTrendQueryResult(trendPrescriptions());
});

// ---------------------------------------------------------------------------
// §1 View-only byte-parity (P6-D1)
// ---------------------------------------------------------------------------

describe("obj-29 · §1 view-only byte-parity (trends never reach buildRxPayload)", () => {
  it("1.1 buildRxPayload is byte-identical with rich trend history rendered in VitalsGrid", async () => {
    const fields = richVitalsFields();
    const pure = JSON.stringify(buildRxPayload(fields));

    renderTrendsHarness(fields);
    await waitFor(() => expect(screen.getByTestId("payload-probe")).toBeInTheDocument());

    expect(JSON.stringify(readPayload())).toBe(pure);
  });

  it("1.1b opening the All trends dialog does not mutate the payload", async () => {
    const fields = richVitalsFields();
    const pure = JSON.stringify(buildRxPayload(fields));

    renderTrendsHarness(fields);
    const trigger = await screen.findByTestId("all-vital-trends-trigger");
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getAllByTestId("recharts-host").length).toBeGreaterThan(0));

    expect(JSON.stringify(readPayload())).toBe(pure);
  });

  it("1.2 no trend / chart / growth keys leak into buildRxPayload", () => {
    const keys = Object.keys(buildRxPayload(richVitalsFields())).sort();
    for (const leaked of [
      "vitalsTrends",
      "trendSeries",
      "growthChart",
      "sparkline",
      "byMetric",
      "attachments",
    ]) {
      expect(keys).not.toContain(leaked);
    }
  });

  it("1.3 vitals save → reload → re-save fixed point is unchanged by trend surfaces", () => {
    const saved = buildRxPayload(richVitalsFields());
    const rx = {
      id: "rx-1",
      vitals_bp_systolic: saved.vitalsBpSystolic,
      vitals_bp_diastolic: saved.vitalsBpDiastolic,
      vitals_hr: saved.vitalsHr,
      vitals_wt_kg: saved.vitalsWtKg,
      vitals_ht_cm: saved.vitalsHtCm,
      vitals_spo2: saved.vitalsSpo2,
      vitals_head_circumference_cm: saved.vitalsHeadCircumferenceCm,
    } as unknown as PrescriptionWithRelations;

    const reloaded = rxFormFieldsFromPrescription(rx);
    expect(JSON.stringify(buildRxPayload(reloaded))).toBe(JSON.stringify(saved));
  });
});

// ---------------------------------------------------------------------------
// §2 Read scope + dependency (P6-D2)
// ---------------------------------------------------------------------------

describe("obj-29 · §2 recharts reused; doctor-scoped read only", () => {
  it("2.1 frontend package.json lists recharts and no new charting dependency", () => {
    const pkgPath = join(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.recharts).toBeTruthy();
    expect(pkg.dependencies?.["chart.js"]).toBeUndefined();
    expect(pkg.dependencies?.d3).toBeUndefined();
  });

  it("2.2 growth reference dataset is versioned config, not PHI", () => {
    expect(GROWTH_REFERENCE_PROVENANCE.phi).toBe(false);
    expect(GROWTH_REFERENCE_PROVENANCE.version).toBe("who-iap-v1");
  });

  it("2.3 vitals trends hook uses the shipped listPrescriptionsByPatient read", () => {
    const hookSrc = readFileSync(
      join(process.cwd(), "hooks/queries/useVitalsTrendsQuery.ts"),
      "utf8",
    );
    expect(hookSrc).toContain("listPrescriptionsByPatient");
    expect(hookSrc).not.toMatch(/\/api\/v1\/.*trends/);
  });
});

// ---------------------------------------------------------------------------
// §3 Sparse / empty data (P6-D4 / P6-D6)
// ---------------------------------------------------------------------------

describe("obj-29 · §3 sparse and empty trend data degrade gracefully", () => {
  it("3.1 zero-point history renders no trend buttons", () => {
    setEmptyTrendQuery();
    renderTrendsHarness();
    expect(screen.queryByTestId("vital-trend-button-vitalsHr")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /trend/i })).not.toBeInTheDocument();
  });

  it("3.2 single-point history opens a chart announcing one prior reading without throwing", async () => {
    setSinglePointTrendQuery();
    expect(() => renderTrendsHarness()).not.toThrow();
    const trigger = await screen.findByRole("button", { name: /Pulse Rate \(PR\) trend/i });
    fireEvent.click(trigger);
    expect(
      await screen.findByRole("img", { name: /Pulse Rate \(PR\) trend across 1 visit\./i }),
    ).toBeInTheDocument();
  });

  it("3.3 multi-point history exposes a per-card trend button and an All trends entry point", async () => {
    renderTrendsHarness();
    const trigger = await screen.findByRole("button", { name: /Pulse Rate \(PR\) trend/i });
    fireEvent.click(trigger);
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: /Pulse Rate \(PR\) trend across 2 visits\./i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("all-vital-trends-trigger")).toBeInTheDocument();
  });

  it("3.4 pediatric growth section is hidden when DOB/sex absent (never errors)", async () => {
    mockedGetPatient.mockResolvedValueOnce({
      data: {
        patient: {
          id: "pat-1",
          name: "Test",
          phone: "999",
          date_of_birth: null,
          gender: "male",
          created_at: "2020-01-01T00:00:00.000Z",
          updated_at: "2020-01-01T00:00:00.000Z",
        },
      },
    });

    renderTrendsHarness();
    fireEvent.click(await screen.findByTestId("all-vital-trends-trigger"));
    await waitFor(() => expect(mockedGetPatient).toHaveBeenCalled());
    expect(screen.queryByText(/Pediatric growth charts/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// §4 Accessibility sweep
// ---------------------------------------------------------------------------

describe("obj-29 · §4 accessibility (sparklines + expandable charts)", () => {
  it("4.1 trend popover expands into a full-history dialog with an accessible chart and table", async () => {
    renderTrendsHarness();
    const trigger = await screen.findByRole("button", { name: /Pulse Rate \(PR\) trend/i });
    fireEvent.click(trigger);

    fireEvent.click(await screen.findByTestId("vital-trend-expand-vitalsHr"));

    expect(await screen.findByTestId("vital-trend-dialog-vitalsHr")).toBeInTheDocument();
    expect(screen.getByTestId("vital-trend-value-table")).toBeInTheDocument();
    expect(
      screen.getAllByRole("img", { name: /Pulse Rate \(PR\) trend across 2 visits\./i }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("4.2 the All trends dialog surfaces the weight/BMI chart and keyboard-reachable growth charts", async () => {
    renderTrendsHarness();

    fireEvent.click(await screen.findByTestId("all-vital-trends-trigger"));

    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: /Weight and BMI trend chart across 2 visits/i }),
      ).toBeInTheDocument(),
    );

    const growthExpand = await screen.findByLabelText(/Expand pediatric growth charts/i);
    expect(growthExpand.tagName).toBe("BUTTON");
    fireEvent.click(growthExpand);
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: /Weight for age growth chart by age/i }),
      ).toBeInTheDocument(),
    );
  });

  it("4.3 per-vital trend button opens a drill-in chart popover (vit-11)", async () => {
    renderTrendsHarness();
    const trigger = await screen.findByRole("button", { name: /Pulse Rate \(PR\) trend/i });
    fireEvent.click(trigger);
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: /Pulse Rate \(PR\) trend across 2 visits/i }),
      ).toBeInTheDocument(),
    );
  });

  it("4.4 the All trends dialog groups per-vital charts by clinical region (vit-12)", async () => {
    renderTrendsHarness();
    const trigger = await screen.findByTestId("all-vital-trends-trigger");
    expect(trigger.tagName).toBe("BUTTON");
    fireEvent.click(trigger);
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: /Pulse Rate \(PR\) trend across 2 visits/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("region", { name: /Core vital trends/i })).toBeInTheDocument();
  });
});
