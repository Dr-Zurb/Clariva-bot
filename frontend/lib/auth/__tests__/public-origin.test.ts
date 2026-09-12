import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { publicRequestOrigin } from "@/lib/auth/public-origin";

function req(url: string, headers?: HeadersInit) {
  return new NextRequest(url, headers ? { headers } : undefined);
}

describe("publicRequestOrigin", () => {
  it("keeps a public request origin", () => {
    expect(publicRequestOrigin(req("https://haloaid.com/auth/callback"))).toBe(
      "https://haloaid.com"
    );
  });

  it("keeps localhost for laptop Next", () => {
    expect(
      publicRequestOrigin(req("http://localhost:3000/auth/callback"))
    ).toBe("http://localhost:3000");
  });

  it("uses forwarded host when Render rewrites the URL", () => {
    expect(
      publicRequestOrigin(
        req("http://localhost:10000/auth/callback", {
          "x-forwarded-host": "haloaid.com",
          "x-forwarded-proto": "https",
        })
      )
    ).toBe("https://haloaid.com");
  });

  it("falls back to the live origin on a bare Render listen address", () => {
    expect(
      publicRequestOrigin(req("http://localhost:10000/auth/callback"))
    ).toBe("https://haloaid.com");
  });

  it("keeps Tailscale when forwarded", () => {
    expect(
      publicRequestOrigin(
        req("http://localhost:3000/auth/callback", {
          "x-forwarded-host": "clariva-dev.tail363099.ts.net",
          "x-forwarded-proto": "https",
        })
      )
    ).toBe("https://clariva-dev.tail363099.ts.net");
  });
});
