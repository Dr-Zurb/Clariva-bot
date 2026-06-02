/**
 * Unit tests for getOpdQueueEmptyState (Vitest).
 *
 * Run: `vitest run frontend/__tests__/components/opd/opdQueueEmptyState.test.ts`
 *
 * @see docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-13-keyboard-a11y.md
 */

import { describe, it, expect } from "vitest";
import { getOpdQueueEmptyState } from "@/components/opd/opdQueueEmptyState";
import type { OpdQueueEmptyStateInput } from "@/components/opd/opdQueueEmptyState";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function input(
  overrides: Partial<OpdQueueEmptyStateInput> = {}
): OpdQueueEmptyStateInput {
  return {
    statusFilter: "all",
    query: "",
    sessionDate: "2026-05-08",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getOpdQueueEmptyState", () => {
  // ── Query override (highest priority) ────────────────────────────────────

  it("returns search-specific copy when query is non-empty, regardless of status filter", () => {
    const result = getOpdQueueEmptyState(
      input({ query: "Ravi", statusFilter: "waiting" })
    );
    expect(result.title).toContain("Ravi");
    expect(result.description).toContain("name, phone, or token");
  });

  it("interpolates the query into the title", () => {
    const result = getOpdQueueEmptyState(input({ query: "Dr House" }));
    expect(result.title).toContain("Dr House");
  });

  // ── Status-specific copy ─────────────────────────────────────────────────

  it("returns 'No waiting patients' for statusFilter=waiting", () => {
    const result = getOpdQueueEmptyState(input({ statusFilter: "waiting" }));
    expect(result.title).toBe("No waiting patients.");
    expect(result.description).toContain("arriving");
  });

  it("returns 'No one called yet' for statusFilter=called", () => {
    const result = getOpdQueueEmptyState(input({ statusFilter: "called" }));
    expect(result.title).toBe("No one called yet.");
    expect(result.description).toContain("Click Open");
  });

  it("returns 'No active consultation' for statusFilter=in_consultation", () => {
    const result = getOpdQueueEmptyState(
      input({ statusFilter: "in_consultation" })
    );
    expect(result.title).toBe("No active consultation.");
    expect(result.description).toContain("Open a patient");
  });

  it("returns 'Nobody finished yet' for statusFilter=completed", () => {
    const result = getOpdQueueEmptyState(input({ statusFilter: "completed" }));
    expect(result.title).toBe("Nobody finished yet.");
    expect(result.description).toContain("Completed patients");
  });

  it("returns 'No no-shows yet today' for statusFilter=no_show", () => {
    const result = getOpdQueueEmptyState(input({ statusFilter: "no_show" }));
    expect(result.title).toBe("No no-shows yet today.");
    expect(result.description).toContain("no-show or skip");
  });

  it("returns 'No no-shows yet today' for statusFilter=skipped", () => {
    const result = getOpdQueueEmptyState(input({ statusFilter: "skipped" }));
    expect(result.title).toBe("No no-shows yet today.");
  });

  // ── Global fallback ───────────────────────────────────────────────────────

  it("returns 'No queue for this day' fallback for statusFilter=all", () => {
    const result = getOpdQueueEmptyState(
      input({ statusFilter: "all", sessionDate: "2026-05-08" })
    );
    expect(result.title).toBe("No queue for this day.");
    expect(result.description).toContain("2026-05-08");
  });

  it("interpolates sessionDate into the fallback description", () => {
    const result = getOpdQueueEmptyState(
      input({ sessionDate: "2026-12-25" })
    );
    expect(result.description).toContain("2026-12-25");
  });
});
