import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";
import { GET } from "../status/route";

const APP_SECRET = "test-app-secret";

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeSignedRequest(payloadObj: unknown, secret: string): string {
  const payload = b64url(Buffer.from(JSON.stringify(payloadObj)));
  const sig = b64url(createHmac("sha256", secret).update(payload).digest());
  return `${sig}.${payload}`;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /data-deletion-callback", () => {
  it("returns 400 when signed_request is missing", async () => {
    const req = new NextRequest("https://haloaid.com/data-deletion-callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns the Meta shape for a validly-signed request", async () => {
    vi.stubEnv("META_APP_SECRET", APP_SECRET);
    const signed = makeSignedRequest({ user_id: "fb-user-9" }, APP_SECRET);
    const req = new NextRequest("https://haloaid.com/data-deletion-callback", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ signed_request: signed }).toString(),
    });
    const res = await POST(req);
    const body = (await res.json()) as {
      url: string;
      confirmation_code: string;
    };
    expect(res.status).toBe(200);
    expect(body.confirmation_code).toMatch(/^del-\d+-([a-f0-9]{12})$/);
    expect(body.url).toBe(
      `https://haloaid.com/data-deletion?code=${body.confirmation_code}`,
    );
  });

  it("does not leak Render's internal origin into the status URL", async () => {
    const req = new NextRequest("http://localhost:10000/data-deletion-callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signed_request: "not-valid" }),
    });
    const res = await POST(req);
    const body = (await res.json()) as { url: string };
    expect(res.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/haloaid\.com\/data-deletion\?code=/);
  });

  it("does not require a user_id match for a bad signature, but still returns the shape", async () => {
    vi.stubEnv("META_APP_SECRET", APP_SECRET);
    const signed = makeSignedRequest({ user_id: "fb-user-9" }, "wrong-secret");
    const req = new NextRequest("https://haloaid.com/data-deletion-callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signed_request: signed }),
    });
    const res = await POST(req);
    const body = (await res.json()) as { confirmation_code: string };
    expect(res.status).toBe(200);
    expect(body.confirmation_code).toContain("invalid");
  });
});

describe("GET /data-deletion-callback/status", () => {
  it("returns 400 without a code", async () => {
    const req = new NextRequest("https://haloaid.com/data-deletion-callback/status");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns received for an issued-looking code", async () => {
    const req = new NextRequest(
      "https://haloaid.com/data-deletion-callback/status?code=del-1780000000000-abcdef123456",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      code: "del-1780000000000-abcdef123456",
      status: "received",
    });
  });
});
