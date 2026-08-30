import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  deletionStatusForCode,
  generateConfirmationCode,
  generateInvalidConfirmationCode,
  getMetaAppSecret,
  isIssuedConfirmationCode,
  parseSignedRequest,
} from "@/lib/meta/data-deletion-callback";

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

describe("parseSignedRequest", () => {
  it("returns the payload for a valid signature", () => {
    const signed = makeSignedRequest({ user_id: "fb-user-9" }, APP_SECRET);
    expect(parseSignedRequest(signed, APP_SECRET)).toEqual({
      user_id: "fb-user-9",
    });
  });

  it("returns null for a wrong secret or missing secret", () => {
    const signed = makeSignedRequest({ user_id: "fb-user-9" }, APP_SECRET);
    expect(parseSignedRequest(signed, "wrong-secret")).toBeNull();
    expect(parseSignedRequest(signed, "")).toBeNull();
    expect(parseSignedRequest("", APP_SECRET)).toBeNull();
  });
});

describe("confirmation codes", () => {
  it("issues a recognisable code", () => {
    const code = generateConfirmationCode();
    expect(isIssuedConfirmationCode(code)).toBe(true);
    expect(deletionStatusForCode(code)).toBe("received");
  });

  it("treats the invalid fallback as received and junk as unknown", () => {
    expect(deletionStatusForCode(generateInvalidConfirmationCode())).toBe(
      "received",
    );
    expect(deletionStatusForCode("not-a-code")).toBe("unknown");
  });
});

describe("getMetaAppSecret", () => {
  it("prefers META_APP_SECRET then INSTAGRAM_APP_SECRET", () => {
    expect(
      getMetaAppSecret({
        META_APP_SECRET: " meta-secret ",
        INSTAGRAM_APP_SECRET: "ig-secret",
      }),
    ).toBe("meta-secret");
    expect(getMetaAppSecret({ INSTAGRAM_APP_SECRET: "ig-secret" })).toBe(
      "ig-secret",
    );
    expect(getMetaAppSecret({})).toBe("");
  });
});
