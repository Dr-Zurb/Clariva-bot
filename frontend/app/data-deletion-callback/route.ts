/**
 * POST /data-deletion-callback — Meta User Data Deletion callback.
 *
 * @see https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  generateConfirmationCode,
  generateInvalidConfirmationCode,
  getMetaAppSecret,
  parseSignedRequest,
} from "@/lib/meta/data-deletion-callback";

export const runtime = "nodejs";

const signedRequestSchema = z.string().min(1).max(8000);

function statusPageUrl(req: NextRequest, code: string): string {
  return `${req.nextUrl.origin}/data-deletion?code=${encodeURIComponent(code)}`;
}

function metaOk(req: NextRequest, code: string): NextResponse {
  return NextResponse.json({
    url: statusPageUrl(req, code),
    confirmation_code: code,
  });
}

async function readSignedRequest(req: NextRequest): Promise<string | null> {
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body: unknown = await req.json();
      if (!body || typeof body !== "object") return null;
      const raw = (body as { signed_request?: unknown }).signed_request;
      const parsed = signedRequestSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    }
    const form = await req.formData();
    const raw = form.get("signed_request");
    const parsed = signedRequestSchema.safeParse(
      typeof raw === "string" ? raw : raw == null ? "" : String(raw),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signedRequest = await readSignedRequest(req);
  if (!signedRequest) {
    return NextResponse.json({ error: "Missing signed_request" }, { status: 400 });
  }

  const data = parseSignedRequest(signedRequest, getMetaAppSecret());
  const userId = data?.user_id;
  if (!userId) {
    return metaOk(req, generateInvalidConfirmationCode());
  }

  return metaOk(req, generateConfirmationCode());
}
