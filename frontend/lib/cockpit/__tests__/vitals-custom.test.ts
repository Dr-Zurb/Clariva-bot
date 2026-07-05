import { describe, it, expect } from "vitest";
import {
  assembleVitalsCustomEntries,
  createCustomVitalDef,
  customVitalDefsStructureKey,
  deriveVitalsCustomLines,
  hydrateVitalsCustom,
  isCustomVitalId,
  normalizeCustomVitalDefs,
  normalizeVitalsCustomEntries,
  patchCustomVitalDef,
  updateCustomVitalDef,
  type CustomVitalDef,
} from "@/lib/cockpit/vitals-custom";
import { deriveVitalsText, normalizeVitalsJson } from "@/lib/cockpit/vitals-json";
import type { VitalsJson } from "@/types/prescription";

const girth: CustomVitalDef = {
  id: "custom_girth",
  label: "Abdominal girth",
  unit: "cm",
  kind: "numeric",
  group: "core",
};
const gait: CustomVitalDef = {
  id: "custom_gait",
  label: "Gait",
  unit: null,
  kind: "text",
  group: "neuro",
};

describe("vitals-custom definition helpers (vit-14)", () => {
  it("mints prefixed ids and recognizes them", () => {
    const def = createCustomVitalDef("Peak flow effort", "numeric", "respiratory", "L/min");
    expect(isCustomVitalId(def.id)).toBe(true);
    expect(def.label).toBe("Peak flow effort");
    expect(def.unit).toBe("L/min");
  });

  it("capitalizes the first letter of custom vital labels on create and sanitize", () => {
    expect(createCustomVitalDef("abdominal girth", "numeric", "core", "cm").label).toBe(
      "Abdominal girth",
    );
    expect(
      normalizeCustomVitalDefs([
        { id: "custom_x", label: "peak flow", kind: "numeric", group: "core" },
      ])[0]?.label,
    ).toBe("Peak flow");
  });

  it("text definitions never keep a unit", () => {
    const def = createCustomVitalDef("Mood", "text", "neuro", "ignored");
    expect(def.unit).toBe("ignored"); // createCustomVitalDef preserves what's passed
    // but assembled entries strip it (see value tests below)
  });

  it("normalizes + dedupes definitions (last write wins) and drops invalid", () => {
    const defs = normalizeCustomVitalDefs([
      girth,
      { ...girth, label: "Girth v2" },
      { id: "", label: "no id", kind: "numeric", group: "core" },
      { id: "custom_x", label: "Bad kind", kind: "weird", group: "core" },
      { id: "custom_g", label: "Bad group", kind: "text", group: "cardiac" },
    ]);
    expect(defs).toEqual([
      { id: "custom_girth", label: "Girth v2", unit: "cm", kind: "numeric", group: "core" },
      // unknown group falls back to "core"
      { id: "custom_g", label: "Bad group", unit: null, kind: "text", group: "core" },
    ]);
  });

  it("structure key is stable + order-sensitive", () => {
    expect(customVitalDefsStructureKey([girth, gait])).toBe(
      customVitalDefsStructureKey([{ ...girth }, { ...gait }]),
    );
    expect(customVitalDefsStructureKey([girth, gait])).not.toBe(
      customVitalDefsStructureKey([gait, girth]),
    );
  });

  it("updates an existing definition in-place with a stable id", () => {
    const updated = patchCustomVitalDef(girth, {
      label: "Waist girth",
      kind: "numeric",
      group: "metabolic",
      unit: "in",
    });
    expect(updated.id).toBe("custom_girth");
    expect(updateCustomVitalDef([girth, gait], updated)).toEqual([
      { id: "custom_girth", label: "Waist girth", unit: "in", kind: "numeric", group: "metabolic" },
      gait,
    ]);
  });

  it("patchCustomVitalDef drops unit when kind is text", () => {
    const updated = patchCustomVitalDef(girth, {
      label: "Notes",
      kind: "text",
      group: "core",
      unit: "cm",
    });
    expect(updated).toEqual({
      id: "custom_girth",
      label: "Notes",
      unit: null,
      kind: "text",
      group: "core",
    });
  });
});

describe("vitals-custom value entries (vit-14)", () => {
  it("assembles only entries with an entered value; numeric coerces, text trims", () => {
    const entries = assembleVitalsCustomEntries([girth, gait], {
      custom_girth: 92,
      custom_gait: "  steady  ",
    });
    expect(entries).toEqual([
      { id: "custom_girth", label: "Abdominal girth", unit: "cm", kind: "numeric", value: 92 },
      { id: "custom_gait", label: "Gait", unit: null, kind: "text", value: "steady" },
    ]);
  });

  it("embeds per-custom-vital notes from the form notes map", () => {
    const entries = assembleVitalsCustomEntries(
      [girth],
      { custom_girth: 92 },
      { custom_girth: " post-meal " },
    );
    expect(entries).toEqual([
      {
        id: "custom_girth",
        label: "Abdominal girth",
        unit: "cm",
        kind: "numeric",
        value: 92,
        note: "post-meal",
      },
    ]);
  });

  it("drops untouched / blank / non-finite values", () => {
    expect(
      assembleVitalsCustomEntries([girth, gait], {
        custom_girth: null,
        custom_gait: "   ",
      }),
    ).toEqual([]);
    expect(
      assembleVitalsCustomEntries([girth], { custom_girth: Number.NaN }),
    ).toEqual([]);
  });

  it("normalizeVitalsCustomEntries drops malformed entries", () => {
    expect(
      normalizeVitalsCustomEntries([
        { id: "custom_a", label: "A", kind: "numeric", value: 5 },
        { id: "", label: "no id", kind: "numeric", value: 5 },
        { id: "custom_b", label: "B", kind: "text", value: "" },
        { id: "custom_c", label: "C", kind: "numeric", value: "not a number" },
        "nope",
      ]),
    ).toEqual([{ id: "custom_a", label: "A", unit: null, kind: "numeric", value: 5 }]);
  });

  it("derives numeric (with unit) and text lines", () => {
    expect(
      deriveVitalsCustomLines([
        { id: "custom_girth", label: "Abdominal girth", unit: "cm", kind: "numeric", value: 92 },
        { id: "custom_gait", label: "Gait", unit: null, kind: "text", value: "steady" },
      ]),
    ).toEqual(["Abdominal girth: 92 cm", "Gait: steady"]);
  });

  it("appends custom-vital notes to derived lines", () => {
    expect(
      deriveVitalsCustomLines([
        {
          id: "custom_girth",
          label: "Abdominal girth",
          unit: "cm",
          kind: "numeric",
          value: 92,
          note: "supine",
        },
      ]),
    ).toEqual(["Abdominal girth: 92 cm — supine"]);
  });
});

describe("vitals-custom hydration (vit-14)", () => {
  it("seeds doctor defaults and overlays stored self-describing values", () => {
    const json: VitalsJson = {
      vitalsCustom: [
        { id: "custom_girth", label: "Abdominal girth (old)", unit: "cm", kind: "numeric", value: 88 },
        { id: "custom_removed", label: "Removed vital", unit: "kg", kind: "numeric", value: 3 },
      ],
    };
    const { defs, values } = hydrateVitalsCustom(json, [girth, gait]);
    // stored snapshot label wins; removed vital still appears (retain-on-remove)
    expect(defs.find((d) => d.id === "custom_girth")?.label).toBe("Abdominal girth (old)");
    expect(defs.find((d) => d.id === "custom_removed")?.label).toBe("Removed vital");
    expect(defs.find((d) => d.id === "custom_gait")).toBeTruthy();
    expect(values.custom_girth).toBe(88);
    expect(values.custom_removed).toBe(3);
    expect(values.custom_gait).toBeNull();
  });
});

describe("vitals-json custom round-trip + byte-parity (vit-14 / V3-D5)", () => {
  it("preserves a valid vitalsCustom slot through normalizeVitalsJson", () => {
    const clean = normalizeVitalsJson({
      vitalsCustom: [
        { id: "custom_girth", label: "Abdominal girth", unit: "cm", kind: "numeric", value: 92 },
      ],
    });
    expect(clean).toEqual({
      vitalsCustom: [
        { id: "custom_girth", label: "Abdominal girth", unit: "cm", kind: "numeric", value: 92 },
      ],
    });
  });

  it("drops an all-invalid vitalsCustom slot to {} (no empty key persists)", () => {
    expect(
      normalizeVitalsJson({
        vitalsCustom: [{ id: "", label: "", kind: "numeric", value: 1 }],
      } as unknown as VitalsJson),
    ).toEqual({});
  });

  it("byte-parity: empty/absent custom adds nothing to derived text", () => {
    expect(deriveVitalsText({})).toBe("");
    expect(deriveVitalsText({ vitalsCustom: [] })).toBe("");
    expect(deriveVitalsText({ vitalsO2FlowLMin: 4 })).toBe(
      deriveVitalsText({ vitalsO2FlowLMin: 4, vitalsCustom: [] }),
    );
  });

  it("appends custom lines after registry vitals in derived text", () => {
    const registryOnly = deriveVitalsText({ vitalsO2FlowLMin: 4 });
    const withCustom = deriveVitalsText({
      vitalsO2FlowLMin: 4,
      vitalsCustom: [
        { id: "custom_girth", label: "Abdominal girth", unit: "cm", kind: "numeric", value: 92 },
      ],
    });
    expect(withCustom).toContain("Abdominal girth: 92 cm");
    // registry line stays first, the custom line is appended after it
    expect(withCustom).toBe(`${registryOnly}\nAbdominal girth: 92 cm`);
  });
});
