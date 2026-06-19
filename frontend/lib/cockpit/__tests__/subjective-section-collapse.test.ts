import { describe, expect, it } from "vitest";
import {
  collapseOverridesToPersist,
  resolveSectionOpenState,
  serializeCollapseOverrides,
  type SubjectiveSectionCollapseMap,
} from "@/lib/cockpit/subjective-section-collapse";
import {
  toCustomBlockSectionId,
  type SubjectiveSectionId,
} from "@/lib/cockpit/subjective-section-order";

describe("subjective-section-collapse (subj-29)", () => {
  const defaultsById: Record<SubjectiveSectionId, boolean> = {
    chief_complaints: true,
    patient_background: true,
    allergies: true,
    family_history: false,
    social_history: false,
    free_text_notes: false,
  };

  describe("resolveSectionOpenState", () => {
    it("returns the default when a stored key is absent", () => {
      expect(resolveSectionOpenState({}, defaultsById)).toEqual(defaultsById);
    });

    it("returns the stored value when a key is present (default true → stored false)", () => {
      const stored: SubjectiveSectionCollapseMap = { family_history: true };
      expect(resolveSectionOpenState(stored, defaultsById).family_history).toBe(true);
    });

    it("returns the stored value when a key is present (default false → stored true)", () => {
      const stored: SubjectiveSectionCollapseMap = { free_text_notes: true };
      expect(resolveSectionOpenState(stored, defaultsById).free_text_notes).toBe(true);
    });

    it("honours an explicit stored false over a default true", () => {
      const stored: SubjectiveSectionCollapseMap = { chief_complaints: false };
      expect(resolveSectionOpenState(stored, defaultsById).chief_complaints).toBe(false);
    });

    it("omits ids that are not mountable in defaultsById", () => {
      const stored: SubjectiveSectionCollapseMap = {
        chief_complaints: false,
        past_surgical: true,
      };
      const resolved = resolveSectionOpenState(stored, defaultsById);
      expect(resolved).not.toHaveProperty("past_surgical");
      expect(Object.keys(resolved).sort()).toEqual(Object.keys(defaultsById).sort());
    });
  });

  describe("collapseOverridesToPersist", () => {
    it("omits keys equal to their default", () => {
      const current: SubjectiveSectionCollapseMap = {
        chief_complaints: true,
        family_history: false,
        free_text_notes: false,
      };
      expect(collapseOverridesToPersist(current, defaultsById)).toEqual({});
    });

    it("keeps genuine overrides only", () => {
      const current: SubjectiveSectionCollapseMap = {
        chief_complaints: false,
        family_history: true,
        free_text_notes: true,
        social_history: false,
      };
      expect(collapseOverridesToPersist(current, defaultsById)).toEqual({
        chief_complaints: false,
        family_history: true,
        free_text_notes: true,
      });
    });

    it("drops custom_block ids even when toggled away from default", () => {
      const blockId = toCustomBlockSectionId("aaaaaaaa-aaaa-4aaa-8aaa-000000000001");
      const withBlockDefaults = {
        ...defaultsById,
        [blockId]: false,
      } as Record<SubjectiveSectionId, boolean>;
      const current: SubjectiveSectionCollapseMap = {
        chief_complaints: false,
        [blockId]: true,
      };
      expect(collapseOverridesToPersist(current, withBlockDefaults)).toEqual({
        chief_complaints: false,
      });
    });
  });

  describe("round-trip", () => {
    it("resolveSectionOpenState(collapseOverridesToPersist(x, d), d) reproduces x for mountable ids", () => {
      const current: SubjectiveSectionCollapseMap = {
        chief_complaints: false,
        patient_background: true,
        allergies: false,
        family_history: true,
        social_history: false,
        free_text_notes: true,
      };

      const persisted = collapseOverridesToPersist(current, defaultsById);
      const resolved = resolveSectionOpenState(persisted, defaultsById);
      expect(resolved).toEqual(current);
    });

    it("round-trips when custom blocks are present but never persisted", () => {
      const blockId = toCustomBlockSectionId("bbbbbbbb-bbbb-4bbb-8bbb-000000000002");
      const withBlockDefaults = {
        ...defaultsById,
        [blockId]: true,
      } as Record<SubjectiveSectionId, boolean>;
      const current: SubjectiveSectionCollapseMap = {
        chief_complaints: false,
        [blockId]: false,
      };

      const persisted = collapseOverridesToPersist(current, withBlockDefaults);
      expect(persisted).toEqual({ chief_complaints: false });
      expect(persisted).not.toHaveProperty(blockId);

      const resolved = resolveSectionOpenState(persisted, withBlockDefaults);
      expect(resolved.chief_complaints).toBe(false);
      expect(resolved[blockId]).toBe(true);
    });
  });

  describe("serializeCollapseOverrides", () => {
    it("produces stable keys regardless of insertion order", () => {
      const a = serializeCollapseOverrides({
        free_text_notes: true,
        chief_complaints: false,
      });
      const b = serializeCollapseOverrides({
        chief_complaints: false,
        free_text_notes: true,
      });
      expect(a).toBe(b);
      expect(a).toBe('{"chief_complaints":false,"free_text_notes":true}');
    });
  });
});
