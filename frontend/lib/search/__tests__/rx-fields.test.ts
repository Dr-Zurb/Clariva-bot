import { describe, expect, it } from "vitest";

import { SUBJECTIVE_SECTION_LABELS } from "@/lib/cockpit/subjective-section-order";
import { VITALS_REGISTRY } from "@/lib/cockpit/vitals-schema";
import {
  appointmentIdFromPath,
  listRxFieldIndex,
  rxFocusValue,
  searchRxFields,
} from "@/lib/search/rx-fields";

const VISIT = "/dashboard/appointments/appt-1";
const PATIENTS = "/dashboard/patients-v2";

function spo2Label(): string {
  const def = VITALS_REGISTRY.find((v) => v.key === "vitalsSpo2");
  if (!def) throw new Error("vitalsSpo2 missing from VITALS_REGISTRY");
  return def.label;
}

describe("listRxFieldIndex (rfeq-01)", () => {
  it("includes every static subjective section label from the registry", () => {
    const labels = listRxFieldIndex()
      .filter((e) => e.pane === "subjective" && !e.field)
      .map((e) => e.label)
      .sort();
    expect(labels).toEqual(Object.values(SUBJECTIVE_SECTION_LABELS).slice().sort());
  });

  it("SpO₂ entry uses the vitals-schema label, not a hardcoded copy", () => {
    const hit = listRxFieldIndex().find((e) => e.field === "vitalsSpo2");
    expect(hit?.label).toBe(spo2Label());
    expect(hit?.pane).toBe("objective");
    expect(hit?.section).toBe("vitals");
  });

  it("does not include custom_block: ids", () => {
    expect(listRxFieldIndex().some((e) => e.section.startsWith("custom_block:"))).toBe(
      false,
    );
  });
});

describe("appointmentIdFromPath", () => {
  it("extracts the id from an appointment leaf path", () => {
    expect(appointmentIdFromPath(VISIT)).toBe("appt-1");
  });

  it("rejects sub-routes and non-appointment paths", () => {
    expect(appointmentIdFromPath(`${VISIT}/chat-history`)).toBeNull();
    expect(appointmentIdFromPath(PATIENTS)).toBeNull();
    expect(appointmentIdFromPath("/dashboard/appointments")).toBeNull();
  });
});

describe("searchRxFields (rfeq-01)", () => {
  it("spo2 hits Oxygen Saturation on an open visit", () => {
    const hits = searchRxFields("spo2", VISIT);
    const spo2 = hits.find((h) => h.id === "objective.vitals.vitalsSpo2");
    expect(spo2).toBeDefined();
    expect(spo2?.label).toBe(spo2Label());
    expect(spo2?.routedTo).toBe(`${VISIT}?rxFocus=objective.vitals.vitalsSpo2`);
    expect(Object.keys(spo2 ?? {}).sort()).toEqual(["id", "label", "routedTo", "subtitle"]);
  });

  it("family hits Family history", () => {
    const hits = searchRxFields("family", VISIT);
    const family = hits.find((h) => h.id === "subjective.family_history");
    expect(family?.label).toBe(SUBJECTIVE_SECTION_LABELS.family_history);
    expect(family?.routedTo).toBe(`${VISIT}?rxFocus=subjective.family_history`);
  });

  it("returns [] off an appointment path", () => {
    expect(searchRxFields("spo2", PATIENTS)).toEqual([]);
    expect(searchRxFields("spo2", `${VISIT}/chat-history`)).toEqual([]);
  });

  it("returns [] for an empty query even on a visit", () => {
    expect(searchRxFields("   ", VISIT)).toEqual([]);
  });

  it("rxFocusValue is pane.section[.field]", () => {
    expect(
      rxFocusValue({ pane: "subjective", section: "family_history", label: "x" }),
    ).toBe("subjective.family_history");
    expect(
      rxFocusValue({
        pane: "objective",
        section: "vitals",
        field: "vitalsSpo2",
        label: "x",
      }),
    ).toBe("objective.vitals.vitalsSpo2");
  });
});
