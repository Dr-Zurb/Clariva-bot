import { describe, it, expect } from "vitest";
import {
  buildPublicSocialProfileUrl,
  formatPlatformUsername,
} from "@/lib/inbox/social-profile-url";

describe("buildPublicSocialProfileUrl", () => {
  it("builds Instagram URL from handle", () => {
    expect(buildPublicSocialProfileUrl("instagram", "halo.aid")).toBe(
      "https://www.instagram.com/halo.aid/"
    );
  });

  it("rejects spaced display names", () => {
    expect(buildPublicSocialProfileUrl("facebook", "Jane Doe")).toBeNull();
  });
});

describe("formatPlatformUsername", () => {
  it("prefixes @ for handles", () => {
    expect(formatPlatformUsername("halo.aid")).toBe("@halo.aid");
  });

  it("keeps display names as-is", () => {
    expect(formatPlatformUsername("Jane Doe")).toBe("Jane Doe");
  });
});
