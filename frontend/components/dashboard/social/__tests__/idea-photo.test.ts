import { describe, expect, it } from "vitest";
import { shrinkIdeaPhoto } from "../idea-photo";

describe("shrinkIdeaPhoto", () => {
  it("leaves a video alone", async () => {
    const video = new File(["clip"], "clip.mp4", { type: "video/mp4" });
    await expect(shrinkIdeaPhoto(video)).resolves.toBe(video);
  });

  it("leaves a small photo alone", async () => {
    const photo = new File(["img"], "snap.jpg", { type: "image/jpeg" });
    await expect(shrinkIdeaPhoto(photo)).resolves.toBe(photo);
  });
});
