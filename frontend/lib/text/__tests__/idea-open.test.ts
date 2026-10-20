import { describe, expect, it } from "vitest";
import {
  addToPile,
  apiBaseFor,
  contentTypeFor,
  ideaTitle,
  readAccessToken,
  seedIdeaFields,
} from "../../../public/idea-open.js";

function sessionCookie(token: string): string {
  const json = JSON.stringify({ access_token: token });
  const encoded = Buffer.from(json, "utf8").toString("base64url");
  return `sb-proj-auth-token=base64-${encoded}`;
}

describe("idea open sheet", () => {
  it("uses a blank title as untitled", () => {
    expect(ideaTitle("")).toBe("untitled");
    expect(ideaTitle("  ")).toBe("untitled");
    expect(ideaTitle("Fees")).toBe("Fees");
  });

  it("opens a shared link with an empty title", () => {
    expect(
      seedIdeaFields({ title: "", note: "https://www.instagram.com/reel/abc", link: "" })
    ).toMatchObject({
      title: "",
      note: "",
      link: "https://www.instagram.com/reel/abc",
    });
  });

  it("reads the login from the supabase cookie", () => {
    expect(readAccessToken(sessionCookie("token-1"))).toBe("token-1");
    expect(readAccessToken("other=1")).toBe("");
  });

  it("joins a chunked login cookie", () => {
    const json = JSON.stringify({ access_token: "token-2" });
    const encoded = `base64-${Buffer.from(json, "utf8").toString("base64url")}`;
    const mid = Math.floor(encoded.length / 2);
    const cookie = `sb-proj-auth-token.0=${encoded.slice(0, mid)}; sb-proj-auth-token.1=${encoded.slice(mid)}`;
    expect(readAccessToken(cookie)).toBe("token-2");
  });

  it("calls the same origin while the phone is on the dev funnel", () => {
    expect(apiBaseFor("clariva-dev.tail363099.ts.net", "https://api.example")).toBe("");
    expect(apiBaseFor("haloaid.com", "https://api.example/")).toBe("https://api.example");
  });

  it("sends a jpeg content type", () => {
    const file = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    expect(contentTypeFor(file)).toBe("image/jpeg");
  });

  it("adds files and stops at ten of one kind", () => {
    const first = new File(["a"], "one.jpg", { type: "image/jpeg" });
    const second = new File(["b"], "two.jpg", { type: "image/jpeg" });
    const piled = addToPile([], [first]);
    const both = addToPile(piled.files, [second]);
    expect(both.files.map((file: File) => file.name)).toEqual(["one.jpg", "two.jpg"]);
    const photos = Array.from({ length: 10 }, (_, index) => new File(["x"], `p${index}.jpg`, { type: "image/jpeg" }));
    const pdf = new File(["pdf"], "note.pdf", { type: "application/pdf" });
    const capped = addToPile(photos, [new File(["y"], "extra.jpg", { type: "image/jpeg" }), pdf]);
    expect(capped.overflow).toBe(true);
    expect(capped.files).toHaveLength(11);
    expect(capped.files.at(-1)?.name).toBe("note.pdf");
  });
});
