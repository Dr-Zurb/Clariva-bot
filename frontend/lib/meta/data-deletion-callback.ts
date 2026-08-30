/**
 * Meta data-deletion callback helpers (public Next.js surface).
 *
 * The Express implementation in `backend/src/routes/data-deletion.ts` does
 * the real doctor-Instagram disconnect. That backend is not hosted yet, so
 * this module powers a public ack + status page on `haloaid.com` for Meta's
 * dashboard test. When the backend is live, point Meta at that URL instead.
 *
 * Never log the signed payload or the Facebook user id.
 */

import { createHmac, randomBytes } from "crypto";

export const META_CONFIRMATION_CODE_RE =
  /^del-\d{10,}-([a-f0-9]{12}|invalid)$/;

export function generateConfirmationCode(): string {
  return `del-${Date.now()}-${randomBytes(6).toString("hex")}`;
}

export function generateInvalidConfirmationCode(): string {
  return `del-${Date.now()}-invalid`;
}

export function isIssuedConfirmationCode(code: string): boolean {
  return META_CONFIRMATION_CODE_RE.test(code);
}

function base64UrlDecode(input: string): Buffer {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

/**
 * Verify Meta's `signed_request` and return the payload, or null if the
 * signature is missing/wrong or the body is not JSON.
 */
export function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): { user_id?: string } | null {
  if (!signedRequest || !appSecret) return null;
  const parts = signedRequest.split(".", 2);
  if (parts.length !== 2) return null;
  const [encodedSig, payload] = parts;
  try {
    const sig = base64UrlDecode(encodedSig);
    const data = JSON.parse(base64UrlDecode(payload).toString("utf8")) as {
      user_id?: string;
    };
    const expectedSig = createHmac("sha256", appSecret).update(payload).digest();
    if (!sig.equals(expectedSig)) return null;
    return data;
  } catch {
    return null;
  }
}

export function getMetaAppSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env.META_APP_SECRET?.trim() || env.INSTAGRAM_APP_SECRET?.trim() || ""
  );
}

export function deletionStatusForCode(code: string): "received" | "unknown" {
  return isIssuedConfirmationCode(code) ? "received" : "unknown";
}
