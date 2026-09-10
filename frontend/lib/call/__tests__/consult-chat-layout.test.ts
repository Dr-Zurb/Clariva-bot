import { describe, it, expect } from "vitest";
import {
  consultAlreadyRoomyForChat,
  shouldEscalateConsultToFull,
  withConsultChatMinSize,
  MIN_CONSULT_WIDTH_FOR_SIDE_CHAT_PX,
  MIN_CHAT_COLUMN_PX,
  MIN_VIDEO_STAGE_WITH_CHAT_PX,
} from "../consult-chat-layout";

describe("consult-chat-layout", () => {
  it("treats Full/Wide Consult focus as already roomy", () => {
    expect(
      consultAlreadyRoomyForChat({
        isFocused: true,
        focusedLeafId: "body",
        ratio: "wide",
      }),
    ).toBe(true);
    expect(
      consultAlreadyRoomyForChat({
        isFocused: true,
        focusedLeafId: "body",
        ratio: "full",
      }),
    ).toBe(true);
  });

  it("does not treat even/narrow or unfocused as roomy", () => {
    expect(
      consultAlreadyRoomyForChat({
        isFocused: true,
        focusedLeafId: "body",
        ratio: "even",
      }),
    ).toBe(false);
    expect(
      consultAlreadyRoomyForChat({
        isFocused: false,
        focusedLeafId: null,
        ratio: null,
      }),
    ).toBe(false);
  });

  it("escalates to Full below the side-chat width floor", () => {
    expect(shouldEscalateConsultToFull(MIN_CONSULT_WIDTH_FOR_SIDE_CHAT_PX - 1)).toBe(
      true,
    );
    expect(shouldEscalateConsultToFull(MIN_CONSULT_WIDTH_FOR_SIDE_CHAT_PX)).toBe(
      false,
    );
    expect(shouldEscalateConsultToFull(0)).toBe(false);
  });

  it("sums video + chat floors into the Consult splitter min", () => {
    expect(MIN_CONSULT_WIDTH_FOR_SIDE_CHAT_PX).toBe(
      MIN_VIDEO_STAGE_WITH_CHAT_PX + MIN_CHAT_COLUMN_PX + 24,
    );
  });

  it("raises body.minSizePx only while chat is open", () => {
    const panes = [
      { id: "body", minSizePx: 280 },
      { id: "subjective", minSizePx: 200 },
    ];
    expect(withConsultChatMinSize(panes, false)).toEqual(panes);
    const open = withConsultChatMinSize(panes, true);
    expect(open[0]).toMatchObject({
      id: "body",
      minSizePx: MIN_CONSULT_WIDTH_FOR_SIDE_CHAT_PX,
    });
    expect(open[1]).toEqual(panes[1]);
  });

  it("does not lower an already-higher body min", () => {
    const panes = [{ id: "body", minSizePx: 800 }];
    expect(withConsultChatMinSize(panes, true)[0]?.minSizePx).toBe(800);
  });
});
