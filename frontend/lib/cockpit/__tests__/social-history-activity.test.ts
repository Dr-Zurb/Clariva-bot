import {
  activityClinicalHints,
  activityHasContent,
  createActivityItem,
  levelPromptsForJobActivity,
  normalizeActivitySection,
  parseActivityText,
  serializeActivitySection,
} from "@/lib/cockpit/social-history-activity";
import { parseSocialHistoryAsStructured, serializeSocialHistory } from "@/lib/cockpit/social-history";

describe("social-history-activity", () => {
  it("normalizes legacy flat level + daysPerWeek", () => {
    expect(normalizeActivitySection({ level: "moderate", daysPerWeek: 3, items: [] })).toMatchObject({
      level: "moderate",
      daysPerWeek: 3,
      items: [],
    });
  });

  it("serializes legacy-compatible moderate activity", () => {
    expect(
      serializeActivitySection({ level: "moderate", daysPerWeek: 3, items: [] }),
    ).toBe("Activity: Moderate, 3 days/wk");
  });

  it("serializes v2 fields with job, types, barriers, and notes", () => {
    expect(
      serializeActivitySection({
        level: "moderate",
        daysPerWeek: 4,
        minutesPerSession: 45,
        types: ["walking", "yoga"],
        jobActivity: "sedentary",
        limitedByHealth: true,
        barriers: "knee OA",
        notes: "goal 150 min/wk",
        items: [],
      }),
    ).toBe(
      "Activity: Moderate, 4 days/wk, 45 min/session; Walking, Yoga; job: desk job; limited by health; barriers: knee OA; notes: goal 150 min/wk",
    );
  });

  it("serializes multi-item activity detail rows", () => {
    const walking = createActivityItem("walking", { daysPerWeek: 5, minutesPerSession: 30 });
    expect(
      serializeActivitySection({
        level: "vigorous",
        items: [walking],
      }),
    ).toBe("Activity: Vigorous — Walking (5 days/wk · 30 min/session)");
  });

  it("parses legacy flat tokens", () => {
    expect(parseActivityText("Moderate, 3 days/wk")).toMatchObject({
      level: "moderate",
      daysPerWeek: 3,
    });
    expect(parseActivityText("Sedentary")).toMatchObject({ level: "sedentary" });
  });

  it("parses v2 tail segments", () => {
    expect(
      parseActivityText(
        "Moderate, 4 days/wk, 45 min/session; Walking, Yoga; job: desk job; limited by health; barriers: knee OA; notes: goal 150 min/wk",
      ),
    ).toMatchObject({
      level: "moderate",
      daysPerWeek: 4,
      minutesPerSession: 45,
      types: ["walking", "yoga"],
      jobActivity: "sedentary",
      limitedByHealth: true,
      barriers: "knee OA",
      notes: "goal 150 min/wk",
    });
  });

  it("prompts job movement only for sedentary or light planned exercise", () => {
    expect(levelPromptsForJobActivity("sedentary")).toBe(true);
    expect(levelPromptsForJobActivity("light")).toBe(true);
    expect(levelPromptsForJobActivity("moderate")).toBe(false);
    expect(levelPromptsForJobActivity("vigorous")).toBe(false);
  });

  it("parses legacy and new work activity job tokens", () => {
    expect(parseActivityText("Moderate; job: desk job").jobActivity).toBe("sedentary");
    expect(parseActivityText("Moderate; job: desk / sedentary").jobActivity).toBe("sedentary");
    expect(parseActivityText("Moderate; job: mostly on feet").jobActivity).toBe("light");
    expect(parseActivityText("Moderate; job: physically active job").jobActivity).toBe("moderate");
  });

  it("round-trips activity through social history TEXT", () => {
    const structured = {
      activity: normalizeActivitySection({
        level: "moderate",
        daysPerWeek: 3,
        minutesPerSession: 40,
        types: ["walking"],
        jobActivity: "sedentary",
        items: [],
      }),
    };
    const text = serializeSocialHistory(structured);
    expect(text).toContain("Activity: Moderate, 3 days/wk, 40 min/session");
    expect(parseSocialHistoryAsStructured(text).activity).toMatchObject({
      level: "moderate",
      daysPerWeek: 3,
      minutesPerSession: 40,
      types: ["walking"],
      jobActivity: "sedentary",
    });
  });

  it("drops section-level typical and types when detail items exist", () => {
    expect(
      normalizeActivitySection({
        level: "moderate",
        daysPerWeek: 3,
        minutesPerSession: 40,
        types: ["walking"],
        items: [createActivityItem("walking", { daysPerWeek: 5, minutesPerSession: 30 })],
      }),
    ).toMatchObject({
      level: "moderate",
      items: [{ type: "walking", daysPerWeek: 5, minutesPerSession: 30 }],
    });
    expect(
      normalizeActivitySection({
        level: "moderate",
        daysPerWeek: 3,
        minutesPerSession: 40,
        types: ["walking"],
        items: [createActivityItem("walking", { daysPerWeek: 5, minutesPerSession: 30 })],
      })?.daysPerWeek,
    ).toBeUndefined();
  });

  it("preserves explicit no-limitation when other activity content exists", () => {
    expect(
      normalizeActivitySection({
        level: "light",
        daysPerWeek: 2,
        limitedByHealth: false,
        items: [],
      }),
    ).toMatchObject({ level: "light", limitedByHealth: false });
    expect(
      serializeActivitySection({
        level: "light",
        daysPerWeek: 2,
        limitedByHealth: false,
        items: [],
      }),
    ).toBe("Activity: Light, 2 days/wk");
    expect(activityHasContent({ limitedByHealth: false, items: [] })).toBe(true);
  });
});
