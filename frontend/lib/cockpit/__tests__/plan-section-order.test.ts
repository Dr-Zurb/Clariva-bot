import { describe, expect, it } from "vitest";
import {
  CORE_PLAN_SECTION_IDS,
  DEFAULT_PLAN_SECTION_ORDER,
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
  type PlanSectionId,
} from "@/lib/cockpit/plan-section-order";

describe("plan-section-order", () => {
  it("DEFAULT_PLAN_SECTION_ORDER matches the six core L1 ids", () => {
    expect(DEFAULT_PLAN_SECTION_ORDER).toEqual([...CORE_PLAN_SECTION_IDS]);
    expect(resolveAvailableSectionIds()).toEqual([...CORE_PLAN_SECTION_IDS]);
  });

  it("normalizeSectionOrder returns canonical order when stored is empty", () => {
    expect(normalizeSectionOrder([])).toEqual([...DEFAULT_PLAN_SECTION_ORDER]);
  });

  it("normalizeSectionOrder drops unknown and duplicate ids", () => {
    expect(
      normalizeSectionOrder(
        [
          "unknown_section" as PlanSectionId,
          "medications",
          "investigations",
          "medications",
        ],
        CORE_PLAN_SECTION_IDS,
      ),
    ).toEqual([
      "medications",
      "investigations",
      "follow_up",
      "advice",
      "referral",
      "clinical_notes",
    ]);
  });

  it("normalizeSectionOrder inserts newly-available ids at canonical slots", () => {
    expect(
      normalizeSectionOrder(
        ["investigations", "follow_up", "clinical_notes"],
        CORE_PLAN_SECTION_IDS,
      ),
    ).toEqual([
      "investigations",
      "medications",
      "follow_up",
      "advice",
      "referral",
      "clinical_notes",
    ]);
  });

  it("normalizeSectionOrder preserves stored relative order for known ids", () => {
    expect(
      normalizeSectionOrder(
        ["advice", "investigations", "medications"],
        CORE_PLAN_SECTION_IDS,
      ),
    ).toEqual([
      "advice",
      "investigations",
      "medications",
      "follow_up",
      "referral",
      "clinical_notes",
    ]);
  });

  it("moveSectionInOrder swaps adjacent slots and no-ops at bounds", () => {
    const order = [...DEFAULT_PLAN_SECTION_ORDER];
    expect(moveSectionInOrder(order, 1, "down")).toEqual([
      "investigations",
      "follow_up",
      "medications",
      "advice",
      "referral",
      "clinical_notes",
    ]);
    expect(moveSectionInOrder(order, 0, "up")).toEqual(order);
    expect(moveSectionInOrder(order, order.length - 1, "down")).toEqual(order);
  });

  it("reorderSectionInOrder inserts before/after target index", () => {
    const order = [...DEFAULT_PLAN_SECTION_ORDER];
    expect(reorderSectionInOrder(order, 4, 1, "before")).toEqual([
      "investigations",
      "referral",
      "medications",
      "follow_up",
      "advice",
      "clinical_notes",
    ]);
    expect(reorderSectionInOrder(order, 0, 2, "after")).toEqual([
      "medications",
      "follow_up",
      "investigations",
      "advice",
      "referral",
      "clinical_notes",
    ]);
  });

  describe("custom blocks (assessment-plan-custom-sections)", () => {
    const blockA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const blockB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    it("toCustomBlockSectionId / isCustomBlockSectionId round-trip", () => {
      const id = toCustomBlockSectionId(blockA);
      expect(id).toBe(`custom_block:${blockA}`);
      expect(isCustomBlockSectionId(id)).toBe(true);
      expect(isCustomBlockSectionId("medications")).toBe(false);
    });

    it("resolveAvailableSectionIds appends custom block ids after static ids", () => {
      expect(resolveAvailableSectionIds([blockA, blockB])).toEqual([
        ...CORE_PLAN_SECTION_IDS,
        toCustomBlockSectionId(blockA),
        toCustomBlockSectionId(blockB),
      ]);
    });

    it("insertCustomBlockIntoOrder appends after clinical_notes", () => {
      const order = [...DEFAULT_PLAN_SECTION_ORDER];
      expect(insertCustomBlockIntoOrder(order, blockA)).toEqual([
        ...DEFAULT_PLAN_SECTION_ORDER,
        toCustomBlockSectionId(blockA),
      ]);
    });

    it("removeCustomBlockFromOrder drops the block section id", () => {
      const withBlock = insertCustomBlockIntoOrder(
        [...DEFAULT_PLAN_SECTION_ORDER],
        blockA,
      );
      expect(removeCustomBlockFromOrder(withBlock, blockA)).toEqual([
        ...DEFAULT_PLAN_SECTION_ORDER,
      ]);
    });

    it("syncCustomBlockIdsInOrder adds new and drops stale blocks", () => {
      const stale = "cccccccc-cccc-cccc-cccc-cccccccccccc";
      const start: PlanSectionId[] = [
        ...DEFAULT_PLAN_SECTION_ORDER,
        toCustomBlockSectionId(stale),
      ];
      const synced = syncCustomBlockIdsInOrder(start, [blockA, blockB]);
      expect(synced).not.toContain(toCustomBlockSectionId(stale));
      expect(synced).toContain(toCustomBlockSectionId(blockA));
      expect(synced).toContain(toCustomBlockSectionId(blockB));
    });

    it("resolveInitialSectionOrder keeps stored order then folds in custom blocks", () => {
      const resolved = resolveInitialSectionOrder(
        ["advice", "investigations"],
        [blockA],
      );
      expect(resolved).toEqual([
        "advice",
        "investigations",
        "medications",
        "follow_up",
        "referral",
        "clinical_notes",
        toCustomBlockSectionId(blockA),
      ]);
    });
  });
});
