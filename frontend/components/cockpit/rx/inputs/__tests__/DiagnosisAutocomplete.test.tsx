import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DiagnosisAutocomplete } from "../DiagnosisAutocomplete";
import { searchDiagnoses } from "@/lib/api/diagnosis-catalog";

vi.mock("@/lib/api/diagnosis-catalog", () => ({
  searchDiagnoses: vi.fn(),
}));

const htnRow = {
  id: "d-1",
  code: "BA00",
  title: "Essential hypertension",
  synonyms: ["high blood pressure", "BP high"],
  chapter: "Circulatory",
  created_at: "",
  updated_at: "",
};

const dmRow = {
  id: "d-2",
  code: "5A11",
  title: "Type 2 diabetes mellitus",
  synonyms: ["sugar", "diabetes"],
  chapter: "Endocrine / metabolic",
  created_at: "",
  updated_at: "",
};

describe("DiagnosisAutocomplete", () => {
  beforeEach(() => {
    vi.mocked(searchDiagnoses).mockImplementation(async (_token, query) => {
      const q = query.toLowerCase();
      if (q.includes("bp") || q.includes("hyper") || q === "hy") {
        return {
          success: true,
          data: { results: [htnRow] },
          meta: { timestamp: "", requestId: "" },
        };
      }
      if (q.includes("sugar") || q.includes("diab")) {
        return {
          success: true,
          data: { results: [dmRow] },
          meta: { timestamp: "", requestId: "" },
        };
      }
      return {
        success: true,
        data: { results: [] },
        meta: { timestamp: "", requestId: "" },
      };
    });
  });

  it("shows suggestions with the ICD code and calls onSelect", async () => {
    const onSelect = vi.fn();
    render(
      <DiagnosisAutocomplete
        inputId="dx"
        value="hy"
        onChange={() => {}}
        onSelect={onSelect}
        token="test-token"
      />,
    );

    fireEvent.focus(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getByText("Essential hypertension")).toBeInTheDocument();
    });
    expect(screen.getByText("BA00")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText("Essential hypertension"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ code: "BA00", title: "Essential hypertension" }),
    );
  });

  it("commits a catalog entry (with code) when Enter selects a highlighted match", async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <DiagnosisAutocomplete
        inputId="dx-capture"
        value="hy"
        onChange={onChange}
        onCommit={onCommit}
        token="test-token"
      />,
    );

    fireEvent.focus(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getByText("Essential hypertension")).toBeInTheDocument();
    });

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith({
      source: "catalog",
      entry: expect.objectContaining({ code: "BA00" }),
      rawText: "hy",
    });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("commits free text (uncoded) on Enter when nothing matches (ASMT-D3)", async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <DiagnosisAutocomplete
        inputId="dx-capture"
        value="Some rare syndrome"
        onChange={onChange}
        onCommit={onCommit}
        token="test-token"
      />,
    );

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith({
        source: "freeText",
        label: "Some rare syndrome",
      });
    });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("commits free text on Shift+Enter even when a catalog match exists", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <DiagnosisAutocomplete
        inputId="dx-capture"
        value="BP high"
        onChange={onChange}
        onCommit={onCommit}
        token="test-token"
        debounceMs={500}
      />,
    );

    vi.mocked(searchDiagnoses).mockClear();
    fireEvent.keyDown(screen.getByRole("combobox"), {
      key: "Enter",
      shiftKey: true,
    });

    // `forced` tells the parent to skip the AI resolver on an explicit Shift+Enter.
    expect(onCommit).toHaveBeenCalledWith({
      source: "freeText",
      label: "BP high",
      forced: true,
    });
    expect(onChange).toHaveBeenCalledWith("");
    expect(searchDiagnoses).not.toHaveBeenCalled();
  });

  it("resolves against the catalog on Enter before debounced results arrive", async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <DiagnosisAutocomplete
        inputId="dx-capture"
        value="sugar"
        onChange={onChange}
        onCommit={onCommit}
        token="test-token"
        debounceMs={500}
      />,
    );

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith({
        source: "catalog",
        entry: expect.objectContaining({ code: "5A11" }),
        rawText: "sugar",
      });
    });
    expect(searchDiagnoses).toHaveBeenCalled();
  });

  it("renders the suggestion listbox in a body portal with fixed positioning", async () => {
    render(
      <DiagnosisAutocomplete
        inputId="dx-capture"
        value="hy"
        onChange={() => {}}
        token="test-token"
      />,
    );

    fireEvent.focus(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    const listbox = screen.getByRole("listbox");
    expect(listbox.parentElement).toBe(document.body);
    expect(listbox).toHaveStyle({ position: "fixed" });
  });

  it("uses a stronger active highlight and scrolls the highlighted option into view", async () => {
    const rows = [
      { ...htnRow, id: "d-a", title: "Hyperdontia", code: "LA30.3" },
      { ...htnRow, id: "d-b", title: "Hyperkaluria", code: "MF98.1" },
      { ...htnRow, id: "d-c", title: "Hyperhidrosis", code: "EE00" },
      { ...htnRow, id: "d-d", title: "Hyperkalaemia", code: "5C76" },
      { ...htnRow, id: "d-e", title: "Hypermetropia", code: "9D00.1" },
      { ...htnRow, id: "d-f", title: "Hyperphalangy", code: "LB77" },
    ];
    vi.mocked(searchDiagnoses).mockResolvedValue({
      success: true,
      data: { results: rows },
      meta: { timestamp: "", requestId: "" },
    });

    const scrollSpy = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {});

    render(
      <DiagnosisAutocomplete
        inputId="dx-capture"
        value="hyper"
        onChange={() => {}}
        token="test-token"
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText("Hyperdontia")).toBeInTheDocument();
    });

    const first = screen.getByRole("option", { name: /Hyperdontia/i });
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(first.className).toContain("bg-primary/15");
    expect(first.className).toContain("font-medium");

    scrollSpy.mockClear();
    fireEvent.keyDown(input, { key: "ArrowDown" });

    const second = screen.getByRole("option", { name: /Hyperkaluria/i });
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(scrollSpy).toHaveBeenCalledWith({ block: "nearest" });

    scrollSpy.mockRestore();
  });
});
