import { describe, it, expect } from "vitest";
import { collapseMuteSystemMessages } from "../collapse-mute-system-messages";
import type { ConsultationMessage } from "../types";

function mute(id: string, muted: boolean): ConsultationMessage {
  return {
    id,
    sessionId: "s1",
    senderId: "sys",
    senderRole: "system",
    body: muted ? "muted" : "unmuted",
    createdAt: `2026-04-28T10:00:0${id}.000Z`,
    kind: "system",
    systemEvent: "mute_changed",
    metadata: { actor_id: "u1", muted },
  };
}

function text(id: string, body: string): ConsultationMessage {
  return {
    id,
    sessionId: "s1",
    senderId: "u1",
    senderRole: "doctor",
    body,
    createdAt: `2026-04-28T10:01:0${id}.000Z`,
    kind: "text",
  };
}

describe("collapseMuteSystemMessages", () => {
  it("leaves a single mute event alone", () => {
    const rows = collapseMuteSystemMessages([mute("1", true)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).not.toHaveProperty("mute_collapse_count");
  });

  it("collapses consecutive mute toggles into one row with count", () => {
    const rows = collapseMuteSystemMessages([
      mute("1", true),
      mute("2", false),
      mute("3", true),
      mute("4", false),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("4");
    expect(rows[0]?.metadata).toMatchObject({ mute_collapse_count: 4 });
  });

  it("does not collapse across a real message", () => {
    const rows = collapseMuteSystemMessages([
      mute("1", true),
      mute("2", false),
      text("t", "hi"),
      mute("3", true),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.metadata).toMatchObject({ mute_collapse_count: 2 });
    expect(rows[1]?.body).toBe("hi");
    expect(rows[2]?.metadata).not.toHaveProperty("mute_collapse_count");
  });
});
