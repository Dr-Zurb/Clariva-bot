import {
  normalizeSleepSection,
  parseSleepText,
  parseStressText,
  serializeSleepSection,
  serializeStressSection,
  sleepHasContent,
  wellbeingClinicalHints,
} from "@/lib/cockpit/social-history-wellbeing";
import { normalizeSocialHistoryStructured, serializeSocialHistory } from "@/lib/cockpit/social-history";

describe("social-history-wellbeing", () => {
  it("serializes sleep with quality, flags, and notes", () => {
    expect(
      serializeSleepSection({
        hoursPerNight: 6,
        quality: "poor",
        snoring: true,
        notes: "wakes at 3 am",
      }),
    ).toBe("Sleep: 6 h, poor, snoring · wakes at 3 am");
  });

  it("serializes stress with social support, sources, and notes", () => {
    expect(
      serializeStressSection({
        level: "high",
        support: "limited",
        sources: ["work", "family"],
        notes: "exam season",
      }),
    ).toBe("Stress: High, limited support · Work, Family · exam season");
  });

  it("round-trips structured sleep and stress", () => {
    const structured = normalizeSocialHistoryStructured({
      sleep: { quality: "fair", shiftWork: true, notes: "night shifts" },
      stress: { level: "moderate", support: "good", sources: ["health"] },
    });
    const text = serializeSocialHistory(structured);
    expect(text).toContain("Sleep: fair, shift work · night shifts");
    expect(text).toContain("Stress: Moderate, good support · Health");
  });

  it("allows quality-only sleep content", () => {
    expect(sleepHasContent({ quality: "poor" })).toBe(true);
    expect(normalizeSleepSection({ quality: "poor" })).toEqual({ quality: "poor" });
  });

  it("emits clinical hints for poor sleep and high unsupported stress", () => {
    expect(
      wellbeingClinicalHints({
        sleep: { hoursPerNight: 4, quality: "poor" },
        stress: { level: "high", support: "none" },
      }),
    ).toEqual([
      "Poor or short sleep — consider sleep hygiene, snoring/OSA, mood, and caffeine.",
      "High stress with limited support — consider psychosocial support or follow-up.",
    ]);
  });

  it("parses sleep and stress text segments", () => {
    expect(parseSleepText("6 h, poor, snoring")).toMatchObject({
      hoursPerNight: 6,
      quality: "poor",
      snoring: true,
    });
    expect(parseStressText("High, limited support")).toMatchObject({
      level: "high",
      support: "limited",
    });
  });
});
