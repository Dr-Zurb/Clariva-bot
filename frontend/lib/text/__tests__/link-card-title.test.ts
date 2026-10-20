import { describe, expect, it } from "vitest";
import { fallbackLinkTitle } from "../link-card-title";

describe("fallbackLinkTitle", () => {
  it("names the sites a doctor shares from", () => {
    expect(fallbackLinkTitle("https://www.instagram.com/reel/abc")).toBe("Instagram reel");
    expect(fallbackLinkTitle("https://www.instagram.com/p/abc")).toBe("Instagram post");
    expect(fallbackLinkTitle("https://youtu.be/abc")).toBe("YouTube");
    expect(fallbackLinkTitle("https://www.nytimes.com/story")).toBe("nytimes.com");
  });
});
