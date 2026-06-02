/**
 * resolveDropZoneFromPointer — truth table (cv3d-02 core deliverable).
 */

import { describe, it, expect } from "vitest";
import type { DropZone } from "@/lib/patient-profile/v3/foundation";
import {
  EDGE,
  resolveDropZoneFromPointer,
} from "@/lib/patient-profile/v3/dropZoneGeometry";

const W = 400;
const H = 300;

function at(nx: number, ny: number, w = W, h = H) {
  return resolveDropZoneFromPointer(
    { width: w, height: h },
    { x: nx * w, y: ny * h },
  );
}

describe("resolveDropZoneFromPointer (cv3d-02)", () => {
  it("exports EDGE = 0.5 (halves model)", () => {
    expect(EDGE).toBe(0.5);
  });

  describe("halves", () => {
    it("left-center → west; right-center → east", () => {
      expect(at(0.25, 0.5)).toBe("west");
      expect(at(0.75, 0.5)).toBe("east");
    });

    it("top-center → north; bottom-center → south", () => {
      expect(at(0.5, 0.25)).toBe("north");
      expect(at(0.5, 0.75)).toBe("south");
    });
  });

  describe("dominant axis", () => {
    it("near left edge but slightly above center → west", () => {
      expect(at(0.05, 0.45)).toBe("west");
    });

    it("near top edge but slightly left of center → north", () => {
      expect(at(0.45, 0.05)).toBe("north");
    });
  });

  describe("exact ties", () => {
    it("dead center → west (horizontal tie-break)", () => {
      expect(at(0.5, 0.5)).toBe("west");
    });

    it("exact corner (0,0) → west (horizontal dominates)", () => {
      expect(at(0, 0)).toBe("west");
    });
  });

  describe("tab bar", () => {
    it("overTabBar: true → center regardless of x/y", () => {
      expect(
        resolveDropZoneFromPointer({ width: W, height: H }, { x: 0, y: 0 }, {
          overTabBar: true,
        }),
      ).toBe("center");
      expect(
        resolveDropZoneFromPointer({ width: W, height: H }, { x: W, y: H }, {
          overTabBar: true,
        }),
      ).toBe("center");
    });
  });

  describe("degenerate", () => {
    it("zero or negative width/height → center, never throws", () => {
      for (const width of [0, -10]) {
        expect(
          resolveDropZoneFromPointer({ width, height: H }, { x: 10, y: 10 }),
        ).toBe("center");
      }
      for (const height of [0, -10]) {
        expect(
          resolveDropZoneFromPointer({ width: W, height }, { x: 10, y: 10 }),
        ).toBe("center");
      }
    });
  });

  describe("totality", () => {
    it("grid sweep over [0,1]² yields a defined DropZone for every cell", () => {
      const zones = new Set<DropZone>();
      for (let row = 0; row <= 10; row += 1) {
        for (let col = 0; col <= 10; col += 1) {
          const zone = at(col / 10, row / 10);
          expect(zone).toBeDefined();
          expect(["west", "east", "north", "south"]).toContain(zone);
          zones.add(zone);
        }
      }
      expect(zones.size).toBe(4);
    });
  });

  describe("aspect ratios", () => {
    it("same normalized point resolves identically at 16:9, 4:3, and tall-narrow", () => {
      const nx = 0.2;
      const ny = 0.7;
      const rects = [
        { width: 1600, height: 900 },
        { width: 400, height: 300 },
        { width: 200, height: 800 },
      ];
      const results = rects.map((rect) =>
        resolveDropZoneFromPointer(rect, { x: nx * rect.width, y: ny * rect.height }),
      );
      expect(new Set(results).size).toBe(1);
      expect(results[0]).toBe("west");
    });
  });
});
