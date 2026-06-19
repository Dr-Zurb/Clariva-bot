import { describe, expect, it } from "vitest";
import { parseComplaintText } from "@/lib/cockpit/parse-complaint-text";

describe("parseComplaintText", () => {
  it("returns the clean name with no patch for a plain complaint", () => {
    const { name, patch } = parseComplaintText("Chest pain");
    expect(name).toBe("Chest pain");
    expect(patch).toEqual({});
  });

  it("extracts duration and leaves the name", () => {
    const { name, patch } = parseComplaintText("chest pain 3 days");
    expect(name).toBe("Chest pain");
    expect(patch.duration).toBe("3 days");
  });

  it("normalises duration abbreviations", () => {
    const { name, patch } = parseComplaintText("fever 2d");
    expect(name).toBe("Fever");
    expect(patch.duration).toBe("2 days");
  });

  it("strips a connector before the duration (fever x 3 days)", () => {
    const { name, patch } = parseComplaintText("fever x 3 days");
    expect(name).toBe("Fever");
    expect(patch.duration).toBe("3 days");
  });

  it("extracts severity synonyms", () => {
    expect(parseComplaintText("severe chest pain").patch.severity).toBe("severe");
    expect(parseComplaintText("slight headache").patch.severity).toBe("mild");
    expect(parseComplaintText("severe chest pain").name).toBe("Chest pain");
  });

  it("maps the strongest words / 'very severe' to the top band, and minimal to mild", () => {
    expect(parseComplaintText("very severe chest pain").patch.severity).toBe("very_severe");
    expect(parseComplaintText("worst headache of my life").patch.severity).toBe("very_severe");
    expect(parseComplaintText("excruciating back pain").patch.severity).toBe("very_severe");
    // `minimal` is no longer a UI band → folded into mild.
    expect(parseComplaintText("minimal chest pain").patch.severity).toBe("mild");
  });

  it("reads a numeric pain score (N/10) into painScore + band on pain cards", () => {
    const a = parseComplaintText("knee pain 7/10");
    expect(a.patch.painScore).toBe(7);
    expect(a.patch.severity).toBe("severe");
    expect(a.name).toBe("Knee pain");

    const b = parseComplaintText("headache rated 9 out of 10");
    expect(b.patch.painScore).toBe(9);
    expect(b.patch.severity).toBe("very_severe");

    // Non-pain cards (no 0–10 scale) leave the number in the name.
    expect(parseComplaintText("fever 8/10").patch.painScore).toBeUndefined();
  });

  it("extracts fever temperature on fever cards", () => {
    const a = parseComplaintText("fever 102");
    expect(a.name).toBe("Fever");
    expect(a.patch.temperature).toBe(102);
    expect(a.patch.temperatureUnit).toBe("F");
    expect(a.patch.feverGrade).toBe("moderate");

    const b = parseComplaintText("high fever 38.5C");
    expect(b.patch.temperature).toBe(38.5);
    expect(b.patch.temperatureUnit).toBe("C");
    expect(b.patch.feverGrade).toBe("moderate");

    const c = parseComplaintText("fever 101F for 2 days");
    expect(c.patch.temperature).toBe(101);
    expect(c.patch.duration).toBe("2 days");
    expect(c.name).toBe("Fever");
  });

  it("extracts patient-language fever pattern from free text", () => {
    expect(parseComplaintText("intermittent fever").patch.timing).toBe("Comes and goes");
    expect(parseComplaintText("continuous fever").patch.timing).toBe("Constant");
    expect(parseComplaintText("fever that comes and goes").patch.timing).toBe("Comes and goes");
  });

  it("extracts radiation to the end of the phrase", () => {
    const { name, patch } = parseComplaintText("chest pain radiating to left arm");
    expect(name).toBe("Chest pain");
    expect(patch.radiation).toBe("Left arm");
  });

  it("handles a combined phrase: severity + name + radiation + duration", () => {
    const { name, patch } = parseComplaintText("severe chest pain radiating to arm 3 days");
    expect(name).toBe("Chest pain");
    expect(patch).toMatchObject({
      severity: "severe",
      radiation: "arm",
      duration: "3 days",
    });
  });

  it("extracts onset (mode) distinct from duration", () => {
    const { name, patch } = parseComplaintText("sudden onset headache 2 days");
    expect(patch.onset).toBe("Sudden");
    expect(patch.duration).toBe("2 days");
    expect(name).toBe("Headache");
  });

  it("extracts character", () => {
    const { name, patch } = parseComplaintText("throbbing headache");
    expect(patch.character).toBe("Throbbing");
    expect(name).toBe("Headache");
  });

  it("maps relative durations", () => {
    expect(parseComplaintText("headache today").patch.duration).toBe("Today");
  });

  it("never returns an empty name", () => {
    const { name } = parseComplaintText("3 days");
    expect(name.length).toBeGreaterThan(0);
  });

  it("returns an empty associated list when none is present", () => {
    expect(parseComplaintText("Chest pain").associated).toEqual([]);
  });

  describe("laterality (schema-aware)", () => {
    it("pre-selects a bare leading side word without stripping it", () => {
      const { name, patch } = parseComplaintText("Right leg pain");
      expect(name).toBe("Right leg pain");
      expect(patch.laterality).toBe("Right");
    });

    it("pre-selects side from a mid-phrase body part", () => {
      const { name, patch } = parseComplaintText("pain in right shoulder");
      expect(name).toBe("Pain in right shoulder");
      expect(patch.laterality).toBe("Right");
    });

    it("maps an abdomen region phrase onto the 9-grid and strips it", () => {
      const { name, patch } = parseComplaintText("stomach pain in upper region");
      expect(name).toBe("Stomach pain");
      expect(patch.laterality).toBe("Upper middle");
    });

    it("maps a two-word abdomen quadrant and strips it", () => {
      const { name, patch } = parseComplaintText("stomach pain upper left");
      expect(name).toBe("Stomach pain");
      expect(patch.laterality).toBe("Upper left");
    });

    it("maps 'around the navel' onto the central abdomen chip", () => {
      const { name, patch } = parseComplaintText("tummy pain around the navel for 2 days");
      expect(name).toBe("Tummy pain");
      expect(patch.laterality).toBe("Around navel");
      expect(patch.duration).toBe("2 days");
    });

    it("token-matches 'both' onto a multiword chip and strips the phrase", () => {
      const { name, patch } = parseComplaintText("headache both sides");
      expect(name).toBe("Headache");
      expect(patch.laterality).toBe("Both sides");
    });

    it("does not set laterality from a radiation target", () => {
      const { patch } = parseComplaintText("chest pain radiating to left arm");
      expect(patch.laterality).toBeUndefined();
    });
  });

  describe("associated symptoms", () => {
    it("extracts a single associated symptom and cleans the name", () => {
      const { name, associated } = parseComplaintText("headache associated with nausea");
      expect(name).toBe("Headache");
      expect(associated).toEqual(["nausea"]);
    });

    it("splits a list on commas / 'and'", () => {
      const { associated } = parseComplaintText(
        "fever along with chills, body ache and headache",
      );
      expect(associated).toEqual(["chills", "body ache", "headache"]);
    });
  });

  describe("schema-driven chip fields (timing / colour / frequency / location)", () => {
    it("extracts timing introduced by a connector and strips it", () => {
      const { name, patch } = parseComplaintText("cough at night 3 days");
      expect(name).toBe("Cough");
      expect(patch.timing).toBe("night");
      expect(patch.duration).toBe("3 days");
    });

    it("keeps a bare leading timing descriptor in the name but pre-selects it", () => {
      const { name, patch } = parseComplaintText("night cough");
      expect(name).toBe("Night cough");
      expect(patch.timing).toBe("night");
    });

    it("extracts sputum colour from a cough", () => {
      const { patch } = parseComplaintText("cough with yellow sputum");
      expect(patch.color).toBe("yellow");
    });

    it("matches a hyphenated colour chip typed with a space", () => {
      const { patch } = parseComplaintText("cough with blood streaked sputum");
      expect(patch.color).toBe("blood-streaked");
    });

    it("extracts frequency words for urinary complaints", () => {
      const { patch } = parseComplaintText("urination with increased frequency");
      expect(patch.frequency).toBe("increased");
    });

    it("maps a headache region onto the location chip", () => {
      const { patch } = parseComplaintText("frontal headache 2 days");
      expect(patch.location).toBe("Forehead");
      expect(patch.duration).toBe("2 days");
    });

    it("maps patient-language pain pattern from free text", () => {
      expect(parseComplaintText("headache at night").patch.timing).toBe("Night");
      expect(parseComplaintText("constant headache").patch.timing).toBe("Constant");
    });

    it("captures a free-text site from an 'over' clause", () => {
      const { name, patch } = parseComplaintText("rash over both forearms");
      expect(name).toBe("Rash");
      expect(patch.location).toBe("both forearms");
    });

    it("does not set answer-style chips like 'none' / 'normal' from free text", () => {
      const { patch } = parseComplaintText("cough no sputum");
      expect(patch.color).toBeUndefined();
    });
  });

  describe("aggravating / relieving (cue-gated)", () => {
    it("extracts both factors from a pain sentence and cleans the name", () => {
      const { name, patch } = parseComplaintText(
        "chest pain worse on exertion relieved by rest",
      );
      expect(name).toBe("Chest pain");
      expect(patch.aggravating).toBe("Exertion");
      expect(patch.relieving).toBe("Rest");
    });

    it("extracts aggravating via 'aggravated by'", () => {
      const { patch } = parseComplaintText("headache aggravated by light");
      expect(patch.aggravating).toBe("light");
    });

    it("does not treat a bare adjective as relieving (needs a cue)", () => {
      const { patch } = parseComplaintText("headache better");
      expect(patch.relieving).toBeUndefined();
    });

    it("does not fill a reused aggravating field that isn't an aggravating factor", () => {
      // "wound" → injury schema, where the `aggravating` key is labelled
      // "Tetanus cover" — must NOT be set from "worse on movement".
      const { patch } = parseComplaintText("wound worse on movement");
      expect(patch.aggravating).toBeUndefined();
    });
  });

  it("parses the full free-typed sentence into every field", () => {
    const { name, patch, associated } = parseComplaintText(
      "pain in stomach in upper region for 5 days burning in nature also associated with nausea",
    );
    expect(name).toBe("Pain in stomach");
    expect(patch).toMatchObject({
      laterality: "Upper middle",
      duration: "5 days",
      character: "burning",
    });
    expect(associated).toEqual(["nausea"]);
  });
});
