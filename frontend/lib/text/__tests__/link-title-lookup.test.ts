import { describe, expect, it, vi } from "vitest";
import { htmlPageTitle, lookupLinkTitle, type LinkTitleDeps } from "../link-title-lookup";

function deps(fetchImpl: LinkTitleDeps["fetch"], addresses?: LinkTitleDeps["addresses"]): LinkTitleDeps {
  return {
    fetch: fetchImpl,
    addresses: addresses ?? vi.fn(async () => ["93.184.216.34"]),
  };
}

describe("lookupLinkTitle", () => {
  it("uses the YouTube video name", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const href = input instanceof URL ? input.href : String(input);
      expect(href).toContain("https://www.youtube.com/oembed");
      expect(href).toContain(encodeURIComponent("https://www.youtube.com/watch?v=abc"));
      return new Response(JSON.stringify({ title: "Fever season reel" }), { status: 200 });
    });
    const title = await lookupLinkTitle("https://www.youtube.com/shorts/abc", deps(fetchImpl));
    expect(title).toBe("Fever season reel");
  });

  it("does not ask Instagram for a title", async () => {
    const fetchImpl = vi.fn();
    const title = await lookupLinkTitle("https://www.instagram.com/reel/abc", deps(fetchImpl));
    expect(title).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads an article title", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('<html><head><meta property="og:title" content="Fee post"></head></html>', {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const title = await lookupLinkTitle("https://example.com/fees", deps(fetchImpl));
    expect(title).toBe("Fee post");
  });

  it("does not follow a redirect to a private address", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/latest" } }),
    );
    const title = await lookupLinkTitle("https://example.com/fees", deps(fetchImpl));
    expect(title).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not fetch a private address", async () => {
    const fetchImpl = vi.fn();
    const title = await lookupLinkTitle("http://127.0.0.1/latest", deps(fetchImpl));
    expect(title).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("htmlPageTitle", () => {
  it("reads the title tag when no social title is present", () => {
    expect(htmlPageTitle("<html><title>Clinic hours &amp; fees</title></html>")).toBe("Clinic hours & fees");
  });
});
