import { describe, expect, it } from "vitest";
import {
  formatVitalLineWithNote,
  hydrateVitalNotesFromPrescription,
  hydrateVitalsSectionNoteFromPrescription,
  normalizeVitalNotes,
  normalizeVitalsSectionNote,
  serializeVitalNotesForVitalsJson,
  VITAL_NOTE_MAX_LEN,
} from "@/lib/cockpit/vital-notes";
import { assembleVitalsJsonPayload, createEmptyJsonVitalFields, deriveVitalsText } from "@/lib/cockpit/vitals-json";
import type { VitalsJson } from "@/types/prescription";

describe("vital-notes", () => {
  it("normalizes and caps note text", () => {
    const long = "x".repeat(VITAL_NOTE_MAX_LEN + 20);
    expect(normalizeVitalNotes({ vitalsHr: `  hello  `, vitalsSpo2: long })).toEqual({
      vitalsHr: "hello",
      vitalsSpo2: "x".repeat(VITAL_NOTE_MAX_LEN),
    });
  });

  it("drops unknown keys and blank notes", () => {
    expect(
      normalizeVitalNotes({
        vitalsHr: "palpated",
        not_a_vital: "nope",
        vitalsRr: "   ",
      }),
    ).toEqual({ vitalsHr: "palpated" });
  });

  it("round-trips through vitals_json assembly and derived text", () => {
    const json = assembleVitalsJsonPayload(
      { ...createEmptyJsonVitalFields(), vitalsO2FlowLMin: 4 },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { vitalsO2FlowLMin: "on NC" },
    );
    expect(json.vitalNotes).toEqual({ vitalsO2FlowLMin: "on NC" });
    expect(deriveVitalsText(json)).toBe("Oxygen Flow Rate (O₂): 4 L/min — on NC");
  });

  it("hydrates notes from prescription json", () => {
    const json: VitalsJson = {
      vitalNotes: { vitalsSpo2: "room air" },
    };
    expect(hydrateVitalNotesFromPrescription(json)).toEqual({ vitalsSpo2: "room air" });
    expect(serializeVitalNotesForVitalsJson(hydrateVitalNotesFromPrescription(json))).toEqual({
      vitalsSpo2: "room air",
    });
  });

  it("formats lines with an em dash separator", () => {
    expect(formatVitalLineWithNote("HR: 72 bpm", "after walk")).toBe("HR: 72 bpm — after walk");
    expect(formatVitalLineWithNote("HR: 72 bpm", null)).toBe("HR: 72 bpm");
  });

  it("round-trips the visit-level vitals section note", () => {
    expect(normalizeVitalsSectionNote("  sitting, post-walk  ")).toBe("sitting, post-walk");
    expect(hydrateVitalsSectionNoteFromPrescription({ sectionNote: "desk note" })).toBe(
      "desk note"
    );
    const json = assembleVitalsJsonPayload(
      createEmptyJsonVitalFields(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "sitting, post-walk",
    );
    expect(json.sectionNote).toBe("sitting, post-walk");
    expect(deriveVitalsText(json)).toBe("sitting, post-walk");
  });
});
