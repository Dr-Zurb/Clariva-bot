import { describe, it, expect } from "vitest";
import {
  SELF_VIEW_FLIP_HORIZONTAL,
  SELF_VIEW_NEXT_POSITION,
  pipCornerWhenChatOpen,
  selfViewOnStart,
  snapPipCorner,
  type SelfViewPosition,
} from "../self-view-position";

describe("self-view-position", () => {
  it("cycles speaker corners BR → BL → TL → TR → BR", () => {
    let p: SelfViewPosition = "BR";
    const seen: SelfViewPosition[] = [];
    for (let i = 0; i < 4; i++) {
      p = SELF_VIEW_NEXT_POSITION[p];
      seen.push(p);
    }
    expect(seen).toEqual(["BL", "TL", "TR", "BR"]);
  });

  it("flips gallery/sidebar left ↔ right without changing vertical preference", () => {
    expect(SELF_VIEW_FLIP_HORIZONTAL.BR).toBe("BL");
    expect(SELF_VIEW_FLIP_HORIZONTAL.BL).toBe("BR");
    expect(SELF_VIEW_FLIP_HORIZONTAL.TR).toBe("TL");
    expect(SELF_VIEW_FLIP_HORIZONTAL.TL).toBe("TR");
  });

  it("treats left corners as start edge for inline CSS order/reverse", () => {
    expect(selfViewOnStart("BL")).toBe(true);
    expect(selfViewOnStart("TL")).toBe(true);
    expect(selfViewOnStart("BR")).toBe(false);
    expect(selfViewOnStart("TR")).toBe(false);
  });

  it("snaps a point to the stage quadrant", () => {
    const stage = { left: 0, top: 0, width: 400, height: 800 };
    expect(snapPipCorner(20, 20, stage)).toBe("TL");
    expect(snapPipCorner(380, 20, stage)).toBe("TR");
    expect(snapPipCorner(20, 780, stage)).toBe("BL");
    expect(snapPipCorner(380, 780, stage)).toBe("BR");
  });

  it("lifts a bottom PiP to the matching top corner when chat is open", () => {
    expect(pipCornerWhenChatOpen("BR")).toBe("TR");
    expect(pipCornerWhenChatOpen("BL")).toBe("TL");
    expect(pipCornerWhenChatOpen("TR")).toBe("TR");
    expect(pipCornerWhenChatOpen("TL")).toBe("TL");
  });
});
