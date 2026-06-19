import { describe, expect, it } from "vitest";
import {
  EXAM_CORE_SYSTEMS,
  EXAM_CORE_SYSTEM_ORDER,
  listExamSystems,
  resolveExamSystem,
} from "@/lib/cockpit/exam-schema";

const EXPECTED_CORE_IDS = ["general", "cvs", "resp", "abd", "cns"] as const;

describe("exam-schema registry (obj-02)", () => {
  it("lists 5 core systems in canonical order", () => {
    expect(listExamSystems()).toHaveLength(5);
    expect(listExamSystems().map((s) => s.systemId)).toEqual([...EXPECTED_CORE_IDS]);
    expect(EXAM_CORE_SYSTEM_ORDER).toEqual([...EXPECTED_CORE_IDS]);
    expect(EXAM_CORE_SYSTEMS.map((s) => s.systemId)).toEqual([...EXPECTED_CORE_IDS]);
  });

  it("gives each core system a non-empty normalLine and at least one abnormal chip", () => {
    for (const system of EXAM_CORE_SYSTEMS) {
      expect(system.label.trim().length).toBeGreaterThan(0);
      expect(system.normalLine.trim().length).toBeGreaterThan(0);
      expect(system.abnormalChips.length).toBeGreaterThanOrEqual(1);
      for (const chip of system.abnormalChips) {
        expect(chip.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("seeds core content from exam-catalog §A1", () => {
    expect(resolveExamSystem("general")).toMatchObject({
      label: "General",
      normalLine: "Alert, oriented, no distress",
      abnormalChips: ["Pallor", "Icterus", "Cyanosis", "Edema", "Lymphadenopathy"],
    });
    expect(resolveExamSystem("cvs")).toMatchObject({
      label: "Cardiovascular",
      normalLine: "HS S1+S2 normal, no murmur",
      abnormalChips: ["Murmur", "Gallop", "JVP raised", "Peripheral edema"],
    });
    expect(resolveExamSystem("resp")).toMatchObject({
      label: "Respiratory",
      normalLine: "Chest clear, NVBS bilaterally",
      abnormalChips: ["Wheeze", "Crackles", "Reduced AE", "Dullness"],
    });
    expect(resolveExamSystem("abd")).toMatchObject({
      label: "Abdomen",
      normalLine: "Soft, non-tender, no organomegaly",
      abnormalChips: ["Tenderness", "Guarding", "Distension", "Hepatosplenomegaly"],
    });
    expect(resolveExamSystem("cns")).toMatchObject({
      label: "CNS / Neuro",
      normalLine: "Conscious, oriented, no focal deficit",
      abnormalChips: ["GCS ↓", "Cranial nerve deficit", "Power/sensory loss"],
    });
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
    expect(msk.abnormalChips.length).toBeGreaterThanOrEqual(1);

    const ent = resolveExamSystem("ent");
    expect(ent.label).toBe("Ent");
    expect(ent.abnormalChips).toContain("Other");

    const spaced = resolveExamSystem("  breast_exam  ");
    expect(spaced.systemId).toBe("breast_exam");
    expect(spaced.label).toBe("Breast Exam");
  });
});
