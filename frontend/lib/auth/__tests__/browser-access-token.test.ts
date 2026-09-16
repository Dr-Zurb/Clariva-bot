import { describe, expect, it } from "vitest";
import { accessTokenNeedsRefresh } from "@/lib/auth/browser-access-token";

function jwtWithExp(expSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: expSeconds }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `hdr.${payload}.sig`;
}

describe("accessTokenNeedsRefresh", () => {
  it("is true when the token cannot be read", () => {
    expect(accessTokenNeedsRefresh("tok")).toBe(true);
    expect(accessTokenNeedsRefresh("")).toBe(true);
  });

  it("is true when expiry is within a minute", () => {
    const nowSec = 1_700_000_000;
    expect(
      accessTokenNeedsRefresh(jwtWithExp(nowSec + 30), nowSec * 1000)
    ).toBe(true);
  });

  it("is false when expiry is still well in the future", () => {
    const nowSec = 1_700_000_000;
    expect(
      accessTokenNeedsRefresh(jwtWithExp(nowSec + 3600), nowSec * 1000)
    ).toBe(false);
  });
});
