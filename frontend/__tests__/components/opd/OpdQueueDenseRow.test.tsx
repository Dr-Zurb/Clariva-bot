/**
 * OpdQueueDenseRow — snapshot tests (Vitest + RTL).
 *
 * Run: `vitest run frontend/__tests__/components/opd/OpdQueueDenseRow.test.tsx`
 *
 * NOTE: This test file is pre-written ahead of a Vitest + RTL setup.
 * A vitest.config.ts (or vitest.config.mts) pointing at the frontend workspace
 * must be added before these tests can run.  Dependencies needed:
 *   npm i -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom \
 *             @testing-library/user-event jsdom
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";

import {
  OpdQueueDenseRow,
  type OpdQueueDenseRowProps,
} from "@/components/opd/OpdQueueDenseRow";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(
  overrides: Partial<DoctorQueueSessionRow> = {}
): DoctorQueueSessionRow {
  return {
    entryId: "entry-1",
    appointmentId: "appt-1",
    tokenNumber: 3,
    position: 1,
    queueStatus: "waiting",
    sessionDate: "2026-05-08",
    // 20 min ago
    queueCreatedAt: new Date(Date.now() - 20 * 60_000).toISOString(),

    patientName: "Priya Sharma",
    medicalRecordNumber: "MRN-001",
    patientPhone: "+91 98765 43210",

    age: 34,
    gender: "F",

    appointmentStatus: "confirmed",
    scheduledAt: new Date().toISOString(),
    reasonForVisit: "Fever and cough",
    serviceLabel: "General Consultation",
    catalogServiceKey: "gen_consult",
    consultationType: "in_clinic",

    episodeId: null,
    opdEventType: null,
    ...overrides,
  };
}

function renderRow(props: Partial<OpdQueueDenseRowProps> = {}) {
  const entry = props.entry ?? makeEntry();
  const onOpen = props.onOpen ?? vi.fn();
  return render(
    <OpdQueueDenseRow entry={entry} onOpen={onOpen} {...props} />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpdQueueDenseRow", () => {
  beforeEach(() => {
    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Basic render ──

  it("renders all 12 content columns with a sample row", () => {
    const entry = makeEntry();
    renderRow({ entry });

    // Token
    expect(screen.getByText(/#03/)).toBeInTheDocument();
    // Status label
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    // Patient name
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    // MRN
    expect(screen.getByText("MRN-001")).toBeInTheDocument();
    // Phone
    expect(screen.getByText("+91 98765 43210")).toBeInTheDocument();
    // Sex / Age
    expect(screen.getByText(/F\s*·\s*34/)).toBeInTheDocument();
    // Service
    expect(screen.getByText("General Consultation")).toBeInTheDocument();
    // Reason (truncated to 40 chars — "Fever and cough" is shorter so no ellipsis)
    expect(screen.getByText("Fever and cough")).toBeInTheDocument();
    // Modality icon (aria-label)
    expect(screen.getByLabelText("In-clinic")).toBeInTheDocument();
  });

  // ── Phone copy ──

  it("copies phone to clipboard and does NOT trigger onOpen", async () => {
    const onOpen = vi.fn();
    const entry = makeEntry({ patientPhone: "+91 99999 88888" });

    renderRow({ entry, onOpen });

    const copyBtn = screen.getByRole("button", {
      name: /Copy phone number/i,
    });

    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "+91 99999 88888"
    );
    // Row-level onOpen must NOT fire from a phone cell click
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("shows 'Copied!' inline label after phone click", async () => {
    renderRow({ entry: makeEntry() });

    const copyBtn = screen.getByRole("button", { name: /Copy phone number/i });

    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });

  // ── isNextUp ──

  it("adds the '(next)' suffix to the patient name when isNextUp=true", () => {
    const entry = makeEntry({ queueStatus: "waiting" });
    renderRow({ entry, isNextUp: true });

    expect(screen.getByText("(next)")).toBeInTheDocument();
  });

  it("does NOT add '(next)' when isNextUp=true but status is not waiting", () => {
    const entry = makeEntry({ queueStatus: "in_consultation" });
    renderRow({ entry, isNextUp: true });

    expect(screen.queryByText("(next)")).not.toBeInTheDocument();
  });

  // ── dimmed ──

  it("applies opacity-60 class when dimmed=true", () => {
    const entry = makeEntry();
    const { container } = renderRow({ entry, dimmed: true });

    // The root element carries the opacity class
    expect(container.firstChild).toHaveClass("opacity-60");
  });

  it("does not apply opacity-60 when dimmed=false", () => {
    const { container } = renderRow({ entry: makeEntry(), dimmed: false });

    expect(container.firstChild).not.toHaveClass("opacity-60");
  });

  // ── Waited time ──

  it("shows waited minutes for a waiting patient", () => {
    // 25 min wait
    const entry = makeEntry({
      queueStatus: "waiting",
      queueCreatedAt: new Date(Date.now() - 25 * 60_000).toISOString(),
    });
    renderRow({ entry });

    expect(screen.getByText(/25 m/)).toBeInTheDocument();
  });

  it("shows a '!' warning when wait > 30 min", () => {
    const entry = makeEntry({
      queueStatus: "waiting",
      queueCreatedAt: new Date(Date.now() - 35 * 60_000).toISOString(),
    });
    renderRow({ entry });

    expect(screen.getByText(/35 m !/)).toBeInTheDocument();
  });

  it("shows '—' for waited on completed rows", () => {
    const entry = makeEntry({ queueStatus: "completed" });
    renderRow({ entry });

    // At least one '—' for waited column (there may be others for missing fields)
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  // ── In-consultation emphasis ──

  it("applies green row background for in_consultation status", () => {
    const entry = makeEntry({ queueStatus: "in_consultation" });
    const { container } = renderRow({ entry });

    expect(container.firstChild).toHaveClass("bg-green-50/60");
  });

  // ── Whole-row click ──

  it("fires onOpen when the row is clicked", () => {
    const onOpen = vi.fn();
    const { container } = renderRow({ entry: makeEntry(), onOpen });

    fireEvent.click(container.firstChild as HTMLElement);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("fires onOpen when Enter is pressed on the row", () => {
    const onOpen = vi.fn();
    const { container } = renderRow({ entry: makeEntry(), onOpen });

    fireEvent.keyDown(container.firstChild as HTMLElement, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // ── Actions slot ──

  it("renders the actions slot when provided", () => {
    const actionsEl = <button>Open</button>;
    renderRow({ entry: makeEntry(), actions: actionsEl });

    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
  });

  it("renders empty actions gutter when actions is undefined", () => {
    const { container } = renderRow({ entry: makeEntry() });

    // Actions column div should exist (last child of grid), be empty
    const allButtons = container.querySelectorAll("button");
    // Phone copy button + no other action buttons
    const actionBtns = Array.from(allButtons).filter(
      (b) => b.textContent === "Open"
    );
    expect(actionBtns).toHaveLength(0);
  });
});
