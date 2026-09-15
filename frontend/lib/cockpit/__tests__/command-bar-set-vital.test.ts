import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applySetVitalWrites,
  parseSetVitalCommand,
} from "@/lib/cockpit/command-bar-set-vital";
import {
  rxCommandBarOpened,
  rxCommandBarSearched,
  rxCommandBarSelected,
} from "@/lib/telemetry/rx-command-bar";
import { VITALS_REGISTRY } from "@/lib/cockpit/vitals-schema";

function spo2Label(): string {
  const def = VITALS_REGISTRY.find((v) => v.key === "vitalsSpo2");
  if (!def) throw new Error("vitalsSpo2 missing");
  return def.label;
}

describe("parseSetVitalCommand (rfec-03)", () => {
  it("parses spo2 98 as a single SpO₂ write", () => {
    const result = parseSetVitalCommand("spo2 98");
    expect(result).toEqual({
      kind: "one",
      option: {
        id: "set:vitalsSpo2:98",
        label: `Set ${spo2Label()} to 98`,
        focusField: "vitalsSpo2",
        writes: [{ key: "vitalsSpo2", value: 98 }],
      },
    });
  });

  it("accepts NFKC SpO₂ alias", () => {
    const result = parseSetVitalCommand("SpO₂ 98");
    expect(result.kind).toBe("one");
    if (result.kind !== "one") return;
    expect(result.option.writes).toEqual([{ key: "vitalsSpo2", value: 98 }]);
  });

  it("rejects out-of-range SpO₂ and temperature", () => {
    expect(parseSetVitalCommand("spo2 200")).toEqual({ kind: "none" });
    expect(parseSetVitalCommand("temp 101")).toEqual({ kind: "none" });
  });

  it("parses temp 38.2 in canonical °C", () => {
    const result = parseSetVitalCommand("temp 38.2");
    expect(result.kind).toBe("one");
    if (result.kind !== "one") return;
    expect(result.option.writes).toEqual([{ key: "vitalsTempC", value: 38.2 }]);
  });

  it("does not treat o2 98 as SpO₂ / FiO₂ / flow", () => {
    expect(parseSetVitalCommand("o2 98")).toEqual({ kind: "none" });
  });

  it("sets both BP keys from bp 120/80 or a bare pair", () => {
    const expectedWrites = [
      { key: "vitalsBpSystolic", value: 120 },
      { key: "vitalsBpDiastolic", value: 80 },
    ];
    const prefixed = parseSetVitalCommand("bp 120/80");
    const bare = parseSetVitalCommand("120/80");
    expect(prefixed.kind).toBe("one");
    expect(bare.kind).toBe("one");
    if (prefixed.kind !== "one" || bare.kind !== "one") return;
    expect(prefixed.option.writes).toEqual(expectedWrites);
    expect(bare.option.writes).toEqual(expectedWrites);
  });

  it("does not write an incomplete bp 120", () => {
    expect(parseSetVitalCommand("bp 120")).toEqual({ kind: "none" });
  });

  it("offers a pick list for an ambiguous pupil token", () => {
    const result = parseSetVitalCommand("pupil 3");
    expect(result.kind).toBe("pick");
    if (result.kind !== "pick") return;
    const keys = result.options.map((opt) => opt.focusField).sort();
    expect(keys).toEqual(["vitalsPupilSizeLeftMm", "vitalsPupilSizeRightMm"]);
    expect(result.options.every((opt) => opt.writes.length === 1)).toBe(true);
  });

  it("sets a categorical vital from an option label", () => {
    const result = parseSetVitalCommand("avpu alert");
    expect(result.kind).toBe("one");
    if (result.kind !== "one") return;
    expect(result.option.writes).toEqual([{ key: "vitalsAvpu", value: "alert" }]);
  });

  it("does not parse a field-only query as a set", () => {
    expect(parseSetVitalCommand("spo2")).toEqual({ kind: "none" });
  });
});

describe("applySetVitalWrites (rfec-03)", () => {
  it("writes a numeric vital through setField", () => {
    const setField = vi.fn();
    applySetVitalWrites(
      setField,
      { vitalsBpReadings: [], vitalsGlucoseReadings: [] },
      [{ key: "vitalsSpo2", value: 98 }]
    );
    expect(setField).toHaveBeenCalledWith("vitalsSpo2", 98);
  });

  it("mirrors a BP pair onto the primary reading", () => {
    const setField = vi.fn();
    applySetVitalWrites(
      setField,
      { vitalsBpReadings: [], vitalsGlucoseReadings: [] },
      [
        { key: "vitalsBpSystolic", value: 120 },
        { key: "vitalsBpDiastolic", value: 80 },
      ]
    );
    expect(setField).toHaveBeenCalledWith("vitalsBpSystolic", 120);
    expect(setField).toHaveBeenCalledWith("vitalsBpDiastolic", 80);
    expect(setField).toHaveBeenCalledWith(
      "vitalsBpReadings",
      expect.arrayContaining([
        expect.objectContaining({ systolic: 120, diastolic: 80 }),
      ])
    );
  });
});

describe("rx-command-bar telemetry (rfec-03)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("searched accepts length only", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    expect(rxCommandBarSearched.length).toBe(1);
    rxCommandBarSearched(7);
    expect(debug).toHaveBeenCalledWith("[ehr:rxcmd]", "searched", {
      queryLen: 7,
    });
    const payload = debug.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("query");
    expect(payload).not.toHaveProperty("rxFocus");
    expect(payload).not.toHaveProperty("value");
  });

  it("selected accepts kind only", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    expect(rxCommandBarOpened.length).toBe(0);
    expect(rxCommandBarSelected.length).toBe(1);
    rxCommandBarSelected("set");
    expect(debug).toHaveBeenCalledWith("[ehr:rxcmd]", "selected", {
      kind: "set",
    });
    const payload = debug.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["kind"]);
  });
});
