import { describe, expect, it } from "vitest";
import {
  hiddenOverridesToPersist,
  isSectionHidden,
  resolveVisibleSections,
  serializeHiddenIds,
} from "@/lib/cockpit/subjective-section-visibility";
import {
  resolveAvailableSectionIds,
  toCustomBlockSectionId,
  type SubjectiveSectionId,
} from "@/lib/cockpit/subjective-section-order";

describe("subjective-section-visibility (subj-33 / subj-38)", () => {
  const blockUuid = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
  const linkedMountable = resolveAvailableSectionIds(true);
  const linkedMountableWithBlock = resolveAvailableSectionIds(true, [blockUuid]);
  const fallbackMountable = resolveAvailableSectionIds(false);
  const blockId = toCustomBlockSectionId(blockUuid);

  const linkedOrder: SubjectiveSectionId[] = [
    "chief_complaints",
    "patient_background",
    "allergies",
    "family_history",
    "social_history",
    "free_text_notes",
    blockId,
  ];

  describe("resolveVisibleSections", () => {
    it("removes a mountable hidden id from the order", () => {
      const hidden = ["family_history"];
      expect(resolveVisibleSections(linkedOrder, hidden, linkedMountable)).toEqual([
        "chief_complaints",
        "patient_background",
        "allergies",
        "social_history",
        "free_text_notes",
        blockId,
      ]);
    });

    it("keeps a non-mountable hidden id in the order (passes through untouched)", () => {
      const hidden = ["allergies"];
      expect(resolveVisibleSections(linkedOrder, hidden, fallbackMountable)).toEqual(linkedOrder);
    });

    it("removes a hidden + mountable custom_block id from the order (P11-D2)", () => {
      const hidden = [blockId, "family_history"];
      expect(resolveVisibleSections(linkedOrder, hidden, linkedMountableWithBlock)).toEqual([
        "chief_complaints",
        "patient_background",
        "allergies",
        "social_history",
        "free_text_notes",
      ]);
    });

    it("keeps a hidden custom_block id when it is not currently mountable (tolerant)", () => {
      const hidden = [blockId];
      expect(resolveVisibleSections(linkedOrder, hidden, linkedMountable)).toEqual(linkedOrder);
    });

    it("preserves order of remaining sections", () => {
      const hidden = ["patient_background", "social_history"];
      expect(resolveVisibleSections(linkedOrder, hidden, linkedMountable)).toEqual([
        "chief_complaints",
        "allergies",
        "family_history",
        "free_text_notes",
        blockId,
      ]);
    });

    it("returns the full order when nothing is hidden", () => {
      expect(resolveVisibleSections(linkedOrder, [], linkedMountable)).toEqual(linkedOrder);
    });
  });

  describe("isSectionHidden", () => {
    it("returns true for a mountable hidden static id", () => {
      expect(isSectionHidden("family_history", ["family_history"], linkedMountable)).toBe(true);
    });

    it("returns false when the id is not in the hidden set", () => {
      expect(isSectionHidden("family_history", [], linkedMountable)).toBe(false);
    });

    it("returns false for a hidden id that is not currently mountable", () => {
      expect(isSectionHidden("allergies", ["allergies"], fallbackMountable)).toBe(false);
    });

    it("returns true for a hidden mountable custom_block id (P11-D2)", () => {
      expect(isSectionHidden(blockId, [blockId], linkedMountableWithBlock)).toBe(true);
    });
  });

  describe("hiddenOverridesToPersist", () => {
    it("keeps static mountable hidden ids", () => {
      expect(
        hiddenOverridesToPersist(["family_history", "social_history"], linkedMountable),
      ).toEqual(["family_history", "social_history"]);
    });

    it("keeps custom_block ids (P11-D2)", () => {
      expect(
        hiddenOverridesToPersist(
          ["chief_complaints", blockId, "free_text_notes"],
          linkedMountableWithBlock,
        ),
      ).toEqual(["chief_complaints", blockId, "free_text_notes"]);
    });

    it("dedupes while preserving first-occurrence order", () => {
      expect(
        hiddenOverridesToPersist(
          ["social_history", "family_history", "social_history"],
          linkedMountable,
        ),
      ).toEqual(["social_history", "family_history"]);
    });

    it("drops ids unknown to the subjective-section registry", () => {
      expect(
        hiddenOverridesToPersist(
          ["chief_complaints", "legacy_removed_section", "allergies"],
          linkedMountable,
        ),
      ).toEqual(["chief_complaints", "allergies"]);
    });

    it("retains hidden ids across chart modes when not currently mountable", () => {
      const hidden = ["allergies", "family_history"];
      expect(hiddenOverridesToPersist(hidden, fallbackMountable)).toEqual([
        "allergies",
        "family_history",
      ]);
    });
  });

  describe("round-trip", () => {
    it("visibility is stable across resolve → persist → re-resolve", () => {
      const hidden = ["patient_background", "family_history", "allergies"];
      const visible = resolveVisibleSections(linkedOrder, hidden, linkedMountable);
      const persisted = hiddenOverridesToPersist(hidden, linkedMountable);
      const reVisible = resolveVisibleSections(linkedOrder, persisted, linkedMountable);
      expect(reVisible).toEqual(visible);
    });

    it("custom_block visibility is stable across resolve → persist → re-resolve (P11-D2)", () => {
      const hidden = [blockId];
      const visible = resolveVisibleSections(linkedOrder, hidden, linkedMountableWithBlock);
      const persisted = hiddenOverridesToPersist(hidden, linkedMountableWithBlock);
      const reVisible = resolveVisibleSections(linkedOrder, persisted, linkedMountableWithBlock);
      expect(reVisible).toEqual(visible);
      expect(visible).not.toContain(blockId);
      expect(persisted).toContain(blockId);
    });

    it("cross-mode retention survives mode switch re-resolve", () => {
      const hidden = ["allergies"];
      const persisted = hiddenOverridesToPersist(hidden, linkedMountable);

      const visibleLinked = resolveVisibleSections(linkedOrder, persisted, linkedMountable);
      expect(visibleLinked).not.toContain("allergies");

      const visibleFallback = resolveVisibleSections(linkedOrder, persisted, fallbackMountable);
      expect(visibleFallback).toEqual(linkedOrder);
    });
  });

  describe("serializeHiddenIds", () => {
    it("produces stable keys regardless of insertion order", () => {
      const a = serializeHiddenIds(["free_text_notes", "chief_complaints"]);
      const b = serializeHiddenIds(["chief_complaints", "free_text_notes"]);
      expect(a).toBe(b);
      expect(a).toBe('["chief_complaints","free_text_notes"]');
    });
  });
});
