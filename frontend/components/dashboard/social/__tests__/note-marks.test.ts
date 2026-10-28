import { describe, expect, it } from "vitest";
import { editPlain, joinPlain, paintColor, plainText, readRuns, splitPlain, styleBefore, toggleStyle, toneValue, writeRuns } from "../note-marks";

describe("note marks", () => {
  it("leaves a plain line untouched", () => {
    expect(plainText("Evening slot")).toBe("Evening slot");
    expect(writeRuns(readRuns("Evening slot"))).toBe("Evening slot");
  });

  it("toggles bold on the selected words and back off", () => {
    const bold = toggleStyle("Fees today", 0, 4, "bold");
    expect(plainText(bold)).toBe("Fees today");
    expect(bold).toBe("«b»Fees«/» today");
    expect(toggleStyle(bold, 0, 4, "bold")).toBe("Fees today");
  });

  it("keeps bold as you type at the end of it", () => {
    const bold = toggleStyle("Fees", 0, 4, "bold");
    expect(editPlain(bold, "Fees today")).toBe("«b»Fees today«/»");
  });

  it("does not pull bold backward, and does keep a block color", () => {
    const bold = toggleStyle("Fees", 0, 4, "bold");
    expect(editPlain(bold, "The Fees")).toBe("The «b»Fees«/»");
    expect(editPlain("«t:red,h:yellow»Fees«/»", "The Fees")).toBe("«t:red,h:yellow»The Fees«/»");
  });

  it("uses the pending style at the caret", () => {
    expect(editPlain("Fees", "Fees!", { at: 4, style: { italic: true } })).toBe("Fees«i»!«/»");
    expect(styleBefore("«b»Fees«/»", 4).bold).toBe(true);
  });

  it("paints and clears a letter color and a highlight", () => {
    const colored = paintColor(paintColor("hook", 0, 4, "color", "red"), 0, 4, "highlight", "yellow");
    expect(colored).toBe("«t:red,h:yellow»hook«/»");
    expect(paintColor(colored, 0, 4, "color", null)).toBe("«h:yellow»hook«/»");
    expect(paintColor("hook", 0, 4, "color", "#123456")).toBe("«t:#123456»hook«/»");
    expect(plainText("«t:#123456»hook«/»")).toBe("hook");
    expect(toneValue("#ABCDEF")).toBe("#abcdef");
    expect(toneValue("nope")).toBeNull();
    expect(readRuns("«t:nope»hook«/»").map((run) => run.text).join("")).toBe("«t:nope»hook");
  });

  it("splits and joins a marked line", () => {
    const bold = toggleStyle("abcdef", 0, 6, "bold");
    const cut = splitPlain(bold, 3);
    expect(plainText(cut.left)).toBe("abc");
    expect(plainText(cut.right)).toBe("def");
    expect(plainText(joinPlain(cut.left, cut.right))).toBe("abcdef");
    expect(joinPlain(cut.left, cut.right)).toBe(bold);
  });

  it("keeps a typed « as a character", () => {
    expect(editPlain("", "say « this")).toBe("say «« this");
    expect(plainText("say «« this")).toBe("say « this");
  });
});
