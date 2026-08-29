import { describe, expect, it } from "vitest";
import {
  filterInCallThread,
  isChatActivityMessage,
  isInCallNoiseSystemMessage,
  isJoinSystemMessage,
} from "../filter-patient-in-call-thread";
import type { ConsultationMessage } from "../types";

function msg(
  partial: Partial<ConsultationMessage> & Pick<ConsultationMessage, "id" | "kind">,
): ConsultationMessage {
  return {
    sessionId: "s1",
    senderId: "sys",
    senderRole: "system",
    body: "",
    createdAt: "2026-08-16T14:26:00.000Z",
    ...partial,
  };
}

describe("filterInCallThread", () => {
  it("drops join, mute, and consult-started banners", () => {
    const join = msg({
      id: "j1",
      kind: "system",
      systemEvent: "party_joined",
      body: "Doctor joined the consult.",
    });
    const mute = msg({
      id: "m1",
      kind: "system",
      systemEvent: "mute_changed",
      body: "You muted your microphone",
    });
    const started = msg({
      id: "s1",
      kind: "system",
      systemEvent: "consult_started",
      body: "Consultation started at 16:12.",
    });
    expect(isJoinSystemMessage(join)).toBe(true);
    expect(isInCallNoiseSystemMessage(mute)).toBe(true);
    expect(isInCallNoiseSystemMessage(started)).toBe(true);
    expect(filterInCallThread([join, mute, started])).toEqual([]);
  });

  it("keeps real messages and clinically useful system rows", () => {
    const hold = msg({
      id: "h1",
      kind: "system",
      systemEvent: "hold_changed",
      body: "You put the call on hold",
    });
    const hello = msg({
      id: "t1",
      kind: "text",
      senderId: "p1",
      senderRole: "patient",
      body: "Hello",
    });
    const filtered = filterInCallThread([hold, hello]);
    expect(filtered.map((m) => m.id)).toEqual(["h1", "t1"]);
    expect(isChatActivityMessage(hello)).toBe(true);
  });
});
