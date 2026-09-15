import { afterEach, describe, expect, it, vi } from "vitest";

import { cmdkSearched, cmdkSelected } from "@/lib/telemetry/cmdk";

describe("cmdk telemetry (rfeq-03)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cmdkSearched emits length only", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    cmdkSearched(4);
    expect(cmdkSearched.length).toBe(1);
    expect(debug).toHaveBeenCalledWith("[ehr:cmdk]", "searched", {
      queryLen: 4,
    });
    const payload = debug.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("query");
    expect(payload).not.toHaveProperty("rxFocus");
  });

  it("cmdkSelected emits the source key only", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    cmdkSelected("fields");
    expect(cmdkSelected.length).toBe(1);
    expect(debug).toHaveBeenCalledWith("[ehr:cmdk]", "selected", {
      source: "fields",
    });
    const payload = debug.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["source"]);
  });
});
