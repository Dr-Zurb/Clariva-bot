/**
 * Cmd-K `fields` source — Phase 1 gate (rfeq-03).
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GlobalCommandPalette } from "@/components/layout/GlobalCommandPalette";
import { VITALS_REGISTRY } from "@/lib/cockpit/vitals-schema";

const { pathnameRef, push, cmdkSelected, cmdkSearched, searchPatients } =
  vi.hoisted(() => ({
    pathnameRef: { current: "/dashboard/appointments/appt-1" },
    push: vi.fn(),
    cmdkSelected: vi.fn(),
    cmdkSearched: vi.fn(),
    searchPatients: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/search/patients", () => ({
  searchPatients: (...args: unknown[]) => searchPatients(...args),
}));

vi.mock("@/lib/telemetry/cmdk", () => ({
  cmdkOpened: vi.fn(),
  cmdkSearched: (...args: unknown[]) => cmdkSearched(...args),
  cmdkSelected: (...args: unknown[]) => cmdkSelected(...args),
}));

function spo2Label(): string {
  const def = VITALS_REGISTRY.find((v) => v.key === "vitalsSpo2");
  if (!def) throw new Error("vitalsSpo2 missing from VITALS_REGISTRY");
  return def.label;
}

function renderPalette() {
  return render(
    <GlobalCommandPalette open onOpenChange={vi.fn()} token="test-token" />
  );
}

async function typeQuery(value: string) {
  const input = await screen.findByPlaceholderText(/search patients/i);
  fireEvent.change(input, { target: { value } });
}

describe("GlobalCommandPalette fields source (rfeq-03)", () => {
  beforeEach(() => {
    pathnameRef.current = "/dashboard/appointments/appt-1";
    push.mockReset();
    cmdkSelected.mockReset();
    cmdkSearched.mockReset();
    searchPatients.mockReset();
    searchPatients.mockResolvedValue([
      { id: "p1", name: "Ravi Sharma", phone: "999", igHandle: null },
    ]);
    window.localStorage.clear();
  });

  it("on a visit, spo2 lists Fields + still returns Patients", async () => {
    renderPalette();
    expect(
      screen.getByPlaceholderText("Search patients or fields…")
    ).toBeInTheDocument();

    await typeQuery("spo2");

    await waitFor(() => {
      expect(screen.getByText("Fields")).toBeInTheDocument();
    });
    expect(screen.getByText(spo2Label())).toBeInTheDocument();
    expect(screen.getByText("Patients")).toBeInTheDocument();
    expect(screen.getByText("Ravi Sharma")).toBeInTheDocument();
    expect(searchPatients).toHaveBeenCalled();
  });

  it("off a visit, spo2 does not list Fields; Patients still return", async () => {
    pathnameRef.current = "/dashboard/patients-v2";
    renderPalette();
    expect(
      screen.getByPlaceholderText("Search patients by name or phone…")
    ).toBeInTheDocument();

    await typeQuery("spo2");

    await waitFor(() => {
      expect(screen.getByText("Patients")).toBeInTheDocument();
    });
    expect(screen.getByText("Ravi Sharma")).toBeInTheDocument();
    expect(screen.queryByText("Fields")).not.toBeInTheDocument();
    expect(screen.queryByText(spo2Label())).not.toBeInTheDocument();
    expect(searchPatients).toHaveBeenCalled();
  });

  it("selecting a field fires cmdkSelected('fields') with no query string", async () => {
    renderPalette();
    await typeQuery("spo2");
    const label = spo2Label();
    const hit = await screen.findByText(label);
    fireEvent.click(hit);

    expect(cmdkSelected).toHaveBeenCalledTimes(1);
    expect(cmdkSelected).toHaveBeenCalledWith("fields");
    expect(cmdkSelected.mock.calls[0]).toHaveLength(1);

    expect(cmdkSearched.mock.calls.length).toBeGreaterThan(0);
    for (const args of cmdkSearched.mock.calls) {
      expect(args).toHaveLength(1);
      expect(typeof args[0]).toBe("number");
    }

    expect(push).toHaveBeenCalledWith(
      "/dashboard/appointments/appt-1?rxFocus=objective.vitals.vitalsSpo2"
    );
  });
});
