import { describe, expect, it } from "vitest";
import {
  EXAM_CORE_SYSTEMS,
  EXAM_CORE_SYSTEM_ORDER,
  listExamSystemChips,
  listExamSystems,
  resolveExamSystem,
} from "@/lib/cockpit/exam-schema";

const EXPECTED_CORE_IDS = ["general", "cvs", "resp", "abd", "cns"] as const;

describe("exam-schema registry (obj-02 · obj-30)", () => {
  it("lists 5 core systems in canonical order", () => {
    expect(listExamSystems()).toHaveLength(5);
    expect(listExamSystems().map((s) => s.systemId)).toEqual([...EXPECTED_CORE_IDS]);
    expect(EXAM_CORE_SYSTEM_ORDER).toEqual([...EXPECTED_CORE_IDS]);
    expect(EXAM_CORE_SYSTEMS.map((s) => s.systemId)).toEqual([...EXPECTED_CORE_IDS]);
  });

  it("gives each core system a non-empty normalLine and labelled subsections with chips", () => {
    for (const system of EXAM_CORE_SYSTEMS) {
      expect(system.label.trim().length).toBeGreaterThan(0);
      expect(system.normalLine.trim().length).toBeGreaterThan(0);
      expect(system.subsections.length).toBeGreaterThanOrEqual(1);
      for (const subsection of system.subsections) {
        expect(subsection.id.trim().length).toBeGreaterThan(0);
        expect(subsection.label.trim().length).toBeGreaterThan(0);
        expect(subsection.chips.length).toBeGreaterThanOrEqual(1);
        for (const chip of subsection.chips) {
          expect(chip.trim().length).toBeGreaterThan(0);
        }
      }
      // Chips must stay globally-unique within a system so the derived flat
      // findings[] text is unambiguous (obj-30 / OBJ-D2).
      const chips = listExamSystemChips(system);
      expect(new Set(chips).size).toBe(chips.length);
    }
  });

  it("seeds core content from exam-catalog §A1", () => {
    expect(resolveExamSystem("general")).toMatchObject({
      label: "General",
      normalLine: "Well appearing, not in distress",
    });
    expect(listExamSystemChips(resolveExamSystem("general"))).toEqual(
      expect.arrayContaining([
        "Distress",
        "Pallor",
        "Icterus",
        "Cyanosis",
        "Plethora",
        "Dehydration",
        "Edema",
        "Clubbing",
        "Lymphadenopathy",
        "Nutrition / habitus",
      ]),
    );
    expect(resolveExamSystem("cvs")).toMatchObject({
      label: "Cardiovascular",
      normalLine: "S1 S2 normal, no murmur",
    });
    expect(listExamSystemChips(resolveExamSystem("cvs"))).toEqual(
      expect.arrayContaining([
        "Visible pulsations",
        "Parasternal heave",
        "Loud S1",
        "Murmur",
        "Gallop",
        "JVP raised",
        "Radio-radial delay",
        "Weak or absent pulses",
      ]),
    );
    expect(resolveExamSystem("resp")).toMatchObject({
      label: "Respiratory",
      normalLine: "Bilateral air entry normal, no added sounds",
    });
    expect(listExamSystemChips(resolveExamSystem("resp"))).toEqual(
      expect.arrayContaining([
        "Wheeze",
        "Crackles",
        "Reduced AE",
        "Accessory muscle use",
        "Dullness",
        "Hyperresonance",
      ]),
    );
    expect(resolveExamSystem("abd")).toMatchObject({
      label: "Abdomen",
      normalLine: "Soft, non-tender, no organomegaly",
    });
    expect(listExamSystemChips(resolveExamSystem("abd"))).toEqual(
      expect.arrayContaining(["Tenderness", "Guarding", "Distension", "Hepatosplenomegaly"]),
    );
    expect(resolveExamSystem("cns")).toMatchObject({
      label: "CNS / Neuro",
      normalLine: "Alert, oriented, no focal deficit",
    });
    expect(listExamSystemChips(resolveExamSystem("cns"))).toEqual(
      expect.arrayContaining(["Confusion", "Facial droop", "Hypertonia", "Neck stiffness"]),
    );
  });

  it("resolveExamSystem returns the same object reference for core ids", () => {
    for (const id of EXPECTED_CORE_IDS) {
      expect(resolveExamSystem(id)).toBe(EXAM_CORE_SYSTEMS.find((s) => s.systemId === id));
    }
  });

  it("returns a safe OLDCARTS-style fallback for unknown systemIds without throwing", () => {
    expect(() => resolveExamSystem("msk")).not.toThrow();
    expect(() => resolveExamSystem("")).not.toThrow();

    const msk = resolveExamSystem("msk");
    expect(msk.systemId).toBe("msk");
    expect(msk.label).toBe("Msk");
    expect(msk.normalLine).toBe("Within normal limits");
    expect(listExamSystemChips(msk).length).toBeGreaterThanOrEqual(1);

    const ent = resolveExamSystem("ent");
    expect(ent.label).toBe("Ent");
    expect(listExamSystemChips(ent)).toContain("Other");

    const spaced = resolveExamSystem("  breast_exam  ");
    expect(spaced.systemId).toBe("breast_exam");
    expect(spaced.label).toBe("Breast Exam");
  });
});
