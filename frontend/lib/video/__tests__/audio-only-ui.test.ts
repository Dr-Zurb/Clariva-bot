import { describe, it, expect } from "vitest";
import { resolveSelfTileAudioOnly } from "../audio-only-ui";

describe("resolveSelfTileAudioOnly", () => {
  it("is true for manual audio-only quality", () => {
    expect(
      resolveSelfTileAudioOnly({
        quality: "audio-only",
        autoFallbackActive: false,
      }),
    ).toBe(true);
  });

  it("is true when adaptive auto-fallback is active (picker stays auto)", () => {
    expect(
      resolveSelfTileAudioOnly({
        quality: "auto",
        autoFallbackActive: true,
      }),
    ).toBe(true);
  });

  it("is false when video quality is active and no fallback", () => {
    expect(
      resolveSelfTileAudioOnly({
        quality: "auto",
        autoFallbackActive: false,
      }),
    ).toBe(false);
    expect(
      resolveSelfTileAudioOnly({
        quality: "720p",
        autoFallbackActive: false,
      }),
    ).toBe(false);
  });
});
