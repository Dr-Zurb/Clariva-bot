import { describe, expect, it } from "vitest";
import {
  aggregateReactions,
  isReactionEmoji,
  type ConsultationMessageReaction,
} from "../aggregate-reactions";

function row(
  overrides: Partial<ConsultationMessageReaction> & Pick<ConsultationMessageReaction, "emoji">,
): ConsultationMessageReaction {
  return {
    id: "r-1",
    message_id: "msg-1",
    user_id: "user-a",
    created_at: "2026-04-28T10:00:00.000Z",
    ...overrides,
  };
}

describe("aggregateReactions", () => {
  it("groups user ids by emoji", () => {
    const result = aggregateReactions([
      row({ id: "1", emoji: "👍", user_id: "u1" }),
      row({ id: "2", emoji: "👍", user_id: "u2" }),
      row({ id: "3", emoji: "❤️", user_id: "u1" }),
    ]);
    expect(result).toEqual({
      "👍": ["u1", "u2"],
      "❤️": ["u1"],
    });
  });

  it("returns an empty object for no rows", () => {
    expect(aggregateReactions([])).toEqual({});
  });
});

describe("isReactionEmoji", () => {
  it("accepts whitelisted emojis only", () => {
    expect(isReactionEmoji("👍")).toBe(true);
    expect(isReactionEmoji("🎉")).toBe(false);
  });
});
