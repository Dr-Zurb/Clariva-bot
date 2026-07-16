import { describe, it, expect } from "vitest";
import {
  isGutterDropData,
  resolveGutterMoveTarget,
} from "@/lib/patient-profile/v3/gutter-insert";

describe("isGutterDropData", () => {
  it("accepts a well-formed gutter payload", () => {
    expect(
      isGutterDropData({
        gutter: true,
        parentId: "p",
        leftChildId: "l",
        rightChildId: "r",
        orientation: "horizontal",
      }),
    ).toBe(true);
  });

  it("rejects non-gutter droppable data (body/tab-bar)", () => {
    expect(isGutterDropData({ groupId: "g" })).toBe(false);
    expect(isGutterDropData({ groupId: "g", overTabBar: true })).toBe(false);
    expect(isGutterDropData(null)).toBe(false);
    expect(isGutterDropData(undefined)).toBe(false);
  });

  it("rejects a gutter flag missing required fields", () => {
    expect(isGutterDropData({ gutter: true, parentId: "p" })).toBe(false);
    expect(
      isGutterDropData({
        gutter: true,
        leftChildId: "l",
        rightChildId: "r",
        orientation: "diagonal",
      }),
    ).toBe(false);
    // Missing parentId — the reorder path relies on it, so it must be present.
    expect(
      isGutterDropData({
        gutter: true,
        leftChildId: "l",
        rightChildId: "r",
        orientation: "horizontal",
      }),
    ).toBe(false);
  });
});

describe("resolveGutterMoveTarget", () => {
  it("horizontal seam → east of the left child (new column between)", () => {
    expect(resolveGutterMoveTarget("horizontal", "left", "right")).toEqual({
      targetGroupId: "left",
      zone: "east",
    });
  });

  it("vertical seam → south of the top child (new row between)", () => {
    expect(resolveGutterMoveTarget("vertical", "top", "bottom")).toEqual({
      targetGroupId: "top",
      zone: "south",
    });
  });

  it("targets the OTHER side when the drag source is the left/top child", () => {
    // Horizontal: source is the left leaf → target right + west.
    expect(
      resolveGutterMoveTarget("horizontal", "left", "right", "left"),
    ).toEqual({ targetGroupId: "right", zone: "west" });
    // Vertical: source is the top leaf → target bottom + north.
    expect(
      resolveGutterMoveTarget("vertical", "top", "bottom", "top"),
    ).toEqual({ targetGroupId: "bottom", zone: "north" });
  });

  it("keeps the default (left) side when the source is the right/bottom child", () => {
    expect(
      resolveGutterMoveTarget("horizontal", "left", "right", "right"),
    ).toEqual({ targetGroupId: "left", zone: "east" });
    expect(
      resolveGutterMoveTarget("vertical", "top", "bottom", "bottom"),
    ).toEqual({ targetGroupId: "top", zone: "south" });
  });

  it("keeps the default side when the source is an unrelated group", () => {
    expect(
      resolveGutterMoveTarget("horizontal", "left", "right", "elsewhere"),
    ).toEqual({ targetGroupId: "left", zone: "east" });
  });
});
