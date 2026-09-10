/**
 * DrugAutocomplete — personal ranking tests (rx-polish-favorites · rxf-05)
 *
 * Run: `vitest run frontend/components/ehr/__tests__/DrugAutocomplete.test.tsx`
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
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
import { resetDrugMasterCatalogCache } from "@/lib/drug-master-catalog";
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
    resetDrugMasterCatalogCache();
    mockedSearch.mockReset();
    mockedUsage.mockReset();
    vi.mocked(
      cockpitTelemetry.trackCockpitV2RRxPolishRankingLanded
    ).mockClear();
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

    expect(
      cockpitTelemetry.trackCockpitV2RRxPolishRankingLanded
    ).toHaveBeenCalledWith({
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
        value="drug"
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

    expect(
      cockpitTelemetry.trackCockpitV2RRxPolishRankingLanded
    ).not.toHaveBeenCalled();
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
        value="drug"
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

describe("DrugAutocomplete — first option is preselected", () => {
  beforeEach(() => {
    resetDrugMasterCatalogCache();
    mockedSearch.mockReset();
    mockedUsage.mockReset();
    mockedUsage.mockReturnValue({ scores: {}, isLoading: false });
  });

  it("highlights the first row and commits it on Enter without ArrowDown", async () => {
    const onSelect = vi.fn();
    const onChange = vi.fn();
    mockedSearch.mockResolvedValue({
      data: { results: [makeDrug(drugA, "Amlodipine")] },
    } as never);

    render(
      <DrugAutocomplete
        value="am"
        onChange={onChange}
        onSelect={onSelect}
        token="test-token-1234567890"
        inputId="med-preselect"
        debounceMs={0}
      />
    );

    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.focus(input);
    });
    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(1);
    });
    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ generic_name: "Amlodipine" })
    );
    expect(onChange).toHaveBeenCalledWith("Amlodipine");
  });

  it("lets Enter bubble after Escape so the parent can keep typed text", async () => {
    const onSelect = vi.fn();
    mockedSearch.mockResolvedValue({
      data: { results: [makeDrug(drugA, "Amlodipine")] },
    } as never);

    render(
      <DrugAutocomplete
        value="am"
        onChange={() => {}}
        onSelect={onSelect}
        token="test-token-1234567890"
        inputId="med-escape-enter"
        debounceMs={0}
      />
    );

    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.focus(input);
    });
    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(1);
    });

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("option")).toBeNull();

    const notCancelled = fireEvent.keyDown(input, { key: "Enter" });
    expect(notCancelled).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("DrugAutocomplete — selectionDisabled (full-line parse mode)", () => {
  beforeEach(() => {
    resetDrugMasterCatalogCache();
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

  it("never fetches when catalogEnabled is false", async () => {
    mockedSearch.mockResolvedValue({
      data: { results: [makeDrug(drugA, "Amlodipine")] },
    } as never);

    render(
      <DrugAutocomplete
        value="amlodipine"
        onChange={() => {}}
        token="test-token-1234567890"
        inputId="med-no-catalog"
        debounceMs={0}
        catalogEnabled={false}
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

describe("DrugAutocomplete — extra options (combos above catalog)", () => {
  beforeEach(() => {
    resetDrugMasterCatalogCache();
    mockedSearch.mockReset();
    mockedUsage.mockReset();
    mockedUsage.mockReturnValue({ scores: {}, isLoading: false });
  });

  it("lists extra options first and commits extras without onSelect", async () => {
    const onSelect = vi.fn();
    const onSelectExtra = vi.fn();
    const onChange = vi.fn();
    mockedSearch.mockResolvedValue({
      data: { results: [makeDrug(drugA, "Multivitamin")] },
    } as never);

    render(
      <DrugAutocomplete
        value="multi"
        onChange={onChange}
        onSelect={onSelect}
        extraOptions={[
          {
            id: "combo-10",
            label: "Multivitamin · 1 OD · 10 days",
            badge: "Most frequent",
          },
        ]}
        onSelectExtra={onSelectExtra}
        token="test-token-1234567890"
        inputId="med-extras"
        debounceMs={0}
      />
    );

    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.focus(input);
    });

    await waitFor(() => {
      expect(screen.getByTestId("medicine-combo-option")).toBeInTheDocument();
      expect(screen.getByTestId("medicine-catalog-option")).toBeInTheDocument();
    });

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Most frequent");
    expect(options[1]).toHaveTextContent("Multivitamin");

    fireEvent.mouseDown(screen.getByTestId("medicine-combo-option"));
    expect(onSelectExtra).toHaveBeenCalledWith("combo-10");
    expect(onSelect).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fills the field from a catalog row without selecting an extra", async () => {
    const onSelect = vi.fn();
    const onSelectExtra = vi.fn();
    const onChange = vi.fn();
    mockedSearch.mockResolvedValue({
      data: { results: [makeDrug(drugA, "Multivitamin")] },
    } as never);

    render(
      <DrugAutocomplete
        value="multi"
        onChange={onChange}
        onSelect={onSelect}
        extraOptions={[
          { id: "combo-10", label: "Multivitamin · 1 OD · 10 days" },
        ]}
        onSelectExtra={onSelectExtra}
        token="test-token-1234567890"
        inputId="med-catalog-fill"
        debounceMs={0}
      />
    );

    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.focus(input);
    });

    fireEvent.mouseDown(await screen.findByTestId("medicine-catalog-option"));
    expect(onChange).toHaveBeenCalledWith("Multivitamin");
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ generic_name: "Multivitamin" })
    );
    expect(onSelectExtra).not.toHaveBeenCalled();
  });

  it("fills form, name, then strength into the field", async () => {
    const onChange = vi.fn();
    mockedSearch.mockResolvedValue({
      data: {
        results: [
          {
            ...makeDrug(drugA, "Prednisolone"),
            form: "tablet",
            strength: "10mg",
          },
        ],
      },
    } as never);

    render(
      <DrugAutocomplete
        value="predni"
        onChange={onChange}
        token="test-token-1234567890"
        inputId="med-form-name-strength"
      />
    );

    await act(async () => {
      fireEvent.focus(screen.getByRole("combobox"));
    });
    fireEvent.mouseDown(await screen.findByTestId("medicine-catalog-option"));
    expect(onChange).toHaveBeenCalledWith("Tab Prednisolone 10mg");
  });
});

describe("DrugAutocomplete — catalog display", () => {
  beforeEach(() => {
    resetDrugMasterCatalogCache();
    mockedSearch.mockReset();
    mockedUsage.mockReset();
    mockedUsage.mockReturnValue({ scores: {}, isLoading: false });
  });

  it("shows the generic name and strength, not brand names", async () => {
    mockedSearch.mockResolvedValue({
      data: {
        results: [
          {
            ...makeDrug(drugA, "Telmisartan"),
            brand_names: ["Telma", "Telpres", "Tazloc"],
            strength: "40mg",
            form: "tablet",
          },
        ],
      },
    } as never);

    render(
      <DrugAutocomplete
        value="telp"
        onChange={() => {}}
        token="test-token-1234567890"
        inputId="med-no-brands"
        debounceMs={0}
      />
    );

    await act(async () => {
      fireEvent.focus(screen.getByRole("combobox"));
    });

    const option = await screen.findByTestId("medicine-catalog-option");
    expect(option).toHaveTextContent("Tab Telmisartan 40mg");
    expect(option).not.toHaveTextContent("Telma");
    expect(option).not.toHaveTextContent("Telpres");
    expect(option).not.toHaveTextContent("Tazloc");
  });

  it("fetches the catalogue once and filters locally as the query changes", async () => {
    mockedSearch.mockResolvedValue({
      data: {
        results: [
          makeDrug(drugA, "Prednisolone"),
          makeDrug(drugB, "Paracetamol"),
        ],
      },
    } as never);

    const { rerender } = render(
      <DrugAutocomplete
        value="pr"
        onChange={() => {}}
        token="test-token-1234567890"
        inputId="med-local-filter"
      />
    );

    await act(async () => {
      fireEvent.focus(screen.getByRole("combobox"));
    });
    await waitFor(() => {
      expect(screen.getByText("Prednisolone")).toBeInTheDocument();
    });
    expect(mockedSearch).toHaveBeenCalledTimes(1);
    expect(mockedSearch).toHaveBeenCalledWith("test-token-1234567890", "", {
      limit: 1000,
    });

    rerender(
      <DrugAutocomplete
        value="pred"
        onChange={() => {}}
        token="test-token-1234567890"
        inputId="med-local-filter"
      />
    );

    expect(screen.getByText("Prednisolone")).toBeInTheDocument();
    expect(screen.queryByText("Paracetamol")).not.toBeInTheDocument();
    expect(mockedSearch).toHaveBeenCalledTimes(1);
  });
});

describe("DrugAutocomplete — arrow keys", () => {
  beforeEach(() => {
    resetDrugMasterCatalogCache();
    mockedSearch.mockReset();
    mockedUsage.mockReset();
    mockedUsage.mockReturnValue({ scores: {}, isLoading: false });
    mockedSearch.mockResolvedValue({
      data: {
        results: [
          makeDrug(drugA, "Telmisartan"),
          makeDrug(drugB, "Telmisartan HCT"),
        ],
      },
    } as never);
  });

  async function openTelmiList() {
    render(
      <DrugAutocomplete
        value="telmi"
        onChange={() => {}}
        extraOptions={[
          {
            id: "combo-a",
            label: "Telmisartan · 40mg",
            badge: "Most frequent",
          },
          { id: "combo-b", label: "telmisartan · 1 tab · 20 days" },
        ]}
        token="test-token-1234567890"
        inputId="med-arrows"
      />
    );
    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.focus(input);
    });
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThanOrEqual(3);
    });
    return input;
  }

  it("stays on the first row on ArrowUp when already preselected", async () => {
    const input = await openTelmiList();
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(options[options.length - 1]).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("moves highlight up and stays on the first row", async () => {
    const input = await openTelmiList();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[2]).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("does not let a parked pointer steal highlight until the mouse moves", async () => {
    const input = await openTelmiList();
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.mouseEnter(options[2]);
    expect(screen.getAllByRole("option")[1]).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.mouseMove(screen.getByRole("listbox"), {
      clientX: 40,
      clientY: 40,
      movementX: 0,
      movementY: 0,
    });
    fireEvent.mouseEnter(screen.getAllByRole("option")[2]);
    expect(screen.getAllByRole("option")[1]).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.mouseMove(screen.getByRole("listbox"), {
      clientX: 48,
      clientY: 40,
      movementX: 8,
      movementY: 0,
    });
    fireEvent.mouseEnter(screen.getAllByRole("option")[2]);
    expect(screen.getAllByRole("option")[2]).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });
});
