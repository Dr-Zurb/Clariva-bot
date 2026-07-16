import { describe, expect, it } from "vitest";
import {
  CORE_ASSESSMENT_SECTION_IDS,
  DEFAULT_ASSESSMENT_SECTION_ORDER,
  insertCustomBlockIntoOrder,
  isCustomBlockSectionId,
  moveSectionInOrder,
  normalizeSectionOrder,
  removeCustomBlockFromOrder,
  reorderSectionInOrder,
  resolveAvailableSectionIds,
  resolveInitialSectionOrder,
  syncCustomBlockIdsInOrder,
  toCustomBlockSectionId,
  type AssessmentSectionId,
} from "@/lib/cockpit/assessment-section-order";

describe("assessment-section-order", () => {
  it("DEFAULT_ASSESSMENT_SECTION_ORDER matches the three core L1 ids", () => {
    expect(DEFAULT_ASSESSMENT_SECTION_ORDER).toEqual([...CORE_ASSESSMENT_SECTION_IDS]);
    expect(resolveAvailableSectionIds()).toEqual([...CORE_ASSESSMENT_SECTION_IDS]);
  });

  it("normalizeSectionOrder returns canonical order when stored is empty", () => {
    expect(normalizeSectionOrder([])).toEqual([...DEFAULT_ASSESSMENT_SECTION_ORDER]);
  });

  it("normalizeSectionOrder drops unknown and duplicate ids", () => {
    expect(
      normalizeSectionOrder(
        [
          "unknown_section" as AssessmentSectionId,
          "assessment_notes",
          "diagnoses",
          "assessment_notes",
        ],
        CORE_ASSESSMENT_SECTION_IDS,
      ),
    ).toEqual(["assessment_notes", "diagnoses", "known_conditions"]);
  });

  it("normalizeSectionOrder inserts newly-available ids at canonical slots", () => {
    expect(
      normalizeSectionOrder(["diagnoses", "assessment_notes"], CORE_ASSESSMENT_SECTION_IDS),
    ).toEqual(["diagnoses", "known_conditions", "assessment_notes"]);
  });

  it("normalizeSectionOrder preserves stored relative order for known ids", () => {
    expect(
      normalizeSectionOrder(
        ["assessment_notes", "diagnoses"],
        CORE_ASSESSMENT_SECTION_IDS,
      ),
    ).toEqual(["assessment_notes", "diagnoses", "known_conditions"]);
  });

  it("moveSectionInOrder swaps adjacent slots and no-ops at bounds", () => {
    const order = [...DEFAULT_ASSESSMENT_SECTION_ORDER];
    expect(moveSectionInOrder(order, 0, "down")).toEqual([
      "known_conditions",
      "diagnoses",
      "assessment_notes",
    ]);
    expect(moveSectionInOrder(order, 0, "up")).toEqual(order);
    expect(moveSectionInOrder(order, 2, "down")).toEqual(order);
  });

  it("reorderSectionInOrder moves with before/after intent", () => {
    const order = [...DEFAULT_ASSESSMENT_SECTION_ORDER];
    expect(reorderSectionInOrder(order, 0, 2, "after")).toEqual([
      "known_conditions",
      "assessment_notes",
      "diagnoses",
    ]);
    expect(reorderSectionInOrder(order, 2, 0, "before")).toEqual([
      "assessment_notes",
      "diagnoses",
      "known_conditions",
    ]);
  });

  describe("custom blocks (assessment-plan-custom-sections)", () => {
    const blockA = "11111111-1111-1111-1111-111111111111";
    const blockB = "22222222-2222-2222-2222-222222222222";

    it("toCustomBlockSectionId / isCustomBlockSectionId round-trip", () => {
      const id = toCustomBlockSectionId(blockA);
      expect(id).toBe(`custom_block:${blockA}`);
      expect(isCustomBlockSectionId(id)).toBe(true);
      expect(isCustomBlockSectionId("diagnoses")).toBe(false);
    });

    it("resolveAvailableSectionIds appends custom block ids after static ids", () => {
      expect(resolveAvailableSectionIds([blockA, blockB])).toEqual([
        ...CORE_ASSESSMENT_SECTION_IDS,
        toCustomBlockSectionId(blockA),
        toCustomBlockSectionId(blockB),
      ]);
    });

    it("insertCustomBlockIntoOrder appends after assessment_notes", () => {
      const order = [...DEFAULT_ASSESSMENT_SECTION_ORDER];
      expect(insertCustomBlockIntoOrder(order, blockA)).toEqual([
        "diagnoses",
        "known_conditions",
        "assessment_notes",
        toCustomBlockSectionId(blockA),
      ]);
    });

    it("insertCustomBlockIntoOrder is idempotent for an existing block", () => {
      const withBlock = insertCustomBlockIntoOrder(
        [...DEFAULT_ASSESSMENT_SECTION_ORDER],
        blockA,
      );
      expect(insertCustomBlockIntoOrder(withBlock, blockA)).toEqual(withBlock);
    });

    it("removeCustomBlockFromOrder drops the block section id", () => {
      const withBlock = insertCustomBlockIntoOrder(
        [...DEFAULT_ASSESSMENT_SECTION_ORDER],
        blockA,
      );
      expect(removeCustomBlockFromOrder(withBlock, blockA)).toEqual([
        ...DEFAULT_ASSESSMENT_SECTION_ORDER,
      ]);
    });

    it("syncCustomBlockIdsInOrder adds new and drops stale blocks, preserving order", () => {
      const stale = "99999999-9999-9999-9999-999999999999";
      const start: AssessmentSectionId[] = [
        "diagnoses",
        "known_conditions",
        "assessment_notes",
        toCustomBlockSectionId(stale),
      ];
      const synced = syncCustomBlockIdsInOrder(start, [blockA, blockB]);
      expect(synced).not.toContain(toCustomBlockSectionId(stale));
      expect(synced).toContain(toCustomBlockSectionId(blockA));
      expect(synced).toContain(toCustomBlockSectionId(blockB));
    });

    it("resolveInitialSectionOrder keeps stored order then folds in custom blocks after assessment_notes", () => {
      const resolved = resolveInitialSectionOrder(
        ["assessment_notes", "diagnoses"],
        [blockA],
      );
      expect(resolved).toEqual([
        "assessment_notes",
        toCustomBlockSectionId(blockA),
        "diagnoses",
        "known_conditions",
      ]);
    });
  });
});
