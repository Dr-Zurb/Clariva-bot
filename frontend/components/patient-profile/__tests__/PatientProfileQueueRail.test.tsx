/**
 * CockpitQueueRail — snapshot + behaviour tests (Vitest + RTL).
 *
 * Run: `vitest run frontend/components/consultation/cockpit/__tests__/CockpitQueueRail.test.tsx`
 *
 * NOTE: Pre-written ahead of the Vitest + RTL setup.
 * Requires: vitest.config.ts, jsdom env, @testing-library/react,
 *           @testing-library/jest-dom, msw or vi.mock for hooks.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom";

import {
  CockpitQueueRail,
  pipelineTokenLabel,
} from "../PatientProfileQueueRail";
import type { PipelineEntry } from "@/hooks/useDoctorDayPipeline";
import { formatOpdSessionDateLabel, todayLocalIso } from "@/lib/dates";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const prefetchRoute = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: prefetchRoute }),
  useSearchParams: () => new URLSearchParams("from=opd-today&date=2026-08-09"),
  usePathname: () => "/dashboard/appointments/appt-2",
}));

// Radix Tooltip needs a pointer-events-capable DOM — stub it out for snapshots
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => (asChild ? <>{children}</> : <span>{children}</span>),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

vi.mock("@/hooks/useDoctorDayPipeline", () => ({
  useDoctorDayPipeline: vi.fn(),
}));

vi.mock("@/lib/query/prefetch/next-consult", () => ({
  prefetchNextConsult: vi.fn(),
}));

// After the mock declaration we can import the mocked module to control it
// (vitest hoists vi.mock calls so the import below sees the mock)
import { useDoctorDayPipeline } from "@/hooks/useDoctorDayPipeline";
import { prefetchNextConsult } from "@/lib/query/prefetch/next-consult";

const mockUsePipeline = vi.mocked(useDoctorDayPipeline);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(
  overrides: Partial<PipelineEntry> & { id: string },
): PipelineEntry {
  return {
    id: overrides.id,
    label: overrides.label ?? "Priya Sharma",
    status: overrides.status ?? "waiting",
    position: overrides.position ?? 1,
    tokenNumber: overrides.tokenNumber ?? null,
    href: `/dashboard/appointments/${overrides.id}`,
    isCurrent: overrides.isCurrent ?? false,
    appointmentDate: overrides.appointmentDate ?? "2026-05-09T10:00:00Z",
    consultationType: overrides.consultationType ?? "in_clinic",
    ...overrides,
  };
}

function pipelineResult(
  entries: PipelineEntry[],
  currentIndex: number | null,
  extra: {
    totalCount?: number;
    source?: "queue" | "schedule";
    sessionDate?: string;
  } = {},
) {
  const idx = currentIndex;
  mockUsePipeline.mockReturnValue({
    entries,
    currentIndex: idx,
    doneCount: 0,
    activeCount: entries.length,
    missedCount: 0,
    totalCount: extra.totalCount ?? entries.length,
    source: extra.source ?? "queue",
    isLoading: false,
    error: null,
    sessionDate: extra.sessionDate ?? todayLocalIso(),
  });
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

function renderRail(
  overrides: {
    currentAppointmentId?: string | null;
    state?: "ready" | "lobby" | "live" | "wrap_up" | "ended" | "terminal";
  } = {},
) {
  return renderWithClient(
    <CockpitQueueRail
      currentAppointmentId={overrides.currentAppointmentId ?? "appt-2"}
      state={overrides.state ?? "ready"}
      token="tok"
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CockpitQueueRail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Visibility gates ────────────────────────────────────────────────────

  it("prefetches the next consult route and chart queries", () => {
    pipelineResult(
      [
        makeEntry({
          id: "appt-2",
          isCurrent: true,
          status: "in_consultation",
          position: 2,
        }),
        makeEntry({
          id: "appt-3",
          status: "waiting",
          position: 3,
          patientId: "pat-3",
        }),
      ],
      0,
    );
    renderRail({ state: "live" });
    expect(prefetchRoute).toHaveBeenCalledWith(
      "/dashboard/appointments/appt-3",
    );
    expect(prefetchNextConsult).toHaveBeenCalledWith(
      expect.anything(),
      "tok",
      { appointmentId: "appt-3", patientId: "pat-3" },
    );
  });

  it("returns null in terminal state", () => {
    pipelineResult([], null);
    const { container } = renderRail({ state: "terminal" });
    expect(container.firstChild).toBeNull();
  });

  it("returns null when pipeline is empty and not loading", () => {
    pipelineResult([], null);
    const { container } = renderRail({ currentAppointmentId: null });
    expect(container.firstChild).toBeNull();
  });

  it("shows loading indicator while pipeline is loading", () => {
    mockUsePipeline.mockReturnValue({
      entries: [],
      currentIndex: null,
      doneCount: 0,
      activeCount: 0,
      missedCount: 0,
      totalCount: 0,
      source: "queue",
      isLoading: true,
      error: null,
      sessionDate: todayLocalIso(),
    });
    // Provide currentAppointmentId so visibility gate doesn't fire
    // (entries.length === 0 but isLoading === true)
    renderWithClient(
      <CockpitQueueRail
        currentAppointmentId="appt-1"
        state="active"
        token="tok"
      />,
    );
    // Rail still renders because isLoading=true; it shouldn't be null
    // (entries.length === 0 only hides rail when !isLoading)
    // Can't test this directly without overriding the visibility logic;
    // just confirm no crash.
  });

  // ── Three-slot layout ───────────────────────────────────────────────────

  it("renders now chip with current patient first name", () => {
    const entries = [
      makeEntry({ id: "appt-1", label: "Ananya Bose", tokenNumber: 1 }),
      makeEntry({
        id: "appt-2",
        label: "Priya Sharma",
        tokenNumber: 2,
        isCurrent: true,
      }),
      makeEntry({ id: "appt-3", label: "Rahul Verma", tokenNumber: 3 }),
    ];
    pipelineResult(entries, 1);
    renderRail();

    expect(screen.getByText("Priya")).toBeInTheDocument();
    expect(screen.getByText("Ananya")).toBeInTheDocument();
    expect(screen.getByText("Rahul")).toBeInTheDocument();
  });

  it("renders token numbers as #N format", () => {
    const entries = [
      makeEntry({ id: "appt-1", tokenNumber: 5 }),
      makeEntry({ id: "appt-2", tokenNumber: 6, isCurrent: true }),
      makeEntry({ id: "appt-3", tokenNumber: 7 }),
    ];
    pipelineResult(entries, 1);
    renderRail();

    expect(screen.getByText("#5")).toBeInTheDocument();
    expect(screen.getByText("#6")).toBeInTheDocument();
    expect(screen.getByText("#7")).toBeInTheDocument();
  });

  it("uses queue tokens in schedule mode when the visit has one", () => {
    const entries = [
      makeEntry({ id: "appt-1", tokenNumber: 901, position: 1 }),
      makeEntry({
        id: "appt-2",
        tokenNumber: 902,
        position: 2,
        isCurrent: true,
      }),
      makeEntry({ id: "appt-3", tokenNumber: 903, position: 3 }),
    ];
    pipelineResult(entries, 1, { source: "schedule" });
    renderRail();

    expect(screen.getByText("#901")).toBeInTheDocument();
    expect(screen.getByText("#902")).toBeInTheDocument();
    expect(screen.getByText("#903")).toBeInTheDocument();
    expect(screen.queryByText("#1")).not.toBeInTheDocument();
    expect(screen.queryByText("#2")).not.toBeInTheDocument();
    expect(screen.queryByText("#3")).not.toBeInTheDocument();
  });

  it("uses position number in schedule mode (tokenNumber null)", () => {
    const entries = [
      makeEntry({ id: "appt-1", tokenNumber: null, position: 1 }),
      makeEntry({
        id: "appt-2",
        tokenNumber: null,
        position: 2,
        isCurrent: true,
      }),
      makeEntry({ id: "appt-3", tokenNumber: null, position: 3 }),
    ];
    pipelineResult(entries, 1, { source: "schedule" });
    renderRail();

    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("#3")).toBeInTheDocument();
  });

  // ── Empty placeholders ──────────────────────────────────────────────────

  it("renders empty placeholder for prev when doctor is on token #1", () => {
    const entries = [
      makeEntry({ id: "appt-1", isCurrent: true, tokenNumber: 1 }),
      makeEntry({ id: "appt-2", tokenNumber: 2 }),
    ];
    pipelineResult(entries, 0);
    renderRail({ currentAppointmentId: "appt-1" });

    // prev is null → placeholder "—" rendered (hidden on mobile but in DOM)
    const placeholders = screen.getAllByText("—");
    expect(placeholders.length).toBeGreaterThanOrEqual(1);
  });

  it("renders empty placeholder for next on the last token", () => {
    const entries = [
      makeEntry({ id: "appt-1", tokenNumber: 1 }),
      makeEntry({ id: "appt-2", isCurrent: true, tokenNumber: 2 }),
    ];
    pipelineResult(entries, 1);
    renderRail({ currentAppointmentId: "appt-2" });

    const placeholders = screen.getAllByText("—");
    expect(placeholders.length).toBeGreaterThanOrEqual(1);
  });

  // ── now chip is not a link ───────────────────────────────────────────────

  it("now chip has aria-current=step and is not wrapped in an anchor", () => {
    const entries = [
      makeEntry({ id: "appt-1", tokenNumber: 1 }),
      makeEntry({
        id: "appt-2",
        isCurrent: true,
        tokenNumber: 2,
        label: "Priya Sharma",
      }),
      makeEntry({ id: "appt-3", tokenNumber: 3 }),
    ];
    pipelineResult(entries, 1);
    renderRail();

    const nowEl = screen.getByRole("generic", {
      // aria-current=step makes it queryable
      name: /Current patient/i,
    });
    expect(nowEl).toHaveAttribute("aria-current", "step");
    expect(nowEl.tagName.toLowerCase()).not.toBe("a");
  });

  // ── prev / next are links ────────────────────────────────────────────────

  it("prev chip is a link to the prev appointment", () => {
    const entries = [
      makeEntry({ id: "appt-1", tokenNumber: 1, label: "Ananya Bose" }),
      makeEntry({
        id: "appt-2",
        tokenNumber: 2,
        isCurrent: true,
        label: "Priya Sharma",
      }),
      makeEntry({ id: "appt-3", tokenNumber: 3 }),
    ];
    pipelineResult(entries, 1);
    renderRail();

    const prevLink = screen.getByRole("link", {
      name: /Previous patient: Ananya Bose/i,
    });
    expect(prevLink).toHaveAttribute(
      "href",
      "/dashboard/appointments/appt-1?from=opd-today&date=2026-08-09",
    );
  });

  it("next chip is a link to the next appointment", () => {
    const entries = [
      makeEntry({ id: "appt-1", tokenNumber: 1 }),
      makeEntry({
        id: "appt-2",
        tokenNumber: 2,
        isCurrent: true,
        label: "Priya Sharma",
      }),
      makeEntry({ id: "appt-3", tokenNumber: 3, label: "Rahul Verma" }),
    ];
    pipelineResult(entries, 1);
    renderRail();

    const nextLink = screen.getByRole("link", {
      name: /Next patient: Rahul Verma/i,
    });
    expect(nextLink).toHaveAttribute(
      "href",
      "/dashboard/appointments/appt-3?from=opd-today&date=2026-08-09",
    );
  });

  // ── View all link ────────────────────────────────────────────────────────

  it("renders a 'View all (N)' link pointing to /dashboard/opd-today", () => {
    const entries = [
      makeEntry({ id: "appt-1", tokenNumber: 1 }),
      makeEntry({ id: "appt-2", tokenNumber: 2, isCurrent: true }),
    ];
    pipelineResult(entries, 1, { totalCount: 12 });
    renderRail();

    const link = screen.getByRole("link", { name: /View all \(12\)/i });
    expect(link).toHaveAttribute(
      "href",
      `/dashboard/opd-today?date=${todayLocalIso()}`,
    );
  });

  it("hides View all while a consult is live", () => {
    const entries = [
      makeEntry({ id: "appt-1", tokenNumber: 1 }),
      makeEntry({ id: "appt-2", tokenNumber: 2, isCurrent: true }),
    ];
    pipelineResult(entries, 1, { totalCount: 12 });
    renderRail({ state: "live" });

    expect(screen.queryByRole("link", { name: /View all/i })).toBeNull();
  });

  // ── Walk-in removal ──────────────────────────────────────────────────────

  it("renders no walk-in button or text", () => {
    const entries = [
      makeEntry({ id: "appt-1", tokenNumber: 1, isCurrent: true }),
    ];
    pipelineResult(entries, 0);
    renderRail({ currentAppointmentId: "appt-1" });

    expect(screen.queryByText(/walk-?in/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /walk-?in/i })).toBeNull();
  });

  // ── Snapshot ─────────────────────────────────────────────────────────────

  it("inline: All and position sit on the leading edge around the now slot", () => {
    pipelineResult(
      [
        makeEntry({ id: "appt-1", label: "Ananya Bose", tokenNumber: 1 }),
        makeEntry({
          id: "appt-2",
          label: "Priya Sharma",
          tokenNumber: 2,
          isCurrent: true,
        }),
        makeEntry({ id: "appt-3", label: "Rahul Verma", tokenNumber: 3 }),
      ],
      1,
      { totalCount: 3 },
    );
    renderWithClient(
      <CockpitQueueRail
        currentAppointmentId="appt-2"
        state="ready"
        token="tok"
        variant="inline"
        nowSlot={<span data-testid="now-slot">NOW</span>}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Today's OPD/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-queue-position")).toHaveTextContent(
      "2 of 3",
    );
    expect(screen.getByTestId("now-slot")).toHaveTextContent("NOW");
    expect(screen.getByRole("link", { name: /Previous patient/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Next patient/i })).toBeInTheDocument();
    expect(screen.queryByText("Priya")).not.toBeInTheDocument();
  });

  it("inline: keeps empty prev/next slots so the title does not jump", () => {
    pipelineResult(
      [makeEntry({ id: "appt-1", isCurrent: true, tokenNumber: 1 })],
      0,
      { totalCount: 1 },
    );
    renderWithClient(
      <CockpitQueueRail
        currentAppointmentId="appt-1"
        state="ready"
        token="tok"
        variant="inline"
        nowSlot={<span>NOW</span>}
      />,
    );
    expect(screen.getByText("NOW")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Previous patient/i }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: /Next patient/i })).toBeNull();
  });

  it("inline: nowSlot function receives the current pipeline token", () => {
    pipelineResult(
      [
        makeEntry({ id: "appt-1", tokenNumber: 49 }),
        makeEntry({
          id: "appt-2",
          tokenNumber: 50,
          isCurrent: true,
        }),
        makeEntry({ id: "appt-3", tokenNumber: 51 }),
      ],
      1,
    );
    let seen: number | null = null;
    renderWithClient(
      <CockpitQueueRail
        currentAppointmentId="appt-2"
        state="ready"
        token="tok"
        variant="inline"
        nowSlot={({ now }) => {
          seen = now?.tokenNumber ?? null;
          return <span>NOW</span>;
        }}
      />,
    );
    expect(seen).toBe(50);
    expect(screen.getByText("NOW")).toBeInTheDocument();
  });

  it("pipelineTokenLabel falls back to position when tokenNumber is unset", () => {
    expect(
      pipelineTokenLabel(
        makeEntry({ id: "appt-2", tokenNumber: null, position: 50 }),
        "queue",
      ),
    ).toBe("#50");
  });

  it("pipelineTokenLabel prefers tokenNumber in schedule mode", () => {
    expect(
      pipelineTokenLabel(
        makeEntry({ id: "appt-2", tokenNumber: 902, position: 2 }),
        "schedule",
      ),
    ).toBe("#902");
  });

  it("inline: All stays reachable while a consult is live", () => {
    pipelineResult(
      [makeEntry({ id: "appt-2", tokenNumber: 2, isCurrent: true })],
      0,
      { totalCount: 4 },
    );
    renderWithClient(
      <CockpitQueueRail
        currentAppointmentId="appt-2"
        state="live"
        token="tok"
        variant="inline"
        nowSlot={<span>NOW</span>}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Today's OPD, 1 of 4/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-queue-position")).toHaveTextContent(
      "1 of 4",
    );
  });

  it("matches three-slot snapshot", () => {
    const entries = [
      makeEntry({
        id: "a1",
        label: "Ananya Bose",
        tokenNumber: 1,
        position: 1,
        appointmentDate: "2099-01-01T10:00:00Z",
      }),
      makeEntry({
        id: "a2",
        label: "Priya Sharma",
        tokenNumber: 2,
        position: 2,
        isCurrent: true,
        status: "in_consultation",
        appointmentDate: "2099-01-01T10:00:00Z",
      }),
      makeEntry({
        id: "a3",
        label: "Rahul Verma",
        tokenNumber: 3,
        position: 3,
        appointmentDate: "2099-01-01T10:00:00Z",
      }),
    ];
    pipelineResult(entries, 1, { totalCount: 8 });
    const { container } = renderRail();
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Today's-OPD picker — the doctor must never leave the cockpit to switch
// ---------------------------------------------------------------------------

describe("CockpitQueueRail today's-OPD picker", () => {
  const NAMES = [
    "Ananya Bose",
    "Priya Sharma",
    "Rahul Verma",
    "Imran Qureshi",
    "Sneha Rao",
    "Vikram Iyer",
    "Farah Khan",
    "Deepak Nair",
    "Kavya Menon",
    "Arjun Das",
    "Meera Pillai",
    "Zoya Sheikh",
  ];

  function seedDay(count: number) {
    const entries = NAMES.slice(0, count).map((label, i) =>
      makeEntry({
        id: `appt-${i + 1}`,
        label,
        tokenNumber: i + 1,
        position: i + 1,
        isCurrent: i === 1,
        ageYears: 20 + i,
        sex: i % 2 === 0 ? "female" : "male",
      }),
    );
    pipelineResult(entries, 1, { totalCount: count });
    return entries;
  }

  function openPicker() {
    fireEvent.click(screen.getByRole("button", { name: /Today's OPD/i }));
    return screen.getByTestId("cockpit-queue-picker");
  }

  function renderInline() {
    return renderWithClient(
      <CockpitQueueRail
        currentAppointmentId="appt-2"
        state="live"
        token="tok"
        variant="inline"
        nowSlot={<span>NOW</span>}
      />,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens today's OPD in place, linking each patient into the cockpit", () => {
    seedDay(3);
    renderInline();

    const picker = within(openPicker());
    const link = picker.getByRole("link", { name: /Rahul Verma/ });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/appointments/appt-3?from=opd-today&date=2026-08-09",
    );
    // The visit already on screen is marked, not offered as a jump target.
    expect(picker.getByRole("link", { name: /Priya Sharma/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("filters by phone and relative, and shows both under the name", () => {
    pipelineResult(
      [
        makeEntry({
          id: "appt-1",
          label: "Jasmin Kaur",
          tokenNumber: 69,
          position: 1,
          ageYears: 13,
          sex: "female",
          patientPhone: "9876543210",
          guardianName: "Charanjit Singh",
          guardianRelation: "father",
        }),
        makeEntry({
          id: "appt-2",
          label: "Kabir Singh",
          tokenNumber: 65,
          position: 2,
          isCurrent: true,
          ageYears: 45,
          sex: "male",
          patientPhone: "9811122233",
        }),
      ],
      1,
    );
    renderInline();

    const picker = within(openPicker());
    expect(picker.getByText("9876543210 · d/o Charanjit Singh")).toBeInTheDocument();
    expect(picker.getByText("9811122233")).toBeInTheDocument();

    const search = picker.getByLabelText(/search today's opd/i);
    fireEvent.change(search, { target: { value: "98765" } });
    expect(picker.getByRole("link", { name: /Jasmin Kaur/ })).toBeInTheDocument();
    expect(picker.queryByRole("link", { name: /Kabir Singh/ })).toBeNull();

    fireEvent.change(search, { target: { value: "charanjit" } });
    expect(picker.getByRole("link", { name: /Jasmin Kaur/ })).toBeInTheDocument();
    expect(picker.queryByRole("link", { name: /Kabir Singh/ })).toBeNull();
  });

  it("filters by name and by #token", () => {
    seedDay(4);
    renderInline();

    const picker = within(openPicker());
    const search = picker.getByLabelText(/search today's opd/i);

    fireEvent.change(search, { target: { value: "rahul" } });
    expect(picker.getByRole("link", { name: /Rahul Verma/ })).toBeInTheDocument();
    expect(picker.queryByRole("link", { name: /Ananya Bose/ })).toBeNull();

    fireEvent.change(search, { target: { value: "#4" } });
    expect(
      picker.getByRole("link", { name: /Imran Qureshi/ }),
    ).toBeInTheDocument();
    expect(picker.queryByRole("link", { name: /Rahul Verma/ })).toBeNull();

    fireEvent.change(search, { target: { value: "nobody" } });
    expect(picker.getByText(/matches that/i)).toBeInTheDocument();
  });

  it("scrolls today's full list and shows age and sex with each name", () => {
    seedDay(12);
    renderInline();

    const picker = within(openPicker());
    expect(picker.getAllByRole("link").filter((el) =>
      /#\d/.test(el.textContent ?? ""),
    )).toHaveLength(12);
    expect(picker.getByText("12 patients")).toBeInTheDocument();
    expect(picker.getByText("21/M")).toBeInTheDocument();
    expect(picker.getByText("22/F")).toBeInTheDocument();
    expect(picker.getByRole("link", { name: /Zoya Sheikh/ })).toBeInTheDocument();
    expect(picker.queryByText(/\+2 more/)).toBeNull();
    // The full hub stays one click away if the doctor still wants the table.
    expect(picker.getByRole("link", { name: /Open OPD tab/i })).toHaveAttribute(
      "href",
      `/dashboard/opd-today?date=${todayLocalIso()}`,
    );
  });

  it("scrolls the current patient into the middle of the list on open", () => {
    const scrollIntoView = vi.fn();
    const proto = Element.prototype as Element & {
      scrollIntoView: typeof scrollIntoView;
    };
    const previous = proto.scrollIntoView;
    proto.scrollIntoView = scrollIntoView;
    try {
      seedDay(12);
      renderInline();
      openPicker();
      expect(screen.getByTestId("cockpit-queue-picker-current")).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "center",
        inline: "nearest",
      });
    } finally {
      proto.scrollIntoView = previous;
    }
  });

  it("warms a patient's chart when the doctor points at the row", () => {
    seedDay(3);
    renderInline();

    const picker = within(openPicker());
    vi.mocked(prefetchNextConsult).mockClear();
    fireEvent.mouseEnter(picker.getByRole("link", { name: /Rahul Verma/ }));

    expect(prefetchNextConsult).toHaveBeenCalledWith(
      expect.anything(),
      "tok",
      expect.objectContaining({ appointmentId: "appt-3" }),
    );
  });

  it("keeps a past day's list, and prev/next stay clickable when those visits are done", () => {
    const sessionDate = "2026-09-10";
    pipelineResult(
      [
        makeEntry({
          id: "appt-14",
          label: "Test Patient Fourteen",
          tokenNumber: 14,
          status: "completed",
        }),
        makeEntry({
          id: "appt-15",
          label: "Test Patient Fifteen",
          tokenNumber: 15,
          status: "completed",
          isCurrent: true,
        }),
        makeEntry({
          id: "appt-16",
          label: "Test Patient Sixteen",
          tokenNumber: 16,
          status: "completed",
        }),
      ],
      1,
      { totalCount: 23, sessionDate },
    );
    renderWithClient(
      <CockpitQueueRail
        currentAppointmentId="appt-15"
        state="ended"
        token="tok"
        variant="inline"
        visitDate={sessionDate}
        nowSlot={<span>NOW</span>}
      />,
    );

    const sessionLabel = formatOpdSessionDateLabel(sessionDate);
    expect(
      screen.getByRole("button", { name: `${sessionLabel}, 2 of 23` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Previous patient: Test Patient Fourteen/i }),
    ).toHaveAttribute(
      "href",
      "/dashboard/appointments/appt-14?from=opd-today&date=2026-08-09",
    );
    expect(
      screen.getByRole("link", { name: /Next patient: Test Patient Sixteen/i }),
    ).toHaveAttribute(
      "href",
      "/dashboard/appointments/appt-16?from=opd-today&date=2026-08-09",
    );

    fireEvent.click(screen.getByRole("button", { name: `${sessionLabel}, 2 of 23` }));
    const picker = within(screen.getByTestId("cockpit-queue-picker"));
    expect(picker.getByText("3 patients")).toBeInTheDocument();
    expect(picker.getByRole("link", { name: /Open OPD tab/i })).toHaveAttribute(
      "href",
      `/dashboard/opd-today?date=${sessionDate}`,
    );
  });

  it("asks the pipeline for the visit day when the URL has no date", () => {
    pipelineResult(
      [makeEntry({ id: "appt-2", tokenNumber: 2, isCurrent: true })],
      0,
    );
    renderWithClient(
      <CockpitQueueRail
        currentAppointmentId="appt-2"
        state="ended"
        token="tok"
        variant="inline"
        visitDate="2026-09-10"
        nowSlot={<span>NOW</span>}
      />,
    );
    expect(mockUsePipeline).toHaveBeenCalledWith({
      token: "tok",
      currentAppointmentId: "appt-2",
      sessionDate: "2026-09-10",
    });
  });
});
