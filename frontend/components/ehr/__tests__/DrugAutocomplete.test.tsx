/**
 * DrugAutocomplete — personal ranking tests (rx-polish-favorites · rxf-05)
 *
 * Run: `vitest run frontend/components/ehr/__tests__/DrugAutocomplete.test.tsx`
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { DrugMasterRow } from "@/types/drug-master";
import { sortDrugResultsByPersonalUsage } from "@/lib/drug-autocomplete-ranking";

vi.mock("@/lib/api", () => ({
  searchDrugs: vi.fn(),
}));

vi.mock("@/hooks/useDoctorDrugUsage", () => ({
  useDoctorDrugUsage: vi.fn(() => ({ scores: {}, isLoading: false })),
}));

vi.mock("@/lib/patient-profile/telemetry", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/patient-profile/telemetry")>();
  return {
    ...actual,
    trackCockpitV2RRxPolishRankingLanded: vi.fn(),
  };
});

import { searchDrugs } from "@/lib/api";
import * as cockpitTelemetry from "@/lib/patient-profile/telemetry";
import { useDoctorDrugUsage } from "@/hooks/useDoctorDrugUsage";
import DrugAutocomplete from "../DrugAutocomplete";

const mockedSearch = vi.mocked(searchDrugs);
const mockedUsage = vi.mocked(useDoctorDrugUsage);

function makeDrug(id: string, generic_name: string): DrugMasterRow {
  return {
    id,
    generic_name,
    brand_names: [],
    strength: null,
    form: null,
    route_default: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const drugA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const drugB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("sortDrugResultsByPersonalUsage", () => {
  it("ranks higher personal score before lower score regardless of alphabetical order", () => {
    const pamidronate = makeDrug(drugB, "Pamidronate");
    const paracetamol = makeDrug(drugA, "Paracetamol");
    const raw = [pamidronate, paracetamol];

    const sorted = sortDrugResultsByPersonalUsage(raw, {
      [drugA]: 100,
      [drugB]: 0,
    });

    expect(sorted.map((d) => d.id)).toEqual([drugA, drugB]);
  });

  it("preserves API order when all personal scores are zero (cold start)", () => {
    const first = makeDrug(drugA, "Alpha");
    const second = makeDrug(drugB, "Beta");
    const raw = [first, second];

    const sorted = sortDrugResultsByPersonalUsage(raw, {});

    expect(sorted).toEqual(raw);
  });
});

describe("DrugAutocomplete — personal ranking in dropdown", () => {
  beforeEach(() => {
    window.__cockpitV2RRxPolishRankingLanded = undefined;
    mockedSearch.mockReset();
    mockedUsage.mockReset();
    vi.mocked(cockpitTelemetry.trackCockpitV2RRxPolishRankingLanded).mockClear();
  });

  it("shows the higher-scored drug first in the dropdown", async () => {
    const pamidronate = makeDrug(drugB, "Pamidronate");
    const paracetamol = makeDrug(drugA, "Paracetamol");

    mockedSearch.mockResolvedValue({
      data: { results: [pamidronate, paracetamol] },
    } as never);
    mockedUsage.mockReturnValue({
      scores: { [drugA]: 100, [drugB]: 0 },
      isLoading: false,
    });

    render(
      <DrugAutocomplete
        value="pa"
        onChange={() => {}}
        token="test-token-1234567890"
        inputId="med-name"
        debounceMs={0}
      />
    );

    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.focus(input);
    });

    await waitFor(() => {
      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveTextContent("Paracetamol");
      expect(options[1]).toHaveTextContent("Pamidronate");
    });

    expect(cockpitTelemetry.trackCockpitV2RRxPolishRankingLanded).toHaveBeenCalledWith({
      topResultPersonalScore: 100,
    });
  });

  it("does not fire ranking landed telemetry when all personal scores are zero", async () => {
    const alpha = makeDrug(drugA, "Alpha Drug");
    const beta = makeDrug(drugB, "Beta Drug");

    mockedSearch.mockResolvedValue({
      data: { results: [alpha, beta] },
    } as never);
    mockedUsage.mockReturnValue({ scores: {}, isLoading: false });

    render(
      <DrugAutocomplete
        value="al"
        onChange={() => {}}
        token="test-token-1234567890"
        inputId="med-name-cold"
        debounceMs={0}
      />
    );

    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.focus(input);
    });

    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(2);
    });

    expect(cockpitTelemetry.trackCockpitV2RRxPolishRankingLanded).not.toHaveBeenCalled();
  });

  it("keeps API order when usage scores are empty", async () => {
    const alpha = makeDrug(drugA, "Alpha Drug");
    const beta = makeDrug(drugB, "Beta Drug");

    mockedSearch.mockResolvedValue({
      data: { results: [alpha, beta] },
    } as never);
    mockedUsage.mockReturnValue({ scores: {}, isLoading: false });

    render(
      <DrugAutocomplete
        value="al"
        onChange={() => {}}
        token="test-token-1234567890"
        inputId="med-name-2"
        debounceMs={0}
      />
    );

    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.focus(input);
    });

    await waitFor(() => {
      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveTextContent("Alpha Drug");
      expect(options[1]).toHaveTextContent("Beta Drug");
    });
  });
});

describe("DrugAutocomplete — selectionDisabled (full-line parse mode)", () => {
  beforeEach(() => {
    mockedSearch.mockReset();
    mockedUsage.mockReset();
    mockedUsage.mockReturnValue({ scores: {}, isLoading: false });
  });

  it("never fetches or shows a dropdown when selectionDisabled", async () => {
    mockedSearch.mockResolvedValue({
      data: { results: [makeDrug(drugA, "Amlodipine")] },
    } as never);

    render(
      <DrugAutocomplete
        value="amlodipine 10 years"
        onChange={() => {}}
        token="test-token-1234567890"
        inputId="med-sig"
        debounceMs={0}
        selectionDisabled
      />
    );

    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.focus(input);
    });

    expect(mockedSearch).not.toHaveBeenCalled();
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("lets Enter bubble (does not pick a drug) when selectionDisabled", async () => {
    const onSelect = vi.fn();
    mockedSearch.mockResolvedValue({
      data: { results: [makeDrug(drugA, "Amlodipine")] },
    } as never);

    render(
      <DrugAutocomplete
        value="amlodipine 10 years"
        onChange={() => {}}
        onSelect={onSelect}
        token="test-token-1234567890"
        inputId="med-sig-2"
        debounceMs={0}
        selectionDisabled
      />
    );

    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.focus(input);
    });

    // dispatchEvent returns false only if a handler called preventDefault.
    const notCancelled = fireEvent.keyDown(input, { key: "Enter" });
    expect(notCancelled).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
