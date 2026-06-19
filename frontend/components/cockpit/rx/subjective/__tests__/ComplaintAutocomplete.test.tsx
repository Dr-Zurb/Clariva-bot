import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ComplaintAutocomplete } from "../ComplaintAutocomplete";
import { searchComplaints } from "@/lib/api/complaint-master";

vi.mock("@/lib/api/complaint-master", () => ({
  searchComplaints: vi.fn(),
}));

const headacheRow = {
  id: "c-1",
  name: "Headache",
  synonyms: ["cephalgia"],
  category: "pain" as const,
  created_at: "",
  updated_at: "",
};

const shoulderPainRow = {
  id: "c-2",
  name: "Shoulder pain",
  synonyms: [],
  category: "pain" as const,
  created_at: "",
  updated_at: "",
};

describe("ComplaintAutocomplete", () => {
  beforeEach(() => {
    vi.mocked(searchComplaints).mockImplementation(async (_token, query) => {
      const q = query.toLowerCase();
      if (q.includes("shoulder")) {
        return {
          success: true,
          data: { results: [shoulderPainRow] },
          meta: { timestamp: "", requestId: "" },
        };
      }
      if (q.includes("head") || q === "he") {
        return {
          success: true,
          data: { results: [headacheRow] },
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

  it("shows suggestions and calls onSelect", async () => {
    const onSelect = vi.fn();
    render(
      <ComplaintAutocomplete
        inputId="complaint-name"
        value="he"
        onChange={() => {}}
        onSelect={onSelect}
        token="test-token"
      />,
    );

    fireEvent.focus(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getByText("Headache")).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText("Headache"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Headache", category: "pain" }),
    );
  });

  it("allows free-text without selecting", () => {
    const onChange = vi.fn();
    render(
      <ComplaintAutocomplete
        inputId="complaint-name"
        value=""
        onChange={onChange}
        token="test-token"
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Custom complaint" },
    });
    expect(onChange).toHaveBeenCalledWith("Custom complaint");
  });

  it("calls onCommit with free text when Enter is pressed and search finds nothing", async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <ComplaintAutocomplete
        inputId="complaint-capture"
        value="Custom complaint"
        onChange={onChange}
        onCommit={onCommit}
        token="test-token"
      />,
    );

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith({
        source: "freeText",
        name: "Custom complaint",
      });
    });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("calls onCommit with master row when Enter selects a highlighted match", async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <ComplaintAutocomplete
        inputId="complaint-capture"
        value="he"
        onChange={onChange}
        onCommit={onCommit}
        token="test-token"
      />,
    );

    fireEvent.focus(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getByText("Headache")).toBeInTheDocument();
    });

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith({
      source: "master",
      complaint: expect.objectContaining({ name: "Headache", category: "pain" }),
      rawText: "he",
    });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("resolves on Enter before debounced dropdown results arrive", async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <ComplaintAutocomplete
        inputId="complaint-capture"
        value="pain in shoulder"
        onChange={onChange}
        onCommit={onCommit}
        token="test-token"
        debounceMs={500}
      />,
    );

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith({
        source: "master",
        complaint: expect.objectContaining({ name: "Shoulder pain", category: "pain" }),
        rawText: "pain in shoulder",
      });
    });
    expect(onChange).toHaveBeenCalledWith("");
    expect(searchComplaints).toHaveBeenCalled();
  });

  it("commits custom text on Shift+Enter even when matches exist", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <ComplaintAutocomplete
        inputId="complaint-capture"
        value="pain in shoulder"
        onChange={onChange}
        onCommit={onCommit}
        token="test-token"
        debounceMs={500}
      />,
    );

    vi.mocked(searchComplaints).mockClear();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter", shiftKey: true });

    expect(onCommit).toHaveBeenCalledWith({
      source: "freeText",
      name: "pain in shoulder",
    });
    expect(onChange).toHaveBeenCalledWith("");
    expect(searchComplaints).not.toHaveBeenCalled();
  });
});
