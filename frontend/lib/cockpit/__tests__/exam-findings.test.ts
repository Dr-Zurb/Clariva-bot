import { describe, it, expect } from "vitest";
import {
  parseExam,
  serializeExam,
  EXAM_DELIMITER,
} from "@/lib/cockpit/exam-findings";

describe("exam-findings", () => {
  describe("parseExam", () => {
    it("returns empty sections for empty input", () => {
      expect(parseExam("")).toEqual({ general: "", systemic: "" });
    });

    it("treats legacy data (no delimiter) as general", () => {
      expect(parseExam("Looks alert and oriented.")).toEqual({
        general: "Looks alert and oriented.",
        systemic: "",
      });
    });

    it("splits on the delimiter", () => {
      const combined = `Pale, afebrile.${EXAM_DELIMITER}Chest: clear. Abdomen: soft, non-tender.`;
      expect(parseExam(combined)).toEqual({
        general: "Pale, afebrile.",
        systemic: "Chest: clear. Abdomen: soft, non-tender.",
      });
    });

    it("handles delimiter at start (empty general)", () => {
      const combined = `${EXAM_DELIMITER}Chest clear.`;
      expect(parseExam(combined)).toEqual({
        general: "",
        systemic: "Chest clear.",
      });
    });

    it("handles delimiter at end (empty systemic)", () => {
      const combined = `Pale.${EXAM_DELIMITER}`;
      expect(parseExam(combined)).toEqual({
        general: "Pale.",
        systemic: "",
      });
    });
  });

  describe("serializeExam", () => {
    it("returns empty string when both sections empty", () => {
      expect(serializeExam("", "")).toBe("");
    });

    it("returns general only when systemic empty", () => {
      expect(serializeExam("Looks well.", "")).toBe("Looks well.");
    });

    it("joins with the delimiter when both present", () => {
      expect(serializeExam("Pale.", "Chest clear.")).toBe(
        `Pale.${EXAM_DELIMITER}Chest clear.`,
      );
    });

    it("escapes literal delimiter in general to prevent collision", () => {
      const general = `Note from intake:${EXAM_DELIMITER}review pending.`;
      const out = serializeExam(general, "");
      expect(out).not.toContain(EXAM_DELIMITER);
      expect(out).toContain("\u200d");
    });
  });

  describe("round-trip", () => {
    it("parse(serialize(x)) === x for normal inputs", () => {
      const cases = [
        { general: "Alert", systemic: "Chest clear" },
        { general: "", systemic: "Chest clear" },
        { general: "Alert", systemic: "" },
        { general: "Multi\nline\ngeneral", systemic: "Multi\nline\nsystemic" },
      ];

      for (const c of cases) {
        const combined = serializeExam(c.general, c.systemic);
        expect(parseExam(combined)).toEqual(c);
      }
    });
  });
});
