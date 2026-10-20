import { describe, expect, it } from "vitest";
import { shareLinkRedirect } from "../share-link-redirect";

describe("shareLinkRedirect", () => {
  it("sends a shared link to the idea page", () => {
    expect(
      shareLinkRedirect("https://haloaid.com", {
        title: "",
        note: "https://www.instagram.com/reel/abc",
        link: "",
      })
    ).toBe(
      "https://haloaid.com/c/idea?note=https%3A%2F%2Fwww.instagram.com%2Freel%2Fabc"
    );
  });

  it("keeps a shared file on the consult landing", () => {
    expect(
      shareLinkRedirect("https://haloaid.com", {
        title: "Scan",
        note: "",
        link: "",
        hasFile: true,
      })
    ).toBe("https://haloaid.com/c/share-target?title=Scan");
  });
});
