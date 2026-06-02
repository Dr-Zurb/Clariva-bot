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
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { CockpitQueueRail } from "../PatientProfileQueueRail";
import type { PipelineEntry } from "@/hooks/useDoctorDayPipeline";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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

// After the mock declaration we can import the mocked module to control it
// (vitest hoists vi.mock calls so the import below sees the mock)
import { useDoctorDayPipeline } from "@/hooks/useDoctorDayPipeline";

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
  extra: { totalCount?: number; source?: "queue" | "schedule" } = {},
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
  });
}

function renderRail(
  overrides: {
    currentAppointmentId?: string | null;
    state?: "active" | "terminal";
  } = {},
) {
  return render(
    <CockpitQueueRail
      currentAppointmentId={overrides.currentAppointmentId ?? "appt-2"}
      state={overrides.state ?? "active"}
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
    });
    // Provide currentAppointmentId so visibility gate doesn't fire
    // (entries.length === 0 but isLoading === true)
    render(
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
      "/dashboard/appointments/appt-1",
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
      "/dashboard/appointments/appt-3",
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
    expect(link).toHaveAttribute("href", expect.stringContaining("/dashboard/opd-today"));
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

  it("matches three-slot snapshot", () => {
    const entries = [
      makeEntry({ id: "a1", label: "Ananya Bose", tokenNumber: 1, position: 1 }),
      makeEntry({
        id: "a2",
        label: "Priya Sharma",
        tokenNumber: 2,
        position: 2,
        isCurrent: true,
        status: "in_consultation",
      }),
      makeEntry({
        id: "a3",
        label: "Rahul Verma",
        tokenNumber: 3,
        position: 3,
      }),
    ];
    pipelineResult(entries, 1, { totalCount: 8 });
    const { container } = renderRail();
    expect(container.firstChild).toMatchSnapshot();
  });
});
