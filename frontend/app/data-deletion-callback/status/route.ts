/**
 * GET /data-deletion-callback/status?code=...
 *
 * Unknown codes return `unknown` (no existence leak of other records).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deletionStatusForCode } from "@/lib/meta/data-deletion-callback";

export const runtime = "nodejs";

const codeSchema = z.string().min(1).max(200);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const parsed = codeSchema.safeParse(req.nextUrl.searchParams.get("code") ?? "");
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const code = parsed.data;
  return NextResponse.json({ code, status: deletionStatusForCode(code) });
}
